import { unzipSync, strFromU8 } from "fflate";
import { normalizePath, convert } from "../core/convert";
import { assertArticle } from "../core/validate";
import { sha256, articleHash, type StoredAsset } from "../core/types";
const MAX_EXPANDED = 250 * 1024 * 1024;
export async function inspectArchive(bytes: Uint8Array, allowRecovery = false) {
  if (bytes.length > MAX_EXPANDED) throw new Error("压缩包不能超过 250 MiB。");
  const names = new Set<string>();
  let total = 0,
    count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        if (file.name.endsWith("/")) return false;
        const normalized = normalizePath(file.name);
        if (normalized !== file.name)
          throw new Error("包内路径必须为规范相对路径。");
        if (names.has(file.name)) throw new Error("压缩包包含重复文件路径。");
        names.add(file.name);
        count++;
        total += file.originalSize;
        if (
          count > 2000 ||
          total > MAX_EXPANDED ||
          file.originalSize > MAX_EXPANDED ||
          file.originalSize > Math.max(file.size, 1) * 100
        )
          throw new Error("压缩包超过解压安全限制。");
        return true;
      },
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "压缩包无法读取。");
  }
  if (Object.values(files).reduce((n, v) => n + v.length, 0) > MAX_EXPANDED)
    throw new Error("压缩包展开体积超限。");
  const parse = (name: string) => {
    if (!files[name]) throw new Error(`包内缺少 ${name}`);
    if (files[name].length > 4 * 1024 * 1024) throw new Error("元数据过大。");
    try {
      return JSON.parse(strFromU8(files[name]));
    } catch {
      throw new Error(`${name} 不是有效 JSON。`);
    }
  };
  const manifest = parse("manifest.json");
  if (manifest.formatVersion !== "1.0.0")
    throw new Error("不支持此资源包版本，不会修改现有文稿。");
  if (manifest.recovery && !allowRecovery)
    throw new Error(
      "这是抢救包，可能缺少资源。请解压后通过 Markdown 导入修复，不会自动覆盖文稿。",
    );
  if (
    !Array.isArray(manifest.files) ||
    !manifest.assetPaths ||
    typeof manifest.assetPaths !== "object"
  )
    throw new Error("资源清单格式错误。");
  const declared = new Set<string>();
  for (const file of manifest.files) {
    if (
      typeof file.path !== "string" ||
      declared.has(file.path) ||
      !files[file.path]
    )
      throw new Error("资源清单重复或缺少文件。");
    declared.add(file.path);
    if (
      files[file.path].length !== file.byteLength ||
      (await sha256(files[file.path])) !== file.sha256
    )
      throw new Error(`完整性校验失败：${file.path}`);
  }
  if (Object.keys(files).some((n) => n !== "manifest.json" && !declared.has(n)))
    throw new Error("压缩包包含未在清单中声明的文件。");
  const article = parse("article.json");
  assertArticle(article);
  if ((await articleHash(article)) !== manifest.sourceHash)
    throw new Error("文稿内容哈希不匹配。");
  const blobs: StoredAsset[] = [];
  for (const a of article.assets) {
    const path = manifest.assetPaths[a.id];
    if (typeof path !== "string" || !path.startsWith("assets/") || !files[path])
      throw new Error(`资源文件缺失：${a.filename}`);
    if (
      files[path].length !== a.byteLength ||
      (await sha256(files[path])) !== a.sha256
    )
      throw new Error(`图片校验失败：${a.filename}`);
    blobs.push({
      id: a.id,
      blob: new Blob([files[path] as BlobPart], { type: a.mime }),
      sha256: a.sha256,
    });
  }
  if (!manifest.recovery) {
    const conversion = convert(article.body);
    for (const n of conversion.nodes)
      if (
        n.kind === "image" &&
        (!n.assetId || !article.assets.some((a) => a.id === n.assetId))
      )
        throw new Error("包中存在未恢复的图片引用。");
  }
  return { article, blobs, manifest };
}
