#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const base = String(
  process.env.XEDITOR_URL || "https://xeditor.acks.com.cn",
).replace(/\/$/, "");
const apiToken = String(process.env.XEDITOR_API_TOKEN || "");
if (!apiToken.startsWith("acks_pat_")) {
  console.error("XEDITOR_API_TOKEN is missing or invalid.");
  process.exit(2);
}

async function request(path, init = {}) {
  const response = await fetch(`${base}/api/x${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload.error || `X Editor API returned ${response.status}`,
    );
  return payload;
}

function mimeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`Unsupported image type: ${extension || path}`);
}

function pngSize(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1],
      length = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcb].includes(marker))
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    if (length < 2) break;
    offset += length + 2;
  }
}

function webpSize(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    return;
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X")
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
}

function imageSize(bytes, mime, fallbackWidth, fallbackHeight) {
  const detected =
    mime === "image/png"
      ? pngSize(bytes)
      : mime === "image/jpeg"
        ? jpegSize(bytes)
        : webpSize(bytes);
  return {
    width: detected?.width || fallbackWidth || 1600,
    height: detected?.height || fallbackHeight || 900,
  };
}

async function prepareImage(input, index) {
  const bytes = await readFile(input.path),
    mime = mimeFor(input.path),
    sha256 = createHash("sha256").update(bytes).digest("hex"),
    id = `asset-${sha256}`,
    size = imageSize(bytes, mime, input.width, input.height);
  return {
    marker: input.marker || `{{image:${index + 1}}}`,
    metadata: {
      id,
      kind: input.kind || "image",
      mime,
      filename: input.path.split(/[\\/]/).at(-1) || `${id}.png`,
      byteLength: bytes.length,
      sha256,
      width: size.width,
      height: size.height,
      alt: input.alt || "",
      caption: input.caption || "",
    },
    data: bytes.toString("base64"),
  };
}

const server = new McpServer({
  name: "acks-x-article-editor",
  version: "1.0.0",
});

server.registerTool(
  "list_articles",
  {
    description:
      "List the user's private cloud articles in ACKS X Article Editor.",
    inputSchema: {},
  },
  async () => {
    const result = await request("/agent/v1/articles");
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "get_article",
  {
    description: "Get one cloud article, its Markdown, and image metadata.",
    inputSchema: { id: z.string().min(1).describe("Article ID") },
  },
  async ({ id }) => {
    const result = await request(
      `/agent/v1/articles/${encodeURIComponent(id)}`,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "upsert_article",
  {
    description:
      "Create or update a complete Markdown article. Local image paths are uploaded and marker strings such as {{image:1}} are replaced with editor asset references.",
    inputSchema: {
      id: z.string().optional().describe("Existing article ID; omit to create"),
      baseRevision: z.number().int().nonnegative().optional(),
      title: z.string().max(20000),
      markdown: z.string().max(2 * 1024 * 1024),
      coverPath: z.string().optional(),
      images: z
        .array(
          z.object({
            path: z.string(),
            marker: z.string().optional(),
            alt: z.string().optional(),
            caption: z.string().optional(),
            width: z.number().int().positive().optional(),
            height: z.number().int().positive().optional(),
          }),
        )
        .optional(),
      idempotencyKey: z.string().optional(),
    },
  },
  async ({
    id,
    baseRevision,
    title,
    markdown,
    coverPath,
    images = [],
    idempotencyKey,
  }) => {
    let existing;
    if (id)
      try {
        existing = await request(
          `/agent/v1/articles/${encodeURIComponent(id)}`,
        );
      } catch {}
    const prepared = await Promise.all(
      images.map((image, index) => prepareImage(image, index)),
    );
    let body = markdown;
    for (const image of prepared)
      body = body.replaceAll(
        image.marker,
        `![${image.metadata.alt}](asset:${image.metadata.id})`,
      );
    let cover;
    if (coverPath)
      cover = await prepareImage(
        { path: coverPath, kind: "cover", alt: "Article cover" },
        prepared.length,
      );
    const uploaded = [...prepared, ...(cover ? [cover] : [])];
    const assetMap = new Map(
      (existing?.article?.assets || []).map((asset) => [asset.id, asset]),
    );
    for (const item of uploaded) assetMap.set(item.metadata.id, item.metadata);
    const timestamp = new Date().toISOString();
    const article = {
      schemaVersion: "1.0.0",
      id: id || randomBytes(18).toString("base64url"),
      revision: Number(existing?.article?.revision || 0),
      title,
      body,
      ...(cover
        ? { coverId: cover.metadata.id }
        : existing?.article?.coverId
          ? { coverId: existing.article.coverId }
          : {}),
      assets: [...assetMap.values()],
      createdAt: existing?.article?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const result = await request("/agent/v1/articles/upsert", {
      method: "POST",
      headers: {
        "Idempotency-Key":
          idempotencyKey ||
          `mcp-${article.id}-${createHash("sha256")
            .update(title + body)
            .digest("hex")}`,
      },
      body: JSON.stringify({
        article,
        baseRevision: baseRevision ?? Number(existing?.cloudRevision || 0),
        assets: uploaded.map((item) => ({
          ...item.metadata,
          data: item.data,
        })),
      }),
    });
    return {
      content: [
        {
          type: "text",
          text: `Saved article ${result.article.id} at cloud revision ${result.cloudRevision}.`,
        },
      ],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "archive_article",
  {
    description: "Archive or unarchive a cloud article without deleting it.",
    inputSchema: {
      id: z.string().min(1),
      archived: z.boolean().default(true),
    },
  },
  async ({ id, archived }) => {
    const current = await request(
      `/agent/v1/articles/${encodeURIComponent(id)}`,
    );
    const article = {
      ...current.article,
      archived,
      updatedAt: new Date().toISOString(),
    };
    const result = await request("/agent/v1/articles/upsert", {
      method: "POST",
      headers: { "Idempotency-Key": `archive-${id}-${archived}-${Date.now()}` },
      body: JSON.stringify({
        article,
        baseRevision: current.cloudRevision,
      }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`ACKS X Article Editor MCP connected to ${base}`);
