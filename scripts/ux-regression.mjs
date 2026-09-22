import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import axe from "axe-core";
import puppeteer from "puppeteer-core";

const port = Number(process.env.UX_AUDIT_PORT || 47640);
const target = process.env.UX_AUDIT_URL || `http://127.0.0.1:${port}/`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = join(process.cwd(), ".local", "ux-regression", stamp);
const viewports = [
  [320, 720],
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates)
    try {
      await access(candidate);
      return candidate;
    } catch {}
  throw new Error("Chrome/Chromium not found. Set CHROME_PATH and retry.");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(target)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Preview server did not become ready: ${target}`);
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label:
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent?.trim().slice(0, 120) ||
        "",
      inDialog: !!element.closest("dialog[open]"),
      focusVisible: element.matches(":focus-visible"),
    };
  });
}

async function openApp(page) {
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => document.fonts.ready);
  await new Promise((resolve) => setTimeout(resolve, 600));
}

await mkdir(outputDir, { recursive: true });
let preview;
try {
  try {
    await waitForServer();
  } catch {
    preview = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      [
        "exec",
        "vite",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    await waitForServer();
  }

  const browser = await puppeteer.launch({
    executablePath: await chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const matrix = [];
    const axeViolations = new Map();

    for (const [width, height] of viewports) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await openApp(page);
      await page.screenshot({
        path: join(outputDir, `${width}x${height}.png`),
      });
      const layout = await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1 ||
          document.body.scrollWidth > innerWidth + 1,
        openDialog: !!document.querySelector("dialog[open]"),
      }));
      await page.addScriptTag({ content: axe.source });
      const axeResult = await page.evaluate(async () =>
        globalThis.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        }),
      );
      for (const violation of axeResult.violations)
        axeViolations.set(violation.id, {
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodes: violation.nodes.length,
          targets: violation.nodes.map((node) => node.target),
        });
      matrix.push({ width, height, ...layout });
    }

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await openApp(page);
    await page.keyboard.press("Tab");
    const keyboardTrail = [];
    for (let index = 0; index < 36; index++) {
      keyboardTrail.push(await focusInfo(page));
      await page.keyboard.press("Tab");
    }
    await page.click(".header-publish-button");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const publishInitialFocus = await focusInfo(page);
    const dialogTrail = [];
    for (let index = 0; index < 8; index++) {
      dialogTrail.push(await focusInfo(page));
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Escape");
    const dialogClosed = !(await page.$("dialog[open]"));
    const dialogFocusEscapes = dialogTrail.filter((item) => !item?.inDialog);

    const zoomPage = await browser.newPage();
    await zoomPage.setViewport({
      width: 720,
      height: 450,
      deviceScaleFactor: 2,
    });
    await openApp(zoomPage);
    await zoomPage.screenshot({ path: join(outputDir, "zoom-200.png") });
    const zoom = await zoomPage.evaluate(() => ({
      scale: devicePixelRatio,
      width: innerWidth,
      height: innerHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth > innerWidth + 1 ||
        document.body.scrollWidth > innerWidth + 1,
    }));
    await zoomPage.close();

    const violations = [...axeViolations.values()];
    const blockingViolations = violations.filter((item) =>
      ["critical", "serious"].includes(item.impact || ""),
    );
    const report = {
      generatedAt: new Date().toISOString(),
      target,
      matrix,
      axe: { violations, blockingViolations },
      keyboard: {
        trail: keyboardTrail,
        publishInitialFocus,
        dialogTrail,
        dialogFocusEscapes,
        dialogClosed,
      },
      zoom,
    };
    await writeFile(
      join(outputDir, "report.json"),
      JSON.stringify(report, null, 2),
    );
    await writeFile(
      join(outputDir, "REPORT.md"),
      [
        "# UX regression report",
        "",
        `- Target: ${target}`,
        `- Viewports: ${matrix.map((item) => `${item.width}x${item.height}`).join(", ")}`,
        `- Horizontal overflow failures: ${matrix.filter((item) => item.horizontalOverflow).length}`,
        `- axe violations: ${violations.length}`,
        `- axe serious/critical: ${blockingViolations.length}`,
        `- Publish dialog initial focus: ${publishInitialFocus?.label || "unknown"}`,
        `- Dialog closed with Escape: ${dialogClosed}`,
        `- Dialog focus escapes: ${dialogFocusEscapes.length}`,
        `- Emulated page scale: ${zoom.scale}`,
        "",
        "See report.json for detailed focus and axe evidence.",
        "",
      ].join("\n"),
    );
    console.log(outputDir);
    console.log(
      JSON.stringify({
        horizontalOverflow: matrix.filter((item) => item.horizontalOverflow),
        axeViolations: violations,
        publishInitialFocus,
        dialogClosed,
        dialogFocusEscapes,
        zoom,
      }),
    );
    if (matrix.some((item) => item.horizontalOverflow)) process.exitCode = 1;
    if (blockingViolations.length) process.exitCode = 1;
    if (
      !dialogClosed ||
      !publishInitialFocus?.inDialog ||
      dialogFocusEscapes.length
    )
      process.exitCode = 1;
  } finally {
    await browser.close();
  }
} finally {
  preview?.kill("SIGTERM");
}
