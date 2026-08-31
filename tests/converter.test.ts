import { describe, it, expect } from "vitest";
import {
  convert,
  importMarkdown,
  postId,
  safeUrl,
  normalizePath,
  bindImage,
} from "../src/core/convert";
import {
  materializeXRequest,
  assertArticle,
  validateConversion,
} from "../src/core/validate";
import { newArticle } from "../src/core/types";
describe("Markdown conversion contract", () => {
  it("binds only image syntax, including reference images, without rewriting prose", () => {
    const source =
      "Read a.png before editing.\n\n![first](a.png)\n\n![second][ref]\n\n[ref]: a.png";
    const result = bindImage(source, "a.png", "asset-new");
    expect(result).toContain("Read a.png before editing.");
    expect(result).toContain("![first](asset:asset-new)");
    expect(result).toContain("![second](asset:asset-new)");
  });
  it("preserves emoji UTF-16 offsets and formatted link spans", () => {
    const c = convert("😀 **重要** [链接](https://example.com)");
    const n = c.nodes[0];
    expect(n.kind).toBe("text");
    if (n.kind === "text") {
      expect(n.text).toBe("😀 重要 链接");
      expect(n.spans).toContainEqual({ offset: 3, length: 2, style: "bold" });
      expect(n.spans).toContainEqual({
        offset: 6,
        length: 2,
        url: "https://example.com/",
      });
    }
  });
  it("normalizes heading depth without discarding source text", () => {
    const c = convert("#### 测试标题");
    expect(c.nodes[0]).toMatchObject({ type: "header-two", text: "测试标题" });
    expect(c.issues[0].code).toBe("HEADING_DOWNGRADE");
  });
  it("flattens nested lists with visible nesting and warnings", () => {
    const c = convert("- 一级\n  - 二级");
    expect(c.nodes[1]).toMatchObject({ text: "› 二级" });
    expect(c.issues.some((i) => i.code === "NESTED_LIST")).toBe(true);
  });
  it("keeps custom ordered list numbering", () =>
    expect(convert("7. 七\n8. 八").nodes).toMatchObject([
      { type: "unstyled", text: "7. 七" },
      { type: "unstyled", text: "8. 八" },
    ]));
  it("preserves inline image order and link definitions", () => {
    const c = convert(
      "之前 ![图](asset:abc) 之后\n\n[链接][ref]\n\n[ref]: https://example.com",
    );
    expect(c.nodes.map((n) => n.kind)).toEqual([
      "text",
      "image",
      "text",
      "text",
    ]);
    expect(c.nodes[1]).toMatchObject({ assetId: "abc", alt: "图" });
  });
  it("blocks remote fetch and unresolved image references", () => {
    const c = convert("![图](https://example.com/private.png)");
    expect(c.nodes[0]).toMatchObject({
      kind: "image",
      path: "https://example.com/private.png",
    });
    expect(c.issues[0].severity).toBe("error");
  });
  it("maps tables and fenced code to render nodes", () => {
    const c = convert(
      "| 列 | 值 |\n|---|---|\n|a|b|\n\n```js\nconst a = 1;\n```",
    );
    expect(c.nodes.map((n) => n.kind)).toEqual(["render", "render"]);
    expect(c.nodes[0]).toMatchObject({
      rows: [
        ["列", "值"],
        ["a", "b"],
      ],
    });
  });
  it("handles X post links without fetching a widget", () => {
    expect(postId("https://x.com/i/status/123456")).toBe("123456");
    expect(postId("https://x.com.evil.test/i/status/1")).toBeUndefined();
    expect(
      convert("https://x.com/example/status/123456").nodes[0],
    ).toMatchObject({ kind: "post", postId: "123456" });
  });
  it("rejects unsafe URLs and preserves visible text", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://secret:password@example.com")).toBeNull();
    const c = convert("[保留](javascript:alert%281%29)");
    expect(c.nodes[0]).toMatchObject({ text: "保留", spans: [] });
    expect(c.issues[0].severity).toBe("error");
  });
  it("normalizes MD import and extracts only the leading H1", () => {
    expect(importMarkdown("\uFEFF# 标题\r\n\r\n正文")).toMatchObject({
      title: "标题",
      body: "正文",
    });
    expect(importMarkdown("正文\n\n# 标题").title).toBe("");
  });
  it("is deterministic and preserves all code source", () => {
    const source = '## 标题\n\n```python\nprint("你好")\n```';
    expect(convert(source)).toEqual(convert(source));
    expect(convert(source).nodes[1]).toMatchObject({ source: 'print("你好")' });
  });
  it("rejects traversal and absolute asset paths", () => {
    for (const p of [
      "../secret",
      "/etc/passwd",
      "C:\\secret",
      "a/../../b",
      "a//b",
    ])
      expect(() => normalizePath(p)).toThrow();
    expect(normalizePath("./assets/a.png")).toBe("assets/a.png");
  });
});
describe("X request boundary", () => {
  it("emits numeric entity indices and string entity keys", () => {
    const a = newArticle(
      "标题",
      "一个 [链接](https://example.com)\n\nhttps://x.com/i/status/123",
    );
    const r = materializeXRequest(a, convert(a.body));
    expect(r.content_state.entities[0]).toMatchObject({
      key: "0",
      value: { type: "link", mutability: "mutable" },
    });
    expect(r.content_state.blocks[0].entity_ranges[0].key).toBe(0);
    expect(r.content_state.entities[1].value.type).toBe("post");
    expect(r.content_state.blocks[1].text).toBe(" ");
    expect(r.content_state.blocks[0]).not.toHaveProperty("depth");
  });
  it("cannot claim a local image is ready to submit", () => {
    const a = newArticle("标题", "![图](asset:abc)");
    expect(() => materializeXRequest(a, convert(a.body))).toThrow("尚未上传");
  });
  it("blocks empty titles only at remote request boundary", () => {
    const a = newArticle("", "正文");
    expect(validateConversion(a, convert(a.body))[0].severity).toBe("warning");
    expect(() => materializeXRequest(a, convert(a.body))).toThrow("标题");
  });
  it("rejects future schemas and unknown fields", () => {
    expect(() =>
      assertArticle({ ...newArticle(), schemaVersion: "2.0.0" }),
    ).toThrow();
    expect(() =>
      assertArticle({ ...newArticle(), token: "not-allowed" }),
    ).toThrow();
    expect(() => assertArticle(newArticle())).not.toThrow();
  });
});
