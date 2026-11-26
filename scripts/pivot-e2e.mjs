import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const out = path.join(root, "review-0.9");
const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9445";
fs.mkdirSync(out, { recursive: true });
const source = path.join(root, "assets", "M0-样本.xlsx");
const working = path.join(out, "M11-数据透视-working.xlsx");
const saved = path.join(out, "M11-数据透视.xlsx");
fs.copyFileSync(source, working);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("1423")) || pages[0];
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(String(error)));
await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });

async function setSelects(values) {
  await page.evaluate((list) => {
    const selects = [...document.querySelectorAll(".pivot-field select")];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    list.forEach((value, index) => {
      setter.call(selects[index], String(value));
      selects[index].dispatchEvent(new Event("change", { bubbles: true }));
    });
  }, values);
}

async function openSource() {
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent.trim() === "明细");
    if (tab instanceof HTMLElement) tab.click();
  });
  await sleep(350);
  await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 4));
  await sleep(120);
  await page.evaluate(() => window.__soroban.openPivot());
  await page.waitForSelector(".pivot-panel", { timeout: 5000 });
  await sleep(200);
}

async function readMatrix() {
  return page.evaluate(() => {
    const snapshot = window.__soroban.getSnapshot();
    const sheet = snapshot.sheets[snapshot.sheetOrder.at(-1)];
    const cells = {};
    for (const [row, line] of Object.entries(sheet.cellData || {})) {
      for (const [column, cell] of Object.entries(line)) cells[`${Number(row)},${Number(column)}`] = cell.v;
    }
    const maxRow = Math.max(...Object.keys(sheet.cellData || {}).map(Number));
    const maxColumn = Math.max(...Object.values(sheet.cellData || {}).flatMap((line) => Object.keys(line).map(Number)));
    const grid = [];
    for (let row = 0; row <= maxRow; row += 1) {
      const line = [];
      for (let column = 0; column <= maxColumn; column += 1) line.push(cells[`${row},${column}`] ?? "");
      grid.push(line);
    }
    return { name: sheet.name, grid };
  });
}

await page.evaluate((file) => window.__soroban.openPath(file), working);
await sleep(1200);
await openSource();
await page.screenshot({ path: path.join(out, "900-pivot-panel.png") });
const panel = await page.evaluate(() => {
  const element = document.querySelector(".pivot-panel");
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), scroll: element.scrollHeight, client: element.clientHeight };
});
await setSelects([2, 4, 3, "avg"]);
await page.evaluate(() => document.querySelector(".pivot-primary").click());
await sleep(800);
const average = await readMatrix();
await page.screenshot({ path: path.join(out, "901-pivot-average.png") });
console.log("AVERAGE", average.name, JSON.stringify(average.grid));
if (average.grid[3]?.[1] !== 27750 || average.grid[8]?.[3] !== 31250) throw new Error("average pivot mismatch");

await openSource();
await setSelects([2, 4, 3, "count"]);
await page.evaluate(() => document.querySelector(".pivot-primary").click());
await sleep(800);
const count = await readMatrix();
await page.screenshot({ path: path.join(out, "902-pivot-count.png") });
console.log("COUNT", count.name, JSON.stringify(count.grid));
if (count.grid[8]?.[3] !== 12 || count.grid[8]?.[1] !== 8 || count.grid[8]?.[2] !== 4) throw new Error("count pivot mismatch");

await page.evaluate((file) => window.__soroban.savePath(file), saved);
await sleep(1000);
await page.evaluate((file) => window.__soroban.openPath(file), saved);
await sleep(1200);
await page.evaluate(() => {
  const tab = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent?.trim() === "透视2");
  if (tab instanceof HTMLElement) tab.click();
});
await sleep(450);
const reopened = await page.evaluate(() => {
  const names = window.__soroban.sheetNames();
  const snapshot = window.__soroban.getSnapshot();
  const sheet = snapshot.sheets[snapshot.sheetOrder.at(-1)];
  return { names, name: sheet.name, active: window.__soroban.activeSheetName(), rows: Object.keys(sheet.cellData || {}).length, dirty: window.__soroban.getState().dirty };
});
console.log("REOPEN", JSON.stringify(reopened));
await page.screenshot({ path: path.join(out, "903-pivot-reopen.png") });
if (reopened.dirty || reopened.rows < 9 || reopened.active !== "透视2") throw new Error("reopen pivot mismatch");

await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1 });
await sleep(400);
await openSource();
const compact = await page.evaluate(() => {
  const element = document.querySelector(".pivot-panel");
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), scroll: element.scrollHeight, client: element.clientHeight, statusHidden: getComputedStyle(document.querySelector(".data-status")).display };
});
await page.screenshot({ path: path.join(out, "904-pivot-900.png") });
await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });

if (panel.w > 380 || panel.h > 500 || panel.scroll > panel.client) throw new Error(`panel 1280 mismatch ${JSON.stringify(panel)}`);
if (compact.w > 360 || compact.x + compact.w > 900 || compact.scroll > compact.client) throw new Error(`panel 900 mismatch ${JSON.stringify(compact)}`);
console.log("PANEL1280", JSON.stringify(panel));
console.log("PANEL900", JSON.stringify(compact));
console.log("ERRORS", JSON.stringify(errors.slice(0, 10)));
if (errors.length) throw new Error("console errors during pivot e2e");
console.log("M11 PIVOT E2E OK");
await browser.disconnect();
