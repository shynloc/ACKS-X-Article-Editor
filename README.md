<div align="center">

# ACKS X Article Editor

[中文](README.md) · [English](README_EN.md)

**让稿件先属于自己，再决定何时分享。**

离线优先的 Markdown 长文写作台 · X 结构转换 · 手动复制与受控发布

[![Core checks](https://github.com/shynloc/ACKS-X-Article-Editor/actions/workflows/ci.yml/badge.svg)](https://github.com/shynloc/ACKS-X-Article-Editor/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Deploy-Docker-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-285E45)
![Status](https://img.shields.io/badge/Status-Public%20Preview-C18B31)

[在线体验](https://xeditor.acks.com.cn) · [快速开始](#快速开始) · [自部署](#docker-自部署) · [X Developer 配置](#x-developer-配置) · [AI Agent 部署提示词](docs/SELF_HOSTING_AGENT_PROMPT.md) · [项目文档](#项目文档)

</div>

![ACKS X Article Editor 封面](public/assets/x-article-editor-cover.png)

ACKS X Article Editor 面向习惯 Markdown 工作流的 X Article 写作者。它把**本地写作、X 格式转换和远端发布**拆成清楚的阶段：文稿与原图默认保存在浏览器；转换器提前显示图片化、降级和缺失资源；发布时可以手动复制，也可以用自己的 X Developer Client ID 创建草稿并确认发布。

> **当前版本：0.2.0 · Public Preview**<br>
> 2026-09-01 已真实完成 OAuth、正文图片、表格图片、Article 草稿和正式发布验证。仓库公开，自部署默认不限直发次数；在线体验站使用邀请码账号控制自动发布额度。

## 为什么做这个项目

X Article 自带的是常规富文本编辑器。对于已经使用 Markdown 或 HTML 写作的人，复制长文时经常需要重新处理标题、列表、表格、代码和图片。

这个项目没有克隆官方编辑器，而是采用：

> **本地写作台 + X 格式转换 + 受控发布桥**

- Markdown 始终是可迁移的写作真源；
- X 兼容性问题在发布前可见；
- 表格与代码块可在本地生成清晰 PNG；
- 自动发布先创建草稿，最终公开仍需再次确认；
- 平台不可用时，原稿、图片和完整资源包仍在你手中。

项目自身的介绍文章也作为默认模板内置在编辑器中：[查看 Markdown 原文](docs/INTRO_ARTICLE.md)。它使用了标题、引用、强调、删除线、任务列表、表格、代码块、图片、链接和脚注，也是转换器的一份真实格式样例。

## 已实现能力

| 范围          | 当前能力                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Markdown 编辑 | CodeMirror 6、H1–H6、粗体、斜体、删除线、引用、列表、任务列表、表格、代码、链接、图片、脚注、公式与 Mermaid 输入 |
| 列表输入      | 回车自动继续列表；有序列表在源文中生成真实递增编号；空项再次回车退出                                             |
| 本地保存      | IndexedDB 事务、自动保存、版本快照、跨标签 revision 冲突保护                                                     |
| 图片          | PNG、JPEG、静态 WebP；文件选择、粘贴、拖入、缺图重新关联                                                         |
| X 转换        | Markdown AST → X Content State；标题、行内样式、列表、引用、链接、图片与分隔线                                   |
| 图片化        | 表格和围栏代码本地生成 2x PNG；长内容自动分片；保留原始 Markdown                                                 |
| 校验          | 协议白名单、缺失资源、降级说明、源位置定位和转换 JSON                                                            |
| 备份迁移      | ZIP 资源包、SHA-256 清单、完整性校验、跨浏览器导入恢复                                                           |
| 手动发布      | 分别复制标题、富文本正文和单张 PNG；不要求登录                                                                   |
| 直接发布      | OAuth 2.0 PKCE、X Media Upload、Article Draft、发布前二次确认                                                    |
| 离线          | 首次完整加载后缓存应用外壳；更新由用户确认；`/api/` 永远直连网络                                                 |
| 体验账号      | Hosted 模式邀请码注册、scrypt 密码哈希、普通账号一次直发、管理员不限次数                                         |

## 两种发布方式

### 手动发布

手动发布不需要账号，也不会把 OAuth token 交给本站：

1. 打开“手动发布到 X”；
2. 分别复制标题和正文；
3. 表格、代码块和本地图片逐张复制或下载上传；
4. 在 X Article 编辑器中检查并发布。

资源包是备份格式，并不是 X 的导入文件。正文中的图片位置会以明确提示保留。

### 直接创建草稿并发布

直接发布使用部署者或体验者自己的 X Developer Client ID：

1. OAuth 2.0 PKCE 连接 X 账号；
2. 上传封面、正文图、表格图和代码图；
3. 创建 X Article 草稿；
4. 到 X 检查草稿；
5. 输入“发布”并最终确认。

应用不要求 Client Secret、Bearer Token、OAuth 1.0 Consumer Secret 或手工 Access Token。OAuth token 只在发布桥中加密保存，浏览器仅持有 HttpOnly 会话 Cookie。

## 在线体验

访问：[https://xeditor.acks.com.cn](https://xeditor.acks.com.cn)

| 使用方式       | 权限                                         |
| -------------- | -------------------------------------------- |
| 不登录         | 本地写作、预览、校验、导入导出、手动发布     |
| 普通邀请码账号 | 使用自己的 Client ID 完成一次完整自动发布    |
| 管理员         | 自动发布不限次数，可生成邀请码和管理体验额度 |

登录只控制直接发布权限，**不会把本地文稿同步到服务器**。如果只是写作和手动发布，可以始终不登录。

## 架构

![ACKS X Article Editor 架构](public/assets/xeditor-architecture.png)

```text
Browser
├── React + CodeMirror
├── IndexedDB：文稿、图片 Blob、历史版本
├── Markdown AST：转换、校验、降级报告
├── Canvas + Shiki：表格和代码 PNG
└── ZIP + SHA-256：资源包与恢复
       │
       │ /api/x/ · same origin
       ▼
Node Publish Bridge
├── OAuth 2.0 PKCE
├── AES-256-GCM token encryption
├── SQLite：会话、邀请码、额度、草稿记录
└── X Media → Article Draft → Publish
```

生产环境由两个容器组成：

- **editor**：非特权 Nginx，只提供静态应用并代理 `/api/x/`；
- **bridge**：Node.js 发布桥，仅在 Compose 内网监听，不映射公网端口。

文稿数据库在浏览器 IndexedDB；服务端 SQLite 不保存文稿库，只保存账号权限、加密 OAuth 会话和远端草稿记录。

## 技术栈

| 层       | 技术                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 应用     | React 19、TypeScript 7、Vite 8                                           |
| 编辑器   | CodeMirror 6                                                             |
| 本地数据 | Dexie 4、IndexedDB                                                       |
| Markdown | unified、remark-parse、remark-gfm                                        |
| 校验     | Ajv 8、JSON Schema                                                       |
| 图像     | Canvas 2D、Shiki 4                                                       |
| 资源包   | fflate、Web Crypto                                                       |
| 后台任务 | Web Workers                                                              |
| 发布桥   | Node.js 24、SQLite、OAuth 2.0 PKCE、AES-256-GCM                          |
| 运行     | Docker Compose、非特权 Nginx、Caddy / Nginx HTTPS                        |
| 测试     | Vitest、fake-indexeddb、桥接集成测试、生产 Worker 与 Service Worker 回归 |

依赖版本由 `pnpm-lock.yaml` 固定。

## 快速开始

需要 Node.js `>=24 <27` 和 pnpm `11.19.0`。

```bash
git clone https://github.com/shynloc/ACKS-X-Article-Editor.git
cd ACKS-X-Article-Editor

corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:47631/`。不要双击 `index.html` 使用 `file://`，因为源码需要由 Vite 构建并提供模块、Worker 和资源路径。

仅开发 X 发布桥时，在另一个终端运行：

```bash
X_SESSION_SECRET="$(openssl rand -base64 48)" pnpm dev:bridge
```

## Docker 自部署

复制环境配置并生成自己的生产密钥：

```bash
cp .env.example .env
openssl rand -base64 48
```

编辑 `.env`：

```env
COMPOSE_PROJECT_NAME=acks-x-article-editor
EDITOR_IMAGE=acks-x-article-editor:local
BRIDGE_IMAGE=acks-x-article-editor-bridge:local
EDITOR_PORT=5701
PUBLIC_BASE_URL=https://xeditor.example.com
X_SESSION_SECRET=替换为刚刚生成的随机值
DEPLOYMENT_MODE=selfhost
```

> 自部署必须保持 `DEPLOYMENT_MODE=selfhost`。该模式不启用官方体验站的邀请码和一次直发限制，API 用量与费用归部署者自己的 X Developer App。

构建并启动：

```bash
pnpm install --frozen-lockfile
pnpm check
node scripts/test-built-worker.mjs
pnpm test:sites

docker compose build
docker compose up -d

curl http://127.0.0.1:5701/health.json
curl http://127.0.0.1:5701/api/x/health
```

宿主机只应绑定 `127.0.0.1:${EDITOR_PORT}`。发布桥不应配置 `ports`。

Caddy 示例：

```caddyfile
xeditor.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:5701
}
```

生产必须使用 HTTPS，以支持 Secure Cookie、Service Worker 和稳定 OAuth callback。完整发行、候选验证、备份与回滚流程见 [部署指南](docs/DEPLOYMENT.md)。

如果希望交给 AI Agent 执行，直接复制 [AI Agent 自部署提示词](docs/SELF_HOSTING_AGENT_PROMPT.md)。提示词包含服务器只读审计、独立 Compose、loopback 端口、密钥、X Developer 配置、真实 OAuth 验收和回滚边界。

## X Developer 配置

在自己的 X Developer Portal 中启用 OAuth 2.0：

| 项目            | 设置                                                           |
| --------------- | -------------------------------------------------------------- |
| App permissions | Read and write                                                 |
| Type of App     | Native App / Public client                                     |
| Callback URI    | `https://你的域名/api/x/callback`                              |
| Website URL     | `https://你的域名`                                             |
| Scopes          | `tweet.read tweet.write users.read media.write offline.access` |

保存设置后，只把 **OAuth 2.0 Client ID** 填入编辑器。

外链图床 URL 可以作为链接，但不能替代 X Article 图片实体所需的 media ID。自动发布会把本地图片上传到 X Media，再绑定返回的 media ID。

## 数据与安全

- 文稿、原图与历史默认保存在当前浏览器 IndexedDB；
- 不包含统计 SDK、第三方字体请求、远程图片预取或 X 嵌帖脚本；
- OAuth token 使用 AES-256-GCM 加密后存入服务端 SQLite；
- 密码使用 scrypt 强哈希；邀请码只保存 SHA-256 摘要且只能使用一次；
- Cookie 使用 HttpOnly、SameSite，HTTPS 下同时使用 Secure；
- 发布 API 检查 Origin、CSRF、账号额度、工作流归属、媒体格式与体积；
- ZIP 导入检查路径、压缩比、体积、重复条目和 SHA-256；
- SVG 与动画图片不会作为正文图片执行或解码；
- Service Worker 不拦截 `/api/`，OAuth callback 始终到达网络；
- 清除站点数据会删除本地稿件，执行前请先导出完整资源包。

不要在公开 Issue 中粘贴私人稿件、Cookie、OAuth code、Client Secret、Bearer Token、Access Token、refresh token、`.env` 或数据库文件。

## 验证状态

- `48` 项 Vitest 测试通过；
- GitHub Actions Core checks 通过；
- 生产 Worker、Service Worker API bypass 和 Sites 路由回归通过；
- Hosted / Self-hosted Docker 模式通过；
- 真实 X OAuth、Media Upload、Article Draft 和 Publish 通过；
- 正文图片、表格图片和排版已在 X Article 中验证；
- 全部 Git 历史经过 Gitleaks 扫描，未发现密钥。

详细证据与已知限制见 [验收记录](docs/ACCEPTANCE.md)。

## 项目文档

| 文档                                                       | 内容                                      |
| ---------------------------------------------------------- | ----------------------------------------- |
| [项目介绍文章](docs/INTRO_ARTICLE.md)                      | 可直接发布的 X Article 项目介绍与格式样例 |
| [PRD](docs/PRD.md)                                         | 产品范围、目标用户与路线                  |
| [X 发布桥指南](docs/X_PUBLISHING.md)                       | OAuth、媒体、草稿、发布与验收边界         |
| [部署指南](docs/DEPLOYMENT.md)                             | 发行、Docker、反向代理、备份和回滚        |
| [AI Agent 自部署提示词](docs/SELF_HOSTING_AGENT_PROMPT.md) | 可直接交给 Agent 的完整部署任务书         |
| [验收记录](docs/ACCEPTANCE.md)                             | 测试、真实发布、缺陷与生产部署证据        |
| [剪贴板说明](docs/CLIPBOARD.md)                            | 标题、正文与图片复制规则                  |
| [第三方声明](docs/THIRD_PARTY.md)                          | 依赖与许可证                              |

## 项目结构

```text
src/components/     编辑器、预览、账号与发布界面
src/core/           文档类型、Markdown 转换、校验与内置模板
src/services/       IndexedDB、出图、资源包、离线更新与发布客户端
server/             OAuth 发布桥、体验账号和管理员 CLI
schemas/            文稿与发布结构契约
tests/              单元、持久化和桥接集成测试
deploy/             Nginx 配置
docs/               PRD、部署、发布、验收与设计资料
```

## 已知边界

- 不同浏览器、设备和域名之间不会自动同步文稿；
- Mermaid 当前保留源码并按代码图片处理，尚未生成图形；
- 行内代码、下划线、高亮、上下标等非 X 原生样式会明确降级；
- X API 能力、价格、权限和配额由 X 决定；
- 结构预览是本地转换结果，不冒充 X 官方渲染。

## 参与项目

欢迎提交 Issue、兼容性样例和 Pull Request。报告转换问题时，请尽量提供脱敏后的最小 Markdown，不要上传私人原稿或凭证。

如果这个项目改善了你的 Markdown → X Article 工作流，欢迎点一个 **Star**。

## License

[MIT License](LICENSE) · Copyright © 2026 ACKS

部署者需要自行申请并遵守 X Developer Agreement、API 计费和内容发布规则。本项目与 X Corp. 无隶属或官方合作关系。
