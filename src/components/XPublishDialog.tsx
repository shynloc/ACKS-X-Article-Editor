import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Copy,
  LockSimple,
  PaperPlaneTilt,
  Plug,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type {
  Article,
  Conversion,
  MediaBinding,
  TargetNode,
} from "../core/types";
import { sha256 } from "../core/types";
import { materializeXRequest, validateConversion } from "../core/validate";
import { db } from "../services/database";
import { getRenderParts } from "../services/archive";
import {
  authorizeX,
  configureX,
  createXDraft,
  disconnectX,
  getXStatus,
  publishXDraft,
  uploadXMedia,
  type XStatus,
} from "../services/xBridge";

export function XPublishDialog({
  article,
  conversion,
  close,
  onNotice,
}: {
  article: Article;
  conversion: Conversion | null;
  close: () => void;
  onNotice: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<XStatus>();
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [draft, setDraft] = useState<{
    articleId: string;
    requestHash: string;
  }>();
  const [confirmation, setConfirmation] = useState("");
  const refresh = async () => {
    const next = await getXStatus();
    setStatus(next);
    setClientId(next.clientId);
  };
  useEffect(() => {
    dialog.current?.showModal();
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
    return () => dialog.current?.close();
  }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  const connect = () =>
    run("connect", async () => {
      if (clientId.trim() !== status?.clientId) {
        await configureX(clientId.trim());
        await refresh();
      }
      const result = await authorizeX();
      location.assign(result.url);
    });
  const createDraft = () =>
    run("draft", async () => {
      if (!conversion) throw new Error("转换仍在进行，请稍后再试。");
      const blocking = validateConversion(article, conversion).filter(
        (issue) => issue.severity === "error",
      );
      if (blocking.length)
        throw new Error(
          `请先修复 ${blocking.length} 个转换错误：${blocking[0].message}`,
        );
      const media: Record<string, MediaBinding> = {};
      const uploadAsset = async (id: string) => {
        if (media[id]) return;
        const stored = await db.assets.get(id);
        if (!stored) throw new Error("本地图片资源缺失，请重新关联。");
        setProgress(`正在上传图片 ${Object.keys(media).length + 1}…`);
        media[id] = await uploadXMedia(stored.blob);
      };
      if (article.coverId) await uploadAsset(article.coverId);
      for (const node of conversion.nodes)
        if (node.kind === "image") {
          if (!node.assetId)
            throw new Error("存在未关联的远程图片，请先下载并关联本地文件。");
          await uploadAsset(node.assetId);
        }
      const nodes: TargetNode[] = [];
      for (const node of conversion.nodes) {
        if (node.kind !== "render") {
          nodes.push(node);
          continue;
        }
        const parts = await getRenderParts(node, article);
        for (const [index, part] of parts.entries()) {
          const id = `render-${node.id}-${index}`;
          setProgress(
            `正在上传${node.renderKind === "table" ? "表格" : "代码"}图片 ${index + 1}/${parts.length}…`,
          );
          media[id] = await uploadXMedia(part.blob);
          nodes.push({
            kind: "image",
            id: `${node.id}-${index}`,
            assetId: id,
            alt: node.renderKind === "table" ? "表格" : "代码",
            caption: "",
            line: node.line,
            from: node.from,
            to: node.to,
          });
        }
      }
      const request = materializeXRequest(
        article,
        { ...conversion, nodes },
        media,
      );
      const requestHash = await sha256(JSON.stringify(request));
      setProgress("正在创建 X Article 草稿…");
      const result = await createXDraft(request, requestHash);
      setDraft({ articleId: result.articleId, requestHash });
      setProgress("");
    });
  const publish = () =>
    run("publish", async () => {
      if (!draft || confirmation !== "发布")
        throw new Error("请输入“发布”确认公开操作。");
      const result = await publishXDraft(draft.articleId, draft.requestHash);
      onNotice(
        `X Article 已发布${result.postId ? ` · Post ${result.postId}` : ""}`,
      );
      close();
    });
  return (
    <dialog
      ref={dialog}
      className="x-publish-dialog"
      aria-label="直接发布到 X"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="dialog-heading">
        <h2>直接发布到 X</h2>
        <button
          className="icon-button"
          aria-label="关闭对话框"
          onClick={close}
          disabled={!!busy}
        >
          <X size={22} />
        </button>
      </div>
      <div className="dialog-content">
        <p className="dialog-intro">
          通过 X 官方 OAuth 和 Articles API
          上传图片、创建草稿，再由你确认是否公开发布。本站不会要求 Client
          Secret，也不会把访问令牌交给浏览器。
        </p>
        {!status?.connected ? (
          <div className="x-connect-card">
            <label>
              <span>X Developer Client ID</span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="从 X Developer Portal 复制 Client ID"
                autoComplete="off"
              />
            </label>
            <div className="callback-field">
              <span>OAuth 2.0 回调地址</span>
              <code>{status?.redirectUri || "正在读取…"}</code>
              <button
                className="icon-button"
                aria-label="复制回调地址"
                onClick={() =>
                  status?.redirectUri &&
                  navigator.clipboard.writeText(status.redirectUri)
                }
              >
                <Copy />
              </button>
            </div>
            <p className="privacy-note">
              <LockSimple />在 X Developer Portal 创建 OAuth 2.0 Public Client /
              SPA，并将上面的地址设为精确回调地址。所需权限：tweet.read、tweet.write、users.read、media.write、offline.access。
            </p>
            <button
              className="primary-button wide"
              disabled={!status || !clientId.trim() || !!busy}
              onClick={connect}
            >
              <Plug />
              {busy === "connect" ? "正在跳转 X 授权…" : "保存并连接 X"}
            </button>
            <a
              href="https://developer.x.com/en/portal/dashboard"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开 X Developer Portal
            </a>
          </div>
        ) : (
          <>
            <div className="x-account">
              <CheckCircle size={22} />
              <span>
                已连接 {status.user ? `@${status.user.username}` : "X 账号"}
              </span>
              <button
                className="quiet-button"
                onClick={() =>
                  run("disconnect", async () => {
                    await disconnectX();
                    setDraft(undefined);
                    await refresh();
                  })
                }
              >
                断开
              </button>
            </div>
            {!draft ? (
              <button
                className="primary-button wide"
                disabled={!!busy || !conversion}
                onClick={createDraft}
              >
                <PaperPlaneTilt />
                {busy === "draft"
                  ? progress || "正在准备草稿…"
                  : "上传资源并创建 X 草稿"}
              </button>
            ) : (
              <div className="publish-confirm">
                <CheckCircle size={28} />
                <strong>X 草稿已创建</strong>
                <code>{draft.articleId}</code>
                <p>
                  草稿不会公开。若已在 X 中检查并确定发布，请在下面输入“发布”。
                </p>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="输入：发布"
                  autoComplete="off"
                />
                <button
                  className="primary-button"
                  disabled={confirmation !== "发布" || !!busy}
                  onClick={publish}
                >
                  {busy === "publish" ? "正在发布…" : "确认公开发布到 X"}
                </button>
                <a
                  href="https://x.com/compose/articles"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  先到 X Articles 检查草稿
                </a>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="x-api-error" role="alert">
            <WarningCircle />
            {error}
          </p>
        )}
        <p className="fine-print">
          X API 能力、访问级别和配额由 X 决定。成功创建本地请求不代表 X
          已接受；只有返回草稿 ID 或 Post ID 才视为对应步骤完成。
        </p>
      </div>
    </dialog>
  );
}
