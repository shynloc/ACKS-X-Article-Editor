import { describe, it, expect } from "vitest";
import { zipSync, strToU8, unzipSync } from "fflate";
import { inspectArchive, exportArchive } from "../src/services/archive";
import { newArticle } from "../src/core/types";
import { convert } from "../src/core/convert";
describe("resource archive safety and restoration", () => {
  it("round-trips source bytes, revision, and Unicode without a server", async () => {
    const a = {
      ...newArticle(
        "示例 😀",
        "## 原始 Markdown\n\n**粗体** + [链接](https://example.com)",
      ),
      revision: 7,
    };
    const blob = await exportArchive(a, convert(a.body));
    const restored = await inspectArchive(
      new Uint8Array(await blob.arrayBuffer()),
    );
    expect(restored.article).toEqual(a);
    expect(restored.manifest.revision).toBe(7);
  });
  it("rejects tampering before any database mutation", async () => {
    const a = newArticle("标题", "原文");
    const blob = await exportArchive(a, convert(a.body));
    const f = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    f["article.md"] = strToU8("tampered");
    await expect(inspectArchive(zipSync(f))).rejects.toThrow("完整性");
  });
  it("rejects traversal and highly compressed input", async () => {
    await expect(
      inspectArchive(zipSync({ "../outside": strToU8("bad") })),
    ).rejects.toThrow("路径");
    await expect(
      inspectArchive(zipSync({ "huge.txt": strToU8("0".repeat(1000000)) })),
    ).rejects.toThrow("安全限制");
  });
  it("rejects unknown package versions without attempting migration", async () => {
    await expect(
      inspectArchive(
        zipSync({ "manifest.json": strToU8('{"formatVersion":"9.0.0"}') }),
      ),
    ).rejects.toThrow("版本");
  });
});
