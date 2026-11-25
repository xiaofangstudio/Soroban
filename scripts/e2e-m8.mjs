import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureSource = path.join(root, "assets", "M3-整理.xlsx");
const csv = path.join(root, "assets", "M3-订单.csv");
const out = process.env.SOROBAN_REVIEW_DIR || path.join(root, "review-0.6.0");
const saveCopy = path.join(out, "autosave-0.6.xlsx");
const fixture = path.join(out, "M3-功能-working.xlsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9446";

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(fixtureSource, fixture);
fs.rmSync(saveCopy, { force: true });

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

let errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.stack || String(error)));

async function open(file, { width = 1280, height = 800 } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".welcome", { timeout: 30000 });
  await page.evaluate((target) => window.__soroban.openPath(target), file);
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent === "订单");
    if (tab instanceof HTMLElement) tab.click();
  });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(900);
}

async function setInput(selector, value, index = 0) {
  await page.evaluate(
    ({ target, next, at }) => {
      const node = document.querySelectorAll(target)[at];
      if (!(node instanceof HTMLInputElement)) throw new Error(`找不到输入框：${target}[${at}]`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(node, next);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { target: selector, next: value, at: index },
  );
  await sleep(150);
}

async function setSelect(selector, value, index = 0) {
  await page.evaluate(
    ({ target, next, at }) => {
      const node = document.querySelectorAll(target)[at];
      if (!(node instanceof HTMLSelectElement)) throw new Error(`找不到下拉：${target}[${at}]`);
      node.value = next;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { target: selector, next: value, at: index },
  );
  await sleep(150);
}

const findState = () => page.evaluate(() => window.__soroban.findState());
const snapshot = () =>
  page.evaluate(() => {
    const snap = window.__soroban.getSnapshot();
    const sheet = snap.sheets[snap.sheetOrder[0]];
    return { sheet, order: snap.sheetOrder };
  });

await open(fixture);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 18, 6));

// 1. 查找与替换
await page.evaluate(() => window.__soroban.openFind(false));
await page.waitForSelector(".find-panel", { timeout: 10000 });
await setInput(".find-query", "已完成");
await page.focus(".find-query");
await page.keyboard.press("Enter");
await sleep(300);
const found = await findState();
assert.equal(found.open, true);
assert.ok(found.matches >= 3, `查找命中过少：${found.matches}`);
assert.equal(found.index, 1);
assert.match(await page.evaluate(() => document.querySelector(".find-meta span")?.textContent ?? ""), /找到 7 处/);
await page.screenshot({ path: path.join(out, "600-find.png") });

await page.click('.find-step[title="下一个"]');
await sleep(180);
const stepped = await findState();
assert.equal(stepped.index, 2);
assert.match(await page.evaluate(() => document.querySelector(".find-meta span")?.textContent ?? ""), /第 2 \/ /);

await page.click(".find-actions .find-more");
await page.waitForSelector(".find-replacement", { timeout: 10000 });
await setInput(".find-replacement", "已结清");
await page.click(".find-actions .find-primary");
await sleep(350);
const afterOne = await findState();
assert.equal(afterOne.matches, found.matches - 1, `单次替换未减少命中：${found.matches} → ${afterOne.matches}`);
assert.match(await page.evaluate(() => document.querySelector(".find-meta span")?.textContent ?? ""), /已替换 1 处/);

await setInput(".find-query", "已完成");
await setInput(".find-replacement", "已结清");
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll(".find-actions button")];
  const target = buttons.find((item) => item.textContent?.trim() === "全部替换");
  if (!(target instanceof HTMLElement)) throw new Error("找不到全部替换");
  target.click();
});
await sleep(500);
const afterAll = await findState();
assert.equal(afterAll.matches, 0);
assert.match(await page.evaluate(() => document.querySelector(".find-meta span")?.textContent ?? ""), /已替换 \d+ 处/);
await page.screenshot({ path: path.join(out, "601-find-replaced.png") });
await page.evaluate(() => {
  const close = document.querySelector(".find-close");
  if (close instanceof HTMLElement) close.click();
});
await sleep(160);
assert.equal((await findState()).open, false);
assert.deepEqual(errors, []);
console.log("M8 FIND OK · 查找 / 上下步进 / 单次替换 / 全部替换");

// 2. 自定义序列排序（UI）
await open(fixture);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 18, 6));
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".data-btn")].find((item) => item.textContent?.trim() === "排序");
  if (!(button instanceof HTMLElement)) throw new Error("找不到排序按钮");
  button.click();
});
await sleep(250);
await setSelect(".sort-pop .sort-column", "4");
await setSelect(".sort-pop .sort-direction", "custom");
await setInput(".sort-custom", "待发货,已完成,进行中");
await page.screenshot({ path: path.join(out, "602-sort-custom.png") });
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".sort-pop button")].find((item) => item.textContent?.trim() === "应用排序");
  if (!(button instanceof HTMLElement)) throw new Error("找不到应用排序");
  button.click();
});
await sleep(600);
const sortedRows = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sheet = snap.sheets[snap.sheetOrder[0]];
  return Array.from({ length: 18 }, (_, index) => sheet.cellData?.[index + 1]?.[4]?.v ?? "");
});
assert.equal(sortedRows[0], "待发货");
const rank = (value) => {
  const at = ["待发货", "已完成", "进行中"].indexOf(value);
  return at === -1 ? 99 : at;
};
for (let index = 1; index < sortedRows.length; index += 1) {
  assert.ok(rank(sortedRows[index - 1]) <= rank(sortedRows[index]), `自定义序列未生效：${sortedRows[index - 1]} → ${sortedRows[index]}`);
}
assert.ok(sortedRows.includes("进行中"));
assert.deepEqual(errors, []);
console.log("M8 CUSTOM SORT OK · 待发货 → 已完成 → 进行中");

// 3. 工作表标签颜色（UI + 落盘）
await open(fixture);
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".data-btn")].find((item) => item.textContent?.trim() === "工作表");
  if (!(button instanceof HTMLElement)) throw new Error("找不到工作表按钮");
  button.click();
});
await sleep(250);
const tabsBefore = await page.evaluate(() => window.__soroban.sheetTabs());
assert.ok(tabsBefore.length >= 2);
await page.click(".sheet-color-btn");
await page.waitForSelector(".tab-colors", { timeout: 10000 });
await page.screenshot({ path: path.join(out, "603-sheet-colors.png") });
await page.click('.tab-colors button[title="#2f80ed"]');
await sleep(300);
const tabsAfter = await page.evaluate(() => window.__soroban.sheetTabs());
const activeId = tabsBefore.find((tab) => tab.name === "订单")?.id;
assert.ok(activeId);
assert.equal(tabsAfter.find((tab) => tab.id === activeId)?.color, "#2f80ed");
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".data-btn")].find((item) => item.textContent?.trim() === "工作表");
  if (button instanceof HTMLElement) button.click();
});
await sleep(200);
assert.deepEqual(errors, []);
console.log("M8 TAB COLOR OK · 订单 → #2f80ed");

// 4. CSV 导入预览：编码 / 分隔符 / 首行标题 / 确认导入
await open(fixture);
const previewed = await page.evaluate((file) => window.__soroban.previewCsv(file), csv);
assert.equal(previewed, true);
await page.waitForSelector(".csv-dialog", { timeout: 10000 });
const dialog = await page.evaluate(() => ({
  summary: document.querySelector(".csv-summary")?.textContent ?? "",
  encoding: document.querySelector(".csv-controls select")?.value,
  rows: document.querySelectorAll(".csv-preview tbody tr").length,
  headers: [...document.querySelectorAll(".csv-preview th")].map((node) => node.textContent),
  rect: (() => {
    const rect = document.querySelector(".csv-dialog")?.getBoundingClientRect();
    return rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
  })(),
}));
assert.equal(dialog.encoding, "UTF-8");
assert.match(dialog.summary, /4 行 · 7 列/);
assert.ok(dialog.rows >= 3);
assert.equal(dialog.headers[0], "订单号");
assert.equal(dialog.headers[3], "金额");
assert.ok(dialog.rect && dialog.rect.right <= 1280 && dialog.rect.bottom <= 800, "CSV 弹窗越界");
await page.screenshot({ path: path.join(out, "604-csv-preview.png") });

await page.evaluate(() => {
  const box = document.querySelector(".csv-check input");
  if (!(box instanceof HTMLInputElement)) throw new Error("找不到首行标题开关");
  box.click();
});
await sleep(200);
const noHeaderSummary = await page.evaluate(() => ({
  headers: document.querySelectorAll(".csv-preview th").length,
  summary: document.querySelector(".csv-summary")?.textContent ?? "",
}));
assert.equal(noHeaderSummary.headers, 0);
assert.match(noHeaderSummary.summary, /4 行 · 7 列/);
await page.evaluate(() => {
  const box = document.querySelector(".csv-check input");
  if (box instanceof HTMLInputElement) box.click();
});
await sleep(200);
await page.click(".csv-actions .csv-primary");
await page.waitForSelector(".sheet-tab", { timeout: 20000 });
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
await sleep(600);
const csvState = await page.evaluate(() => {
  const state = window.__soroban.getState();
  const snap = window.__soroban.getSnapshot();
  const sheet = snap.sheets[snap.sheetOrder[0]];
  return {
    screen: state.screen,
    name: state.name,
    dirty: state.dirty,
    a1: sheet.cellData?.[0]?.[0]?.v,
    d2: sheet.cellData?.[1]?.[3]?.v,
    dialog: Boolean(document.querySelector(".csv-dialog")),
    selection: window.__soroban.selectionA1(),
  };
});
assert.equal(csvState.screen, "editor");
assert.equal(csvState.name, "M3-订单.xlsx");
assert.equal(csvState.dirty, true);
assert.equal(csvState.dialog, false);
assert.equal(csvState.selection, "A1", "CSV 导入后不应选中整块数据");
assert.equal(csvState.a1, "订单号");
assert.equal(csvState.d2, 128000);
await page.screenshot({ path: path.join(out, "605-csv-imported.png") });
assert.deepEqual(errors, []);
console.log("M8 CSV PREVIEW OK · UTF-8 / 逗号 / 标题开关 / 导入 4 行 7 列");

// 5. 自动保存：改单元格后调用同一保存路径，dirty 归零且文件落盘
fs.copyFileSync(fixture, saveCopy);
await open(saveCopy);
await page.evaluate(() => window.__soroban.selectCell(0, 7));
await page.click(".fx-input");
await sleep(120);
await page.keyboard.type("自动保存");
await page.keyboard.press("Enter");
await sleep(500);
const dirtyBefore = await page.evaluate(() => window.__soroban.getState().dirty);
assert.equal(dirtyBefore, true);
const saved = await page.evaluate(() => window.__soroban.autoSaveNow());
assert.equal(saved.saved, true);
await sleep(300);
const afterSave = await page.evaluate(() => window.__soroban.getState());
assert.equal(afterSave.dirty, false);
assert.ok(afterSave.path && afterSave.path.endsWith("autosave-0.6.xlsx"));
assert.ok(fs.statSync(saveCopy).size > 6000);
const savedCell = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  return snap.sheets[snap.sheetOrder[0]].cellData?.[0]?.[7]?.v;
});
assert.equal(savedCell, "自动保存");
await page.screenshot({ path: path.join(out, "606-autosave.png") });
assert.deepEqual(errors, []);
console.log("M8 AUTOSAVE OK · H1 已写入 / dirty=false / 文件已落盘");

// 6. 900 × 620 窄窗：查找面板与 CSV 预览不越界
await open(fixture, { width: 900, height: 620 });
await page.evaluate(() => window.__soroban.openFind(true));
await page.waitForSelector(".find-panel", { timeout: 10000 });
const findRect = await page.evaluate(() => {
  const rect = document.querySelector(".find-panel")?.getBoundingClientRect();
  return rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width };
});
assert.ok(findRect);
assert.ok(findRect.right <= 900 && findRect.bottom <= 620, `查找面板越界：${JSON.stringify(findRect)}`);
await page.screenshot({ path: path.join(out, "607-find-900.png") });
await page.evaluate(() => {
  const close = document.querySelector(".find-close");
  if (close instanceof HTMLElement) close.click();
});
await sleep(160);

await page.evaluate((file) => window.__soroban.previewCsv(file), csv);
await page.waitForSelector(".csv-dialog", { timeout: 10000 });
const csvRect = await page.evaluate(() => {
  const rect = document.querySelector(".csv-dialog")?.getBoundingClientRect();
  return rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width };
});
assert.ok(csvRect);
assert.ok(csvRect.right <= 900 && csvRect.bottom <= 620, `CSV 弹窗越界：${JSON.stringify(csvRect)}`);
assert.ok(csvRect.width >= 700);
await page.screenshot({ path: path.join(out, "608-csv-900.png") });
await page.evaluate(() => {
  const cancel = [...document.querySelectorAll(".csv-actions button")].find((item) => item.textContent?.trim() === "取消");
  if (cancel instanceof HTMLElement) cancel.click();
});
await sleep(200);
await page.evaluate(() => window.__soroban.back());
await sleep(200);
const finalState = await page.evaluate(() => window.__soroban.getState());
assert.equal(finalState.screen, "welcome");
assert.deepEqual(errors, []);
console.log("M8 Layout 900 OK · 查找面板 / CSV 弹窗均在 900×620 内");

console.log({
  found: found.matches,
  replaced: afterAll.matches,
  sorted: sortedRows.slice(0, 4),
  tabColor: tabsAfter.find((tab) => tab.id === activeId)?.color,
  csvName: csvState.name,
  csvCells: [csvState.a1, csvState.d2],
  autoSaved: saved,
  findRect,
  csvRect,
});
console.log("ALL 0.6.0 CHECKS PASSED");
await browser.disconnect();
