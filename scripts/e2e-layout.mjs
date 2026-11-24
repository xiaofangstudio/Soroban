import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M0-样本.xlsx");
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9445", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1 });
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector(".welcome", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: path.join(root, "review-m0", "010-welcome-900.png") });

const welcome = await page.evaluate(() => {
  const body = document.querySelector(".welcome-body")?.getBoundingClientRect();
  return {
    w: innerWidth,
    h: innerHeight,
    body: body && { x: body.x, right: body.right, width: body.width },
    overflowX: document.documentElement.scrollWidth > innerWidth,
  };
});
console.log("welcome", welcome);
assert.equal(welcome.overflowX, false, "欢迎页横向溢出");
assert.ok(welcome.body.width <= 900, "欢迎页容器超出窗口");

await page.evaluate((p) => window.__soroban.openPath(p), fixture);
await page.waitForSelector(".univer-container", { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: path.join(root, "review-m0", "011-editor-900.png") });
const editor = await page.evaluate(() => {
  const tb = document.querySelector(".topbar");
  const items = [...tb.querySelectorAll("button, .tb-file, .tb-sheets, .tb-status")];
  const right = Math.max(...items.map((el) => el.getBoundingClientRect().right));
  return {
    w: innerWidth,
    topbarRight: right,
    overflowX: document.documentElement.scrollWidth > innerWidth,
    grid: document.querySelector(".sheet-grid")?.getBoundingClientRect().toJSON(),
    tabs: document.querySelector(".sheet-tabs")?.getBoundingClientRect().toJSON(),
    statusVisible: getComputedStyle(document.querySelector(".tb-status")).display,
    tabsList: [...document.querySelectorAll(".sheet-tab")].map((t) => t.textContent),
  };
});
console.log("editor", editor);
assert.equal(editor.overflowX, false, "编辑器横向溢出");
assert.ok(editor.topbarRight <= editor.w, "顶栏超窗");
assert.deepEqual(editor.tabsList, ["销售", "明细"]);
assert.ok(editor.tabs.top >= editor.grid.bottom - 1, "标签与网格重叠");
console.log("Layout 900 OK");
await browser.disconnect();
