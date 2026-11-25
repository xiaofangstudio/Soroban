import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M0-样本.xlsx");
const out = path.join(root, "review-0.7");
const working = path.join(out, "M0-单元格工具-working.xlsx");
const saved = path.join(out, "M9-单元格工具.xlsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9445";

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(fixture, working);

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

let errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.stack || String(e)));
const waitReady = async () => {
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(900);
};
const open = async (file, tab = "销售") => {
  await page.evaluate((p) => window.__soroban.openPath(p), file);
  await waitReady();
  await page.evaluate((name) => {
    const item = [...document.querySelectorAll(".sheet-tab")].find((x) => x.textContent === name);
    if (item instanceof HTMLElement) item.click();
  }, tab);
  await sleep(600);
};
const snapshot = () => page.evaluate(() => window.__soroban.getSnapshot());
const sheetSnap = async (index = 0) => {
  const snap = await snapshot();
  return snap.sheets[snap.sheetOrder[index]];
};
const clickTool = (label) => page.evaluate((label) => {
  const buttons = [...document.querySelectorAll(".cell-tools button")];
  const btn = buttons.find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`单元格工具按钮不存在：${label}`);
  btn.click();
}, label);
const openTools = async () => {
  const exists = await page.evaluate(() => Boolean(document.querySelector(".cell-tools")));
  if (!exists) await page.evaluate(() => document.querySelector(".cell-tools-mark")?.click());
  await sleep(250);
};

await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1.5 });
await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".welcome", { timeout: 30000 });
await open(working);

// 1. 面板入口与合并状态
await page.evaluate(() => window.__soroban.selectRange(0, 0, 0, 5));
await openTools();
const panel = await page.evaluate(() => {
  const el = document.querySelector(".cell-tools");
  const r = el?.getBoundingClientRect();
  const merge = [...document.querySelectorAll(".cell-tools button")].find((b) => b.textContent?.trim() === "取消合并");
  return {
    width: r?.width,
    height: r?.height,
    right: r?.right,
    bottom: r?.bottom,
    range: document.querySelector(".ct-range")?.textContent,
    unmergeDisabled: merge instanceof HTMLButtonElement ? merge.disabled : null,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(panel.width, 360);
assert.ok(panel.right <= 1280 && panel.bottom <= 820, "单元格工具面板越界");
assert.equal(panel.range, "A1:F1");
assert.equal(panel.unmergeDisabled, false);
assert.equal(panel.overflow, false);
await page.screenshot({ path: path.join(out, "700-cell-tools.png") });

// 2. 取消合并 A1 标题，撤销恢复
await clickTool("取消合并");
await sleep(350);
let sh = await sheetSnap();
assert.equal(sh.mergeData?.length ?? 0, 0);
assert.equal(sh.cellData?.[0]?.[0]?.v, "2026 年第四季度销售台账");
await page.click('.tb-btn[title="撤销 Ctrl+Z"]');
await sleep(450);
sh = await sheetSnap();
assert.deepEqual(sh.mergeData?.[0], { startRow: 0, endRow: 0, startColumn: 0, endColumn: 4 });

// 3. 合并并居中 G1:G3
await page.evaluate(() => window.__soroban.selectRange(0, 6, 2, 6));
await sleep(250);
await openTools();
await clickTool("合并并居中");
await sleep(350);
sh = await sheetSnap();
const merge = sh.mergeData?.find((item) => item.startRow === 0 && item.startColumn === 6);
assert.ok(merge, "G1:G3 未合并");
assert.equal(merge.endRow, 2);
assert.equal(merge.endColumn, 6);
const mergedStyle = await page.evaluate(() => window.__soroban.cellStyle(0, 6));
assert.equal(mergedStyle?.tb, 3);
assert.equal(mergedStyle?.vt, 2);

// 4. 外框 B3:D5，四角边线
await page.evaluate(() => window.__soroban.selectRange(2, 1, 4, 3));
await sleep(250);
await clickTool("外框");
await sleep(350);
const b3 = await page.evaluate(() => window.__soroban.cellStyle(2, 1));
const d5 = await page.evaluate(() => window.__soroban.cellStyle(4, 3));
assert.equal(b3?.bd?.t?.cl?.rgb, "#8fb3a2");
assert.equal(b3?.bd?.l?.cl?.rgb, "#8fb3a2");
assert.equal(d5?.bd?.b?.cl?.rgb, "#8fb3a2");
assert.equal(d5?.bd?.r?.cl?.rgb, "#8fb3a2");

// 5. 自动换行与底端对齐
await page.evaluate(() => window.__soroban.selectCell(7, 6));
await sleep(200);
await page.keyboard.type("这是一段需要自动换行的长备注，用来验证单元格文字不会溢出到右侧空白区域。");
await page.keyboard.press("Enter");
await sleep(300);
await page.evaluate(() => window.__soroban.selectCell(7, 6));
await openTools();
await clickTool("自动换行");
await clickTool("底端");
await sleep(400);
const note = await page.evaluate(() => window.__soroban.cellStyle(7, 6));
assert.equal(note?.tb, 3);
assert.equal(note?.vt, 3);
await page.screenshot({ path: path.join(out, "701-cell-tools-applied.png") });

// 6. 行列结构：插入 / 撤销 / 隐藏 / 显示
await page.evaluate(() => {
  const item = [...document.querySelectorAll(".sheet-tab")].find((x) => x.textContent === "明细");
  if (item instanceof HTMLElement) item.click();
});
await sleep(700);
await page.evaluate(() => window.__soroban.selectCell(13, 0));
await page.keyboard.type("结构测试");
await page.keyboard.press("Enter");
await sleep(350);
let detail = await sheetSnap(1);
assert.equal(detail.cellData?.[13]?.[0]?.v, "结构测试");
await page.evaluate(() => window.__soroban.selectCell(9, 0));
await openTools();
await clickTool("上方插入");
await sleep(450);
detail = await sheetSnap(1);
assert.equal(detail.cellData?.[14]?.[0]?.v, "结构测试");
await page.click('.tb-btn[title="撤销 Ctrl+Z"]');
await sleep(450);
detail = await sheetSnap(1);
assert.equal(detail.cellData?.[13]?.[0]?.v, "结构测试");

await page.evaluate(() => window.__soroban.selectRange(2, 3, 2, 3));
await sleep(200);
await openTools();
await clickTool("左侧插入");
await sleep(450);
detail = await sheetSnap(1);
assert.equal(detail.cellData?.[2]?.[4]?.v, 15500);
await page.click('.tb-btn[title="撤销 Ctrl+Z"]');
await sleep(450);
detail = await sheetSnap(1);
assert.equal(detail.cellData?.[2]?.[3]?.v, 15500);

const hiddenBase = await page.evaluate(() => window.__soroban.hiddenRows());
await page.evaluate(() => window.__soroban.selectCell(4, 0));
await openTools();
await clickTool("隐藏行");
await sleep(400);
const hiddenAfter = await page.evaluate(() => window.__soroban.hiddenRows());
assert.ok(hiddenAfter > hiddenBase, `隐藏行未生效：${hiddenBase} -> ${hiddenAfter}`);
await page.evaluate(() => window.__soroban.selectCell(4, 0));
await openTools();
await clickTool("显示行");
await sleep(400);
assert.equal(await page.evaluate(() => window.__soroban.hiddenRows()), hiddenBase);
await page.evaluate(() => window.__soroban.selectCell(13, 0));
await page.keyboard.press("Delete");
await sleep(300);

// 7. 900 × 620 窄窗
await page.evaluate(() => {
  const item = [...document.querySelectorAll(".sheet-tab")].find((x) => x.textContent === "销售");
  if (item instanceof HTMLElement) item.click();
});
await sleep(650);
await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1.5 });
await sleep(500);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 0, 5));
await openTools();
const narrow = await page.evaluate(() => {
  const r = document.querySelector(".cell-tools")?.getBoundingClientRect();
  return {
    width: r?.width,
    right: r?.right,
    bottom: r?.bottom,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(narrow.width, 360);
assert.ok(narrow.right <= 900, "窄窗面板横向越界");
assert.ok(narrow.bottom <= 620, "窄窗面板纵向越界");
assert.equal(narrow.overflow, false);
await page.screenshot({ path: path.join(out, "702-cell-tools-900.png") });

// 8. 保存重开：合并、边框、换行、垂直对齐保留
await page.evaluate((p) => window.__soroban.savePath(p), saved);
await page.waitForFunction(() => !window.__soroban.getState().dirty, { timeout: 30000 });
await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1.5 });
await page.evaluate((p) => window.__soroban.openPath(p), saved);
await waitReady();
const reopened = await sheetSnap(0);
// 保存后当前表可能回到「销售」
assert.ok(reopened.mergeData?.some((item) => item.startRow === 0 && item.endRow === 2 && item.startColumn === 6), "重开后 G1:G3 合并丢失");
const reopenedB3 = await page.evaluate(() => window.__soroban.cellStyle(2, 1));
const reopenedNote = await page.evaluate(() => window.__soroban.cellStyle(7, 6));
assert.equal(reopenedB3?.bd?.t?.cl?.rgb, "#8fb3a2");
assert.equal(reopenedNote?.tb, 3);
assert.equal(reopenedNote?.vt, 3);
assert.ok((reopened.rowData?.["7"]?.h ?? 0) >= 150, "重开后自动换行行高未保留");
await page.evaluate(() => document.querySelector(".ct-close")?.click());
await page.evaluate(() => window.__soroban.selectCell(7, 6));
await sleep(350);
await page.screenshot({ path: path.join(out, "703-cell-tools-reopen.png") });

assert.deepEqual(errors, []);
console.log("M9 CELL TOOLS OK");
console.log("M9 MERGE OK");
console.log("M9 BORDER OK");
console.log("M9 WRAP OK");
console.log("M9 STRUCTURE OK");
console.log("M9 ROUNDTRIP OK");
console.log("M9 Layout 900 OK");
await browser.disconnect();
