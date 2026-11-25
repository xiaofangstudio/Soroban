import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M3-整理.xlsx");
const csvUtf8 = path.join(root, "assets", "M3-订单.csv");
const csvGbk = path.join(root, "assets", "M3-订单-GBK.csv");
const out = path.join(root, "review-m3");
const saveCopy = path.join(out, "M3-筛选保存.xlsx");
const exportCsv = path.join(out, "M3-导出.csv");
const reimportCopy = path.join(out, "M3-导出回读.xlsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9446";

fs.mkdirSync(out, { recursive: true });
fs.rmSync(saveCopy, { force: true });
fs.rmSync(exportCsv, { force: true });
fs.rmSync(reimportCopy, { force: true });

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

let errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.stack || String(e)));

async function open(file, { width = 1280, height = 800, clear = true, tab = "订单" } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".welcome", { timeout: 30000 });
  if (clear) {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("soroban:charts:path:") || key.startsWith("soroban:cf:path:")) localStorage.removeItem(key);
      }
    });
  }
  await page.evaluate((p) => window.__soroban.openPath(p), file);
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.evaluate((name) => {
    const item = [...document.querySelectorAll(".sheet-tab")].find((x) => x.textContent === name);
    if (item instanceof HTMLElement) item.click();
  }, tab);
  await sleep(900);
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
}

async function clickData(label) {
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll(".data-btn")].find((item) => {
      const value = item.textContent?.trim() || "";
      return value === text || value.startsWith(text);
    });
    if (!(button instanceof HTMLElement)) throw new Error(`找不到数据按钮 ${text}`);
    button.click();
  }, label);
  await sleep(350);
}

async function clickPop(label) {
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll(".data-pop button")].find((item) => item.textContent?.trim() === text);
    if (!(button instanceof HTMLElement)) throw new Error(`找不到弹层按钮 ${text}`);
    button.click();
  }, label);
  await sleep(350);
}

async function closePop() {
  await page.keyboard.press("Escape");
  await sleep(250);
}

async function state() {
  return page.evaluate(() => window.__soroban.getState());
}

async function cell(row, column) {
  return page.evaluate((r, c) => {
    const snap = window.__soroban.getSnapshot();
    const sheet = snap.sheets[snap.sheetOrder[0]];
    const value = sheet.cellData?.[r]?.[c];
    return value?.v ?? value ?? null;
  }, row, column);
}

function rectOf(element) {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    const rect = element?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
  }, element);
}

// 1. 数据工具栏 + 排序 + 公式随行
errors = [];
await open(fixture);
const toolbar = await page.evaluate(() => {
  const data = document.querySelector(".data-toolbar")?.getBoundingClientRect();
  const fmt = document.querySelector(".fmt-toolbar")?.getBoundingClientRect();
  const fx = document.querySelector(".formula-bar")?.getBoundingClientRect();
  return {
    data: data && { x: data.x, y: data.y, width: data.width, height: data.height, bottom: data.bottom, right: data.right },
    fmtBottom: fmt?.bottom,
    fxTop: fx?.top,
    overflow: document.documentElement.scrollWidth > innerWidth,
    buttons: document.querySelectorAll(".data-btn").length,
  };
});
assert.ok(toolbar.data, "数据工具栏未挂载");
assert.ok(toolbar.data.height >= 28 && toolbar.data.height <= 42, "数据工具栏高度异常");
assert.ok(toolbar.data.y >= (toolbar.fmtBottom ?? 0) - 1, "数据工具栏与格式工具栏重叠");
assert.ok(toolbar.data.bottom <= (toolbar.fxTop ?? 0) + 1, "数据工具栏压住公式栏");
assert.equal(toolbar.overflow, false);
assert.ok(toolbar.buttons >= 6);

await page.evaluate(() => window.__soroban.selectCell(1, 3));
await sleep(300);
assert.equal(await page.evaluate(() => document.querySelector(".data-status")?.textContent), "A1:G19 · D 金额");
await clickData("排序");
const sortPanel = await page.evaluate(() => {
  const pop = document.querySelector(".sort-pop");
  const rect = pop?.getBoundingClientRect();
  return {
    rect: rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
    range: pop?.innerText.split("\n")[0],
    options: pop?.querySelectorAll("select option").length,
  };
});
assert.equal(sortPanel.range, "排序 · A1:G19");
assert.equal(sortPanel.options, 7);
assert.ok(sortPanel.rect.right <= 1280 && sortPanel.rect.bottom <= 800);
await page.screenshot({ path: path.join(out, "300-sort-panel.png") });
await clickPop("降序 ↓");
await sleep(900);
const sorted = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sheet = snap.sheets[snap.sheetOrder[0]];
  return {
    header: sheet.cellData?.[0]?.[0]?.v,
    amounts: Array.from({ length: 18 }, (_, index) => sheet.cellData?.[index + 1]?.[3]?.v),
    formulas: Array.from({ length: 18 }, (_, index) => sheet.cellData?.[index + 1]?.[6]?.f),
    totalD: sheet.cellData?.[20]?.[3]?.v,
    totalG: sheet.cellData?.[20]?.[6]?.v,
    totalFormula: sheet.cellData?.[20]?.[6]?.f,
    dirty: window.__soroban.getState().dirty,
  };
});
assert.equal(sorted.header, "订单号");
assert.deepEqual(sorted.amounts, [...sorted.amounts].sort((a, b) => b - a));
assert.equal(sorted.amounts[0], 268000);
assert.equal(sorted.amounts[17], 42100);
assert.equal(sorted.formulas[0], "=D2*0.32");
assert.equal(sorted.formulas[17], "=D19*0.32");
assert.equal(sorted.totalD, 2330900);
assert.equal(sorted.totalG, 745888);
assert.equal(sorted.totalFormula, "=SUM(G2:G19)");
assert.equal(sorted.dirty, true);
await page.screenshot({ path: path.join(out, "301-sorted.png") });
assert.deepEqual(errors, []);

// 2. 筛选：表头保留、7/18、清除恢复
errors = [];
await open(fixture);
await page.evaluate(() => window.__soroban.selectCell(1, 4));
await sleep(250);
await clickData("筛选");
await page.evaluate(() => {
  const selects = document.querySelectorAll(".filter-pop select");
  selects[0].value = "4";
  selects[0].dispatchEvent(new Event("change", { bubbles: true }));
  selects[1].value = "eq";
  selects[1].dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector(".filter-pop input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "已完成");
  input?.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(300);
await page.screenshot({ path: path.join(out, "302-filter-panel.png") });
await clickPop("应用筛选");
await sleep(750);
const filtered = await page.evaluate(() => ({
  info: window.__soroban.filterInfo(),
  hidden: window.__soroban.hiddenRows(),
  header: window.__soroban.getSnapshot().sheets[window.__soroban.getSnapshot().sheetOrder[0]].cellData?.[0]?.[0]?.v,
  status: document.querySelector(".data-status")?.textContent,
  button: [...document.querySelectorAll(".data-btn")].find((item) => item.textContent?.includes("筛选"))?.textContent?.trim(),
}));
assert.deepEqual(filtered.info, {
  columnLabel: "E 状态",
  operator: "等于",
  value: "已完成",
  matched: 7,
  total: 18,
});
assert.equal(filtered.hidden, 11);
assert.equal(filtered.header, "订单号");
assert.equal(filtered.status, "A1:G19 · A 订单号");
assert.equal(filtered.button, "筛选 7/18");
await page.screenshot({ path: path.join(out, "303-filtered.png") });

await clickData("筛选");
await clickPop("清除筛选");
await sleep(750);
const cleared = await page.evaluate(() => ({
  hidden: window.__soroban.hiddenRows(),
  info: window.__soroban.filterInfo(),
  status: document.querySelector(".data-status")?.textContent,
}));
assert.equal(cleared.hidden, 0);
assert.equal(cleared.info, null);
assert.equal(cleared.status, "A1:G19 · A 订单号");
assert.deepEqual(errors, []);

// 3. 冻结：首行、当前单元格、取消
errors = [];
await open(fixture);
await clickData("冻结");
const freezePanel = await rectOf(".freeze-pop");
assert.ok(freezePanel.right <= 1280 && freezePanel.bottom <= 800);
await page.screenshot({ path: path.join(out, "304-freeze-panel.png") });
await page.evaluate(() => document.querySelectorAll(".freeze-item")[0]?.click());
await sleep(550);
assert.deepEqual(await page.evaluate(() => window.__soroban.freezeState()), { rows: 1, columns: 0 });
await page.screenshot({ path: path.join(out, "305-freeze-row.png") });

await page.evaluate(() => window.__soroban.selectCell(1, 1));
await sleep(300);
await clickData("冻结");
await page.evaluate(() => document.querySelectorAll(".freeze-item")[2]?.click());
await sleep(550);
assert.deepEqual(await page.evaluate(() => window.__soroban.freezeState()), { rows: 1, columns: 1 });
await page.screenshot({ path: path.join(out, "306-freeze-cell.png") });

await clickData("冻结");
await page.evaluate(() => document.querySelectorAll(".freeze-item")[3]?.click());
await sleep(450);
assert.equal(await page.evaluate(() => window.__soroban.freezeState()), null);
assert.deepEqual(errors, []);

// 4. 工作表：改名、复制、新建、删除
errors = [];
await open(fixture);
await clickData("工作表");
const sheetsPanel = await rectOf(".sheet-pop");
assert.ok(sheetsPanel.right <= 1280 && sheetsPanel.bottom <= 800);
await page.screenshot({ path: path.join(out, "307-sheets.png") });
await page.click(".sheet-pop input");
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.keyboard.type("订单明细");
await clickPop("改名");
await sleep(400);
assert.deepEqual(await page.evaluate(() => window.__soroban.sheetNames()), ["订单明细", "区域汇总"]);
await clickPop("复制");
await sleep(450);
const duplicated = await page.evaluate(() => ({
  names: window.__soroban.sheetNames(),
  active: window.__soroban.activeSheetName(),
  tabs: [...document.querySelectorAll(".sheet-tab")].map((item) => item.textContent),
}));
assert.deepEqual(duplicated.names, ["订单明细", "订单明细 副本", "区域汇总"]);
assert.equal(duplicated.active, "订单明细 副本");
assert.equal(duplicated.tabs.length, 3);
await page.screenshot({ path: path.join(out, "308-sheets-duplicate.png") });
await clickPop("新建");
await sleep(450);
assert.equal((await page.evaluate(() => window.__soroban.sheetNames())).length, 4);
await clickPop("删除");
await sleep(450);
assert.equal((await page.evaluate(() => window.__soroban.sheetNames())).length, 3);
assert.deepEqual(errors, []);

// 5. CSV 导入（UTF-8 / GB18030）、导出、回读
errors = [];
await open(fixture);
await page.evaluate((file) => window.__soroban.importCsv(file), csvUtf8);
await sleep(1500);
const importedUtf8 = await page.evaluate(() => window.__soroban.getState());
assert.equal(importedUtf8.screen, "editor");
assert.match(importedUtf8.name, /M3-订单/);
assert.equal(importedUtf8.sheets, 1);
const utf8Cells = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sheet = snap.sheets[snap.sheetOrder[0]];
  return {
    a1: sheet.cellData?.[0]?.[0]?.v,
    b2: sheet.cellData?.[1]?.[1]?.v,
    d2: sheet.cellData?.[1]?.[3]?.v,
    b4: sheet.cellData?.[3]?.[1]?.v,
    g4: sheet.cellData?.[3]?.[6]?.v,
    toast: document.querySelector(".toast")?.textContent,
  };
});
assert.equal(utf8Cells.a1, "订单号");
assert.equal(utf8Cells.b2, "深圳,南山");
assert.equal(utf8Cells.d2, 128000);
assert.equal(utf8Cells.b4, 'A "quote" 客户');
assert.match(utf8Cells.g4, /备注一\n备注二/);
assert.match(utf8Cells.toast || "", /UTF-8|CSV/);
await page.screenshot({ path: path.join(out, "309-csv-import-utf8.png") });

await page.evaluate((file) => window.__soroban.importCsv(file), csvGbk);
await sleep(1500);
const gbkState = await page.evaluate(() => window.__soroban.getState());
assert.match(gbkState.name, /M3-订单-GBK/);
const gbkToast = await page.evaluate(() => document.querySelector(".toast")?.textContent);
assert.match(gbkToast || "", /GB18030/);
assert.equal(await cell(1, 1), "深圳,南山");
assert.equal(await cell(3, 1), 'A "quote" 客户');
await page.screenshot({ path: path.join(out, "310-csv-import-gbk.png") });

await open(fixture);
const exported = await page.evaluate((file) => window.__soroban.exportCsv(file), exportCsv);
assert.ok(exported && exported.size > 1000);
const exportedBytes = fs.readFileSync(exportCsv);
assert.deepEqual([...exportedBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
const exportedText = exportedBytes.subarray(3).toString("utf8");
assert.match(exportedText, /订单号,客户,城市,金额,状态,负责人,毛利/);
await sleep(700);
const exportToast = await page.evaluate(() => document.querySelector(".toast")?.textContent);
assert.match(exportToast || "", /已导出/);
await page.screenshot({ path: path.join(out, "311-csv-export.png") });

await page.evaluate((file) => window.__soroban.importCsv(file), exportCsv);
await sleep(1500);
assert.equal(await cell(0, 0), "订单号");
assert.equal(await cell(1, 0), "SO-1001");
assert.equal(await cell(1, 3), 128000);
assert.equal(await cell(3, 1), "南山,智造");
assert.equal(await cell(20, 0), "合计");
assert.equal(await cell(20, 3), 2330900);
await page.evaluate((file) => window.__soroban.savePath(file), reimportCopy);
await sleep(2500);
assert.ok(fs.statSync(reimportCopy).size > 6000);
assert.equal((await state()).dirty, false);
assert.deepEqual(errors, []);

// 6. 筛选状态下保存：先恢复隐藏行再写文件；重开无筛选
errors = [];
fs.copyFileSync(fixture, saveCopy);
await open(saveCopy);
await page.evaluate(() => window.__soroban.selectCell(1, 4));
await page.evaluate(() => window.__soroban.filterBy(4, "eq", "已完成"));
await sleep(500);
assert.equal(await page.evaluate(() => window.__soroban.hiddenRows()), 11);
await page.evaluate((file) => window.__soroban.savePath(file), saveCopy);
await sleep(2500);
const savedState = await state();
assert.equal(savedState.dirty, false);
assert.equal(await page.evaluate(() => window.__soroban.hiddenRows()), 0);
assert.equal(await page.evaluate(() => window.__soroban.filterInfo()), null);

await open(saveCopy, { clear: false });
const reopened = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sheet = snap.sheets[snap.sheetOrder[0]];
  return {
    sheets: snap.sheetOrder.length,
    hidden: window.__soroban.hiddenRows(),
    filter: window.__soroban.filterInfo(),
    rows: Array.from({ length: 18 }, (_, index) => sheet.cellData?.[index + 1]?.[0]?.v),
    g2: sheet.cellData?.[1]?.[6]?.f,
    total: sheet.cellData?.[20]?.[6]?.v,
  };
});
assert.equal(reopened.sheets, 2);
assert.equal(reopened.hidden, 0);
assert.equal(reopened.filter, null);
assert.equal(reopened.rows[0], "SO-1001");
assert.equal(reopened.rows[17], "SO-1018");
assert.equal(reopened.g2, "=D2*0.32");
assert.equal(reopened.total, 745888);
await page.screenshot({ path: path.join(out, "312-save-reopen.png") });
assert.deepEqual(errors, []);

// 7. 900 × 620 窄窗：工具栏、排序/筛选/冻结/工作表弹层不越界
errors = [];
await open(fixture, { width: 900, height: 620 });
const narrow = await page.evaluate(() => {
  const data = document.querySelector(".data-toolbar")?.getBoundingClientRect();
  const fmt = document.querySelector(".fmt-toolbar")?.getBoundingClientRect();
  return {
    width: innerWidth,
    data: data && { x: data.x, width: data.width, height: data.height, right: data.right },
    fmtWidth: fmt?.width,
    overflow: document.documentElement.scrollWidth > innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  };
});
assert.equal(narrow.width, 900);
assert.equal(narrow.overflow, false);
assert.ok(narrow.data.right <= 900);
assert.ok(narrow.data.height <= 42);
await page.screenshot({ path: path.join(out, "313-toolbar-900.png") });

await clickData("排序");
const sort900 = await rectOf(".sort-pop");
assert.ok(sort900.right <= 900 && sort900.bottom <= 620);
await page.screenshot({ path: path.join(out, "314-sort-900.png") });
await closePop();

await clickData("筛选");
const filter900 = await rectOf(".filter-pop");
assert.ok(filter900.right <= 900 && filter900.bottom <= 620);
await page.screenshot({ path: path.join(out, "315-filter-900.png") });
await closePop();

await clickData("冻结");
const freeze900 = await rectOf(".freeze-pop");
assert.ok(freeze900.right <= 900 && freeze900.bottom <= 620);
await page.screenshot({ path: path.join(out, "316-freeze-900.png") });
await closePop();

await clickData("工作表");
const sheets900 = await rectOf(".sheet-pop");
assert.ok(sheets900.right <= 900 && sheets900.bottom <= 620);
await page.screenshot({ path: path.join(out, "317-sheets-900.png") });
await closePop();
assert.deepEqual(errors, []);

console.log("M3 UI OK");
console.log("M3 SORT OK");
console.log("M3 FILTER OK");
console.log("M3 FREEZE OK");
console.log("M3 SHEETS OK");
console.log("M3 CSV OK");
console.log("M3 SAVE OK");
console.log("M3 Layout 900 OK");
console.log({ toolbar, sortPanel, sorted, filtered, cleared, duplicated, utf8Cells, gbkState, exported: exported.size, reopened, narrow, sort900, filter900, freeze900, sheets900 });
await browser.disconnect();
