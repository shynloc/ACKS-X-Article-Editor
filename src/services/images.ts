import {
  sha256,
  type Asset,
  type StoredAsset,
  type RenderNode,
  type RenderedPart,
} from "../core/types";
import { imageHeader } from "../core/imageHeader";
export async function ingestImage(
  file: File | Blob,
  filename = "image.png",
  kind: Asset["kind"] = "image",
): Promise<{ asset: Asset; stored: StoredAsset }> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("单张图片不能超过 20 MiB。");
  imageHeader(new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer()));
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime =
    head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71
      ? "image/png"
      : head[0] === 255 && head[1] === 216
        ? "image/jpeg"
        : String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...head.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (!mime)
    throw new Error("请选择 PNG、JPEG 或静态 WebP 图片；SVG 与动画暂不支持。");
  // Reject animated WebP rather than silently importing one frame.
  if (mime === "image/webp") {
    const flags = new Uint8Array(await file.slice(12, 21).arrayBuffer());
    if (String.fromCharCode(...flags.slice(0, 4)) === "VP8X" && flags[8] & 2)
      throw new Error("暂不支持动画 WebP。");
  }
  const normalized = file.slice(0, file.size, mime);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(normalized);
  } catch {
    throw new Error("图片无法解码，请检查文件是否完整。");
  }
  const { width, height } = bitmap;
  bitmap.close();
  if (width * height > 40_000_000 || !width || !height)
    throw new Error("图片解码尺寸不能超过 4000 万像素。");
  const hash = await sha256(normalized),
    id = `asset-${hash}`;
  return {
    asset: {
      id,
      kind,
      mime,
      filename,
      byteLength: file.size,
      sha256: hash,
      width,
      height,
      alt: "",
      caption: "",
    },
    stored: { id, blob: normalized, sha256: hash },
  };
}
const FONT =
  '16px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
function splitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
): string[] {
  const segments =
    typeof Intl.Segmenter === "function"
      ? [
          ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            text,
          ),
        ].map((x) => x.segment)
      : Array.from(text);
  const result: string[] = [];
  let line = "";
  for (const char of segments) {
    if (line && ctx.measureText(line + char).width > max) {
      result.push(line);
      line = char;
    } else line += char;
  }
  result.push(line);
  return result;
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width * 2;
  c.height = height * 2;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("浏览器未提供 Canvas，无法生成图片。");
  ctx.scale(2, 2);
  ctx.font = FONT;
  ctx.textBaseline = "top";
  return { c, ctx };
}
function blobOf(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("出图失败，请缩小内容后重试。")),
      "image/png",
    ),
  );
}
let highlighterPromise: Promise<any> | undefined;
async function highlight(code: string, lang: string) {
  const known = [
    "javascript",
    "typescript",
    "json",
    "python",
    "bash",
    "css",
    "html",
    "markdown",
  ];
  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    sh: "bash",
    md: "markdown",
    py: "python",
  };
  lang = aliases[lang] ?? lang;
  if (!known.includes(lang)) return undefined;
  highlighterPromise ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
  ]).then(([core, engine]) =>
    core.createHighlighterCore({
      engine: engine.createJavaScriptRegexEngine(),
      themes: [import("shiki/themes/github-light.mjs")],
      langs: [
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/markdown.mjs"),
      ],
    }),
  );
  const h = await highlighterPromise;
  return h.codeToTokens(code, { lang, theme: "github-light" }).tokens as {
    content: string;
    color?: string;
  }[][];
}
const cache = new Map<string, Promise<RenderedPart[]>>();
export function renderNode(node: RenderNode): Promise<RenderedPart[]> {
  const key = `canvas-v1:light:${node.renderKind}:${node.lang ?? ""}:${node.source}`;
  let job = cache.get(key);
  if (job) return job;
  job = renderFresh(node).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, job);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return job;
}
async function renderFresh(node: RenderNode): Promise<RenderedPart[]> {
  const parts: RenderedPart[] = [];
  const width = 720,
    padding = 24;
  if (node.renderKind === "table") {
    const rows = node.rows ?? [],
      cols = Math.max(...rows.map((r) => r.length), 1);
    if (cols > 10) throw new Error("表格超过 10 列，请拆分表格以保证可读性。");
    const colWidth = (width - padding * 2) / cols,
      measure = canvas(1, 1).ctx;
    const laid = rows.map((r) =>
      r.map((text) => splitText(measure, text, colWidth - 24)),
    );
    const heights = laid.map(
      (r) => Math.max(...r.map((c) => c.length), 1) * 26 + 24,
    );
    if (heights.some((h) => h > 1100))
      throw new Error("单个表格单元格过长，请拆分后再出图。");
    const groups: number[][] = [];
    let group: number[] = [0],
      height = heights[0] ?? 50;
    for (let i = 1; i < rows.length; i++) {
      if (height + heights[i] > 1100) {
        groups.push(group);
        group = [0];
        height = heights[0];
      }
      group.push(i);
      height += heights[i];
    }
    groups.push(group);
    for (const [page, indices] of groups.entries()) {
      const h =
          indices.reduce((v, i) => v + heights[i], 0) +
          padding * 2 +
          (groups.length > 1 ? 24 : 0),
        { c, ctx } = canvas(width, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, h);
      let y = padding;
      for (const i of indices) {
        ctx.fillStyle = i === 0 ? "#f2f4ef" : "#ffffff";
        ctx.fillRect(padding, y, width - padding * 2, heights[i]);
        for (let j = 0; j < cols; j++) {
          ctx.strokeStyle = "#d9ded5";
          ctx.strokeRect(padding + j * colWidth, y, colWidth, heights[i]);
          ctx.fillStyle = "#252b24";
          ctx.font = i === 0 ? `600 ${FONT}` : FONT;
          for (const [line, t] of (laid[i]?.[j] ?? [""]).entries())
            ctx.fillText(t, padding + j * colWidth + 12, y + 12 + line * 26);
        }
        y += heights[i];
      }
      if (groups.length > 1) {
        ctx.fillStyle = "#62695f";
        ctx.font = "12px sans-serif";
        ctx.fillText(`${page + 1} / ${groups.length}`, padding, h - 20);
      }
      parts.push({
        blob: await blobOf(c),
        width: c.width,
        height: c.height,
        filename: `table-${page + 1}.png`,
        source: node.source,
        kind: "table_png",
      });
    }
  } else {
    const lines = node.source.split("\n");
    if (lines.length > 5000)
      throw new Error("代码块超过 5000 行，请拆分后再出图。");
    const measure = canvas(1, 1).ctx;
    measure.font = "16px monospace";
    const wrapped = lines.flatMap((line, i) =>
      splitText(measure, line.replace(/\t/g, "    "), width - 100).map(
        (text, wrap) => ({ text, index: i, wrap }),
      ),
    );
    let tokens: Awaited<ReturnType<typeof highlight>>;
    try {
      tokens = await highlight(node.source, node.lang ?? "text");
    } catch {
      /* Plain code is a lossless fallback when a grammar is unavailable. */
    }
    const pages = Math.max(1, Math.ceil(wrapped.length / 36));
    for (let page = 0; page < pages; page++) {
      const slice = wrapped.slice(page * 36, (page + 1) * 36),
        height = 56 + Math.max(1, slice.length) * 26 + 24,
        { c, ctx } = canvas(width, height);
      ctx.fillStyle = "#f7f8f5";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#657160";
      ctx.font = "12px sans-serif";
      ctx.fillText(
        `${node.lang ?? "text"}${pages > 1 ? ` · ${page + 1} / ${pages}` : ""}`,
        padding,
        18,
      );
      ctx.font = "16px monospace";
      for (const [j, line] of slice.entries()) {
        const y = 50 + j * 26;
        ctx.fillStyle = "#8b9487";
        ctx.font = "12px monospace";
        ctx.fillText(line.wrap ? "↳" : String(line.index + 1), padding, y + 2);
        ctx.font = "16px monospace";
        const ts = tokens?.[line.index];
        if (!line.wrap && ts && line.text === lines[line.index]) {
          let x = 64;
          for (const token of ts) {
            ctx.fillStyle = token.color ?? "#253322";
            ctx.fillText(token.content, x, y);
            x += ctx.measureText(token.content).width;
          }
        } else {
          ctx.fillStyle = "#253322";
          ctx.fillText(line.text, 64, y);
        }
      }
      parts.push({
        blob: await blobOf(c),
        width: c.width,
        height: c.height,
        filename: `code-${page + 1}.png`,
        source: node.source,
        kind: "code_png",
      });
    }
  }
  return parts;
}
