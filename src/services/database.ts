import Dexie, { type EntityTable } from "dexie";
import {
  newArticle,
  SAMPLE_BODY,
  SAMPLE_TITLE,
  sha256,
  type Article,
  type Snapshot,
  type StoredAsset,
} from "../core/types";
import {
  INTRO_ARCHITECTURE_PLACEHOLDER,
  INTRO_ARTICLE_ID,
} from "../core/introArticle";

export class ConflictError extends Error {
  constructor() {
    super("文稿已在其他标签页更新。当前修改保留在内存中，请另存副本。");
    this.name = "ConflictError";
  }
}
export class EditorDatabase extends Dexie {
  articles!: EntityTable<Article, "id">;
  assets!: EntityTable<StoredAsset, "id">;
  snapshots!: EntityTable<Snapshot, "id">;
  constructor(name = "acks-x-article-editor") {
    super(name);
    this.version(1).stores({
      articles: "id,updatedAt,archived,deletedAt",
      assets: "id,sha256",
      snapshots: "++id,articleId,[articleId+revision],at",
    });
  }
}
export const db = new EditorDatabase();
export const changes =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("acks-x-editor-changes")
    : undefined;
export async function saveArticle(
  article: Article,
  baseRevision: number,
  reason = "自动保存",
  database = db,
): Promise<Article> {
  const next = {
    ...article,
    revision: baseRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  await database.transaction(
    "rw",
    database.articles,
    database.snapshots,
    database.assets,
    async () => {
      const current = await database.articles.get(article.id);
      if (current && current.revision !== baseRevision)
        throw new ConflictError();
      if (!current && baseRevision !== 0) throw new ConflictError();
      for (const asset of next.assets)
        if (!(await database.assets.get(asset.id)))
          throw new Error(`图片尚未完整保存：${asset.filename}`);
      await database.articles.put(next);
      await database.snapshots.add({
        articleId: next.id,
        revision: next.revision,
        article: next,
        at: next.updatedAt,
        reason,
        pinned: reason !== "自动保存",
      });
    },
  );
  changes?.postMessage({ id: next.id, revision: next.revision });
  return next;
}
export async function insertArticle(
  article: Article,
  blobs: StoredAsset[] = [],
  reason = "导入",
  database = db,
) {
  const next = { ...article, revision: 1, updatedAt: new Date().toISOString() };
  await database.transaction(
    "rw",
    database.articles,
    database.snapshots,
    database.assets,
    async () => {
      if (await database.articles.get(next.id)) throw new ConflictError();
      for (const blob of blobs) {
        const existing = await database.assets.get(blob.id);
        if (existing && existing.sha256 !== blob.sha256)
          throw new Error("资源 ID 冲突，已取消写入。");
      }
      if (blobs.length) await database.assets.bulkPut(blobs);
      for (const a of next.assets)
        if (!(await database.assets.get(a.id)))
          throw new Error(`资源缺失：${a.filename}`);
      await database.articles.add(next);
      await database.snapshots.add({
        articleId: next.id,
        revision: 1,
        article: next,
        at: next.updatedAt,
        reason,
        pinned: true,
      });
    },
  );
  changes?.postMessage({ id: next.id, revision: 1 });
  return next;
}
export async function listArticles() {
  return (await db.articles.toArray()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function seedLibrary(database = db) {
  const wasEmpty = (await database.articles.count()) === 0;
  if (!(await database.articles.get(INTRO_ARTICLE_ID))) {
    const article = newArticle(SAMPLE_TITLE, SAMPLE_BODY);
    article.id = INTRO_ARTICLE_ID;
    try {
      const definitions = [
        {
          path: "/assets/x-article-editor-cover.webp",
          filename: "x-article-editor-cover.webp",
          kind: "cover" as const,
          width: 1600,
          height: 730,
          alt: "从本地 Markdown 写作台通向结构化长文发布的工作流",
        },
        {
          path: "/assets/xeditor-architecture.webp",
          filename: "xeditor-architecture.webp",
          kind: "image" as const,
          width: 1600,
          height: 900,
          alt: "ACKS X Article Editor 本地写作、格式转换与发布桥架构",
        },
      ];
      const assets: Article["assets"] = [],
        blobs: StoredAsset[] = [];
      for (const definition of definitions) {
        const response = await fetch(definition.path);
        if (!response.ok) throw new Error("intro asset");
        const blob = await response.blob(),
          hash = await sha256(blob),
          id = `asset-${hash}`;
        assets.push({
          id,
          kind: definition.kind,
          mime: blob.type,
          filename: definition.filename,
          byteLength: blob.size,
          sha256: hash,
          width: definition.width,
          height: definition.height,
          alt: definition.alt,
          caption: "",
        });
        blobs.push({ id, blob, sha256: hash });
      }
      article.assets = assets;
      article.coverId = assets[0].id;
      article.body = article.body.replace(
        INTRO_ARCHITECTURE_PLACEHOLDER,
        assets[1].id,
      );
      await insertArticle(article, blobs, "项目介绍模板", database);
    } catch {
      if (await database.articles.get(INTRO_ARTICLE_ID)) return;
      article.body = article.body.replace(
        /!\[[^\]]*\]\(asset:__ARCHITECTURE_ASSET__\)\r?\n*/,
        "",
      );
      await insertArticle(article, [], "项目介绍模板", database);
    }
  }
  if (!wasEmpty) return;
  for (const [title, body] of [
    [
      "一篇长文的结构",
      "## 从一个清晰的问题开始\n\n写下读者最关心的问题。\n\n## 用段落展开思考\n\n每一段只说明一件事。",
    ],
    [
      "关于慢思考",
      "## 留白，也是写作的一部分\n\n想法不必立即完整。这里是你的本地写作空间。",
    ],
  ])
    await insertArticle(newArticle(title, body), [], "示例文稿", database);
}
export async function pruneHistory(database = db) {
  const day = Date.now() - 24 * 3600_000,
    month = Date.now() - 30 * 86400_000;
  const rows = (await database.snapshots.toArray()).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  const kept = new Set<string>();
  const remove: number[] = [];
  for (const s of rows) {
    if (s.pinned || Date.parse(s.at) > day) continue;
    const group = `${s.articleId}:${Math.floor(Date.parse(s.at) / 300000)}`;
    if (Date.parse(s.at) < month || kept.has(group)) {
      if (s.id) remove.push(s.id);
    } else kept.add(group);
  }
  if (remove.length) await database.snapshots.bulkDelete(remove);
}
