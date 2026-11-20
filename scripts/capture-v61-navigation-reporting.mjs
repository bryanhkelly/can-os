#!/usr/bin/env node
/**
 * Build-independent entry point for a *built* Storybook. This captures the
 * actual V6.1 React primitives, not a synthetic HTML mock or an approved Site.
 * The build and Playwright Chromium are required; failures leave no fabricated
 * "reviewed" evidence in docs/verification/v61-visual-evidence.json.
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve("storybook-static");
const output = resolve("artifacts/v61-navigation-reporting");
const names = {
  light: "light",
  dark: "dark",
};
const widths = [390, 768, 1440];
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".ico": "image/x-icon",
};
const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
const entries = Object.values(index.entries ?? {});
const story = name => {
  const found = entries.find(item =>
    item.type === "story" &&
    item.title === "Foundations/V6.1 reporting tables and navigation" &&
    item.name === name
  );
  if (!found?.id) throw new Error("Missing built V6.1 story: " + name);
  return found.id;
};
const desktopStory = story("Desktop");
const cursorStory = story("Cursor Paging Interactions");
await mkdir(output, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const candidate = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      response.writeHead(403).end(); return;
    }
    const file = await readFile(candidate);
    response.writeHead(200, { "content-type": contentTypes[extname(candidate)] ?? "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((ok, fail) => {
  server.once("error", fail);
  server.listen(0, "127.0.0.1", ok);
});
const port = server.address().port;
const base = `http://127.0.0.1:${port}/iframe.html`;
const report = { sourceCommit: process.env.GITHUB_SHA ?? null,
  note: "Automated screenshots of actual Storybook fixtures; independent human visual review and authenticated product journeys remain separate.",
  screenshots: [], failures: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const [theme] of Object.entries(names)) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const filename = `reporting-table-${theme}-${width}.png`;
      try {
        const url = new URL(base);
        url.searchParams.set("id", desktopStory);
        url.searchParams.set("viewMode", "story");
        url.searchParams.set("globals", `theme:${theme}`);
        await page.goto(url.toString(), { waitUntil: "load", timeout: 45_000 });
        const region = page.getByRole("region", { name: "Site participation totals" });
        await region.waitFor({ timeout: 30_000 });
        const table = page.getByRole("table", { name: "Site participation totals" });
        const headers = await table.getByRole("rowheader").count();
        const columns = await table.getByRole("columnheader").count();
        const navigation = await page.getByRole("navigation", { name: "Related evidence destinations" }).count();
        const metrics = await region.evaluate(el => ({
          scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, tabIndex: el.tabIndex,
          documentWidth: document.documentElement.scrollWidth,
          hasDarkTheme: !!document.querySelector(".dark"),
        }));
        await page.screenshot({ path: join(output, filename), fullPage: true, animations: "disabled" });
        report.screenshots.push({ filename, theme, width, headers, columns, navigation, ...metrics });
        if (headers !== 2 || columns !== 4 || navigation !== 1 || metrics.tabIndex !== 0 ||
            (theme === "dark" && !metrics.hasDarkTheme) ||
            (width === 390 && metrics.scrollWidth <= metrics.clientWidth) ||
            metrics.documentWidth > width + 2)
          report.failures.push({ filename, reason: "table/navigation semantics, theme or viewport overflow", metrics });
      } catch (error) {
        report.failures.push({ filename, reason: String(error) });
      } finally {
        await page.close();
      }
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  try {
    const url = new URL(base);
    url.searchParams.set("id", cursorStory);
    url.searchParams.set("viewMode", "story");
    await page.goto(url.toString(), { waitUntil: "load", timeout: 45_000 });
    const older = page.getByRole("button", { name: "Older" });
    const newer = page.getByRole("button", { name: "Newer" });
    await older.waitFor({ timeout: 30_000 });
    if (!(await newer.isDisabled())) throw new Error("Newer must be disabled on page 1");
    await older.click();
    if (!(await page.getByText("Page 2").isVisible())) throw new Error("Cursor failed to advance to page 2");
    await older.click();
    if (!(await page.getByText("Page 3").isVisible()) || !(await older.isDisabled()))
      throw new Error("Final cursor page is not bounded");
    await page.screenshot({ path: join(output, "blueprint-cursor-final-page-mobile.png"), fullPage: true });
    report.screenshots.push({ filename: "blueprint-cursor-final-page-mobile.png", width: 390, currentPage: 3 });
  } catch (error) {
    report.failures.push({ filename: "blueprint-cursor-final-page-mobile.png", reason: String(error) });
  } finally {
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(ok => server.close(ok));
}
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`V6.1 navigation/reporting captures: ${report.screenshots.length} screenshots, ${report.failures.length} failures`);
if (report.failures.length) process.exitCode = 1;
