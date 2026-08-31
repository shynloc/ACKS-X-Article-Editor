import type { ClipboardBody } from "../core/clipboardBody";

function clipboardError(message: string) {
  return new Error(message);
}
export async function copyBody(
  payload: ClipboardBody,
): Promise<"html" | "plain"> {
  if (!payload.text.trim())
    throw clipboardError("正文为空，没有可复制的内容。");
  const clipboard = navigator.clipboard;
  if (!clipboard)
    throw clipboardError(
      "此浏览器无法访问剪贴板。请使用 HTTPS 站点，或手动复制正文。",
    );
  const richSupported =
    typeof ClipboardItem !== "undefined" &&
    typeof clipboard.write === "function" &&
    (!ClipboardItem.supports || ClipboardItem.supports("text/html"));
  if (richSupported) {
    // Keep write() inside the click's user activation, without awaiting a save or render.
    await clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([payload.html], { type: "text/html" }),
        "text/plain": new Blob([payload.text], { type: "text/plain" }),
      }),
    ]);
    return "html";
  }
  if (typeof clipboard.writeText !== "function")
    throw clipboardError("此浏览器无法复制正文，请手动选择文字。");
  await clipboard.writeText(payload.text);
  return "plain";
}
export async function copyTitle(title: string) {
  if (!title.trim()) throw clipboardError("请先填写文章标题。");
  if (!navigator.clipboard?.writeText)
    throw clipboardError("无法访问剪贴板，请手动复制标题。");
  await navigator.clipboard.writeText(title);
}
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.size === 0) throw clipboardError("图片为空，请重新生成。");
  if (blob.type === "image/png") return blob;
  if (!["image/jpeg", "image/webp"].includes(blob.type))
    throw clipboardError("图片格式无法转换为 PNG。");
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw clipboardError("图片尺寸过大，请下载原图后处理。");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw clipboardError("浏览器不能转换图片。");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(clipboardError("PNG 转换失败。")),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}
export async function copyPng(image: Blob | Promise<Blob>): Promise<void> {
  const source = Promise.resolve(image);
  void source.catch(() => {});
  if (
    !navigator.clipboard?.write ||
    typeof ClipboardItem === "undefined" ||
    (ClipboardItem.supports && !ClipboardItem.supports("image/png"))
  )
    throw clipboardError(
      "当前浏览器不支持复制 PNG，请下载图片后在 X 编辑器中上传。",
    );
  const png = source.then(toPng);
  void png.catch(() => {});
  // Promise-valued data retains Safari user activation even while IndexedDB is loading.
  const item = new ClipboardItem({ "image/png": png });
  // Consume conversion errors even when the platform rejects the clipboard immediately.
  await navigator.clipboard.write([item]);
}
export function copyErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "NotAllowedError")
    return "浏览器未允许写入剪贴板。请让本站保持前台后重试；图片也可以下载 PNG 后上传。";
  return error instanceof Error
    ? error.message
    : "复制失败，请重试或使用下载。";
}
