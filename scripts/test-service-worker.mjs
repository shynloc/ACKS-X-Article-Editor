import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("dist/client/sw.js", "utf8");
const handlers = new Map();
const context = {
  URL,
  caches: {
    open: async () => ({
      match: async () => new Response("cached app"),
      addAll: async () => {},
    }),
    keys: async () => [],
    delete: async () => true,
  },
  fetch: async () => new Response("network"),
  Response,
  self: {
    location: { origin: "https://xeditor.acks.com.cn" },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: () => {},
  },
};
vm.runInNewContext(source, context);
const fetchHandler = handlers.get("fetch");
assert.equal(
  typeof fetchHandler,
  "function",
  "service worker fetch handler missing",
);

function intercepted(path, mode = "navigate") {
  let response;
  fetchHandler({
    request: {
      method: "GET",
      mode,
      url: `https://xeditor.acks.com.cn${path}`,
    },
    respondWith: (value) => {
      response = value;
    },
  });
  return response;
}

assert.equal(
  intercepted("/api/x/callback?code=test&state=test"),
  undefined,
  "OAuth callback must reach the network",
);
assert.equal(
  intercepted("/api/x/status", "cors"),
  undefined,
  "X API requests must reach the network",
);
assert.ok(
  intercepted("/draft/example"),
  "app navigation should use offline shell",
);
assert.ok(
  intercepted("/index.html", "cors"),
  "immutable app assets should use the cache",
);
console.log("Service worker routing: PASS (API bypass, app shell retained).");
