import checkArticle from "./article-validator.js";
import { safeUrl } from "./convert";
import type { Article, Conversion, Issue, MediaBinding } from "./types";
export { default as articleSchema } from "../../schemas/article.schema.json";

export function assertArticle(input: unknown): asserts input is Article {
  if (!checkArticle(input))
    throw new Error("文稿格式不受支持或字段不合法。请检查包版本与完整性。");
  const article = input as unknown as Article;
  const ids = article.assets.map((a) => a.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("文稿包含重复资源 ID。");
  if (article.coverId && !ids.includes(article.coverId))
    throw new Error("封面资源未在资源清单中声明。");
  if (
    !Number.isFinite(Date.parse(article.createdAt)) ||
    !Number.isFinite(Date.parse(article.updatedAt))
  )
    throw new Error("文稿时间字段无效。");
}
export function validateConversion(
  article: Article,
  result: Conversion,
): Issue[] {
  const issues = [...result.issues];
  const issue = (
    code: string,
    message: string,
    severity: Issue["severity"] = "error",
  ) => issues.push({ code, message, severity, line: 1, from: 0, to: 0 });
  if (!article.title.trim())
    issue(
      "EMPTY_TITLE",
      "文章尚未命名；可以保存或导出，创建 X 草稿前必须填写标题。",
      "warning",
    );
  if (article.title.length > 500)
    issue(
      "TITLE_SOFT_LIMIT",
      "标题超过本产品建议的 500 字符，请在接入 X 前核实。",
      "warning",
    );
  const ids = new Set(article.assets.map((a) => a.id));
  for (const n of result.nodes) {
    if (n.kind === "image" && n.assetId && !ids.has(n.assetId))
      issues.push({
        code: "MISSING_ASSET",
        message: "图片引用缺失，请重新关联文件。",
        severity: "error",
        line: n.line,
        from: n.from,
        to: n.to,
      });
    if (n.kind === "text")
      for (const s of n.spans) {
        if (
          !Number.isInteger(s.offset) ||
          !Number.isInteger(s.length) ||
          s.offset < 0 ||
          s.length <= 0 ||
          s.offset + s.length > n.text.length
        )
          issue("INVALID_RANGE", "存在越界文字范围。");
        if (s.url && !safeUrl(s.url)) issue("UNSAFE_LINK", "链接协议不安全。");
      }
  }
  return issues;
}
export function materializeXRequest(
  article: Article,
  conversion: Conversion,
  media: Record<string, MediaBinding> = {},
) {
  if (!article.title.trim()) throw new Error("标题不能为空。");
  const blocks: any[] = [],
    entities: any[] = [];
  const entity = (type: string, data: object, mutability = "immutable") => {
    const key = entities.length;
    entities.push({ key: String(key), value: { type, mutability, data } });
    return key;
  };
  for (const n of conversion.nodes) {
    if (n.kind === "render")
      throw new Error("代码或表格尚未转为已上传的图片。");
    if (n.kind === "text") {
      const entity_ranges = n.spans
        .filter((s) => s.url)
        .map((s) => ({
          offset: s.offset,
          length: s.length,
          key: entity("link", { url: s.url }, "mutable"),
        }));
      blocks.push({
        key: n.id,
        type: n.type,
        text: n.text,
        inline_style_ranges: n.spans
          .filter((s) => s.style)
          .map((s) => ({ offset: s.offset, length: s.length, style: s.style })),
        entity_ranges,
      });
    } else {
      let key: number;
      if (n.kind === "image") {
        const binding = n.assetId ? media[n.assetId] : undefined;
        if (!binding)
          throw new Error("图片尚未上传；本地转换产物不是可提交请求。");
        key = entity("image", { caption: n.caption, media_items: [binding] });
      } else
        key = entity(
          n.kind === "post" ? "post" : "divider",
          n.kind === "post" ? { post_id: n.postId } : {},
        );
      blocks.push({
        key: n.id,
        type: "atomic",
        text: " ",
        inline_style_ranges: [],
        entity_ranges: [{ offset: 0, length: 1, key }],
      });
    }
  }
  if (article.coverId && !media[article.coverId])
    throw new Error("封面尚未上传。");
  return {
    title: article.title,
    content_state: { blocks, entities },
    ...(article.coverId ? { cover_media: media[article.coverId] } : {}),
  };
}
