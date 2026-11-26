// Isolated, built-app regression. No account, OAuth token or real publishing.
import assert from "node:assert/strict";
import { preview } from "vite";
import puppeteer from "puppeteer-core";
const app = await preview({
  configFile: false,
  build: { outDir: "dist/client" },
  preview: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  for (const width of [390, 1440]) {
    const context = await browser.createBrowserContext(),
      page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument(() =>
      localStorage.setItem("acks-x-language", "zh-CN"),
    );
    await page.goto("http://127.0.0.1:" + app.httpServer.address().port);
    await page.waitForSelector(".document-open");
    const click = async (s) => {
      await page.waitForSelector(s, { visible: true });
      await page.click(s);
    };
    const open = async () => {
      if (width < 600) await click(".mobile-menu");
      await click(".shelf-index");
      await page.waitForSelector(".article-shelf[open]");
    };
    const action = (n) => '.article-shelf button[aria-label="' + n + '"]';
    await open();
    await click(action("卡片"));
    const tabs = async (name) => {
      await page.evaluate(
        (n) =>
          [...document.querySelectorAll(".shelf-tabs button")]
            .find((b) => b.textContent.startsWith(n))
            .click(),
        name,
      );
    };
    const name = await page.$eval(".shelf-open strong", (e) => e.textContent);
    await page.type(".shelf-controls input", name);
    await click(action("标记为已发布"));
    await page.waitForSelector(action("标记为草稿"));
    await tabs("已发布");
    assert.equal(await page.$$eval(".shelf-item", (a) => a.length), 1);
    await click(action("移入回收站"));
    await click(".shelf-confirm button:last-child");
    await page.waitForFunction(() => !document.querySelector(".shelf-item"));
    await tabs("回收站");
    await click(action("恢复文章"));
    await page.waitForFunction(() => !document.querySelector(".shelf-item"));
    await tabs("已发布");
    assert.equal(
      await page.$eval(".shelf-open strong", (e) => e.textContent),
      name,
    );
    assert(
      await page.$eval(
        ".article-shelf",
        (el) => el.scrollWidth <= el.clientWidth + 1,
      ),
    );
    await page.reload();
    await page.waitForSelector(".document-open");
    await open();
    await tabs("已发布");
    await page.waitForSelector(".shelf-results.cards .shelf-open");
    await click(".shelf-open");
    await page.waitForFunction(
      () => !document.querySelector(".article-shelf[open]"),
    );
    console.log(
      "PASS article manager " +
        width +
        "px: classify, trash, restore, persisted state and open",
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => app.httpServer.close(r));
}
