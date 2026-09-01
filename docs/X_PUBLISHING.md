# X 发布桥指南

## 能力依据

X 官方 API 当前提供媒体上传、创建 Article 草稿、发布 Article 草稿，以及 OAuth 2.0 Authorization Code with PKCE。官方文档：[Articles 概览](https://docs.x.com/x-api/articles/introduction)、[创建草稿](https://docs.x.com/x-api/articles/create-draft-article)、[发布 Article](https://docs.x.com/x-api/articles/publish-article)、[媒体上传](https://docs.x.com/x-api/media/upload-media)、[OAuth 2.0 PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)。X 可能调整访问级别、价格、配额或字段，线上行为以 X 的实时响应为准。

## 为什么需要同源后端

X API 端点不向任意网页开放浏览器 CORS。把 bearer token 存入 IndexedDB 或 localStorage 也会扩大 XSS 与扩展读取风险。因此浏览器只与本站 `/api/x/` 通信；发布桥持有并刷新 token，再调用 X。

发布桥只接受同源请求和 CSRF token。OAuth token 使用部署密钥派生的 AES-256-GCM 密钥加密写入 SQLite。浏览器收到随机会话 Cookie，属性为 HttpOnly、SameSite=Lax，HTTPS 下同时使用 Secure。

## X Developer Portal 设置

1. 创建支持 OAuth 2.0 的应用，客户端类型选择 Public Client / SPA。
2. 在编辑器“直接发布到 X”中复制精确回调地址，例如 `https://xeditor.acks.com.cn/api/x/callback`。
3. 将回调地址原样加入应用允许列表；协议、域名、路径和尾部字符都必须一致。
4. 使用界面显示的 Client ID。不要把 Client Secret、bearer token 或 private key 粘贴到编辑器。
5. 授权范围为 `tweet.read tweet.write users.read media.write offline.access`。

## 发布顺序

1. 浏览器冻结当前转换结果。
2. 原图、封面、表格 PNG 和代码 PNG 逐张上传到 X media API。
3. 用 X 返回的 media ID 组装 Article `content_state`，计算 SHA-256 请求哈希。
4. 创建草稿并保存由 X 返回的 Article ID。
5. 用户可先到 X Articles 检查草稿。
6. 只有输入“发布”后，服务端才会核对会话、Article ID 与请求哈希并调用 publish API。

官方 hosted 体验站在媒体上传前要求邀请码账号。普通账号只能保留一个未完成工作流，并在 X 成功返回草稿 ID 后消耗一次额度；发布该草稿不重复计数。管理员不限次数。自部署 `selfhost` 模式不启用此限制，API 用量与费用归部署者自己的 X Developer App。

外链图片 URL 不是 Article 图片实体。它可以保留为链接，但 X 原生图片要求 media ID，所以图床不会省略媒体上传步骤。

## 验收边界

本地测试可以证明 CSRF、Cookie、加密存储、授权 URL 和请求组装正常，不能证明某个 X Developer 账户具备 Articles 权限。真实联调至少应记录：授权账号、X 返回的 media ID、Article 草稿 ID、草稿在 X 页面可见，以及在明确确认后返回的 Post ID。日志与截图必须遮盖 token、state、授权码和私人稿件。
