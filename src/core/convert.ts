import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import {
  CONVERTER_VERSION,
  PROFILE_VERSION,
  type Conversion,
  type Issue,
  type Span,
  type StyleName,
  type TargetNode,
  type BlockType,
} from "./types";

interface Ast {
  type: string;
  value?: string;
  children?: Ast[];
  depth?: number;
  ordered?: boolean;
  start?: number;
  checked?: boolean | null;
  url?: string;
  alt?: string;
  title?: string;
  lang?: string;
  identifier?: string;
  position?: {
    start: { line: number; offset: number };
    end: { line: number; offset: number };
  };
}
const parser = unified().use(remarkParse).use(remarkGfm);
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function postId(url: string): string | undefined {
  try {
    const u = new URL(url);
    return /^(www\.)?(x\.com|twitter\.com)$/.test(u.hostname)
      ? u.pathname.match(/^\/(?:[^/]+|i)\/status\/(\d{1,25})\/?$/)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
}
export function normalizePath(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !p ||
    p.startsWith("/") ||
    /^[A-Za-z]:/.test(p) ||
    p.split("/").some((s) => s === ".." || s === "") ||
    /[\x00-\x1f]/.test(p)
  )
    throw new Error("资源路径不安全");
  return p;
}
export function importMarkdown(source: string) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const root = parser.parse(normalized) as unknown as Ast;
  const first = root.children?.[0];
  if (first?.type === "heading" && first.depth === 1 && first.position) {
    const title = plain(first);
    return {
      title,
      body: normalized.slice(first.position.end.offset).replace(/^\n+/, ""),
      original: source,
    };
  }
  return { title: "", body: normalized, original: source };
}
function plain(n: Ast): string {
  return n.value ?? (n.children ?? []).map(plain).join("");
}
export function convert(source: string): Conversion {
  const root = parser.parse(source) as unknown as Ast;
  const nodes: TargetNode[] = [],
    issues: Issue[] = [];
  const definitions = new Map<string, Ast>();
  for (const n of root.children ?? [])
    if (n.type === "definition") definitions.set(n.identifier ?? "", n);
  const at = (n: Ast) => ({
    line: n.position?.start.line ?? 1,
    from: n.position?.start.offset ?? 0,
    to: n.position?.end.offset ?? 0,
  });
  const addIssue = (
    n: Ast,
    code: string,
    message: string,
    severity: Issue["severity"] = "warning",
  ) => {
    issues.push({ code, message, severity, ...at(n) });
  };
  let serial = 0;
  const id = () => `b${serial++}`;
  function text(n: Ast, type: BlockType = "unstyled", prefix = "") {
    let value = prefix,
      spans: Span[] = [];
    const flush = () => {
      if (value)
        nodes.push({
          kind: "text",
          id: id(),
          type,
          text: value,
          spans,
          ...at(n),
        });
      value = "";
      spans = [];
    };
    function inline(child: Ast, styles: StyleName[] = [], link?: string) {
      if (child.type === "image" || child.type === "imageReference") {
        flush();
        const def =
          child.type === "imageReference"
            ? definitions.get(child.identifier ?? "")
            : child;
        const path = def?.url ?? child.identifier ?? "";
        const localId = path.startsWith("asset:") ? path.slice(6) : undefined;
        nodes.push({
          kind: "image",
          id: id(),
          assetId: localId,
          path: localId ? undefined : path,
          alt: child.alt ?? "",
          caption: child.title ?? def?.title ?? "",
          ...at(child),
        });
        if (!localId)
          addIssue(
            child,
            "MISSING_IMAGE",
            /^https?:/.test(path)
              ? "远程图片不会自动下载，请关联本地文件。"
              : `图片尚未关联：${path}`,
            "error",
          );
        return;
      }
      const nextStyles =
        child.type === "strong"
          ? [...styles, "bold" as const]
          : child.type === "emphasis"
            ? [...styles, "italic" as const]
            : child.type === "delete"
              ? [...styles, "strikethrough" as const]
              : styles;
      if (child.type === "link" || child.type === "linkReference") {
        const raw =
          child.url ?? definitions.get(child.identifier ?? "")?.url ?? "";
        const url = safeUrl(raw);
        if (!url)
          addIssue(
            child,
            "UNSAFE_URL",
            "链接无效或协议不受支持；已保留文字并移除链接。",
            "error",
          );
        (child.children ?? []).forEach((c) =>
          inline(c, nextStyles, url ?? undefined),
        );
        return;
      }
      if (child.type === "inlineCode")
        addIssue(
          child,
          "INLINE_CODE",
          "行内代码以普通文字呈现，源码仍被保留。",
        );
      if (child.type === "html")
        addIssue(child, "HTML_TEXT", "HTML 已转义为文字，不执行脚本或样式。");
      if (child.type === "footnoteReference") {
        addIssue(child, "FOOTNOTE", "脚注引用转换为可见编号。");
        child = { ...child, value: `[^${child.identifier}]` };
      }
      if (child.value !== undefined || child.type === "break") {
        const piece =
          child.type === "break" ? "\n" : child.value!.replace(/\n/g, " ");
        const offset = value.length;
        value += piece;
        for (const style of nextStyles)
          if (piece.length) spans.push({ offset, length: piece.length, style });
        if (link && piece.length)
          spans.push({ offset, length: piece.length, url: link });
      } else (child.children ?? []).forEach((c) => inline(c, nextStyles, link));
    }
    (n.children ?? [{ type: "text", value: n.value ?? "" }]).forEach((c) =>
      inline(c),
    );
    flush();
  }
  function walk(n: Ast, context?: BlockType, depth = 0) {
    switch (n.type) {
      case "definition":
        return;
      case "heading":
        if (n.depth !== 2)
          addIssue(
            n,
            "HEADING_DOWNGRADE",
            `H${n.depth} 按当前兼容配置降为 H2。`,
          );
        text(n, "header-two");
        return;
      case "paragraph": {
        const raw = plain(n).trim(),
          embedded = postId(raw);
        if (embedded) {
          nodes.push({ kind: "post", id: id(), postId: embedded, ...at(n) });
          return;
        }
        text(n, context);
        return;
      }
      case "list": {
        const customNumber = n.ordered && (n.start ?? 1) !== 1;
        if (depth)
          addIssue(n, "NESTED_LIST", "嵌套列表已扁平化，层级用文字前缀保留。");
        if (customNumber)
          addIssue(
            n,
            "LIST_START",
            "非 1 起始的编号转为普通段落，保留原编号。",
          );
        (n.children ?? []).forEach((item, i) => {
          const type: BlockType = customNumber
            ? "unstyled"
            : n.ordered
              ? "ordered-list-item"
              : "unordered-list-item";
          const prefix = `${depth ? `${"› ".repeat(Math.min(depth, 6))}` : ""}${customNumber ? `${(n.start ?? 1) + i}. ` : ""}${item.checked != null ? (item.checked ? "[x] " : "[ ] ") : ""}`;
          (item.children ?? []).forEach((c, j) =>
            c.type === "list"
              ? walk(c, undefined, depth + 1)
              : c.type === "paragraph"
                ? text(c, type, j === 0 ? prefix : "")
                : walk(c, type, depth),
          );
        });
        return;
      }
      case "blockquote":
        if (context === "blockquote")
          addIssue(n, "NESTED_QUOTE", "多层引用已合并为一级引用。");
        (n.children ?? []).forEach((c) => walk(c, "blockquote", depth));
        return;
      case "thematicBreak":
        nodes.push({ kind: "divider", id: id(), ...at(n) });
        return;
      case "table":
        nodes.push({
          kind: "render",
          id: id(),
          renderKind: "table",
          rows: (n.children ?? []).map((r) => (r.children ?? []).map(plain)),
          source: source.slice(at(n).from, at(n).to),
          ...at(n),
        });
        addIssue(
          n,
          "TABLE_IMAGE",
          "表格将作为图片，原始 Markdown 保存在资源包中。",
          "info",
        );
        return;
      case "code":
        nodes.push({
          kind: "render",
          id: id(),
          renderKind: "code",
          source: n.value ?? "",
          lang: n.lang ?? "text",
          ...at(n),
        });
        addIssue(
          n,
          n.lang === "mermaid" ? "MERMAID_SOURCE" : "CODE_IMAGE",
          n.lang === "mermaid"
            ? "当前版本将 Mermaid 源码作为代码图片；图形渲染属于后续版本。"
            : "代码将作为图片，完整源码保存在资源包中。",
          n.lang === "mermaid" ? "warning" : "info",
        );
        return;
      case "html":
        addIssue(n, "HTML_TEXT", "HTML 已转义为文字，不执行脚本或样式。");
        text(n, context);
        return;
      case "footnoteDefinition":
        addIssue(n, "FOOTNOTE", "脚注定义转为普通段落，保留内容。");
        text({
          ...n,
          value: `[^${n.identifier}] ${plain(n)}`,
          children: undefined,
        });
        return;
      default:
        if (n.children) n.children.forEach((c) => walk(c, context, depth));
        else {
          addIssue(n, "UNSUPPORTED", "未支持语法已保留为文字。");
          text(n, context);
        }
    }
  }
  (root.children ?? []).forEach((n) => walk(n));
  return {
    artifactKind: "conversion",
    artifactVersion: "1.0.0",
    converterVersion: CONVERTER_VERSION,
    targetProfileVersion: PROFILE_VERSION,
    nodes,
    issues,
  };
}
/** Resolve image syntax only; prose mentioning the same filename stays untouched. */
export function bindImage(
  source: string,
  requestedPath: string,
  assetId: string,
) {
  const root = parser.parse(source) as unknown as Ast;
  const definitions = new Map(
    (root.children ?? [])
      .filter((n) => n.type === "definition")
      .map((n) => [n.identifier, n]),
  );
  const changes: { from: number; to: number; text: string }[] = [];
  const visit = (n: Ast) => {
    const reference =
      n.type === "imageReference" ? definitions.get(n.identifier) : n;
    if (
      (n.type === "image" || n.type === "imageReference") &&
      reference?.url === requestedPath &&
      n.position
    ) {
      const alt = (n.alt ?? "").replace(/[\\\[\]]/g, "\\$&");
      const title = n.title ?? reference.title;
      changes.push({
        from: n.position.start.offset,
        to: n.position.end.offset,
        text: `![${alt}](asset:${assetId}${title ? ` "${title.replace(/[\\"]/g, "\\$&")}"` : ""})`,
      });
    }
    n.children?.forEach(visit);
  };
  visit(root);
  for (const c of changes.sort((a, b) => b.from - a.from))
    source = source.slice(0, c.from) + c.text + source.slice(c.to);
  return source;
}
