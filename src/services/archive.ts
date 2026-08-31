import { inspectArchive } from "./archive-inspect";
export { inspectArchive } from "./archive-inspect";
import { zip, unzipSync, strToU8, strFromU8 } from "fflate";
import { convert, normalizePath } from "../core/convert";
import { assertArticle } from "../core/validate";
import {
  articleHash,
  sha256,
  safeFilename,
  CONVERTER_VERSION,
  type Article,
  type Asset,
  type Conversion,
  type RenderedPart,
  type RenderNode,
  type StoredAsset,
} from "../core/types";
import { db, insertArticle } from "./database";
import { renderNode } from "./images";
import { imageHeader } from "../core/imageHeader";

const MAX_EXPANDED = 250 * 1024 * 1024;
export async function renderKey(n: RenderNode) {
  return `${CONVERTER_VERSION}:light:${n.renderKind}:${n.lang ?? ""}:${await sha256(n.source)}`;
}
export async function getRenderParts(
  n: RenderNode,
  article: Article,
): Promise<RenderedPart[]> {
  const key = await renderKey(n),
    cached = article.assets.filter((a) => a.renderKey === key);
  if (cached.length) {
    const parts = await Promise.all(
      cached.map(async (a) => {
        const stored = await db.assets.get(a.id);
        if (!stored) throw new Error("已导入的图片资源缺失。");
        return {
          blob: stored.blob,
          width: a.width,
          height: a.height,
          filename: a.filename,
          kind: a.kind as "table_png" | "code_png",
          source: a.source ?? n.source,
        };
      }),
    );
    return parts;
  }
  return renderNode(n);
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportArchive(
  article: Article,
  conversion: Conversion,
  recovery = false,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {},
    savedAssets: Asset[] = [],
    assetPaths: Record<string, string> = {};
  const nodes: Conversion["nodes"] = [];
  const warnings: string[] = [];
  const referenced = new Set(
    conversion.nodes
      .filter((n) => n.kind === "image" && n.assetId)
      .map((n) => (n.kind === "image" ? n.assetId : "")),
  );
  if (article.coverId) referenced.add(article.coverId);
  for (const a of article.assets.filter((a) => referenced.has(a.id))) {
    const stored = await db.assets.get(a.id);
    if (!stored) {
      if (!recovery) throw new Error(`资源缺失：${a.filename}`);
      warnings.push(`缺失：${a.filename}`);
      continue;
    }
    const bytes = new Uint8Array(await stored.blob.arrayBuffer());
    if ((await sha256(bytes)) !== a.sha256)
      throw new Error(`资源校验失败：${a.filename}`);
    const ext =
      a.mime === "image/png" ? "png" : a.mime === "image/jpeg" ? "jpg" : "webp";
    const path = `assets/original/${a.sha256}.${ext}`;
    files[path] = bytes;
    savedAssets.push(a);
    assetPaths[a.id] = path;
  }
  for (const n of conversion.nodes) {
    if (n.kind !== "render") {
      nodes.push(n);
      continue;
    }
    try {
      const parts = await getRenderParts(n, article),
        key = await renderKey(n);
      for (const [i, part] of parts.entries()) {
        const bytes = new Uint8Array(await part.blob.arrayBuffer()),
          hash = await sha256(bytes),
          id = `derived-${hash}`,
          path = `assets/derived/${hash}.png`;
        files[path] = bytes;
        assetPaths[id] = path;
        if (!savedAssets.some((a) => a.id === id))
          savedAssets.push({
            id,
            kind: part.kind,
            mime: "image/png",
            filename: `${n.id}-${i + 1}.png`,
            sha256: hash,
            byteLength: bytes.length,
            width: part.width,
            height: part.height,
            alt: n.renderKind === "table" ? "表格图片" : "代码图片",
            caption: "",
            source: n.source,
            renderKey: key,
          });
        nodes.push({
          id: `${n.id}-${i}`,
          kind: "image",
          assetId: id,
          alt: n.renderKind === "table" ? "表格图片" : "代码图片",
          caption: "",
          line: n.line,
          from: n.from,
          to: n.to,
        });
      }
    } catch (e) {
      if (!recovery) throw e;
      warnings.push(`第 ${n.line} 行出图未完成`);
      nodes.push(n);
    }
  }
  const portable: Article = { ...article, assets: savedAssets };
  if (portable.coverId && !savedAssets.some((a) => a.id === portable.coverId))
    delete portable.coverId;
  const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));
  files["article.json"] = json(portable);
  let markdown = `# ${article.title || "未命名文章"}\n\n${article.body}`;
  for (const [id, path] of Object.entries(assetPaths))
    markdown = markdown.split(`asset:${id}`).join(path);
  files["article.md"] = strToU8(markdown);
  files["conversion.json"] = json({
    ...conversion,
    nodes,
    sourceRevision: article.revision,
  });
  files["validation.json"] = json({
    complete: !recovery && warnings.length === 0,
    issues: conversion.issues,
    recoveryWarnings: warnings,
    sourceRevision: article.revision,
  });
  const manifest = {
    formatVersion: "1.0.0",
    appVersion: "0.1.0",
    createdAt: new Date().toISOString(),
    documentId: article.id,
    revision: article.revision,
    sourceHash: await articleHash(portable),
    converterVersion: conversion.converterVersion,
    targetProfileVersion: conversion.targetProfileVersion,
    assetPaths,
    recovery,
    recoveryWarnings: warnings,
    files: await Promise.all(
      Object.entries(files).map(async ([path, bytes]) => ({
        path,
        byteLength: bytes.length,
        sha256: await sha256(bytes),
      })),
    ),
  };
  files["manifest.json"] = json(manifest);
  if (Object.values(files).reduce((n, f) => n + f.length, 0) > MAX_EXPANDED)
    throw new Error("导出包超过 250 MiB，请拆分文稿。");
  const compressed = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
  await inspectArchiveOffThread(compressed, true);
  return new Blob([compressed as BlobPart], { type: "application/zip" });
}
export async function importArchive(file: File) {
  const { article, blobs } = await inspectArchiveOffThread(
    new Uint8Array(await file.arrayBuffer()),
  );
  for (const stored of blobs) {
    const header = imageHeader(
      new Uint8Array(await stored.blob.slice(0, 1024 * 1024).arrayBuffer()),
    );
    const metadata = article.assets.find((a) => a.id === stored.id)!;
    if (
      header.mime !== metadata.mime ||
      header.width * header.height !== metadata.width * metadata.height
    )
      throw new Error("图片内容与尺寸声明不一致，已取消导入。");
  }
  const originalId = article.id;
  article.id = crypto.randomUUID();
  article.revision = 0;
  delete article.lastExportAt;
  delete article.lastExportRevision;
  delete article.archived;
  delete article.deletedAt;
  if (await db.articles.get(originalId))
    article.title = `${article.title}（导入副本）`;
  // Preserve source bytes and IDs on round-trip. Conflicting identities are rejected, never overwritten.
  for (const b of blobs) {
    const existing = await db.assets.get(b.id);
    if (existing && existing.sha256 !== b.sha256)
      throw new Error("资源 ID 与已有文稿冲突；已取消导入，原稿不变。");
  }
  return insertArticle(article, blobs, "导入资源包");
}
export const archiveFilename = (article: Article) =>
  `${safeFilename(article.title)}-r${article.revision}.xas.zip`;

function inspectArchiveOffThread(
  bytes: Uint8Array,
  allowRecovery = false,
): Promise<Awaited<ReturnType<typeof inspectArchive>>> {
  if (typeof document === "undefined")
    return inspectArchive(bytes, allowRecovery);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./archive.worker.ts", import.meta.url), {
      type: "module",
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("资源包检查超时；未修改已有文稿。"));
    }, 30000);
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (e) => {
      finish();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("资源包校验任务失败；未修改已有文稿。"));
    };
    const copy = bytes.slice();
    worker.postMessage({ bytes: copy, allowRecovery }, [copy.buffer]);
  });
}
