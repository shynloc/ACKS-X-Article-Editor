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

const port = Number(process.env.X_BRIDGE_PORT || 8787);
const publicBase = process.env.PUBLIC_BASE_URL || "http://127.0.0.1:47631";
const origin = new URL(publicBase).origin;
const databasePath = process.env.X_BRIDGE_DB || "/data/x-bridge.sqlite";
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
`);

const now = () => Date.now();
const token = (size = 32) => randomBytes(size).toString("base64url");
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
  const response = await fetch(`https://api.x.com${path}`, {
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
  const response = await fetch("https://api.x.com/2/oauth2/token", {
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
      return send(res, 200, {
        configured: !!row.client_id,
        connected: !!row.token,
        clientId: row.client_id || "",
        csrf: row.csrf,
        user,
        redirectUri: `${publicBase}/api/x/callback`,
      });
    }
    if (req.method === "GET" && path === "/callback") {
      if (
        !same(
          String(url.searchParams.get("state") || ""),
          String(row.state || ""),
        )
      )
        throw Object.assign(new Error("X 授权 state 校验失败。"), {
          status: 403,
        });
      const code = url.searchParams.get("code");
      if (!code)
        throw Object.assign(new Error("X 未返回授权码。"), { status: 400 });
      const form = new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: row.client_id,
        redirect_uri: `${publicBase}/api/x/callback`,
        code_verifier: open(row.verifier),
      });
      const response = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Object.assign(
          new Error("X 授权码交换失败，请检查 Client ID 与回调地址。"),
          { status: 400 },
        );
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
    }
    if (req.method !== "POST") return send(res, 404, { error: "接口不存在。" });
    requirePost(req, row);
    const input = await body(req);
    if (path === "/config") {
      const clientId = String(input.clientId || "").trim();
      if (!/^[A-Za-z0-9._~-]{8,200}$/.test(clientId))
        throw Object.assign(new Error("Client ID 格式无效。"), { status: 400 });
      db.prepare(
        "UPDATE sessions SET client_id=?,token=NULL,refresh=NULL,expires_at=NULL,user_json=NULL,updated_at=? WHERE id=?",
      ).run(clientId, now(), row.id);
      return send(res, 200, { ok: true });
    }
    if (path === "/authorize") {
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
      db.prepare(
        "UPDATE sessions SET token=NULL,refresh=NULL,expires_at=NULL,user_json=NULL,state=NULL,verifier=NULL,updated_at=? WHERE id=?",
      ).run(now(), row.id);
      return send(res, 200, { ok: true });
    }
    const accessToken = await access(row);
    if (path === "/media") {
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
      db.prepare(
        "INSERT OR REPLACE INTO drafts(session_id,article_id,request_hash,created_at) VALUES(?,?,?,?)",
      ).run(row.id, articleId, requestHash, now());
      return send(res, 201, { articleId });
    }
    const publish = /^\/publish\/([^/]+)$/.exec(path);
    if (publish) {
      const draft = db
        .prepare("SELECT * FROM drafts WHERE session_id=? AND article_id=?")
        .get(row.id, publish[1]);
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
