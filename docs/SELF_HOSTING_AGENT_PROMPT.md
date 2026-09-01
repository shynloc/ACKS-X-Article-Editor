# ACKS X Article Editor — AI Agent 自部署执行提示词

复制下面整段内容给具备终端、Git、Docker 和 SSH 能力的 AI Agent。先替换尖括号变量；不要在提示词或聊天中填写 Client Secret、Bearer Token、Access Token、私钥或密码。

```text
你是一名谨慎的生产部署工程师。请把 ACKS X Article Editor 部署到我的服务器，并指导我完成 X Developer OAuth 2.0 配置。持续工作到候选环境、HTTPS、OAuth 回调和本地写作流程都得到验证；遇到必须由我登录 X 或点击授权的步骤时，完成此前所有工作，再明确告诉我需要执行的唯一人工步骤。

部署参数：
- Git 仓库：https://github.com/shynloc/ACKS-X-Article-Editor.git
- SSH 目标：<SSH_ALIAS_OR_USER_HOST>
- 生产域名：<EDITOR_DOMAIN，例如 xeditor.example.com>
- 服务器发行目录：<RELEASE_ROOT，默认 /opt/acks-x-article-editor>
- 候选 loopback 端口：<EDITOR_PORT，例如 5704>
- 反向代理：<Caddy 或 Nginx；先发现现状，不要猜>

不可违反的安全边界：
1. 先只读审计服务器：操作系统、CPU 架构、磁盘、Docker/Compose、现有容器、端口、反向代理配置、证书方式和目标目录。不要停止、重启、重建、移动或删除任何现有服务。
2. 不运行 docker system prune，不覆盖全局 Caddy/Nginx 配置，不修改防火墙或 DNS，除非我明确要求。
3. 使用独立发行目录、唯一镜像标签、独立 Compose 项目、独立网络与持久卷。Web 端口只绑定 127.0.0.1；发布桥不得映射到公网。
4. 不读取、打印、提交或记录 Client Secret、Bearer Token、Access Token、OAuth code、refresh token、私钥、Cookie 或私人稿件。Client ID 可以显示；本项目不需要 Client Secret。
5. 生产密钥 X_SESSION_SECRET 必须在服务器上使用密码学安全随机数生成，写入权限 0600 的 .env；不要回显明文，不要复制示例值。
6. 自部署必须设置 DEPLOYMENT_MODE=selfhost。不要启用维护者体验站的 hosted 邀请账号模式，不要使用 xeditor.acks.com.cn 作为 PUBLIC_BASE_URL。
7. 所有切换都必须有可执行回滚：保留旧镜像、旧发行目录、旧代理配置备份和旧上游端口。

执行步骤：
A. 本地或构建机检查
- 检查仓库状态、当前 commit、package.json、pnpm-lock.yaml、README、docs/DEPLOYMENT.md、docs/X_PUBLISHING.md、compose.yaml、Dockerfile.runtime 和 Dockerfile.bridge。
- 使用 package.json engines 指定的 Node.js 版本和锁定的 pnpm，执行 pnpm install --frozen-lockfile。
- 依次执行 pnpm check、node scripts/test-built-worker.mjs、pnpm test:sites。
- 记录 commit、应用版本和 dist/client/health.json 的 build 标识。任一检查失败时先修复，不得把失败构建部署为生产候选。

B. 服务器候选发行
- 在 <RELEASE_ROOT>/releases/<version>-<commit>/ 创建新发行，不覆盖旧发行。
- 上传经过验证的 dist/client、server、compose.yaml、Dockerfile.runtime、Dockerfile.bridge 和 deploy/nginx.conf；核对上传包 SHA-256。
- 创建 .env，至少包含：
  COMPOSE_PROJECT_NAME=<独立项目名>
  EDITOR_IMAGE=<唯一静态镜像标签>
  BRIDGE_IMAGE=<唯一桥镜像标签>
  EDITOR_PORT=<候选 loopback 端口>
  PUBLIC_BASE_URL=https://<EDITOR_DOMAIN>
  X_SESSION_SECRET=<在服务器生成，不回显>
  DEPLOYMENT_MODE=selfhost
- 将 .env 权限设为 0600。运行 docker compose config --quiet，分别构建静态镜像与桥镜像。
- 启动候选，不改代理。等待两个容器 healthy。

C. 候选验证
- 验证 http://127.0.0.1:<EDITOR_PORT>/health.json 返回正确版本和 build。
- 验证 /api/x/health 返回 200，并确认桥容器没有公网端口映射。
- 验证未知 API 返回 404，非 API POST 不回退到应用 HTML，恶意 Origin 与错误 CSRF 被拒绝。
- 检查 CSP、X-Frame-Options、Referrer-Policy、Cache-Control，以及 /sw.js 不缓存或拦截 /api/ 路径。
- 验证页面包含“手动发布到 X”“直接发布到 X”和 Markdown 工具栏；验证浅色/深色、创建文稿、自动保存、导出资源包和重新导入。

D. HTTPS 与反向代理
- 备份目标站点的现有代理配置。只新增或修改 <EDITOR_DOMAIN> 对应的独立站点，上游为 127.0.0.1:<EDITOR_PORT>。
- Caddy 示例：
  <EDITOR_DOMAIN> {
      encode zstd gzip
      reverse_proxy 127.0.0.1:<EDITOR_PORT>
  }
- 修改后先 validate，再 reload；失败则立即恢复备份。不要重启无关服务。
- 从外部验证 https://<EDITOR_DOMAIN>/health.json、/api/x/health、证书、HTML、JS、CSS、字体和 Service Worker。

E. 指导我配置 X Developer
- 让我在自己的 X Developer Portal 创建或选择 App，启用 OAuth 2.0。
- 权限选择 Read and write；类型选择 Native App / Public client。
- 精确 Callback URI：https://<EDITOR_DOMAIN>/api/x/callback
- Website URL 使用 https://<EDITOR_DOMAIN>。
- 所需 scopes：tweet.read、tweet.write、users.read、media.write、offline.access。
- 只让我复制 OAuth 2.0 Client ID 到编辑器。明确警告：不要提供 Client Secret、Bearer Token、OAuth 1.0 Consumer Secret、Access Token 或 refresh token。
- 提醒我在 Developer Portal 最底部保存设置。

F. OAuth 与真实工作流验收
- 打开“直接发布到 X”，填入 Client ID，点击连接。此时由我在 X 页面登录并点击 Authorize app。
- 授权后必须真实请求 /api/x/callback，返回编辑器并显示已连接的 X 用户；不能仅凭回到首页判断成功。
- 使用不敏感的测试文稿，验证图片上传、表格/代码图片、创建 Article 草稿。记录 X 返回草稿 ID，但不要在公开日志中记录正文或 token。
- 在我明确确认后再执行最终公开发布；验证返回 Post ID 并在 X 页面可见。未经我在发布界面的最终确认，不得代表我发布内容。

G. 收尾与报告
- 更新 current 指针到新发行，但保留上一发行、镜像、代理备份和数据卷。
- 不清除浏览器站点数据，因为 IndexedDB 保存本地稿件。
- 汇报：commit、版本、build、容器/端口、公开 URL、健康检查、OAuth/草稿/发布各自的真实状态、仍存在的限制、回滚命令。
- 回滚必须只影响本项目：恢复旧代理上游或在旧发行目录执行其 docker compose up -d --no-build，然后重新验证。不得清理其他 Docker 资源。

验收标准：
- 测试和生产构建全部通过。
- 静态容器、发布桥容器 healthy；仅 Web 端口绑定 loopback。
- HTTPS 与安全头正确，其他既有站点无回归。
- callback 使用部署者自己的域名，Service Worker 不拦截 /api/x/callback。
- 自部署模式不显示体验账号限制。
- OAuth、媒体、草稿、发布分别以 X 的真实返回为证据；未测试的步骤必须明确写“未验收”，不能推断成功。
```
