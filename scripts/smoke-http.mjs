import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:5701");
const get = async (p) => {
  const r = await fetch(new URL(p, base), {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(r.status, 200, `${p}: ${r.status}`);
  return r;
};
const health = await (await get("/health.json")).json();
assert.equal(health.app, "acks-x-article-editor");
const root = await get("/");
const html = await root.text();
assert.match(html, /<title>ACKS X Article Editor/);
assert.match(
  root.headers.get("content-security-policy") ?? "",
  /script-src 'self'/,
);
assert.doesNotMatch(
  root.headers.get("content-security-policy") ?? "",
  /unsafe-eval/,
);
assert.equal(root.headers.get("x-content-type-options"), "nosniff");
const resources = [
  ...new Set(
    [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map((m) => m[1]),
  ),
];
assert(resources.some((p) => p.endsWith(".js")));
for (const p of resources) {
  const r = await get(p);
  if (p.endsWith(".js"))
    assert.match(r.headers.get("content-type") ?? "", /javascript/);
  if (p.endsWith(".css"))
    assert.match(r.headers.get("content-type") ?? "", /text\/css/);
}
const sw = await get("/sw.js");
assert.match(sw.headers.get("cache-control") ?? "", /no-store/);
assert((await sw.text()).includes(health.build));
const post = await fetch(base, {
  method: "POST",
  body: "non-sensitive deployment smoke check",
  signal: AbortSignal.timeout(10000),
});
assert.equal(post.status, 405, "Static server must reject writes");
console.log(
  JSON.stringify(
    {
      base: base.origin,
      status: "PASS",
      health,
      html: true,
      resources: resources.length,
      csp: true,
      serviceWorker: true,
      rejectsWrite: true,
      browserWorkflow: "NOT TESTED",
    },
    null,
    2,
  ),
);
