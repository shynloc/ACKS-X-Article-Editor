import { sha256, type Article, type StoredAsset } from "../core/types";
import {
  applyCloudArticle,
  changes,
  db,
  insertArticle,
  listArticles,
} from "./database";
import {
  getCloudAsset,
  listCloudArticles,
  uploadCloudAsset,
  upsertCloudArticle,
  type CloudArticleRecord,
} from "./xBridge";

interface SyncMeta {
  cloudRevision: number;
  articleHash: string;
  assetHashes: string[];
  localOrigin: boolean;
}
type SyncMap = Record<string, SyncMeta>;

const metaKey = (userId: string) => `acks-x-cloud-meta:${userId}`;
const localOnlyKey = (userId: string) => `acks-x-local-only:${userId}`;
const migrationKey = (userId: string) => `acks-x-cloud-migrated:${userId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function readMeta(userId: string): SyncMap {
  return readJson<SyncMap>(metaKey(userId), {});
}
function writeMeta(userId: string, value: SyncMap) {
  writeJson(metaKey(userId), value);
}
const syncHash = (article: Article) =>
  sha256(JSON.stringify({ ...article, revision: 0 }));
export function cloudMigrationDone(userId: string) {
  try {
    return localStorage.getItem(migrationKey(userId)) === "1";
  } catch {
    return false;
  }
}
export function finishCloudMigration(userId: string) {
  try {
    localStorage.setItem(migrationKey(userId), "1");
  } catch {}
}
export function localOnlyArticles(userId: string) {
  return new Set(readJson<string[]>(localOnlyKey(userId), []));
}
export function setLocalOnlyArticles(userId: string, ids: Iterable<string>) {
  writeJson(localOnlyKey(userId), [...new Set(ids)]);
}
export function makeArticleCloudEnabled(userId: string, articleId: string) {
  const ids = localOnlyArticles(userId);
  ids.delete(articleId);
  setLocalOnlyArticles(userId, ids);
}
export function isArticleLocalOnly(userId: string, articleId: string) {
  return localOnlyArticles(userId).has(articleId);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function downloadMissingAssets(article: Article) {
  const blobs: StoredAsset[] = [];
  for (const asset of article.assets) {
    if (await db.assets.get(asset.id)) continue;
    const result = await getCloudAsset(asset.id);
    blobs.push({
      id: asset.id,
      sha256: asset.sha256,
      blob: new Blob([fromBase64(result.asset.data)], { type: asset.mime }),
    });
  }
  return blobs;
}

async function rememberRemote(
  userId: string,
  record: CloudArticleRecord,
  localOrigin?: boolean,
) {
  const meta = readMeta(userId);
  meta[record.article.id] = {
    cloudRevision: record.cloudRevision,
    articleHash: await syncHash(record.article),
    assetHashes: record.article.assets.map((asset) => asset.sha256),
    localOrigin: localOrigin ?? meta[record.article.id]?.localOrigin ?? false,
  };
  writeMeta(userId, meta);
}

export async function pushCloudArticle(userId: string, article: Article) {
  if (isArticleLocalOnly(userId, article.id)) return null;
  const meta = readMeta(userId),
    previous = meta[article.id],
    knownAssets = new Set(previous?.assetHashes ?? []);
  for (const asset of article.assets) {
    if (knownAssets.has(asset.sha256)) continue;
    const stored = await db.assets.get(asset.id);
    if (!stored) throw new Error(`本地图片资源缺失：${asset.filename}`);
    await uploadCloudAsset(asset, stored.blob);
  }
  const record = await upsertCloudArticle(
    article,
    previous?.cloudRevision ?? 0,
    crypto.randomUUID(),
  );
  await rememberRemote(userId, record, previous?.localOrigin ?? true);
  return record;
}

export async function pullCloudLibrary(userId: string) {
  const result = await listCloudArticles(),
    meta = readMeta(userId),
    remoteIds = new Set<string>(),
    conflicts: string[] = [],
    applied: string[] = [];
  for (const record of result.articles) {
    const remote = record.article;
    remoteIds.add(remote.id);
    const local = await db.articles.get(remote.id),
      localMeta = meta[remote.id],
      remoteHash = await syncHash(remote);
    if (!local) {
      await applyCloudArticle(remote, await downloadMissingAssets(remote));
      applied.push(remote.id);
      await rememberRemote(userId, record, false);
      continue;
    }
    const localHash = await syncHash(local);
    if (localHash === remoteHash) {
      await rememberRemote(userId, record, localMeta?.localOrigin ?? true);
      continue;
    }
    if (localMeta && record.cloudRevision <= localMeta.cloudRevision) {
      await pushCloudArticle(userId, local);
      continue;
    }
    if (localMeta && localHash !== localMeta.articleHash) {
      const copy = {
        ...local,
        id: crypto.randomUUID(),
        revision: 0,
        title: `${local.title || "未命名文章"}（本地冲突副本）`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastExportAt: undefined,
        lastExportRevision: undefined,
      };
      await insertArticle(copy, [], "云端冲突保护");
      conflicts.push(copy.id);
    }
    await applyCloudArticle(remote, await downloadMissingAssets(remote));
    applied.push(remote.id);
    await rememberRemote(userId, record, localMeta?.localOrigin ?? true);
  }
  if (applied.length || conflicts.length) changes?.postMessage({ cloud: true });
  return {
    remoteIds,
    applied,
    conflicts,
    storageUsed: result.storageUsed,
    storageLimit: result.storageLimit,
  };
}

export async function localArticlesMissingFromCloud(remoteIds: Set<string>) {
  return (await listArticles()).filter(
    (article) => !article.deletedAt && !remoteIds.has(article.id),
  );
}

export async function detachCloudAccount(userId: string) {
  const meta = readMeta(userId);
  const cloudOnlyIds = Object.entries(meta)
    .filter(([, item]) => !item.localOrigin)
    .map(([id]) => id);
  if (cloudOnlyIds.length) {
    const cached = await db.articles.bulkGet(cloudOnlyIds);
    const candidateAssets = new Set(
      cached.flatMap(
        (article) => article?.assets.map((asset) => asset.id) ?? [],
      ),
    );
    await db.transaction(
      "rw",
      db.articles,
      db.snapshots,
      db.assets,
      async () => {
        await db.articles.bulkDelete(cloudOnlyIds);
        await db.snapshots.where("articleId").anyOf(cloudOnlyIds).delete();
        const referenced = new Set(
          (await db.articles.toArray()).flatMap((article) =>
            article.assets.map((asset) => asset.id),
          ),
        );
        await db.assets.bulkDelete(
          [...candidateAssets].filter((id) => !referenced.has(id)),
        );
      },
    );
  }
  for (const id of cloudOnlyIds) delete meta[id];
  writeMeta(userId, meta);
  changes?.postMessage({ cloudDetached: true });
  return cloudOnlyIds;
}
