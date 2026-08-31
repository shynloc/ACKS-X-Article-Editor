import { afterEach, describe, expect, it, vi } from "vitest";
import { convert } from "../src/core/convert";
import { buildClipboardBody } from "../src/core/clipboardBody";
import { copyBody, copyPng, copyTitle } from "../src/services/clipboard";

afterEach(() => vi.unstubAllGlobals());
describe("X body clipboard serialization", () => {
  it("keeps authored image captions next to their insertion markers", () => {
    const result = buildClipboardBody(
      convert('![图片](asset:image-id "图片说明 & 保留")'),
    );
    expect(result.text).toContain(
      "[图片 1：正文图片，请单独插入]\n\n图片说明 & 保留",
    );
    expect(result.html).toContain("<p>图片说明 &amp; 保留</p>");
  });
  it("serializes headings and formatted text, without preview UI or title", () => {
    const result = buildClipboardBody(
      convert(
        "## 小标题\n\n😀 **粗体** *斜体* ~~删除~~ [链接](https://example.com)",
      ),
    );
    expect(result.html).toContain("<h2>小标题</h2>");
    expect(result.html).toContain("<strong>粗体</strong>");
    expect(result.html).toContain("<em>斜体</em>");
    expect(result.html).toContain("<s>删除</s>");
    expect(result.html).toContain('href="https://example.com/"');
    expect(result.html).not.toContain("<h1");
    expect(result.text).not.toContain("结构预览");
    expect(result.imageCount).toBe(0);
  });
  it("replaces image groups with stable ordered position markers, never blob URLs", () => {
    const result = buildClipboardBody(
      convert(
        "文字\n\n|列|值|\n|---|---|\n|a|b|\n\n![图片](asset:local-id)\n\n```js\nconsole.log(1);\n```",
      ),
    );
    expect(result.imageCount).toBe(3);
    expect(result.text).toContain("[图片 1：表格，请单独插入]");
    expect(result.text).toContain("[图片 2：正文图片，请单独插入]");
    expect(result.text).toContain("[图片 3：代码，请单独插入]");
    expect(result.html).not.toMatch(/<img|blob:|asset:|console\.log/);
  });
  it("preserves ordered/unordered list boundaries and post links", () => {
    const result = buildClipboardBody(
      convert(
        "- 一\n- 二\n\n分隔段\n\n1. 三\n2. 四\n\nhttps://x.com/i/status/123",
      ),
    );
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain("</ul>\n<p>分隔段</p>\n<ol>");
    expect(result.html).toContain("</ol>");
    expect(result.text).toContain("1. 三");
    expect(result.postCount).toBe(1);
    expect(result.html).toContain("https://x.com/i/status/123");
  });
  it("escapes untrusted HTML and never emits unsafe links", () => {
    const result = buildClipboardBody(
      convert('<script>alert("x")</script>\n\n[文字](javascript:alert%281%29)'),
    );
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain('href="javascript:');
  });
});

class FakeClipboardItem {
  static supports(type: string) {
    return ["text/html", "text/plain", "image/png"].includes(type);
  }
  constructor(public data: Record<string, Blob | Promise<Blob>>) {}
}
function clipboardMock() {
  const write = vi.fn().mockResolvedValue(undefined),
    writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { write, writeText } });
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  return { write, writeText };
}
describe("clipboard MIME contract", () => {
  it("writes both sanitized HTML and plain text in a single item", async () => {
    const { write } = clipboardMock();
    const payload = buildClipboardBody(convert("## 标题\n\n正文"));
    expect(await copyBody(payload)).toBe("html");
    const item = write.mock.calls[0][0][0] as FakeClipboardItem;
    expect(Object.keys(item.data)).toEqual(["text/html", "text/plain"]);
    expect(await (await item.data["text/html"]).text()).toBe(payload.html);
  });
  it("reports plain text fallback honestly when ClipboardItem is unavailable", async () => {
    const { writeText } = clipboardMock();
    vi.stubGlobal("ClipboardItem", undefined);
    expect(await copyBody(buildClipboardBody(convert("正文")))).toBe("plain");
    expect(writeText).toHaveBeenCalledWith("正文");
  });
  it("copies title separately and does not write for an empty title", async () => {
    const { writeText } = clipboardMock();
    await copyTitle("文章标题");
    expect(writeText).toHaveBeenCalledWith("文章标题");
    await expect(copyTitle(" ")).rejects.toThrow("标题");
    expect(writeText).toHaveBeenCalledTimes(1);
  });
  it("calls write during the user gesture, before async image data resolves", async () => {
    const { write } = clipboardMock();
    let resolve!: (blob: Blob) => void;
    const pending = new Promise<Blob>((r) => {
      resolve = r;
    });
    const operation = copyPng(pending);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as FakeClipboardItem;
    expect(Object.keys(item.data)).toEqual(["image/png"]);
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], {
      type: "image/png",
    });
    resolve(png);
    expect(await item.data["image/png"]).toBe(png);
    await operation;
  });
  it("propagates clipboard denial instead of reporting success", async () => {
    const { write } = clipboardMock();
    write.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await expect(
      copyPng(new Blob(["png"], { type: "image/png" })),
    ).rejects.toHaveProperty("name", "NotAllowedError");
  });
  it("never substitutes text or a blob URL for an unsupported PNG write", async () => {
    const { write, writeText } = clipboardMock();
    vi.stubGlobal("ClipboardItem", undefined);
    await expect(
      copyPng(new Blob(["png"], { type: "image/png" })),
    ).rejects.toThrow("下载");
    expect(write).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });
});
