import { safeUrl } from "./convert";
import type { Conversion, TextNode, Asset } from "./types";

export interface ClipboardBody {
  html: string;
  text: string;
  imageCount: number;
  postCount: number;
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
function inlineHtml(node: TextNode) {
  const spans = node.spans.filter(
    (s) =>
      Number.isInteger(s.offset) &&
      Number.isInteger(s.length) &&
      s.offset >= 0 &&
      s.length > 0 &&
      s.offset + s.length <= node.text.length,
  );
  const boundaries = [
    ...new Set([
      0,
      node.text.length,
      ...spans.flatMap((s) => [s.offset, s.offset + s.length]),
    ]),
  ].sort((a, b) => a - b);
  return boundaries
    .slice(0, -1)
    .map((from, i) => {
      const to = boundaries[i + 1],
        active = spans.filter(
          (s) => s.offset <= from && s.offset + s.length >= to,
        );
      let html = escapeHtml(node.text.slice(from, to)).replace(/\n/g, "<br>");
      if (active.some((s) => s.style === "bold"))
        html = `<strong>${html}</strong>`;
      if (active.some((s) => s.style === "italic")) html = `<em>${html}</em>`;
      if (active.some((s) => s.style === "strikethrough"))
        html = `<s>${html}</s>`;
      const link = active.find((s) => s.url && safeUrl(s.url));
      if (link?.url)
        html = `<a href="${escapeHtml(safeUrl(link.url)!)}">${html}</a>`;
      return html;
    })
    .join("");
}
/** Serialize the converted body, never preview DOM, Blob URLs, title, or UI controls. */
export function buildClipboardBody(
  conversion: Conversion,
  assets: Asset[] = [],
): ClipboardBody {
  const html: string[] = [],
    text: string[] = [];
  let list: "ol" | "ul" | null = null,
    listIndex = 0,
    imageCount = 0,
    postCount = 0;
  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
      listIndex = 0;
    }
  };
  for (const node of conversion.nodes) {
    if (node.kind === "text") {
      const listType =
        node.type === "ordered-list-item"
          ? "ol"
          : node.type === "unordered-list-item"
            ? "ul"
            : null;
      if (listType) {
        if (list !== listType) {
          closeList();
          html.push(`<${listType}>`);
          list = listType;
        }
        listIndex++;
        html.push(`<li>${inlineHtml(node)}</li>`);
        text.push(`${listType === "ol" ? `${listIndex}.` : "•"} ${node.text}`);
      } else {
        closeList();
        const tag =
          node.type === "header-two"
            ? "h2"
            : node.type === "blockquote"
              ? "blockquote"
              : "p";
        html.push(`<${tag}>${inlineHtml(node)}</${tag}>`);
        text.push(node.text);
      }
    } else {
      closeList();
      if (node.kind === "divider") {
        html.push("<hr>");
        text.push("---");
      } else if (node.kind === "post") {
        postCount++;
        const url = `https://x.com/i/status/${node.postId}`;
        html.push(`<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`);
        text.push(url);
      } else {
        imageCount++;
        const kind =
          node.kind === "render"
            ? node.renderKind === "table"
              ? "表格"
              : "代码"
            : "正文图片";
        const marker = `[图片 ${imageCount}：${kind}，请单独插入]`;
        html.push(`<p>${escapeHtml(marker)}</p>`);
        text.push(marker);
        const caption =
          node.kind === "image"
            ? node.caption || assets.find((a) => a.id === node.assetId)?.caption
            : "";
        if (caption) {
          html.push(`<p>${escapeHtml(caption)}</p>`);
          text.push(caption);
        }
      }
    }
  }
  closeList();
  return {
    html: html.join("\n"),
    text: text.join("\n\n"),
    imageCount,
    postCount,
  };
}
