import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M1-跨表.xlsx");
const shot = (name) => path.join(root, "review-m1", name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9445";

const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${cdp}`,
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1 });
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector(".welcome", { timeout: 20000 });
await page.evaluate(() => window.__soroban.newDoc());
await page.waitForSelector(".univer-container", { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
await sleep(1000);

await page.click(".fx-input");
await page.keyboard.type("=SU");
await sleep(400);
const suggest = await page.evaluate(() => {
  const panel = document.querySelector(".fx-suggest")?.getBoundingClientRect();
  return {
    open: Boolean(panel),
    rect: panel && { left: panel.left, right: panel.right, width: panel.width },
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(suggest.open, true);
assert.ok(suggest.rect.right <= 900, "提示卡越过窗口");
assert.ok(suggest.rect.width <= 804, "提示卡过宽");
assert.equal(suggest.overflow, false);
await page.screenshot({ path: shot("110-suggest-900.png") });

await page.click(".fx-mark");
await sleep(400);
const library = await page.evaluate(() => {
  const panel = document.querySelector(".fx-library")?.getBoundingClientRect();
  return {
    open: Boolean(panel),
    rect: panel && { left: panel.left, right: panel.right, width: panel.width, height: panel.height },
    rows: document.querySelectorAll(".fx-lib-list .fx-row").length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(library.open, true);
assert.ok(library.rect.right <= 900, "函数库越过窗口");
assert.ok(library.rect.width <= 804, "函数库过宽");
assert.ok(library.rect.height <= 500, "函数库过高");
assert.ok(library.rows >= 40);
await page.screenshot({ path: shot("111-library-900.png") });
await page.keyboard.press("Escape");
await sleep(200);

await page.evaluate((file) => window.__soroban.openPath(file), fixture);
await page.waitForFunction(
  () => [...document.querySelectorAll(".sheet-tab")].some((tab) => tab.textContent === "汇总"),
  { timeout: 30000 },
);
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
await sleep(900);
await page.evaluate(() =>
  [...document.querySelectorAll(".sheet-tab")].find((tab) => tab.textContent === "汇总")?.click(),
);
await sleep(500);
const editor = await page.evaluate(() => {
  const topbar = document.querySelector(".topbar");
  const items = [...topbar.querySelectorAll("button, .tb-file, .tb-sheets, .tb-status")];
  const right = Math.max(...items.map((element) => element.getBoundingClientRect().right));
  return {
    width: innerWidth,
    topbarRight: right,
    overflow: document.documentElement.scrollWidth > innerWidth,
    grid: document.querySelector(".sheet-grid")?.getBoundingClientRect().toJSON(),
    tabs: document.querySelector(".sheet-tabs")?.getBoundingClientRect().toJSON(),
    tabsList: [...document.querySelectorAll(".sheet-tab")].map((tab) => tab.textContent),
  };
});
assert.equal(editor.overflow, false);
assert.ok(editor.topbarRight <= editor.width, "顶栏越界");
assert.deepEqual(editor.tabsList, ["明细", "汇总"]);
assert.ok(editor.tabs.top >= editor.grid.bottom - 1, "标签与网格重叠");
await page.screenshot({ path: shot("112-cross-900.png") });

console.log("suggest", suggest);
console.log("library", { rect: library.rect, rows: library.rows });
console.log("editor", editor);
console.log("M1 Layout 900 OK");
await browser.disconnect();
