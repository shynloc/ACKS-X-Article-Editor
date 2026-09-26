# Agent API 与 MCP 接入

ACKS X Article Editor 的登录用户可以为可信 Agent 创建独立 API Token。Agent 写入的文章、Markdown 和图片进入同一个私有云端文稿库，用户登录编辑器后可以继续排版，再自行决定是否发布到 X。

## 安全边界

- API Token 只显示一次，服务端只保存 SHA-256 摘要；
- Token 默认具有 `articles:read`、`articles:write`、`assets:read`、`assets:write`；
- 用户可以在“账号 → Agent API Token”随时撤销；
- Agent 只能管理该 Token 所属用户的文章和图片；
- Agent API 不提供 X OAuth token，也不能绕过编辑器的公开发布确认；
- 云端文章 JSON 和图片内容使用 AES-256-GCM 加密后写入 SQLite；
- 单张图片上限 10 MiB，单账号图片空间默认 200 MiB；
- 写入支持 `Idempotency-Key` 和 `baseRevision`，避免重复创建与静默覆盖。

不要把 Token 写入仓库、公开 Issue、文章正文、截图或聊天记录。

## MCP

在项目目录安装依赖后，可以启动 stdio MCP Server：

```bash
XEDITOR_URL=https://xeditor.acks.com.cn \
XEDITOR_API_TOKEN=acks_pat_请替换 \
pnpm mcp
```

通用 MCP 配置示例：

```json
{
  "mcpServers": {
    "acks-x-editor": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/ACKS-X-Article-Editor", "mcp"],
      "env": {
        "XEDITOR_URL": "https://xeditor.acks.com.cn",
        "XEDITOR_API_TOKEN": "acks_pat_请替换"
      }
    }
  }
}
```

提供的工具：

| 工具              | 作用                                           |
| ----------------- | ---------------------------------------------- |
| `list_articles`   | 列出用户的云端文章                             |
| `get_article`     | 读取完整 Markdown、文章结构和图片元数据        |
| `upsert_article`  | 创建或更新文章，并从本地路径上传封面、正文图片 |
| `archive_article` | 归档或恢复文章                                 |

`upsert_article` 中可以在 Markdown 使用 `{{image:1}}`、`{{image:2}}` 等占位符，并通过 `images` 传入对应本地文件：

```json
{
  "title": "Agent 写好的文章",
  "markdown": "## 正文\n\n{{image:1}}\n\n结尾。",
  "images": [
    {
      "path": "/absolute/path/diagram.png",
      "marker": "{{image:1}}",
      "alt": "系统架构图"
    }
  ],
  "idempotencyKey": "project-article-2026-09-27"
}
```

MCP 会读取文件、计算 SHA-256、生成编辑器资源 ID，并把占位符改写为 `asset:<id>` 引用。

## REST API

基础地址：

```text
https://你的域名/api/x/agent/v1
```

每个请求需要：

```http
Authorization: Bearer acks_pat_...
Content-Type: application/json
```

### 列出与读取文章

```http
GET /articles
GET /articles/{articleId}
```

文章响应包含 `article`、`cloudRevision`、`serverUpdatedAt` 和 `assetUrls`。

### 写入完整文章

```http
POST /articles/upsert
Idempotency-Key: stable-operation-id
```

```json
{
  "baseRevision": 0,
  "article": {
    "schemaVersion": "1.0.0",
    "id": "agent-article-id",
    "revision": 0,
    "title": "文章标题",
    "body": "## Markdown 正文\n\n![图](asset:asset-example)",
    "assets": [
      {
        "id": "asset-example",
        "kind": "image",
        "mime": "image/png",
        "filename": "diagram.png",
        "byteLength": 1234,
        "sha256": "图片 SHA-256",
        "width": 1600,
        "height": 900,
        "alt": "架构图",
        "caption": ""
      }
    ],
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  "assets": [
    {
      "id": "asset-example",
      "kind": "image",
      "mime": "image/png",
      "filename": "diagram.png",
      "width": 1600,
      "height": 900,
      "alt": "架构图",
      "caption": "",
      "data": "PNG 的 Base64"
    }
  ]
}
```

新文章使用 `baseRevision: 0`。更新文章时传入读取结果中的 `cloudRevision`；版本不匹配会返回 HTTP `409`，不会覆盖另一设备的新版本。

### 下载图片

```http
GET /assets/{assetId}
```

必须携带同一 Token，响应为原始图片二进制。
