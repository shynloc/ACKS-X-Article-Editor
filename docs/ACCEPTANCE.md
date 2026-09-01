# 验收记录

## Hosted 体验账号与自部署模式

实现邀请码注册、scrypt 密码哈希、HttpOnly 会话、登录限速、普通账号一次直发、管理员不限次数、邀请码管理、额度调整和账号停用。额度绑定到服务器工作流，在 X 成功返回草稿 ID 后与草稿记录同一 SQLite 事务扣除；上传或网络失败不扣额度，同一账号不能并行保留多个未完成直发工作流。`DEPLOYMENT_MODE=selfhost` 不要求账号且不限次数。

桥接集成测试使用本地模拟 X OAuth、media、draft 与 publish 服务，真实走完邀请码注册、OAuth callback、媒体上传、草稿创建、额度扣除、草稿发布和第二次工作流拒绝；管理员测试覆盖生成邀请码、读取账号列表和增加额度。AI Agent 自部署提示词包含只读审计、独立候选、密钥、callback、X Developer 设置、真实验收与回滚。

生产构建 `d627ae5301633011` 已部署到 `xeditor.acks.com.cn` 的 hosted 模式。升级前使用 SQLite `VACUUM INTO` 生成一致性备份并保存在服务器权限 0600 的独立备份目录；迁移后原 OAuth 连接、一个草稿和一个已发布记录均保留。公开状态接口返回 `deploymentMode=hosted`、`registrationMode=invite`，未登录配置 Client ID 返回 401；静态包包含账号、邀请码注册、管理员邀请码和直发登录门槛。静态与桥容器均 healthy，主站、Watermarker、Audio 跟随跳转最终状态为 200。浏览器应用更新后真实看到账号窗口与未登录直发门槛；未替用户创建账号或设置密码。

## 0.2.0 Markdown 工具栏与 X 发布桥

2026-09-01：44 项 Vitest 测试、TypeScript、生产构建通过。列表测试覆盖连续编号、修正粘贴后重复的 `1.`、无序/任务列表继续和空项退出。发布桥本地请求验证了 HttpOnly / SameSite Cookie、`Cache-Control: no-store`、非法 Origin 拒绝、CSRF 拒绝、Client ID 保存及 PKCE 授权 URL 生成。

首次部署时尚未取得维护者的 X Developer Client ID，因此当时只验证到 OAuth 前置边界；以下记录保留该阶段事实和后续修复过程。

同日部署构建 `8c6175de9401fdc7` 到 `xeditor.acks.com.cn`：静态容器与发布桥容器均为 healthy，公开 `/health.json` 和 `/api/x/health` 返回 200，OAuth 状态接口返回精确 HTTPS 回调地址并设置 Secure / HttpOnly / SameSite Cookie；公开 JS 包含工具栏、手动发布与直接发布入口。`acks.com.cn`、Watermarker 与 Audio 的跟随跳转最终状态均为 200。浏览器控制环境因原本地错误页的 URL 策略拒绝导航，未取得本轮运行截图；视觉验收仍需人工刷新站点确认。

12:00 用户首次实测发现授权页返回后没有连接账号。服务端证据显示两次 `/authorize` 成功，但没有任何 `/callback` 请求，相关会话保持 pending、token 为 0、草稿为 0；截图时间显示授权尝试早于回调地址配置截图。修复版在状态接口中公开 pending 状态，返回主页时自动恢复发布对话框并提示“未收到 X 回调”；回调 state、取消授权、缺少 code 和 token 交换失败均重定向到可见错误，不再显示无上下文 JSON。真实成功回调仍须在 X Developer Portal 保存精确 URI 后复测。

12:14 再次实测确认 Client ID 与回调地址一致，但服务器仍无 `/callback`。最终定位为离线 Service Worker 对所有 navigation 无条件返回缓存 `/index.html`，在浏览器侧吞掉了 `/api/x/callback?code=...`。修复后 `/api/` 全路径绕过 Service Worker 并直达网络；新增独立 Service Worker 路由测试，验证 OAuth callback 与状态 API 不调用 `respondWith`，普通应用导航和已缓存静态资源仍保留离线能力。

Service Worker 修复部署后，维护者真实完成 X OAuth 授权、媒体上传、Article 草稿创建与正式发布；正文排版、普通图片和表格图片均进入 X Article。该结果由用户在 X 页面确认，说明完整发布链路通过，不再属于“仅本地请求成功”。

状态：**私有预览版本，尚未达到公开发行条件。**

## 0.1.1 剪贴板修复

新增正文富文本、独立标题、单张 PNG 复制和下载；复制正文用白名单结构生成，不携带 Blob URL。已在用户正常打开的 HTTP 页面完成本地粘贴验证，PNG 实际到达测试接收端。38 个单元测试通过。详见 [手动复制与验收记录](CLIPBOARD.md)。

2026-09-01 已部署 0.1.1（构建 de01a933f1c27d12）；线上 HTTP 检查与控件加载通过。线上跨页自动粘贴未得到可靠最终回执，X 编辑器粘贴仍待人工验证，不宣称完整发布流程通过。

之前的浏览器安全策略阻断记录保留为历史事实。本次没有访问被阻断的 file URL，而是使用用户已打开的正常 HTTP 写作台；没有切换浏览器或代理绕过限制。本次检查限于复制功能，不等同于下文尚待完成的整套端到端验收。

## 已取得的证据

- TypeScript 类型检查通过。
- 27 个 Vitest 测试与 4 个打包/路由测试通过；GitHub Actions Core checks 在 Node.js 24 上通过（运行 33377680484，源码 ac2de784a4aaa9230c71cf3bdb82bda543564b82）。
- Ajv 文稿校验器已在构建时预编译，在禁止字符串代码生成的环境中通过验证，生产 CSP 无需 unsafe-eval。
- 转换、UTF-16 样式范围、图片引用、列表/标题降级、X DTO 边界、本地事务、过期写入保护、资源包往返与安全检查已建立单元测试。
- 生产 Worker 在不提供 document/DOM 的 Node 线程中回归验证标题、emoji 样式与表格转换。
- 本地非特权 Docker 运行层启动，健康接口返回 200，loopback 绑定与安全响应头已检查。
- GitHub 仓库为 PRIVATE，匿名访问返回 404。

## 未完成的验收

- 完整浏览器导入、编辑、保存、刷新恢复、出图、导出、第二浏览器恢复与离线回归。
- 浏览器在首次查看后被安全策略阻止后续自动访问；未尝试通过其他浏览器、端口或代理绕过。
- 首次浏览器截图发现预览没有更新。已定位并修复 Worker 使用 DOM 依赖入口的问题，并新增生产 Worker 回归；完整浏览器复验仍未完成。
- 双主题与响应式最终对照截图、中文 IME、性能目标和长会话验证。

类型检查、单元测试、HTTP 健康与部署成功都不能替代以上未完成事项。线上 HTTP 记录见下文。不能将该版本称为“全部开发可用”或据此公开仓库。

## 2026-08-31 部署记录

- 已部署私有预览构建到 `https://xeditor.acks.com.cn`，HTTPS `/health.json` 返回 200，构建标识 `44a46001f23bbbcd`。
- 服务器镜像 `acks-x-article-editor:preview-ac2de78`，平台 linux/amd64，容器绑定 `127.0.0.1:5701`，健康状态正常。
- 镜像 ID `sha256:62d59c14f550e93c2ff98f5b3abdf8d52573871ef626bac970e62902763ac657`；传输包 SHA-256 `744c9f454db344693db1784e1b94061a3730533223d2d55e75ff60d214e72c3b`，本地与服务器一致。
- 发行目录 `/opt/acks-x-article-editor/releases/20260831-ac2de78`，当前指针 `/opt/acks-x-article-editor/current`。
- Caddy 仅新增 `/etc/caddy/xeditor.Caddyfile` 的导入。原配置保留在 `/etc/caddy/backups/xeditor-20260831-ac2de78/Caddyfile`。
- 已验证 HTTP-01 证书签发成功；未修改 DNS、Cloudflare TLS 模式、其他站点上游或其他容器。
- 本地 Docker 与公网 HTTPS 的 HTTP 冒烟均通过：首页、入口 JS/CSS/图像资源、CSP、Service Worker 版本、禁止缓存更新脚本和拒绝 POST（405）。执行命令为 `node scripts/smoke-http.mjs https://xeditor.acks.com.cn`；该脚本明确不执行浏览器工作流。
- 主站、水印站和音频站部署前后均返回 200；原有容器保持运行。

浏览器端到端与视觉 QA 仍未通过，不因本节新增而改变预览版状态。
