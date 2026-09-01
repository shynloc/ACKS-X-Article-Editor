# 把 Markdown 写作者带回 X Article：我做了一个本地优先的长文编辑器

> 写作工具应该帮助你保持思路，而不是让你在发布前重新修一遍格式。

如果你习惯用 Markdown 写长文，大概遇到过这样的场景：

1. 在熟悉的编辑器里写好文章；
2. 复制到 X Article；
3. 标题层级变了，列表乱了，表格直接消失；
4. 然后开始一段段重新排版。

X 自带的 Article 编辑器是一个常规富文本编辑器。它可以完成基本写作，但对已经形成 Markdown 或 HTML 工作流的人并不友好。原始 Markdown 不能直接成为稳定的发布结构，HTML 复制也经常受到编辑器清洗规则影响。

尤其是表格、代码块、多级标题和本地图片——每次复制都像在碰运气。

~~把格式崩了再修一遍~~，不应该成为长文发布流程的一部分。

于是我做了 **ACKS X Article Editor**。

体验地址：[https://xeditor.acks.com.cn](https://xeditor.acks.com.cn)

GitHub：[https://github.com/shynloc/ACKS-X-Article-Editor](https://github.com/shynloc/ACKS-X-Article-Editor)

---

## 它不是另一个 X 编辑器

一开始我就没有打算复制一套 X 官方编辑器。

这个项目采用的是另一条路线：

> **本地写作台 + X 格式转换 + 受控发布桥**

它把写作、转换和发布分成三个清楚的阶段：

- **写作阶段**：Markdown、图片和历史版本留在浏览器本地；
- **转换阶段**：把 Markdown AST 转换成适合 X Article 的结构，并提前显示降级结果；
- **发布阶段**：可以手动复制，也可以通过 OAuth 连接自己的 X Developer App 创建草稿。

这意味着，你始终保留一份独立于平台的 Markdown 真源。

平台编辑器是发布终点，不再是唯一的写作现场。

## 为什么强调“本地优先”

长文里可能有尚未公开的观点、工作记录、产品计划或私人素材。

因此，ACKS X Article Editor 默认遵循这些原则：

- [x] 文稿保存在浏览器 IndexedDB；
- [x] 自动保存并保留本地历史版本；
- [x] 图片使用本地 Blob，不主动上传；
- [x] 可导出包含 Markdown、原图、转换结构和校验结果的完整资源包；
- [x] 只有当你主动创建 X 草稿时，冻结后的内容和图片才会发送给 X；
- [ ] 不要求把 Client Secret、Bearer Token 或 Access Token 粘贴进网页。

登录体验账号也不会开启云同步。账号只控制自动发布权限，文章和图片仍然属于当前浏览器。

## 从 Markdown 到 X，中间发生了什么

![ACKS X Article Editor 发布架构](asset:__ARCHITECTURE_ASSET__)

整体链路可以概括为：

```text
Markdown 源文
  ↓  unified / remark 解析
Markdown AST
  ↓  兼容性转换与校验
X Content State
  ↓  表格、代码块生成 PNG
X Media Upload
  ↓  OAuth 2.0 PKCE
Article Draft
  ↓  用户再次确认
Publish
```

转换器不会假装所有 Markdown 都能被 X 原样支持。

例如：

| Markdown 内容            | X 发布策略                           |
| ------------------------ | ------------------------------------ |
| 标题、段落、粗体、斜体   | 转换为原生文字结构                   |
| 删除线、引用、列表、链接 | 保留对应结构或明确降级               |
| 本地图片                 | 上传到 X Media 后绑定 media ID       |
| 表格                     | 在本地生成 2x PNG，保留原始 Markdown |
| 代码块                   | 使用 Shiki 高亮并生成分页 PNG        |
| 不安全链接与缺失资源     | 阻止自动建稿并定位到源文             |

你可以在右侧看到“X 结构预览”，也可以打开校验面板查看：

- 哪些内容会图片化；
- 哪些样式会降级；
- 哪些资源缺失；
- 问题位于 Markdown 的哪一行。

**预览不是对 X 官方渲染的冒充。**它是一份发布前的结构检查。

## 技术栈

前端是一套离线优先的 React 应用：

- `React 19 + TypeScript + Vite`
- `CodeMirror 6`：Markdown 编辑、选择区、历史和列表输入规则
- `Dexie + IndexedDB`：文稿、图片 Blob 和版本快照
- `unified + remark-parse + remark-gfm`：Markdown AST
- `Canvas 2D + Shiki`：表格和代码图片
- `Web Workers`：转换、导入与压缩包检查
- `fflate + Web Crypto`：ZIP 资源包和 SHA-256 完整性校验

发布桥是一套尽量小的 Node 服务：

- `Node.js 24`
- `SQLite`
- `OAuth 2.0 Authorization Code + PKCE`
- `AES-256-GCM` 加密保存 OAuth token
- `HttpOnly + Secure + SameSite` 会话 Cookie
- CSRF、Origin、媒体类型和体积检查

生产部署使用两个隔离容器：

1. 非特权 Nginx：只提供静态应用，并把 `/api/x/` 转发到内网；
2. Node 发布桥：不映射公网端口，只保存加密 OAuth 会话和草稿记录。

## Markdown 工具栏，也认真做了

编辑器工具栏全部使用 SVG 图标，覆盖常见 Markdown 和扩展写法：

**H1–H6、粗体、斜体、删除线、引用、无序列表、有序列表、任务列表、表格、行内代码、代码块、链接、图片、脚注、公式和 Mermaid。**

列表输入还专门处理了一个很容易被忽略的问题：

```markdown
1. 第一项
2. 第二项
3. 第三项
```

输入第一项后按回车，会在源文中真实生成 `2.`，而不是让每一行都停留在 `1.` 再依赖渲染器“看起来正确”。空列表项再次回车则退出列表。

这篇文章本身也使用了标题、引用、粗体、删除线、任务列表、表格、代码块、链接和图片。它既是一篇介绍，也是一份真实的格式压力测试。

## 两种发布方式

### 方式一：手动发布

不登录也可以使用：

1. 点击“手动发布到 X”；
2. 打开 X Articles；
3. 分别复制标题和正文；
4. 表格、代码和本地图片逐张复制或下载上传；
5. 在 X 中检查后发布。

资源包是备份文件，不是 X 的导入格式。应用会明确告诉你哪些图片需要单独处理。

### 方式二：自动创建草稿并发布

如果你有自己的 X Developer App，可以填写 OAuth 2.0 Client ID：

1. 授权 X 账号；
2. 上传正文图片、表格图和代码图；
3. 创建 X Article 草稿；
4. 到 X 检查草稿；
5. 输入“发布”并进行最终确认。

自动发布不会在第一次点击时直接把内容公开。**先草稿，后发布**，是刻意保留的安全边界。

官方体验站采用邀请码账号：普通体验账号可以完成一次完整自动发布，管理员不限次数。每位体验者仍使用自己的 Client ID，API 用量归自己的 Developer App。

如果你想体验自动发布，可以在这篇文章下评论，或者私信我获取一次性注册邀请码。

## 五分钟自部署

如果你希望长期使用，推荐自行部署。

自部署版本默认不启用体验次数限制，你使用自己的域名、callback、Client ID 和 X API 余额。

```bash
git clone https://github.com/shynloc/ACKS-X-Article-Editor.git
cd ACKS-X-Article-Editor

corepack enable
pnpm install --frozen-lockfile
pnpm check

cp .env.example .env
docker compose build
docker compose up -d
```

`.env` 至少需要确认这些设置：

```env
EDITOR_PORT=5701
PUBLIC_BASE_URL=https://xeditor.example.com
X_SESSION_SECRET=请在服务器生成独立随机值
DEPLOYMENT_MODE=selfhost
```

然后在 X Developer Portal 中配置：

| 项目            | 设置                                                           |
| --------------- | -------------------------------------------------------------- |
| App permissions | Read and write                                                 |
| Type of App     | Native App / Public client                                     |
| Callback URI    | `https://你的域名/api/x/callback`                              |
| Website URL     | `https://你的域名`                                             |
| Scopes          | `tweet.read tweet.write users.read media.write offline.access` |

编辑器里只需要填写 **Client ID**。

不要填写 Client Secret、Bearer Token、OAuth 1.0 Consumer Secret 或手工 Access Token。

如果你习惯让 AI Agent 帮你部署，仓库里已经准备了一份完整提示词：

`docs/SELF_HOSTING_AGENT_PROMPT.md`

它包含服务器只读审计、Docker 隔离、HTTPS、X Developer 设置、候选验证、真实 OAuth 验收和回滚要求。

## 现在可以体验

在线体验：

[https://xeditor.acks.com.cn](https://xeditor.acks.com.cn)

- 不登录：本地写作、结构预览、导入导出、手动发布；
- 邀请码账号：使用自己的 Client ID 体验一次自动发布；
- 自部署：不限制自动发布次数。

项目源码：

[https://github.com/shynloc/ACKS-X-Article-Editor](https://github.com/shynloc/ACKS-X-Article-Editor)

如果它刚好解决了你的 Markdown → X Article 工作流，也欢迎帮项目点一个 **Star**。

问题、建议和兼容性反馈同样欢迎。这个项目仍在继续打磨，但它已经完成了最重要的一件事：

> 让写作者先在自己的节奏里完成文章，再决定如何把它交给平台。

---

_写作应该保持专注，发布应该清楚、可控、可回退。_[^1]

[^1]: ACKS X Article Editor 目前保持本地优先；清除浏览器站点数据前，请先导出资源包。
