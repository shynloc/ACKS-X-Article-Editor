import { createServer } from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  hashPassword,
  inviteHash,
  newInviteCode,
  normalizeUsername,
  usernameKey,
  validPassword,
  validUsername,
  verifyPassword,
} from "./security.mjs";

const port = Number(process.env.X_BRIDGE_PORT || 8787);
const publicBase = process.env.PUBLIC_BASE_URL || "http://127.0.0.1:47631";
const xApiBase = process.env.X_API_BASE_URL || "https://api.x.com";
const origin = new URL(publicBase).origin;
const databasePath = process.env.X_BRIDGE_DB || "/data/x-bridge.sqlite";
const deploymentMode =
  process.env.DEPLOYMENT_MODE === "hosted" ? "hosted" : "selfhost";
const registrationMode = deploymentMode === "hosted" ? "invite" : "disabled";
const keySource = process.env.X_SESSION_SECRET || "";
const key = keySource ? createHash("sha256").update(keySource).digest() : null;
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, client_id TEXT, csrf TEXT NOT NULL, state TEXT,
    verifier TEXT, token TEXT, refresh TEXT, expires_at INTEGER, user_json TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drafts (
    session_id TEXT NOT NULL, article_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    published_at INTEGER, created_at INTEGER NOT NULL,
    PRIMARY KEY(session_id, article_id)
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','trial')),
    direct_limit INTEGER NOT NULL DEFAULT 1, direct_used INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invites (
    code_hash TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('admin','trial')),
    direct_limit INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at INTEGER NOT NULL,
    used_at INTEGER, used_by TEXT
  );
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT, status TEXT NOT NULL,
    article_id TEXT, request_hash TEXT, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_open_workflow_per_user
    ON workflows(user_id)
    WHERE user_id IS NOT NULL AND status IN ('active','draft');
`);
function addColumn(table, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (error) {
    if (!String(error?.message).includes("duplicate column")) throw error;
  }
}
addColumn("sessions", "user_id TEXT");
addColumn("drafts", "user_id TEXT");
addColumn("drafts", "workflow_id TEXT");

const now = () => Date.now();
const token = (size = 32) => randomBytes(size).toString("base64url");
const attempts = new Map();
function rateLimit(req, bucket, maximum, windowMs) {
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
  const key = `${bucket}:${ip}`,
    time = now(),
    entry = attempts.get(key);
  if (!entry || entry.resetAt <= time) {
    attempts.set(key, { count: 1, resetAt: time + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > maximum)
    throw Object.assign(new Error("操作过于频繁，请稍后重试。"), {
      status: 429,
    });
}
function accountFor(row) {
  if (!row?.user_id) return null;
  return (
    db
      .prepare(
        "SELECT id,username,role,direct_limit,direct_used,disabled,created_at FROM users WHERE id=?",
      )
      .get(row.user_id) || null
  );
}
function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    disabled: !!account.disabled,
    directLimit: account.direct_limit,
    directUsed: account.direct_used,
    directRemaining:
      account.role === "admin" || account.direct_limit < 0
        ? -1
        : Math.max(0, account.direct_limit - account.direct_used),
  };
}
function requireAccount(row) {
  if (deploymentMode !== "hosted") return null;
  const account = accountFor(row);
  if (!account)
    throw Object.assign(new Error("请先登录体验账号。"), { status: 401 });
  if (account.disabled)
    throw Object.assign(new Error("账号已被停用。"), { status: 403 });
  return account;
}
function requireAdmin(row) {
  const account = requireAccount(row);
  if (!account || account.role !== "admin")
    throw Object.assign(new Error("需要管理员权限。"), { status: 403 });
  return account;
}
function workflowFor(row, id, allowed = ["active"]) {
  const workflow = id
    ? db
        .prepare("SELECT * FROM workflows WHERE id=? AND session_id=?")
        .get(id, row.id)
    : null;
  if (
    !workflow ||
    !allowed.includes(workflow.status) ||
    workflow.expires_at < now()
  )
    throw Object.assign(new Error("直发工作流已失效，请重新开始。"), {
      status: 409,
    });
  if (deploymentMode === "hosted" && workflow.user_id !== row.user_id)
    throw Object.assign(new Error("直发工作流与当前账号不匹配。"), {
      status: 403,
    });
  return workflow;
}
function seal(value) {
  if (!key || !value) return null;
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
function open(value) {
  if (!key || !value) return null;
  const raw = Buffer.from(value, "base64url"),
    iv = raw.subarray(0, 12),
    tag = raw.subarray(12, 28),
    body = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter((item) => item.length === 2),
  );
}
function session(req, res, create = true) {
  let id = cookies(req).acks_x_session,
    row = id
      ? db.prepare("SELECT * FROM sessions WHERE id=?").get(id)
      : undefined;
  if (!row && create) {
    id = token();
    const time = now();
    db.prepare(
      "INSERT INTO sessions(id,csrf,created_at,updated_at) VALUES(?,?,?,?)",
    ).run(id, token(24), time, time);
    row = db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
    res.setHeader(
      "Set-Cookie",
      `acks_x_session=${id}; Path=/api/x; HttpOnly; SameSite=Lax${origin.startsWith("https:") ? "; Secure" : ""}; Max-Age=2592000`,
    );
  }
  return row;
}
function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(body));
}
function same(a = "", b = "") {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
async function body(req, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit)
      throw Object.assign(new Error("请求体过大。"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("请求 JSON 无效。"), { status: 400 });
  }
}
function requirePost(req, row) {
  if (req.headers.origin && req.headers.origin !== origin)
    throw Object.assign(new Error("请求来源不受信任。"), { status: 403 });
  if (!same(String(req.headers["x-csrf-token"] || ""), String(row.csrf)))
    throw Object.assign(new Error("会话校验失败，请刷新后重试。"), {
      status: 403,
    });
}
async function xFetch(path, accessToken, init = {}) {
  const response = await fetch(`${xApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.detail || payload?.title || `X API 返回 ${response.status}`,
    );
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return payload;
}
async function access(row) {
  if (!row.token)
    throw Object.assign(new Error("尚未连接 X 账号。"), { status: 401 });
  if (Number(row.expires_at || 0) > now() + 60000) return open(row.token);
  const refreshToken = open(row.refresh);
  if (!refreshToken)
    throw Object.assign(new Error("X 授权已过期，请重新连接。"), {
      status: 401,
    });
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: row.client_id,
  });
  const response = await fetch(`${xApiBase}/2/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error("X 授权刷新失败，请重新连接。"), {
      status: 401,
    });
  db.prepare(
    "UPDATE sessions SET token=?,refresh=?,expires_at=?,updated_at=? WHERE id=?",
  ).run(
    seal(payload.access_token),
    seal(payload.refresh_token || refreshToken),
    now() + Number(payload.expires_in || 7200) * 1000,
    now(),
    row.id,
  );
  return payload.access_token;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", publicBase),
    path = url.pathname.replace(/^\/api\/x/, "") || "/";
  try {
    if (req.method === "GET" && path === "/health")
      return send(res, 200, { ok: true, configured: !!key });
    if (!key)
      throw Object.assign(new Error("X 发布桥尚未配置服务端加密密钥。"), {
        status: 503,
      });
    const row = session(req, res);
    if (req.method === "GET" && path === "/status") {
      let user = row.user_json ? JSON.parse(row.user_json) : null;
      if (row.token && !user) {
        try {
          const result = await xFetch("/2/users/me", await access(row));
          user = result.data;
          db.prepare(
            "UPDATE sessions SET user_json=?,updated_at=? WHERE id=?",
          ).run(JSON.stringify(user), now(), row.id);
        } catch {}
      }
      const account = accountFor(row),
        workflow = db
          .prepare(
            "SELECT id,status,article_id,request_hash,expires_at FROM workflows WHERE session_id=? AND status IN ('active','draft') AND expires_at>? ORDER BY created_at DESC LIMIT 1",
          )
          .get(row.id, now());
      return send(res, 200, {
        deploymentMode,
        registrationMode,
        account: publicAccount(account),
        workflow: workflow
          ? {
              id: workflow.id,
              status: workflow.status,
              articleId: workflow.article_id || undefined,
              requestHash: workflow.request_hash || undefined,
            }
          : null,
        configured: !!row.client_id,
        connected: !!row.token,
        pending: !!row.state,
        clientId: row.client_id || "",
        csrf: row.csrf,
        user,
        redirectUri: `${publicBase}/api/x/callback`,
      });
    }
    if (req.method === "GET" && path === "/callback") {
      let reason = "callback_failed";
      try {
        if (
          !same(
            String(url.searchParams.get("state") || ""),
            String(row.state || ""),
          )
        ) {
          reason = "state_mismatch";
          throw new Error("state mismatch");
        }
        const code = url.searchParams.get("code");
        if (!code) {
          reason =
            url.searchParams.get("error") === "access_denied"
              ? "access_denied"
              : "missing_code";
          throw new Error("missing authorization code");
        }
        const form = new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: row.client_id,
          redirect_uri: `${publicBase}/api/x/callback`,
          code_verifier: open(row.verifier),
        });
        const response = await fetch(`${xApiBase}/2/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          reason = "token_exchange_failed";
          throw new Error("token exchange failed");
        }
        db.prepare(
          "UPDATE sessions SET token=?,refresh=?,expires_at=?,state=NULL,verifier=NULL,user_json=NULL,updated_at=? WHERE id=?",
        ).run(
          seal(payload.access_token),
          seal(payload.refresh_token || ""),
          now() + Number(payload.expires_in || 7200) * 1000,
          now(),
          row.id,
        );
        res.writeHead(302, {
          Location: "/?x=connected",
          "Cache-Control": "no-store",
        });
        return res.end();
      } catch (error) {
        console.error("x-bridge callback", reason, error?.message || error);
        res.writeHead(302, {
          Location: `/?x=error&reason=${encodeURIComponent(reason)}`,
          "Cache-Control": "no-store",
        });
        return res.end();
      }
    }
    if (req.method !== "POST") return send(res, 404, { error: "接口不存在。" });
    requirePost(req, row);
    const input = await body(req);
    if (path === "/auth/register") {
      rateLimit(req, "register", 8, 15 * 60 * 1000);
      if (registrationMode !== "invite")
        throw Object.assign(new Error("当前部署未开放注册。"), { status: 403 });
      if (row.user_id)
        throw Object.assign(new Error("当前已经登录，请先退出。"), {
          status: 409,
        });
      const username = normalizeUsername(input.username),
        password = String(input.password || ""),
        codeHash = inviteHash(input.inviteCode);
      if (!validUsername(username))
        throw Object.assign(
          new Error("用户名需为 3–32 位文字、数字、下划线或连字符。"),
          { status: 400 },
        );
      if (!validPassword(password))
        throw Object.assign(new Error("密码长度需为 12–128 个字符。"), {
          status: 400,
        });
      const passwordHash = await hashPassword(password),
        userId = token(18),
        time = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const invite = db
          .prepare("SELECT * FROM invites WHERE code_hash=?")
          .get(codeHash);
        if (!invite || invite.used_at)
          throw Object.assign(new Error("邀请码无效或已使用。"), {
            status: 400,
          });
        db.prepare(
          "INSERT INTO users(id,username,username_key,password_hash,role,direct_limit,direct_used,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?)",
        ).run(
          userId,
          username,
          usernameKey(username),
          passwordHash,
          invite.role,
          invite.direct_limit,
          time,
          time,
        );
        db.prepare(
          "UPDATE invites SET used_at=?,used_by=? WHERE code_hash=? AND used_at IS NULL",
        ).run(time, userId, codeHash);
        db.prepare("UPDATE sessions SET user_id=?,updated_at=? WHERE id=?").run(
          userId,
          time,
          row.id,
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (String(error?.message).includes("UNIQUE constraint"))
          throw Object.assign(new Error("用户名已被使用。"), { status: 409 });
        throw error;
      }
      const account = accountFor({ ...row, user_id: userId });
      return send(res, 201, { account: publicAccount(account) });
    }
    if (path === "/auth/login") {
      rateLimit(req, "login", 12, 15 * 60 * 1000);
      const user = db
        .prepare("SELECT * FROM users WHERE username_key=?")
        .get(usernameKey(input.username));
      if (
        !user ||
        !(await verifyPassword(
          String(input.password || ""),
          user.password_hash,
        ))
      )
        throw Object.assign(new Error("用户名或密码不正确。"), { status: 401 });
      if (user.disabled)
        throw Object.assign(new Error("账号已被停用。"), { status: 403 });
      if (row.user_id && row.user_id !== user.id)
        db.prepare(
          "UPDATE sessions SET user_id=?,client_id=NULL,token=NULL,refresh=NULL,expires_at=NULL,user_json=NULL,state=NULL,verifier=NULL,updated_at=? WHERE id=?",
        ).run(user.id, now(), row.id);
      else
        db.prepare("UPDATE sessions SET user_id=?,updated_at=? WHERE id=?").run(
          user.id,
          now(),
          row.id,
        );
      return send(res, 200, { account: publicAccount(user) });
    }
    if (path === "/auth/logout") {
      db.prepare(
        "UPDATE sessions SET user_id=NULL,client_id=NULL,token=NULL,refresh=NULL,expires_at=NULL,user_json=NULL,state=NULL,verifier=NULL,updated_at=? WHERE id=?",
      ).run(now(), row.id);
      return send(res, 200, { ok: true });
    }
    if (path === "/auth/change-password") {
      rateLimit(req, "password", 8, 15 * 60 * 1000);
      const account = requireAccount(row),
        full = db.prepare("SELECT * FROM users WHERE id=?").get(account.id),
        currentPassword = String(input.currentPassword || ""),
        nextPassword = String(input.nextPassword || "");
      if (!(await verifyPassword(currentPassword, full.password_hash)))
        throw Object.assign(new Error("当前密码不正确。"), { status: 401 });
      if (!validPassword(nextPassword))
        throw Object.assign(new Error("新密码长度需为 12–128 个字符。"), {
          status: 400,
        });
      db.prepare(
        "UPDATE users SET password_hash=?,updated_at=? WHERE id=?",
      ).run(await hashPassword(nextPassword), now(), account.id);
      return send(res, 200, { ok: true });
    }
    if (path === "/admin/invites/create") {
      const admin = requireAdmin(row),
        role = input.role === "admin" ? "admin" : "trial",
        directLimit =
          role === "admin"
            ? -1
            : Math.min(100, Math.max(0, Number(input.directLimit ?? 1))),
        code = newInviteCode();
      db.prepare(
        "INSERT INTO invites(code_hash,role,direct_limit,created_by,created_at) VALUES(?,?,?,?,?)",
      ).run(inviteHash(code), role, directLimit, admin.id, now());
      return send(res, 201, { code, role, directLimit });
    }
    if (path === "/admin/overview") {
      requireAdmin(row);
      const users = db
          .prepare(
            "SELECT id,username,role,direct_limit,direct_used,disabled,created_at FROM users ORDER BY created_at DESC LIMIT 200",
          )
          .all()
          .map(publicAccount),
        invites = db
          .prepare(
            "SELECT role,direct_limit,created_at,used_at,used_by FROM invites ORDER BY created_at DESC LIMIT 200",
          )
          .all()
          .map((invite) => ({ ...invite, used: !!invite.used_at }));
      return send(res, 200, { users, invites });
    }
    if (path === "/admin/users/update") {
      const admin = requireAdmin(row),
        target = db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(String(input.userId || ""));
      if (!target)
        throw Object.assign(new Error("账号不存在。"), { status: 404 });
      if (target.id === admin.id && input.disabled === true)
        throw Object.assign(new Error("不能停用当前管理员账号。"), {
          status: 400,
        });
      const limit =
          target.role === "admin"
            ? -1
            : Math.min(
                100,
                Math.max(0, Number(input.directLimit ?? target.direct_limit)),
              ),
        disabled =
          input.disabled === undefined
            ? target.disabled
            : input.disabled
              ? 1
              : 0;
      db.prepare(
        "UPDATE users SET direct_limit=?,disabled=?,updated_at=? WHERE id=?",
      ).run(limit, disabled, now(), target.id);
      return send(res, 200, {
        account: publicAccount({ ...target, direct_limit: limit, disabled }),
      });
    }
    if (path === "/workflow/start") {
      const account = requireAccount(row);
      const time = now();
      if (account)
        db.prepare(
          "UPDATE workflows SET status='expired',updated_at=? WHERE user_id=? AND status IN ('active','draft') AND expires_at<=?",
        ).run(time, account.id, time);
      else
        db.prepare(
          "UPDATE workflows SET status='expired',updated_at=? WHERE session_id=? AND status IN ('active','draft') AND expires_at<=?",
        ).run(time, row.id, time);
      const existing = account
        ? db
            .prepare(
              "SELECT * FROM workflows WHERE user_id=? AND status IN ('active','draft') ORDER BY created_at DESC LIMIT 1",
            )
            .get(account.id)
        : db
            .prepare(
              "SELECT * FROM workflows WHERE session_id=? AND status IN ('active','draft') ORDER BY created_at DESC LIMIT 1",
            )
            .get(row.id);
      if (existing) {
        if (existing.session_id !== row.id)
          throw Object.assign(
            new Error("该账号在另一个浏览器会话中有未完成的直接发布。"),
            { status: 409 },
          );
        return send(res, 200, {
          workflow: {
            id: existing.id,
            status: existing.status,
            articleId: existing.article_id || undefined,
            requestHash: existing.request_hash || undefined,
          },
        });
      }
      if (
        account &&
        account.role !== "admin" &&
        account.direct_limit >= 0 &&
        account.direct_used >= account.direct_limit
      )
        throw Object.assign(
          new Error(
            "体验账号的一次直接发布额度已经使用。手动发布仍可继续使用。",
          ),
          { status: 403 },
        );
      const id = token(24);
      db.prepare(
        "INSERT INTO workflows(id,session_id,user_id,status,created_at,updated_at,expires_at) VALUES(?,?,?,'active',?,?,?)",
      ).run(id, row.id, account?.id || null, time, time, time + 60 * 60 * 1000);
      return send(res, 201, { workflow: { id, status: "active" } });
    }
    if (path === "/config") {
      requireAccount(row);
      const clientId = String(input.clientId || "").trim();
      if (!/^[A-Za-z0-9._~-]{8,200}$/.test(clientId))
        throw Object.assign(new Error("Client ID 格式无效。"), { status: 400 });
      db.prepare(
        "UPDATE sessions SET client_id=?,token=NULL,refresh=NULL,expires_at=NULL,user_json=NULL,state=NULL,verifier=NULL,updated_at=? WHERE id=?",
      ).run(clientId, now(), row.id);
      return send(res, 200, { ok: true });
    }
    if (path === "/authorize") {
      requireAccount(row);
      if (!row.client_id)
        throw Object.assign(new Error("请先保存 X Developer Client ID。"), {
          status: 400,
        });
      const state = token(24),
        verifier = token(48),
        challenge = createHash("sha256").update(verifier).digest("base64url");
      db.prepare(
        "UPDATE sessions SET state=?,verifier=?,updated_at=? WHERE id=?",
      ).run(state, seal(verifier), now(), row.id);
      const authorize = new URL("https://x.com/i/oauth2/authorize");
      authorize.search = new URLSearchParams({
        response_type: "code",
        client_id: row.client_id,
        redirect_uri: `${publicBase}/api/x/callback`,
        scope: "tweet.read tweet.write users.read media.write offline.access",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return send(res, 200, { url: authorize.toString() });
    }
    if (path === "/disconnect") {
      requireAccount(row);
      db.prepare(
        "UPDATE sessions SET token=NULL,refresh=NULL,expires_at=NULL,user_json=NULL,state=NULL,verifier=NULL,updated_at=? WHERE id=?",
      ).run(now(), row.id);
      return send(res, 200, { ok: true });
    }
    const accessToken = await access(row);
    if (path === "/media") {
      workflowFor(row, String(req.headers["x-workflow-id"] || ""));
      const media = String(input.media || ""),
        mime = String(input.mime || "");
      if (
        !/^image\/(png|jpeg|webp)$/.test(mime) ||
        !/^[A-Za-z0-9+/=]+$/.test(media) ||
        Buffer.byteLength(media, "base64") > 8 * 1024 * 1024
      )
        throw Object.assign(
          new Error("媒体必须是 8 MiB 以内的 PNG、JPEG 或 WebP。"),
          { status: 400 },
        );
      const result = await xFetch("/2/media/upload", accessToken, {
        method: "POST",
        body: JSON.stringify({ media, media_category: "tweet_image" }),
      });
      return send(res, 201, {
        mediaId: result.data?.id,
        mediaCategory: result.data?.media_category || "tweet_image",
      });
    }
    if (path === "/draft") {
      const workflow = workflowFor(
          row,
          String(req.headers["x-workflow-id"] || ""),
        ),
        account = accountFor(row);
      const requestHash = String(input.requestHash || "");
      if (!/^[a-f0-9]{64}$/.test(requestHash) || !input.article)
        throw Object.assign(new Error("草稿请求缺少完整性标识。"), {
          status: 400,
        });
      const result = await xFetch("/2/articles/draft", accessToken, {
        method: "POST",
        body: JSON.stringify(input.article),
      });
      const articleId = String(result.data?.id || "");
      if (!articleId)
        throw Object.assign(new Error("X 未返回草稿 ID。"), { status: 502 });
      const time = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT OR REPLACE INTO drafts(session_id,article_id,request_hash,created_at,user_id,workflow_id) VALUES(?,?,?,?,?,?)",
        ).run(
          row.id,
          articleId,
          requestHash,
          time,
          account?.id || null,
          workflow.id,
        );
        db.prepare(
          "UPDATE workflows SET status='draft',article_id=?,request_hash=?,updated_at=?,expires_at=? WHERE id=? AND status='active'",
        ).run(
          articleId,
          requestHash,
          time,
          time + 7 * 24 * 60 * 60 * 1000,
          workflow.id,
        );
        if (account && account.role !== "admin" && account.direct_limit >= 0)
          db.prepare(
            "UPDATE users SET direct_used=direct_used+1,updated_at=? WHERE id=?",
          ).run(time, account.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(res, 201, { articleId });
    }
    const publish = /^\/publish\/([^/]+)$/.exec(path);
    if (publish) {
      const workflow = workflowFor(
        row,
        String(req.headers["x-workflow-id"] || ""),
        ["draft"],
      );
      const draft = db
        .prepare(
          "SELECT * FROM drafts WHERE session_id=? AND article_id=? AND workflow_id=?",
        )
        .get(row.id, publish[1], workflow.id);
      if (
        !draft ||
        input.confirm !== true ||
        !same(String(input.requestHash || ""), String(draft.request_hash))
      )
        throw Object.assign(new Error("发布确认与当前草稿不匹配。"), {
          status: 409,
        });
      const result = await xFetch(
        `/2/articles/${encodeURIComponent(publish[1])}/publish`,
        accessToken,
        { method: "POST", body: "{}" },
      );
      db.prepare(
        "UPDATE drafts SET published_at=? WHERE session_id=? AND article_id=?",
      ).run(now(), row.id, publish[1]);
      db.prepare(
        "UPDATE workflows SET status='published',updated_at=? WHERE id=?",
      ).run(now(), workflow.id);
      return send(res, 200, {
        articleId: publish[1],
        postId: result.data?.post_id,
      });
    }
    return send(res, 404, { error: "接口不存在。" });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error("x-bridge", error?.message || error);
    return send(res, status, {
      error:
        status >= 500 ? "X 发布桥暂时不可用。" : error?.message || "请求失败。",
    });
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`x-bridge listening on ${port}`),
);
