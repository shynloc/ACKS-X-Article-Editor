import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const port = 49129;
let apiServer;

beforeAll(async () => {
  apiServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== "Bearer acks_pat_test") {
      response.statusCode = 401;
      return response.end(JSON.stringify({ error: "unauthorized" }));
    }
    if (request.url === "/api/x/agent/v1/articles")
      return response.end(
        JSON.stringify({
          articles: [
            {
              id: "existing",
              title: "Existing",
              cloudRevision: 1,
            },
          ],
        }),
      );
    if (
      request.url === "/api/x/agent/v1/articles/upsert" &&
      request.method === "POST"
    )
      return response.end(
        JSON.stringify({
          article: body.article,
          cloudRevision: 1,
          serverUpdatedAt: Date.now(),
        }),
      );
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => apiServer.listen(port, "127.0.0.1", resolve));
});

afterAll(() => apiServer?.close());

describe("ACKS X Article Editor MCP", () => {
  it("列出工具并通过 Agent API 创建文章", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["server/mcp-server.mjs"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        XEDITOR_URL: `http://127.0.0.1:${port}`,
        XEDITOR_API_TOKEN: "acks_pat_test",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "mcp-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "list_articles",
          "get_article",
          "upsert_article",
          "archive_article",
        ]),
      );
      const listed = await client.callTool({
        name: "list_articles",
        arguments: {},
      });
      expect(listed.structuredContent.articles[0].id).toBe("existing");
      const created = await client.callTool({
        name: "upsert_article",
        arguments: {
          title: "Agent article",
          markdown: "## Written by an Agent",
          idempotencyKey: "mcp-test-create",
        },
      });
      expect(created.structuredContent.article.title).toBe("Agent article");
      expect(created.structuredContent.cloudRevision).toBe(1);
    } finally {
      await transport.close();
    }
  });
});
