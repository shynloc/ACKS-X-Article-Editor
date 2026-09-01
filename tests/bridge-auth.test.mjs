import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inviteHash } from "../server/security.mjs";

const port = 49127;
const xPort = 49128;
const base = `http://127.0.0.1:${port}/api/x`;
let processHandle;
let directory;
let databasePath;
let xServer;

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("bridge did not become healthy");
}

async function browserSession() {
  const response = await fetch(`${base}/status`);
  const status = await response.json();
  const cookie = response.headers.get("set-cookie").split(";", 1)[0];
  const post = async (path, input = {}, extraHeaders = {}) => {
    const result = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: `http://127.0.0.1:${port}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": status.csrf,
        ...extraHeaders,
      },
      body: JSON.stringify(input),
    });
    return { response: result, body: await result.json() };
  };
  const getStatus = async () => {
    const result = await fetch(`${base}/status`, {
      headers: { Cookie: cookie },
    });
    return result.json();
  };
  return { post, getStatus, status, cookie };
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "acks-x-bridge-auth-"));
  databasePath = join(directory, "bridge.sqlite");
  xServer = createServer((request, response) => {
    const path = new URL(request.url, `http://127.0.0.1:${xPort}`).pathname;
    response.setHeader("Content-Type", "application/json");
    if (path === "/2/oauth2/token")
      return response.end(
        JSON.stringify({
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 7200,
        }),
      );
    if (path === "/2/users/me")
      return response.end(
        JSON.stringify({
          data: { id: "x-user", name: "Test", username: "test" },
        }),
      );
    if (path === "/2/media/upload")
      return response.end(
        JSON.stringify({
          data: { id: "media-1", media_category: "tweet_image" },
        }),
      );
    if (path === "/2/articles/draft")
      return response.end(JSON.stringify({ data: { id: "article-1" } }));
    if (path === "/2/articles/article-1/publish")
      return response.end(JSON.stringify({ data: { post_id: "post-1" } }));
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolve) => xServer.listen(xPort, "127.0.0.1", resolve));
  processHandle = spawn(process.execPath, ["server/x-bridge.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      X_BRIDGE_PORT: String(port),
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      X_BRIDGE_DB: databasePath,
      X_SESSION_SECRET: "integration-test-secret",
      DEPLOYMENT_MODE: "hosted",
      X_API_BASE_URL: `http://127.0.0.1:${xPort}`,
    },
    stdio: "ignore",
  });
  await waitForHealth();
});

afterAll(async () => {
  processHandle?.kill("SIGTERM");
  xServer?.close();
  await rm(directory, { recursive: true, force: true });
});

describe("体验账号与直发额度", () => {
  it("在 hosted 模式下先登录，再使用一次性邀请码与工作流", async () => {
    const session = await browserSession();
    expect(session.status.deploymentMode).toBe("hosted");
    expect(session.status.account).toBeNull();
    expect(
      (await session.post("/config", { clientId: "validClient123" })).response
        .status,
    ).toBe(401);

    const db = new DatabaseSync(databasePath);
    db.prepare(
      "INSERT INTO invites(code_hash,role,direct_limit,created_at) VALUES(?,?,?,?)",
    ).run(inviteHash("ACKS-TRIAL-TEST-CODE"), "trial", 1, Date.now());
    db.close();

    const registered = await session.post("/auth/register", {
      username: "体验用户",
      password: "a-secure-password-123",
      inviteCode: "ACKS-TRIAL-TEST-CODE",
    });
    expect(registered.response.status).toBe(201);
    expect(registered.body.account.directRemaining).toBe(1);

    const duplicate = await session.post("/auth/register", {
      username: "第二用户",
      password: "another-secure-password",
      inviteCode: "ACKS-TRIAL-TEST-CODE",
    });
    expect(duplicate.response.status).toBe(409);

    const started = await session.post("/workflow/start");
    expect(started.response.status).toBe(201);
    expect(started.body.workflow.status).toBe("active");
    const resumed = await session.post("/workflow/start");
    expect(resumed.body.workflow.id).toBe(started.body.workflow.id);

    expect(
      (await session.post("/config", { clientId: "validClient123" })).response
        .status,
    ).toBe(200);
    const authorization = await session.post("/authorize");
    const state = new URL(authorization.body.url).searchParams.get("state");
    const callback = await fetch(
      `${base}/callback?state=${encodeURIComponent(state)}&code=test-code`,
      { headers: { Cookie: session.cookie }, redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    expect((await session.getStatus()).connected).toBe(true);

    const workflowHeaders = { "X-Workflow-Id": started.body.workflow.id };
    const media = await session.post(
      "/media",
      { mime: "image/png", media: "iVBORw0KGgo=" },
      workflowHeaders,
    );
    expect(media.body.mediaId).toBe("media-1");
    const draft = await session.post(
      "/draft",
      { article: { title: "test" }, requestHash: "a".repeat(64) },
      workflowHeaders,
    );
    expect(draft.body.articleId).toBe("article-1");
    const afterDraft = await session.getStatus();
    expect(afterDraft.account.directUsed).toBe(1);
    expect(afterDraft.account.directRemaining).toBe(0);
    const published = await session.post(
      "/publish/article-1",
      { confirm: true, requestHash: "a".repeat(64) },
      workflowHeaders,
    );
    expect(published.body.postId).toBe("post-1");
    expect((await session.post("/workflow/start")).response.status).toBe(403);
  });

  it("管理员可以生成邀请码、查看账号并调整额度", async () => {
    const db = new DatabaseSync(databasePath);
    db.prepare(
      "INSERT INTO invites(code_hash,role,direct_limit,created_at) VALUES(?,?,?,?)",
    ).run(inviteHash("ACKS-ADMIN-TEST-CODE"), "admin", -1, Date.now());
    db.close();
    const admin = await browserSession();
    const registered = await admin.post("/auth/register", {
      username: "站点管理员",
      password: "admin-secure-password-123",
      inviteCode: "ACKS-ADMIN-TEST-CODE",
    });
    expect(registered.body.account.role).toBe("admin");
    expect(registered.body.account.directRemaining).toBe(-1);

    const invite = await admin.post("/admin/invites/create", {
      role: "trial",
      directLimit: 1,
    });
    expect(invite.response.status).toBe(201);
    expect(invite.body.code).toMatch(/^ACKS-/);

    const overview = await admin.post("/admin/overview");
    const trial = overview.body.users.find((user) => user.role === "trial");
    expect(trial).toBeTruthy();
    const updated = await admin.post("/admin/users/update", {
      userId: trial.id,
      directLimit: 2,
    });
    expect(updated.body.account.directLimit).toBe(2);
  });
});
