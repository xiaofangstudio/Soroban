import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M2-图表.xlsx");
const copy = path.join(root, "assets", "M2-图表-编辑.xlsx");
const out = path.join(root, "review-m2");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9445";

fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

let errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.stack || String(e)));

async function open(file, { width = 1280, height = 800, clear = true, tab = "月度" } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
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

async function valueOf(selector, attr) {
  return page.evaluate((sel, name) => document.querySelector(sel)?.getAttribute(name), selector, attr);
}

// 1. 格式工具栏与字体/填充/数字格式
errors = [];
await open(fixture);
const toolbar = await page.evaluate(() => {
  const bar = document.querySelector(".fmt-toolbar")?.getBoundingClientRect();
  const last = document.querySelector(".fmt-btn.chart")?.getBoundingClientRect();
  return {
    rect: bar && { x: bar.x, y: bar.y, width: bar.width, height: bar.height },
    lastRight: last?.right,
    buttons: document.querySelectorAll(".fmt-btn").length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.ok(toolbar.rect, "格式工具栏未挂载");
assert.equal(toolbar.buttons, 11);
assert.equal(toolbar.overflow, false);
assert.ok(toolbar.lastRight <= 1280, "工具栏越界");

await page.evaluate(() => window.__soroban.selectRange(1, 1, 12, 1));
await page.select(".fmt-select.num", "¥#,##0.00");
await sleep(400);
await page.evaluate(() => window.__soroban.selectRange(1, 3, 12, 3));
await page.evaluate(() => document.querySelectorAll(".fmt-btn.letter")[0]?.click());
await sleep(200);
await page.evaluate(() => document.querySelector(".fmt-btn.fill")?.click());
await sleep(150);
await page.evaluate(() => document.querySelectorAll(".color-cell")[2]?.click());
await sleep(500);
await page.evaluate(() => window.__soroban.selectCell(1, 3));
await sleep(300);

const format = await page.evaluate(() => {
  const snap = window.__soroban.getSnapshot();
  const sheet = snap.sheets[snap.sheetOrder[0]];
  const b2 = sheet.cellData?.[1]?.[1];
  const d2 = sheet.cellData?.[1]?.[3];
  const styleB = b2?.s ? snap.styles?.[b2.s] : null;
  const styleD = d2?.s ? snap.styles?.[d2.s] : null;
  return {
    currency: styleB?.n?.pattern,
    bold: styleD?.bl,
    fill: styleD?.bg?.rgb,
    numLabel: document.querySelector(".fmt-select.num")?.value,
    boldActive: document.querySelector(".fmt-btn.letter")?.classList.contains("active"),
  };
});
assert.equal(format.currency, "¥#,##0.00");
assert.equal(format.bold, 1);
assert.equal(String(format.fill).toLowerCase(), "#d3f4e6");
assert.equal(format.numLabel, "#,##0");
assert.equal(format.boldActive, true);
assert.deepEqual(errors, []);
await page.screenshot({ path: path.join(out, "200-format.png") });

// 2. 条件格式：色阶 / 数据条 / 清除
errors = [];
await open(fixture);
await page.evaluate(() => window.__soroban.selectRange(1, 1, 12, 1));
await page.evaluate(() => document.querySelector(".fmt-btn.text")?.click());
await sleep(200);
await page.evaluate(() => document.querySelectorAll(".cf-item")[0]?.click());
await sleep(1200);
assert.equal(await page.evaluate(() => window.__soroban.conditionalRuleCount()), 1);
await page.evaluate(() => window.__soroban.selectCell(0, 0));
await sleep(300);
await page.screenshot({ path: path.join(out, "201-color-scale.png") });

await page.evaluate(() => window.__soroban.selectRange(1, 1, 12, 1));
await page.evaluate(() => document.querySelector(".fmt-btn.text")?.click());
await sleep(200);
await page.evaluate(() => document.querySelector(".cf-clear")?.click());
await sleep(600);
assert.equal(await page.evaluate(() => window.__soroban.conditionalRuleCount()), 0);

await page.evaluate(() => window.__soroban.selectRange(1, 1, 12, 1));
await page.evaluate(() => document.querySelector(".fmt-btn.text")?.click());
await sleep(200);
await page.evaluate(() => document.querySelectorAll(".cf-item")[1]?.click());
await sleep(1200);
assert.equal(await page.evaluate(() => window.__soroban.conditionalRuleCount()), 1);
await page.evaluate(() => window.__soroban.selectCell(0, 0));
await sleep(300);
assert.deepEqual(errors, []);
await page.screenshot({ path: path.join(out, "202-data-bar.png") });

// 3. 图表：工作室、四类图、编辑联动、拖动、删除
errors = [];
await open(fixture);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
await page.waitForSelector(".chart-studio", { timeout: 3000 });
await sleep(400);
const studio = await page.evaluate(() => {
  const rect = document.querySelector(".chart-studio")?.getBoundingClientRect();
  return {
    rect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
    range: document.querySelectorAll(".cs-field input")[0]?.value,
    title: document.querySelectorAll(".cs-field input")[1]?.value,
    sum: document.querySelector(".cs-preview .chart-svg")?.getAttribute("data-chart-sum"),
    types: document.querySelectorAll(".cs-type").length,
  };
});
assert.equal(studio.range, "A1:C13");
assert.equal(studio.title, "柱状图 · 月度");
assert.equal(studio.types, 4);
assert.equal(studio.sum, "3213000");
assert.ok(studio.rect.right <= 1280 && studio.rect.bottom <= 800);
await page.screenshot({ path: path.join(out, "210-chart-studio.png") });

await page.evaluate(() => document.querySelector(".cs-insert")?.click());
await sleep(800);
let cards = await page.evaluate(() => [...document.querySelectorAll(".chart-card")].map((card) => ({
  title: card.querySelector(".chart-card-title")?.textContent,
  sum: card.querySelector(".chart-svg")?.getAttribute("data-chart-sum"),
})));
assert.equal(cards.length, 1);
assert.equal(cards[0].title, "柱状图 · 月度");
await page.screenshot({ path: path.join(out, "211-chart-single.png") });

await page.evaluate(() => window.__soroban.selectCell(1, 1));
await sleep(200);
await page.click(".fx-input");
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.keyboard.type("260000");
await page.keyboard.press("Enter");
await sleep(1500);
cards = await page.evaluate(() => [...document.querySelectorAll(".chart-card")].map((card) => ({
  title: card.querySelector(".chart-card-title")?.textContent,
  sum: card.querySelector(".chart-svg")?.getAttribute("data-chart-sum"),
})));
assert.equal(cards[0].sum, "3345000", "编辑单元格后图表未联动");
await page.screenshot({ path: path.join(out, "212-chart-linked.png") });

for (const index of [1, 2, 3]) {
  await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
  await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
  await page.waitForSelector(".chart-studio", { timeout: 3000 });
  await page.evaluate((n) => document.querySelectorAll(".cs-type")[n]?.click(), index);
  await sleep(300);
  await page.evaluate(() => document.querySelector(".cs-insert")?.click());
  await sleep(700);
}
cards = await page.evaluate(() => [...document.querySelectorAll(".chart-card")].map((card) => {
  const rect = card.getBoundingClientRect();
  return {
    title: card.querySelector(".chart-card-title")?.textContent,
    type: card.querySelector(".chart-svg")?.querySelectorAll("polygon, polyline, path, rect").length,
    rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
  };
}));
assert.equal(cards.length, 4);
assert.deepEqual(cards.map((card) => card.title), ["柱状图 · 月度", "折线图 · 月度", "面积图 · 月度", "饼图 · 月度"]);
assert.ok(cards.every((card) => card.rect.x >= 0 && card.rect.right <= 1280));
assert.ok(cards.every((card) => card.rect.y >= 112 && card.rect.bottom <= 800));
await page.screenshot({ path: path.join(out, "213-charts-four.png") });

const beforeDrag = await page.evaluate(() => {
  const rect = document.querySelector(".chart-card")?.getBoundingClientRect();
  return { x: rect.x, y: rect.y };
});
await page.mouse.move(beforeDrag.x + 190, beforeDrag.y + 15);
await page.mouse.down();
await page.mouse.move(beforeDrag.x + 270, beforeDrag.y + 75, { steps: 8 });
await page.mouse.up();
await sleep(400);
const afterDrag = await page.evaluate(() => {
  const rect = document.querySelector(".chart-card")?.getBoundingClientRect();
  return { x: rect.x, y: rect.y };
});
assert.equal(Math.round(afterDrag.x - beforeDrag.x), 80);
assert.equal(Math.round(afterDrag.y - beforeDrag.y), 60);

await page.evaluate(() => document.querySelectorAll(".chart-close")[3]?.click());
await sleep(400);
assert.equal(await page.evaluate(() => document.querySelectorAll(".chart-card").length), 3);
assert.deepEqual(errors, []);

// 4. 保存 / 重开：条件格式与图表随文档恢复
errors = [];
fs.copyFileSync(fixture, copy);
await open(copy);
await page.evaluate(() => window.__soroban.selectRange(1, 1, 12, 1));
await page.evaluate(() => document.querySelector(".fmt-btn.text")?.click());
await sleep(200);
await page.evaluate(() => document.querySelectorAll(".cf-item")[0]?.click());
await sleep(800);
await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
await page.waitForSelector(".chart-studio", { timeout: 3000 });
await page.evaluate(() => document.querySelector(".cs-insert")?.click());
await sleep(700);
await page.evaluate((p) => window.__soroban.savePath(p), copy);
await sleep(3000);
const saved = await page.evaluate(() => window.__soroban.getState());
assert.equal(saved.dirty, false);
assert.ok(fs.statSync(copy).size > 8000);

await open(copy, { clear: false });
await page.evaluate(() => window.__soroban.selectCell(0, 0));
await sleep(500);
const reopened = await page.evaluate(() => ({
  cf: window.__soroban.conditionalRuleCount(),
  cards: document.querySelectorAll(".chart-card").length,
  sum: document.querySelector(".chart-card .chart-svg")?.getAttribute("data-chart-sum"),
}));
assert.equal(reopened.cf, 1);
assert.equal(reopened.cards, 1);
assert.equal(reopened.sum, "3213000");
assert.deepEqual(errors, []);
await page.screenshot({ path: path.join(out, "220-reopen.png") });

// 5. 900 × 620 窄窗
errors = [];
await open(fixture, { width: 900, height: 620 });
const narrow = await page.evaluate(() => {
  const bar = document.querySelector(".fmt-toolbar")?.getBoundingClientRect();
  const last = document.querySelector(".fmt-btn.chart")?.getBoundingClientRect();
  return {
    width: innerWidth,
    bar: bar && { x: bar.x, width: bar.width, right: bar.right },
    lastRight: last?.right,
    overflow: document.documentElement.scrollWidth > innerWidth,
    buttons: document.querySelectorAll(".fmt-btn").length,
  };
});
assert.equal(narrow.width, 900);
assert.equal(narrow.overflow, false);
assert.ok(narrow.lastRight <= 900, "窄窗工具栏越界");
assert.equal(narrow.buttons, 11);
await page.screenshot({ path: path.join(out, "230-toolbar-900.png") });

await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
await page.waitForSelector(".chart-studio", { timeout: 3000 });
await sleep(400);
const studio900 = await page.evaluate(() => {
  const rect = document.querySelector(".chart-studio")?.getBoundingClientRect();
  return rect && { x: rect.x, right: rect.right, bottom: rect.bottom };
});
assert.ok(studio900.right <= 900, "窄窗工作室越界");
assert.ok(studio900.bottom <= 620, "窄窗工作室过高");
await page.screenshot({ path: path.join(out, "231-studio-900.png") });

await page.evaluate(() => document.querySelector(".cs-insert")?.click());
await sleep(600);
for (const index of [1, 2, 3]) {
  await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
  await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
  await page.waitForSelector(".chart-studio", { timeout: 3000 });
  await page.evaluate((n) => document.querySelectorAll(".cs-type")[n]?.click(), index);
  await sleep(300);
  await page.evaluate(() => document.querySelector(".cs-insert")?.click());
  await sleep(600);
}
const cards900 = await page.evaluate(() => [...document.querySelectorAll(".chart-card")].map((card) => {
  const rect = card.getBoundingClientRect();
  return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
}));
assert.equal(cards900.length, 4);
assert.ok(cards900.every((card) => card.x >= 0 && card.right <= 900));
assert.ok(cards900.every((card) => card.y >= 80 && card.bottom <= 620));
assert.deepEqual(errors, []);
await page.screenshot({ path: path.join(out, "232-charts-900.png") });

console.log("M2 UI OK");
console.log("M2 Layout 900 OK");
console.log("M2 CHARTS OK");
console.log("M2 ROUNDTRIP OK");
console.log({ toolbar, format, studio, cards: cards.map((card) => card.title), reopened, narrow, studio900, cards900 });
await browser.disconnect();
