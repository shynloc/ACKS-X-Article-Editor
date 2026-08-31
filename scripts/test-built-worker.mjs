import { readdir } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const filename = (await readdir("dist/client/assets")).find((n) =>
  /^converter\.worker-.*\.js$/.test(n),
);
assert(filename, "Production converter worker must be emitted");
const url = pathToFileURL(path.resolve("dist/client/assets", filename)).href;
const source =
  "## 工作线程\n\n😀 **重要**\n\n| 列 | 值 |\n| --- | --- |\n| a | b |";
const worker = new Worker(
  `const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:m=>parentPort.postMessage(m)};import(${JSON.stringify(url)}).then(()=>self.onmessage({data:{id:1,source:${JSON.stringify(source)}}})).catch(e=>{throw e;});`,
  { eval: true },
);
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    worker.terminate();
    reject(new Error("Worker timed out"));
  }, 10000);
  worker.once("error", (e) => {
    clearTimeout(timer);
    reject(e);
  });
  worker.once("message", (m) => {
    clearTimeout(timer);
    resolve(m);
  });
});
await worker.terminate();
assert.equal(result.conversion?.nodes.length, 3, JSON.stringify(result));
assert.equal(result.conversion.nodes[2].renderKind, "table");
assert.equal(result.conversion.nodes[1].spans[0].offset, 3);
console.log(
  "Production worker: PASS (no document/DOM globals; heading, UTF-16 styles, table).",
);
