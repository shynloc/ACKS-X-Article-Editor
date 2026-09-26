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
    expect(invite.body.id).toBeTruthy();

    const overview = await admin.post("/admin/overview");
    expect(
      overview.body.invites.some((item) => item.id === invite.body.id),
    ).toBe(true);
    expect(
      overview.body.audits.some((item) => item.action === "invite.create"),
    ).toBe(true);
    const trial = overview.body.users.find((user) => user.role === "trial");
    expect(trial).toBeTruthy();
    const updated = await admin.post("/admin/users/update", {
      userId: trial.id,
      directLimit: 2,
    });
    expect(updated.body.account.directLimit).toBe(2);
    const revoked = await admin.post("/admin/invites/revoke", {
      inviteId: invite.body.id,
    });
    expect(revoked.response.status).toBe(200);
    const afterRevoke = await admin.post("/admin/overview");
    expect(
      afterRevoke.body.invites.some((item) => item.id === invite.body.id),
    ).toBe(false);
    expect(
      afterRevoke.body.audits.some((item) => item.action === "invite.revoke"),
    ).toBe(true);
    expect(
      afterRevoke.body.audits.some((item) => item.action === "user.update"),
    ).toBe(true);
  });

  it("登录用户可以云同步，Agent Token 可以写入完整文章与图片", async () => {
    const admin = await browserSession();
    expect(
      (
        await admin.post("/auth/login", {
          username: "站点管理员",
          password: "admin-secure-password-123",
        })
      ).response.status,
    ).toBe(200);
    const createdToken = await admin.post("/account/tokens/create", {
      name: "测试 Agent",
    });
    expect(createdToken.response.status).toBe(201);
    expect(createdToken.body.token).toMatch(/^acks_pat_/);
    const apiToken = createdToken.body.token;
    const imageData = Buffer.from("png-test").toString("base64");
    const article = {
      schemaVersion: "1.0.0",
      id: "agent-article",
      revision: 1,
      title: "Agent 写入文章",
      body: "## 正文\n\n![插图](asset:asset-agent-test)",
      assets: [
        {
          id: "asset-agent-test",
          kind: "image",
          mime: "image/png",
          filename: "agent.png",
          byteLength: 8,
          sha256: "",
          width: 1,
          height: 1,
          alt: "Agent 插图",
          caption: "",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const agentRequest = async (path, init = {}) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      return { response, body: await response.json() };
    };
    const firstWrite = await agentRequest("/agent/v1/articles/upsert", {
      method: "POST",
      headers: { "Idempotency-Key": "agent-write-1" },
      body: JSON.stringify({
        article,
        baseRevision: 0,
        assets: [{ ...article.assets[0], data: imageData }],
      }),
    });
    expect(firstWrite.response.status).toBe(200);
    expect(firstWrite.body.cloudRevision).toBe(1);
    const encryptedDb = new DatabaseSync(databasePath, { readOnly: true });
    const encryptedArticle = encryptedDb
      .prepare(
        "SELECT article_json FROM cloud_articles WHERE id='agent-article'",
      )
      .get();
    const encryptedAsset = encryptedDb
      .prepare("SELECT data FROM cloud_assets WHERE id='asset-agent-test'")
      .get();
    encryptedDb.close();
    expect(encryptedArticle.article_json).not.toContain("Agent 写入文章");
    expect(Buffer.from(encryptedAsset.data).toString()).not.toBe("png-test");
    const repeated = await agentRequest("/agent/v1/articles/upsert", {
      method: "POST",
      headers: { "Idempotency-Key": "agent-write-1" },
      body: JSON.stringify({
        article,
        baseRevision: 0,
        assets: [{ ...article.assets[0], data: imageData }],
      }),
    });
    expect(repeated.body.cloudRevision).toBe(1);
    const agentList = await agentRequest("/agent/v1/articles");
    expect(agentList.body.articles.some((item) => item.id === article.id)).toBe(
      true,
    );
    const agentDetail = await agentRequest(`/agent/v1/articles/${article.id}`);
    expect(agentDetail.body.article.title).toBe(article.title);
    const assetResponse = await fetch(
      `${base}/agent/v1/assets/asset-agent-test`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    expect(Buffer.from(await assetResponse.arrayBuffer()).toString()).toBe(
      "png-test",
    );

    const cloudList = await admin.post("/cloud/articles/list");
    expect(
      cloudList.body.articles.some(
        (item) => item.article.id === article.id && item.cloudRevision === 1,
      ),
    ).toBe(true);
    const cloudAsset = await admin.post("/cloud/assets/get", {
      assetId: "asset-agent-test",
    });
    expect(cloudAsset.body.asset.data).toBe(imageData);
    const browserUpdate = await admin.post("/cloud/articles/upsert", {
      article: { ...firstWrite.body.article, title: "浏览器更新文章" },
      baseRevision: 1,
      mutationId: "browser-update-1",
    });
    expect(browserUpdate.body.cloudRevision).toBe(2);
    const conflict = await admin.post("/cloud/articles/upsert", {
      article,
      baseRevision: 0,
      mutationId: "browser-conflict-1",
    });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body.cloudRevision).toBe(2);

    const otherInvite = await admin.post("/admin/invites/create", {
      role: "trial",
      directLimit: 1,
    });
    const otherUser = await browserSession();
    expect(
      (
        await otherUser.post("/auth/register", {
          username: "另一个云端用户",
          password: "another-cloud-password-123",
          inviteCode: otherInvite.body.code,
        })
      ).response.status,
    ).toBe(201);
    const isolatedLibrary = await otherUser.post("/cloud/articles/list");
    expect(isolatedLibrary.body.articles).toHaveLength(0);

    const tokenList = await admin.post("/account/tokens/list");
    expect(
      tokenList.body.tokens.some(
        (item) => item.id === createdToken.body.id && item.lastUsedAt,
      ),
    ).toBe(true);
    expect(
      (
        await admin.post("/account/tokens/revoke", {
          tokenId: createdToken.body.id,
        })
      ).response.status,
    ).toBe(200);
    expect((await agentRequest("/agent/v1/articles")).response.status).toBe(
      401,
    );
  });
});
