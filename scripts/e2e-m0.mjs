import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M0-样本.xlsx");
const saved = path.join(root, "assets", "M0-编辑.xlsx");
const shot = (name) => path.join(root, "review-m0", name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${process.env.SOROBAN_CDP || "9445"}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");
console.log("page", page.url());
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

const waitReady = async () => {
  await page.waitForSelector(".univer-container", { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(1200);
};

const state = () => page.evaluate(() => window.__soroban.getState());
const snapshot = () => page.evaluate(() => window.__soroban.getSnapshot());
const first = async (row, col) => {
  const s = await snapshot();
  const sh = s.sheets[s.sheetOrder[0]];
  return sh.cellData?.[row]?.[col];
};

await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".welcome", { timeout: 20000 });
await sleep(400);
await page.screenshot({ path: shot("001-welcome.png") });
const welcomeOk = await page.evaluate(() => ({
  hasNew: !!document.querySelector(".btn-primary"),
  hasOpen: !!document.querySelector(".btn-ghost"),
  recent: document.querySelectorAll(".recent-item").length,
  overflow: document.documentElement.scrollWidth > innerWidth,
}));
assert.equal(welcomeOk.hasNew, true);
assert.equal(welcomeOk.hasOpen, true);
assert.equal(welcomeOk.overflow, false);

// 新建空白，直接在网格里打字并算公式
await page.evaluate(() => window.__soroban.newDoc());
await waitReady();
await page.evaluate(() => window.__soroban.selectCell(0, 0));
await page.keyboard.type("45");
await page.keyboard.press("Enter");
await sleep(300);
await page.evaluate(() => window.__soroban.selectCell(0, 1));
await page.keyboard.type("=A1*2");
await page.keyboard.press("Enter");
await sleep(600);
const a1 = await first(0, 0);
const b1 = await first(0, 1);
assert.equal(a1.v, 45);
assert.equal(b1.f, "=A1*2");
assert.equal(b1.v, 90);
assert.equal((await state()).dirty, true);
await page.screenshot({ path: shot("002-new-grid.png") });

// 打开两份 sheet 的 xlsx
await page.evaluate((p) => window.__soroban.openPath(p), fixture);
await waitReady();
let s = await state();
assert.equal(s.sheets, 2);
assert.equal(s.dirty, false);
const tabs = await page.evaluate(() => [...document.querySelectorAll(".sheet-tab")].map((t) => t.textContent));
assert.deepEqual(tabs, ["销售", "明细"]);
assert.equal(await page.evaluate(() => document.querySelector(".name-box")?.textContent), "A1");
assert.equal(await page.evaluate(() => document.querySelector(".fx-input")?.value), "2026 年第四季度销售台账");
await page.screenshot({ path: shot("003-open-fixture.png") });

// 切到明细，选 A14，公式栏写 SUM
await page.evaluate(() => [...document.querySelectorAll(".sheet-tab")].find((t) => t.textContent === "明细")?.click());
await sleep(500);
assert.equal((await state()).dirty, false);
await page.evaluate(() => window.__soroban.selectCell(13, 0));
await sleep(200);
assert.equal(await page.evaluate(() => document.querySelector(".name-box")?.textContent), "A14");
const fxBefore = await page.evaluate(() => document.querySelector(".fx-input")?.value);
assert.equal(fxBefore, "");
await page.click(".fx-input");
await page.type(".fx-input", "=SUM(D2:D13)");
await page.keyboard.press("Enter");
await sleep(700);
const edited = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sh = snap.sheets[snap.sheetOrder[1]];
  return { cell: sh.cellData?.[13]?.[0], addr: document.querySelector(".name-box")?.textContent, fx: document.querySelector(".fx-input")?.value };
});
assert.equal(edited.cell.f, "=SUM(D2:D13)");
assert.equal(edited.cell.v, 375000);
assert.equal(edited.addr, "A14");
assert.equal(edited.fx, "=SUM(D2:D13)");
assert.equal((await state()).dirty, true);
await page.screenshot({ path: shot("005-edit-formula.png") });

// 撤销 / 重做
await page.click('.tb-btn[title="撤销 Ctrl+Z"]');
await sleep(400);
assert.equal((await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sh = snap.sheets[snap.sheetOrder[1]];
  return sh.cellData?.[13]?.[0];
})), undefined);
await page.click('.tb-btn[title="重做 Ctrl+Y"]');
await sleep(400);
const redone = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sh = snap.sheets[snap.sheetOrder[1]];
  return sh.cellData?.[13]?.[0];
});
assert.equal(redone.f, "=SUM(D2:D13)");
assert.equal(redone.v, 375000);

// 保存并重新打开
const save = await page.evaluate((p) => window.__soroban.savePath(p), saved);
assert.equal(typeof save.size, "number");
assert.ok(save.size > 1000);
assert.equal((await state()).dirty, false);
await page.screenshot({ path: shot("006-saved.png") });

await page.evaluate((p) => window.__soroban.openPath(p), saved);
await waitReady();
const reopened = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sh = snap.sheets[snap.sheetOrder[1]];
  return {
    name: sh.name,
    a14: sh.cellData?.[13]?.[0],
    sheets: window.__soroban.getState().sheets,
    dirty: window.__soroban.getState().dirty,
    tabs: [...document.querySelectorAll(".sheet-tab")].map((t) => t.textContent),
  };
});
assert.equal(reopened.a14.f, "=SUM(D2:D13)");
assert.equal(reopened.a14.v, 375000);
assert.equal(reopened.sheets, 2);
assert.equal(reopened.dirty, false);
assert.deepEqual(reopened.tabs, ["销售", "明细"]);
await page.evaluate(() => [...document.querySelectorAll(".sheet-tab")].find((t) => t.textContent === "明细")?.click());
await sleep(500);
await page.screenshot({ path: shot("007-reopen-detail.png") });
await page.click('.tb-btn[title="返回欢迎页"]');
await page.waitForSelector(".welcome", { timeout: 10000 });
await sleep(500);
const recentAfter = await page.evaluate(() => document.querySelectorAll(".recent-item").length);
assert.ok(recentAfter >= 1);
await page.screenshot({ path: shot("001-welcome.png") });
assert.deepEqual(errors, []);

console.log("welcome", welcomeOk);
console.log("recentAfter", recentAfter);
console.log("grid", { a1, b1 });
console.log("open", { sheets: s.sheets, tabs });
console.log("edit", edited);
console.log("save", save);
console.log("reopen", reopened);
console.log("M0 UI OK");
await browser.disconnect();
