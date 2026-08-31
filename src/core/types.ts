export const DOC_VERSION = "1.0.0";
export const CONVERTER_VERSION = "1.0.0";
export const PROFILE_VERSION = "x-conservative-2026-08-31";
export type Theme = "light" | "dark";
export type AssetKind = "image" | "cover" | "table_png" | "code_png";
export interface Asset {
  id: string;
  kind: AssetKind;
  mime: string;
  filename: string;
  byteLength: number;
  sha256: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  source?: string;
  renderKey?: string;
  sourceAssetId?: string;
}
export interface Article {
  schemaVersion: string;
  id: string;
  revision: number;
  title: string;
  body: string;
  coverId?: string;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
  lastExportRevision?: number;
  lastExportAt?: string;
  archived?: boolean;
  deletedAt?: string;
}
export interface StoredAsset {
  id: string;
  blob: Blob;
  sha256: string;
}
export interface Snapshot {
  id?: number;
  articleId: string;
  revision: number;
  article: Article;
  at: string;
  reason: string;
  pinned: boolean;
}
export interface Issue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  line: number;
  from: number;
  to: number;
}
export type StyleName = "bold" | "italic" | "strikethrough";
export interface Span {
  offset: number;
  length: number;
  style?: StyleName;
  url?: string;
}
export type BlockType =
  | "unstyled"
  | "header-two"
  | "blockquote"
  | "ordered-list-item"
  | "unordered-list-item";
export interface TextNode {
  id: string;
  kind: "text";
  type: BlockType;
  text: string;
  spans: Span[];
  line: number;
  from: number;
  to: number;
}
export interface ImageNode {
  id: string;
  kind: "image";
  assetId?: string;
  path?: string;
  alt: string;
  caption: string;
  line: number;
  from: number;
  to: number;
}
export interface RenderNode {
  id: string;
  kind: "render";
  renderKind: "table" | "code";
  source: string;
  rows?: string[][];
  lang?: string;
  line: number;
  from: number;
  to: number;
}
export interface EmbedNode {
  id: string;
  kind: "post";
  postId: string;
  line: number;
  from: number;
  to: number;
}
export interface DividerNode {
  id: string;
  kind: "divider";
  line: number;
  from: number;
  to: number;
}
export type TargetNode =
  TextNode | ImageNode | RenderNode | EmbedNode | DividerNode;
export interface Conversion {
  artifactKind: "conversion";
  artifactVersion: string;
  converterVersion: string;
  targetProfileVersion: string;
  nodes: TargetNode[];
  issues: Issue[];
  sourceHash?: string;
  sourceRevision?: number;
}
export interface RenderedPart {
  blob: Blob;
  width: number;
  height: number;
  filename: string;
  source: string;
  kind: "table_png" | "code_png";
}
export type RenderedAssets = Record<string, RenderedPart[]>;
export interface MediaBinding {
  media_id: string;
  media_category: string;
}
export const SAMPLE_TITLE = "把灵感，留在本地";
export const SAMPLE_BODY = `## 写作，应该先让人安心

好的工具不打断思路，也不替你决定表达。
让草稿先属于自己，再决定何时分享。

## 从想法到文章

- 写下想法，不必一次完成
- 插入图片，保留它的位置
- 看清转换结果，再导出备份

| 环节 | 原则 |
| --- | --- |
| 写作 | 本地保存 |
| 预览 | 明示降级 |`;
export function newArticle(title = "", body = ""): Article {
  const now = new Date().toISOString();
  return {
    schemaVersion: DOC_VERSION,
    id: crypto.randomUUID(),
    revision: 0,
    title,
    body,
    assets: [],
    createdAt: now,
    updatedAt: now,
  };
}
export function safeFilename(name: string) {
  return (
    name
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
      .trim()
      .slice(0, 100) || "article"
  );
}
export async function sha256(
  value: string | Blob | Uint8Array,
): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof Blob
        ? new Uint8Array(await value.arrayBuffer())
        : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function articleHash(article: Article) {
  return sha256(
    JSON.stringify({
      title: article.title,
      body: article.body,
      coverId: article.coverId ?? null,
      assets: article.assets.map((a) => [a.id, a.sha256, a.alt, a.caption]),
    }),
  );
}
