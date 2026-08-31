import { describe, it, expect, afterEach } from "vitest";
import {
  EditorDatabase,
  insertArticle,
  saveArticle,
  ConflictError,
} from "../src/services/database";
import { newArticle } from "../src/core/types";
const databases: EditorDatabase[] = [];
function fresh() {
  const d = new EditorDatabase(`test-${crypto.randomUUID()}`);
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases.splice(0)) {
    d.close();
    await d.delete();
  }
});
describe("transactional persistence", () => {
  it("commits snapshots with the article, and rejects stale writes", async () => {
    const d = fresh();
    const a = await insertArticle(newArticle("初稿", "原文"), [], "测试", d);
    const b = await saveArticle({ ...a, body: "新版" }, 1, "自动保存", d);
    expect(b.revision).toBe(2);
    await expect(
      saveArticle({ ...a, body: "过期覆盖" }, 1, "自动保存", d),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await d.articles.get(a.id))?.body).toBe("新版");
    expect(await d.snapshots.count()).toBe(2);
  });
  it("aborts the entire save when an asset is missing", async () => {
    const d = fresh();
    const a = await insertArticle(newArticle("初稿", "原文"), [], "测试", d);
    await expect(
      saveArticle(
        {
          ...a,
          body: "坏引用",
          assets: [
            {
              id: "missing",
              kind: "image",
              mime: "image/png",
              filename: "a.png",
              byteLength: 10,
              sha256: "0".repeat(64),
              width: 1,
              height: 1,
              alt: "",
              caption: "",
            },
          ],
        },
        1,
        "自动保存",
        d,
      ),
    ).rejects.toThrow("图片");
    expect((await d.articles.get(a.id))?.revision).toBe(1);
    expect(await d.snapshots.count()).toBe(1);
  });
  it("does not overwrite another documents blob with a conflicting identity", async () => {
    const d = fresh();
    await d.assets.put({
      id: "asset-a",
      blob: new Blob(["old"]),
      sha256: "old",
    });
    await expect(
      insertArticle(
        newArticle(),
        [{ id: "asset-a", blob: new Blob(["new"]), sha256: "new" }],
        "导入",
        d,
      ),
    ).rejects.toThrow("冲突");
    expect((await d.assets.get("asset-a"))?.sha256).toBe("old");
    expect(await d.articles.count()).toBe(0);
  });
});
