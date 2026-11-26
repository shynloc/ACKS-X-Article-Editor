import { describe, it, expect } from "vitest";
import { newArticle } from "../src/core/types";
import { fileArticle, shelfGroup } from "../src/core/articleShelf";
import { inspectArchive, exportArchive } from "../src/services/archive";
import { convert } from "../src/core/convert";
describe("portable library metadata", () => {
  it("interprets legacy v1 drafts without rewriting them", () => {
    const old = newArticle("old", "unchanged");
    expect(shelfGroup(old)).toBe("draft");
    expect(old.shelfStatus).toBeUndefined();
    const pub = fileArticle(old, "published");
    expect(pub.body).toBe(old.body);
    const archived = fileArticle(pub, "archive");
    const trash = fileArticle(archived, "trash");
    expect(shelfGroup(trash)).toBe("deleted");
    const restored = fileArticle(trash, "restore");
    expect(shelfGroup(restored)).toBe("archived");
    expect(shelfGroup(fileArticle(restored, "restore"))).toBe("published");
  });
  it("includes classification when moving an article to another instance via ZIP", async () => {
    const a = fileArticle(newArticle("Shelf QA", "portable"), "published");
    const out = await exportArchive(a, convert(a.body));
    const unpacked = await inspectArchive(
      new Uint8Array(await out.arrayBuffer()),
    );
    expect(unpacked.article.shelfStatus).toBe("published");
    expect(unpacked.article.body).toBe(a.body);
  });
});
