import { useState } from "react";
import { Copy, DownloadSimple } from "@phosphor-icons/react";
import { copyPng, copyErrorMessage, toPng } from "../services/clipboard";
import { downloadBlob } from "../services/archive";
import { localizeKnownMessage, useI18n } from "../i18n";

export function ImageTransfer({
  label,
  filename,
  getBlob,
  disabled = false,
}: {
  label: string;
  filename: string;
  getBlob: () => Promise<Blob> | Blob;
  disabled?: boolean;
}) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function transfer(mode: "copy" | "download") {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      if (mode === "copy") {
        await copyPng(getBlob());
        setMessage(
          t("PNG 已复制。到 X 正文对应位置粘贴；若未插入图片，请下载后上传。"),
        );
      } else {
        const blob = await toPng(await getBlob());
        downloadBlob(blob, filename);
        setMessage(
          t("已生成 PNG 下载，请检查下载文件，再在 X 正文对应位置上传。"),
        );
      }
    } catch (error) {
      setFailed(true);
      setMessage(localizeKnownMessage(copyErrorMessage(error), language));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="image-transfer" data-copy-ui="true">
      <div className="image-transfer-buttons">
        <span>{label}</span>
        <button
          className="quiet-button"
          disabled={disabled || busy}
          onClick={() => transfer("copy")}
          aria-label={`${t("复制图片")}：${label}`}
        >
          <Copy size={15} />
          {t("复制图片")}
        </button>
        <button
          className="quiet-button"
          disabled={disabled || busy}
          onClick={() => transfer("download")}
          aria-label={`${t("下载 PNG")}：${label}`}
        >
          <DownloadSimple size={15} />
          {t("下载 PNG")}
        </button>
      </div>
      {message && (
        <p
          className={failed ? "transfer-error" : "transfer-feedback"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
