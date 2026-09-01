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
  startDirectWorkflow,
  uploadXMedia,
  type XStatus,
} from "../services/xBridge";
import { localizeKnownMessage, useI18n } from "../i18n";

export function XPublishDialog({
  article,
  conversion,
  close,
  onNotice,
  onRequireAccount,
}: {
  article: Article;
  conversion: Conversion | null;
  close: () => void;
  onNotice: (message: string) => void;
  onRequireAccount: () => void;
}) {
  const { t, language } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<XStatus>();
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [draft, setDraft] = useState<{
    articleId: string;
    requestHash: string;
    workflowId: string;
  }>();
  const [confirmation, setConfirmation] = useState("");
  const confirmationWord = language === "en" ? "publish" : "发布";
  const refresh = async () => {
    const next = await getXStatus();
    setStatus(next);
    setClientId(next.clientId);
    if (
      next.workflow?.status === "draft" &&
      next.workflow.articleId &&
      next.workflow.requestHash
    )
      setDraft({
        articleId: next.workflow.articleId,
        requestHash: next.workflow.requestHash,
        workflowId: next.workflow.id,
      });
    if (next.connected)
      try {
        sessionStorage.removeItem("acks-x-oauth-pending");
      } catch {}
  };
  useEffect(() => {
    dialog.current?.showModal();
    refresh().catch((e) =>
      setError(
        localizeKnownMessage(
          e instanceof Error ? e.message : String(e),
          language,
        ),
      ),
    );
    return () => dialog.current?.close();
  }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        localizeKnownMessage(
          e instanceof Error ? e.message : String(e),
          language,
        ),
      );
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
      try {
        sessionStorage.setItem("acks-x-oauth-pending", "1");
      } catch {}
      location.assign(result.url);
    });
  const createDraft = () =>
    run("draft", async () => {
      if (!conversion) throw new Error("转换仍在进行，请稍后再试。");
      const started = await startDirectWorkflow();
      if (
        started.workflow.status === "draft" &&
        started.workflow.articleId &&
        started.workflow.requestHash
      ) {
        setDraft({
          articleId: started.workflow.articleId,
          requestHash: started.workflow.requestHash,
          workflowId: started.workflow.id,
        });
        return;
      }
      const workflowId = started.workflow.id;
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
        setProgress(
          t("正在上传图片 {number}…", {
            number: Object.keys(media).length + 1,
          }),
        );
        media[id] = await uploadXMedia(stored.blob, workflowId);
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
            t("正在上传{kind}图片 {current}/{total}…", {
              kind: t(node.renderKind === "table" ? "表格" : "代码"),
              current: index + 1,
              total: parts.length,
            }),
          );
          media[id] = await uploadXMedia(part.blob, workflowId);
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
      setProgress(t("正在创建 X Article 草稿…"));
      const result = await createXDraft(request, requestHash, workflowId);
      setDraft({ articleId: result.articleId, requestHash, workflowId });
      setProgress("");
      await refresh();
    });
  const publish = () =>
    run("publish", async () => {
      if (!draft || confirmation !== confirmationWord)
        throw new Error(t("请输入确认词以确认公开操作。"));
      const result = await publishXDraft(
        draft.articleId,
        draft.requestHash,
        draft.workflowId,
      );
      onNotice(
        `${t("X Article 已发布")}${result.postId ? ` · Post ${result.postId}` : ""}`,
      );
      close();
    });
  return (
    <dialog
      ref={dialog}
      className="x-publish-dialog"
      aria-label={t("直接发布到 X")}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="dialog-heading">
        <h2>{t("直接发布到 X")}</h2>
        <button
          className="icon-button"
          aria-label={t("关闭对话框")}
          onClick={close}
          disabled={!!busy}
        >
          <X size={22} />
        </button>
      </div>
      <div className="dialog-content">
        <p className="dialog-intro">
          {t(
            "通过 X 官方 OAuth 和 Articles API 上传图片、创建草稿，再由你确认是否公开发布。本站不会要求 Client Secret，也不会把访问令牌交给浏览器。授权只连接账号，不会自动发布文章。",
          )}
        </p>
        {status?.deploymentMode === "hosted" && !status.account ? (
          <div className="x-login-gate">
            <LockSimple size={30} />
            <strong>{t("直接发布需要体验账号")}</strong>
            <p>
              {t(
                "登录后可以使用自己的 X Developer Client ID。普通体验账号有一次完整直发额度；手动发布不受影响。",
              )}
            </p>
            <button
              className="primary-button wide"
              onClick={() => {
                close();
                onRequireAccount();
              }}
            >
              {t("登录或使用邀请码注册")}
            </button>
          </div>
        ) : !status?.connected ? (
          <div className="x-connect-card">
            {status?.pending && (
              <p className="oauth-pending-note" role="status">
                <WarningCircle />
                {t(
                  "上次授权没有收到 X 回调。请确认开发者后台已经保存精确回调地址，再重新发起授权。",
                )}
              </p>
            )}
            <label>
              <span>X Developer Client ID</span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t("从 X Developer Portal 复制 Client ID")}
                autoComplete="off"
              />
            </label>
            <div className="callback-field">
              <span>{t("OAuth 2.0 回调地址")}</span>
              <code>{status?.redirectUri || t("正在读取…")}</code>
              <button
                className="icon-button"
                aria-label={t("复制回调地址")}
                onClick={() =>
                  status?.redirectUri &&
                  navigator.clipboard.writeText(status.redirectUri)
                }
              >
                <Copy />
              </button>
            </div>
            <p className="privacy-note">
              <LockSimple />
              {t(
                "在 X Developer Portal 创建 OAuth 2.0 Public Client / SPA，并将上面的地址设为精确回调地址。所需权限：tweet.read、tweet.write、users.read、media.write、offline.access。",
              )}
            </p>
            <button
              className="primary-button wide"
              disabled={!status || !clientId.trim() || !!busy}
              onClick={connect}
            >
              <Plug />
              {busy === "connect"
                ? t("正在跳转 X 授权…")
                : status?.pending
                  ? t("重新发起 X 授权")
                  : t("保存并连接 X")}
            </button>
            <a
              href="https://developer.x.com/en/portal/dashboard"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("打开 X Developer Portal")}
            </a>
          </div>
        ) : (
          <>
            <div className="x-account">
              <CheckCircle size={22} />
              <span>
                {t("已连接")} {status.user ? `@${status.user.username}` : "X"}
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
                {t("断开")}
              </button>
            </div>
            {status.account && (
              <p className="direct-allowance">
                {status.account.role === "admin" ||
                status.account.directRemaining < 0
                  ? t("管理员 · 直接发布不限次数")
                  : t("体验额度：剩余 {remaining} / {limit} 次", {
                      remaining: status.account.directRemaining,
                      limit: status.account.directLimit,
                    })}
              </p>
            )}
            {!draft ? (
              <button
                className="primary-button wide"
                disabled={!!busy || !conversion}
                onClick={createDraft}
              >
                <PaperPlaneTilt />
                {busy === "draft"
                  ? progress || t("正在准备草稿…")
                  : t("上传资源并创建 X 草稿")}
              </button>
            ) : (
              <div className="publish-confirm">
                <CheckCircle size={28} />
                <strong>{t("X 草稿已创建")}</strong>
                <code>{draft.articleId}</code>
                <p>
                  {t(
                    "草稿不会公开。若已在 X 中检查并确定发布，请在下面输入确认词。",
                  )}
                </p>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={`${t("输入")}: ${confirmationWord}`}
                  autoComplete="off"
                />
                <button
                  className="primary-button"
                  disabled={confirmation !== confirmationWord || !!busy}
                  onClick={publish}
                >
                  {busy === "publish" ? t("正在发布…") : t("确认公开发布到 X")}
                </button>
                <a
                  href="https://x.com/compose/articles"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("先到 X Articles 检查草稿")}
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
          {t(
            "X API 能力、访问级别和配额由 X 决定。成功创建本地请求不代表 X 已接受；只有返回草稿 ID 或 Post ID 才视为对应步骤完成。",
          )}
        </p>
      </div>
    </dialog>
  );
}
