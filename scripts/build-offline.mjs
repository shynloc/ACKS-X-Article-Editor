import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve("dist/client");
const appVersion = JSON.parse(await readFile("package.json", "utf8")).version;
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await walk(p)));
    else result.push(p);
  }
  return result;
}
const files = (await walk(root)).filter((p) => !p.endsWith("/sw.js")).sort();
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(file));
const version = hash.digest("hex").slice(0, 16);
const assets = files.map(
  (f) => "/" + path.relative(root, f).replaceAll("\\", "/"),
);
await writeFile(
  path.join(root, "health.json"),
  JSON.stringify({
    status: "ok",
    app: "acks-x-article-editor",
    version: appVersion,
    build: version,
  }),
);
assets.push("/health.json");
await writeFile(
  path.join(root, "sw.js"),
  `// Generated from the immutable build asset set. Never caches user-authored content.
const CACHE='acks-x-editor-${version}';
const ASSETS=${JSON.stringify(assets)};
const PATHS=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(let i=0;i<ASSETS.length;i+=12)await cache.addAll(ASSETS.slice(i,i+12));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const old=(await caches.keys()).filter(k=>k.startsWith('acks-x-editor-')&&k!==CACHE);for(const key of old.slice(0,-1))await caches.delete(key);})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname==='/health.json')return;
 if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async c=>(await c.match('/index.html'))||fetch(event.request)));return;}
 if(PATHS.has(u.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname))||fetch(event.request)));
});
`,
);
console.log(
  `Offline shell ${version}: ${assets.length} local assets. Updates wait for user confirmation.`,
);
