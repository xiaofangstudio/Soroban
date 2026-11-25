import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M1-跨表.xlsx");
const saved = path.join(root, "assets", "M1-跨表-编辑.xlsx");
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
console.log("page", page.url());
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

const waitReady = async () => {
  await page.waitForSelector(".univer-container", { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 60000 });
  await sleep(1200);
};

await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".welcome", { timeout: 20000 });
await page.evaluate(() => window.__soroban.newDoc());
await waitReady();

// 公式提示卡：输入 =SU，点击 SUM 填入并算 1+2+3
await page.click(".fx-input");
await sleep(120);
await page.keyboard.type("=SU");
await sleep(400);
const suggest = await page.evaluate(() => ({
  open: Boolean(document.querySelector(".fx-suggest")),
  names: [...document.querySelectorAll(".fx-suggest .fx-row-name")].map((node) => node.textContent),
  hint: document.querySelector(".fx-hint")?.textContent,
}));
assert.equal(suggest.open, true, "公式提示卡未打开");
assert.ok(suggest.names.includes("SUM"), "提示卡没有 SUM");
assert.ok(suggest.names.length >= 4, "提示项过少");
assert.match(suggest.hint ?? "", /Tab/);
await page.screenshot({ path: shot("100-formula-suggest.png") });
await page.click(".fx-suggest .fx-row");
await sleep(200);
assert.equal(await page.evaluate(() => document.querySelector(".fx-input").value), "=SUM(");
await page.type(".fx-input", "1,2,3)");
await page.keyboard.press("Enter");
await sleep(500);
const sumCell = await page.evaluate(() => {
  const snapshot = window.__soroban.getSnapshot();
  return snapshot.sheets[snapshot.sheetOrder[0]].cellData?.[0]?.[0];
});
assert.equal(sumCell.f, "=SUM(1,2,3)");
assert.equal(sumCell.v, 6);
assert.equal((await page.evaluate(() => window.__soroban.getState())).dirty, true);

// 函数库：528 个、可搜索、可关闭
await page.click(".fx-mark");
await sleep(400);
const library = await page.evaluate(() => ({
  open: Boolean(document.querySelector(".fx-library")),
  count: document.querySelector(".fx-lib-count")?.textContent ?? "",
  filter: document.querySelector(".fx-lib-filter")?.textContent,
  rows: document.querySelectorAll(".fx-lib-list .fx-row").length,
  names: [...document.querySelectorAll(".fx-lib-list .fx-row-name")].slice(0, 6).map((node) => node.textContent),
}));
assert.equal(library.open, true, "函数库未打开");
const libraryCount = Number((library.count.match(/(\d+)/) ?? [])[1]);
assert.ok(libraryCount >= 500, `函数数量不足：${libraryCount}`);
assert.equal(library.filter, "只看常用");
assert.deepEqual(library.names.slice(0, 3), ["SUM", "AVERAGE", "COUNT"]);
assert.ok(library.rows >= 40);
await page.screenshot({ path: shot("101-formula-library.png") });

await page.evaluate(() => document.querySelector(".fx-lib-search").focus());
await page.type(".fx-lib-search", "日期");
await sleep(350);
const search = await page.evaluate(() => ({
  rows: document.querySelectorAll(".fx-lib-list .fx-row").length,
  names: [...document.querySelectorAll(".fx-lib-list .fx-row-name")].map((node) => node.textContent),
}));
assert.ok(search.names.includes("TODAY"), "搜索日期找不到 TODAY");
assert.ok(search.names.includes("DATEDIF"), "搜索日期找不到 DATEDIF");
assert.ok(search.rows > 5);
await page.screenshot({ path: shot("102-formula-search.png") });
await page.keyboard.press("Escape");
await sleep(250);
assert.equal(await page.evaluate(() => Boolean(document.querySelector(".fx-library"))), false);

// 跨表引用 + 常用函数实算
await page.evaluate((file) => window.__soroban.openPath(file), fixture);
await page.waitForFunction(
  () => [...document.querySelectorAll(".sheet-tab")].some((tab) => tab.textContent === "汇总"),
  { timeout: 30000 },
);
await waitReady();
assert.equal((await page.evaluate(() => window.__soroban.getState())).sheets, 2);
await page.evaluate(() =>
  [...document.querySelectorAll(".sheet-tab")].find((tab) => tab.textContent === "汇总")?.click(),
);
await sleep(600);
const summary = await page.evaluate(() => {
  const snapshot = window.__soroban.getSnapshot();
  const sheet = snapshot.sheets[snapshot.sheetOrder[1]];
  const at = (row) => sheet.cellData?.[row]?.[1];
  const checks = {
    total: at(3),
    average: at(4),
    max: at(5),
    count: at(6),
    text: at(7),
    round: at(10),
    countif: at(11),
    sumifs: at(12),
    iferror: at(13),
    vlookup: at(14),
    index: at(15),
    match: at(16),
    textjoin: at(17),
    let: at(18),
    filter: at(19),
  };
  return checks;
});
assert.equal(summary.total.f, "=SUM(明细!D2:D13)");
assert.equal(summary.total.v, 375000);
assert.equal(summary.average.v, 31250);
assert.equal(summary.max.v, 45000);
assert.equal(summary.count.v, 12);
assert.equal(summary.text.v, "375,000.00");
assert.equal(summary.round.v, 3.14);
assert.equal(summary.countif.v, 1);
assert.equal(summary.sumifs.v, 345000);
assert.equal(summary.iferror.v, "错误");
assert.equal(summary.vlookup.v, 30000);
assert.equal(summary.index.v, 30000);
assert.equal(summary.match.v, 3);
assert.equal(summary.textjoin.v, "10 月、11 月、12 月");
assert.equal(summary.let.v, 204000);
assert.equal(summary.filter.v, 45000);
await page.screenshot({ path: shot("103-cross-sheet.png") });

// 保存 → 重开，跨表公式与结果保留
const save = await page.evaluate((file) => window.__soroban.savePath(file), saved);
assert.ok(save.size > 5000, `保存过小：${save.size}`);
assert.equal((await page.evaluate(() => window.__soroban.getState())).dirty, false);
await page.evaluate((file) => window.__soroban.openPath(file), saved);
await page.waitForFunction(
  () => [...document.querySelectorAll(".sheet-tab")].some((tab) => tab.textContent === "汇总"),
  { timeout: 30000 },
);
await waitReady();
await page.evaluate(() =>
  [...document.querySelectorAll(".sheet-tab")].find((tab) => tab.textContent === "汇总")?.click(),
);
await sleep(500);
const reopened = await page.evaluate(() => {
  const snapshot = window.__soroban.getSnapshot();
  const sheet = snapshot.sheets[snapshot.sheetOrder[1]];
  return {
    total: sheet.cellData?.[3]?.[1],
    sumifs: sheet.cellData?.[12]?.[1],
    sheets: window.__soroban.getState().sheets,
    dirty: window.__soroban.getState().dirty,
  };
});
assert.equal(reopened.total.v, 375000);
assert.equal(reopened.total.f, "=SUM(明细!D2:D13)");
assert.equal(reopened.sumifs.v, 345000);
assert.equal(reopened.sheets, 2);
assert.equal(reopened.dirty, false);
await page.screenshot({ path: shot("104-reopen-cross.png") });

assert.deepEqual(errors, []);
console.log("suggest", suggest);
console.log("library", { count: library.count, rows: library.rows, filter: library.filter });
console.log("search", search.names.slice(0, 8));
console.log("summary", {
  total: summary.total.v,
  average: summary.average.v,
  max: summary.max.v,
  text: summary.text.v,
  round: summary.round.v,
  sumifs: summary.sumifs.v,
  textjoin: summary.textjoin.v,
});
console.log("save", save);
console.log("M1 UI OK");
await browser.disconnect();
