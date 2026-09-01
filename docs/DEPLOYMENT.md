# 部署与回滚

## 目标拓扑

浏览器 → HTTPS / Caddy → `127.0.0.1:5701` → 非特权 Nginx 容器。Nginx 提供 `dist/client/`，并把 `/api/x/` 代理到 Compose 内网的 Node 发布桥。发布桥只保存加密 OAuth 会话和已创建草稿的完整性记录；稿件库仍只在浏览器 IndexedDB。

自部署在 `.env` 中使用 `DEPLOYMENT_MODE=selfhost`，不启用官方体验站的邀请码和一次直发限制。只有维护者运营的公共体验站才使用 `DEPLOYMENT_MODE=hosted`；hosted 模式必须先通过 `admin-cli.mjs create-admin-invite` 生成一次性管理员邀请码，再由管理员在界面中创建普通体验邀请码。

线上域名：`xeditor.acks.com.cn`。SSH 使用操作者本机已配置的 `acks` 别名；仓库不保存主机密钥或登录凭证。

## 发行目录

建议使用 `/opt/acks-x-article-editor/releases/<release-id>/` 保存每次静态产物、Compose、运行层 Dockerfile 和发行记录，`current` 指向当前发行。镜像使用唯一发行标签，不覆盖 `latest`。保留上一发行和镜像，不执行 Docker 全局清理。

## 发布顺序

1. 确认源码提交、依赖锁文件和测试结果，生成静态构建。
2. 在发行目录 `.env` 生成唯一 `X_SESSION_SECRET`，权限设为 `0600`；不要复制示例值或提交到 Git。
3. 检查现有容器、Caddy 站点、端口与磁盘空间。
4. 上传新发行到新目录，分别构建静态应用与发布桥镜像。
5. 初次部署可直接启动新服务；更新时先用另一个未占用的 loopback 端口启动候选。
6. 检查两个容器健康、`/health.json`、`/api/x/health`、HTML、资源、CSP、缓存策略、404、CSRF 与拒绝写入行为。
7. 备份 Caddy 配置，新增或切换该域名的单独站点，先 validate 再 reload。
8. 从外网核验 HTTPS、静态工作流和 OAuth 前置状态；真实账号联调须记录草稿 ID，公开发布须另行确认。

不要重启或重新构建其他项目，不改服务器防火墙或 DNS，除非已定位确需变更并获得相应授权。新服务保持仅 loopback 可访问。

## 回滚

恢复本项目之前的 `EDITOR_IMAGE` / Compose 配置或将 Caddy 上游切回上一候选端口，验证后 reload。只停止本项目的新候选容器，保留镜像用于排查。不要运行 `docker system prune` 或删除其他项目网络、卷。

浏览器已缓存的应用不会仅因服务端回滚就立刻替换。确认更新提示的版本；必要时以同一 origin 发布更高标识的兼容回滚包。**不要要求用户清除站点数据**，那会删除 IndexedDB 稿件。任何 schema 迁移都必须先有用户资源包备份。

## 离线与缓存

首次访问需要网络，必须等“已准备好离线使用”出现。应用只缓存自身静态资源，不把文章写到 Cache Storage。`sw.js` 禁止缓存，更新等待用户选择“保存并更新”。首版没有跨域名或跨设备数据迁移服务，应通过资源包迁移。

## 故障定位

本次使用 Cloudflare 代理。新站点限定 ACME HTTP-01 验证（`issuer acme { disable_tlsalpn_challenge }`），因为代理不透传 TLS-ALPN 挑战。曾出现证书机构 CAA 查询超时及证书下载 404；未修改 DNS 或降低 TLS 安全模式，后续正常签发。

- 双击源码 HTML 空白：使用 HTTP 服务入口，不能用 `file://` 运行 Vite 源码。
- 525：分别检查 Cloudflare 到源站 TLS、Caddy 站点证书和域名对应关系，不能只看容器健康。
- 文稿不见：确认浏览器、配置文件、域名、协议和端口是否相同；不要清库。
- 预览不更新：检查 Worker 错误；转换器依赖必须使用不依赖 DOM 的实体解码实现。
- 保存失败：先导出恢复包，检查配额和权限，不通过自动删除稿件腾空间。
