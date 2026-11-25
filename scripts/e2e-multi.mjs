import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M3-整理.xlsx");
const out = path.join(root, "review-0.5.1");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9446";

fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

async function open(file) {
  await page.evaluate((target) => window.__soroban.openPath(target), file);
  await page.waitForSelector(".univer-container", { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 60000 });
  await sleep(900);
}

async function clickButton(label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
  }, label);
  assert.ok(clicked, `找不到按钮：${label}`);
  await sleep(350);
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
  await sleep(120);
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
  await sleep(120);
}

const snapshotRows = () =>
  page.evaluate(() => {
    const snap = window.__soroban.getSnapshot();
    const sheet = snap.sheets[snap.sheetOrder[0]];
    return Array.from({ length: 18 }, (_, index) => {
      const row = sheet.cellData?.[index + 1] ?? [];
      return {
        status: row[4]?.v ?? "",
        amount: Number(row[3]?.v ?? 0),
        formula: row[6]?.f ?? "",
      };
    });
  });

await open(fixture);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 18, 6));
await sleep(250);

// 1. 多键排序 UI：状态升序，同状态金额降序
await clickButton("排序");
await setSelect(".sort-pop .sort-column", "4", 0);
await setSelect(".sort-pop .sort-direction", "asc", 0);
await clickButton("添加排序条件");
await setSelect(".sort-pop .sort-column", "3", 1);
await setSelect(".sort-pop .sort-direction", "desc", 1);
await page.screenshot({ path: path.join(out, "500-multi-sort.png") });
await clickButton("应用排序");
await sleep(900);

const sorted = await snapshotRows();
for (let index = 1; index < sorted.length; index += 1) {
  const previous = sorted[index - 1];
  const current = sorted[index];
  const compared = String(previous.status).localeCompare(String(current.status), "zh-CN");
  assert.ok(compared <= 0, `状态未升序：${previous.status} → ${current.status}`);
  if (compared === 0) {
    assert.ok(previous.amount >= current.amount, `同状态下金额未降序：${previous.amount} → ${current.amount}`);
  }
}
assert.ok(sorted.every((row) => /^=D\d+\*0\.32$/.test(row.formula)), "公式未随行平移");
assert.equal(sorted.reduce((sum, row) => sum + row.amount, 0), 2330900);
console.log("MULTI SORT OK · 状态升序 + 金额降序");

// 2. 多条件 AND：状态=已完成 且 金额>100000
const expectedAnd = sorted.filter((row) => row.status === "已完成" && row.amount > 100000).length;
await page.evaluate(() => window.__soroban.selectRange(0, 0, 18, 6));
await sleep(250);
await clickButton("筛选");
await setSelect(".filter-pop .filter-column", "4", 0);
await setSelect(".filter-pop .filter-operator", "eq", 0);
await setInput(".filter-pop .filter-value", "已完成", 0);
await clickButton("添加筛选条件");
await setSelect(".filter-pop .filter-column", "3", 1);
await setSelect(".filter-pop .filter-operator", "gt", 1);
await setInput(".filter-pop .filter-value", "100000", 1);
await page.screenshot({ path: path.join(out, "501-filter-and.png") });
await clickButton("应用筛选");
await sleep(700);

const filteredAnd = await page.evaluate(() => ({
  info: window.__soroban.filterInfo(),
  hidden: window.__soroban.hiddenRows(),
}));
assert.equal(filteredAnd.info.matched, expectedAnd);
assert.equal(filteredAnd.info.total, 18);
assert.equal(filteredAnd.info.mode, "and");
assert.equal(filteredAnd.info.conditions?.length, 2);
assert.equal(filteredAnd.hidden, 18 - expectedAnd);
console.log(`MULTI FILTER AND OK · ${expectedAnd}/18`);

// 3. 多条件 OR：状态=已完成 或 状态=待发货
const rows = await snapshotRows();
const expectedOr = rows.filter((row) => row.status === "已完成" || row.status === "待发货").length;
await page.evaluate(() => window.__soroban.clearFilter());
await sleep(2200);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 18, 6));
await sleep(200);
await clickButton("筛选");
await clickButton("任一条件");
await setSelect(".filter-pop .filter-column", "4", 0);
await setSelect(".filter-pop .filter-operator", "eq", 0);
await setInput(".filter-pop .filter-value", "已完成", 0);
await clickButton("添加筛选条件");
await setSelect(".filter-pop .filter-column", "4", 1);
await setSelect(".filter-pop .filter-operator", "eq", 1);
await setInput(".filter-pop .filter-value", "待发货", 1);
await page.screenshot({ path: path.join(out, "502-filter-or.png") });
await clickButton("应用筛选");
await sleep(700);
const filteredOr = await page.evaluate(() => window.__soroban.filterInfo());
assert.equal(filteredOr.matched, expectedOr);
assert.equal(filteredOr.mode, "or");
assert.equal(filteredOr.conditions?.length, 2);
console.log(`MULTI FILTER OR OK · ${expectedOr}/18`);

// 3.1 重新打开筛选面板时保持“任一条件”
await clickButton("筛选");
const reopenedMode = await page.evaluate(() =>
  document.querySelector(".filter-mode button.active")?.textContent?.trim() ?? "",
);
assert.equal(reopenedMode, "任一条件");
console.log("MULTI FILTER MODE PERSIST OK · 任一条件");

// 4. 900×620 双条件面板不越界
await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1.5 });
await sleep(450);
await page.evaluate(() => window.__soroban.clearFilter());
await sleep(2200);
await clickButton("排序");
await clickButton("添加排序条件");
const compact = await page.evaluate(() => {
  const pop = document.querySelector(".sort-pop");
  const rect = pop?.getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight],
    panel: rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
    rows: document.querySelectorAll(".sort-key-row").length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(compact.rows, 2);
assert.ok(compact.panel && compact.panel.right <= compact.viewport[0] + 1);
assert.ok(compact.panel.bottom <= compact.viewport[1] + 1);
assert.equal(compact.overflow, false);
await page.screenshot({ path: path.join(out, "503-multi-sort-900.png") });
console.log(`MULTI 900 OK · ${compact.panel.right}/${compact.panel.bottom}`);

await page.evaluate(() => window.__soroban.clearFilter());
assert.deepEqual(errors, []);
console.log("ALL MULTI SORT / FILTER CHECKS PASSED");
browser.disconnect();
