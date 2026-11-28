import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const out = path.join(root, "review-1.0");
const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9450";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const source = path.join(root, "assets", "M0-样本.xlsx");
const working = path.join(out, "M16-图表-working.xlsx");
const saved = path.join(out, "M16-图表1.0.xlsx");
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(source, working);

const tsv = path.join(out, "M17-导入.tsv");
fs.writeFileSync(tsv, "月份\t销售额\t成本\n10 月\t128000\t74000\n11 月\t156400\t88200\n12 月\t189300\t101500\n", "utf8");

const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421")) || pages[0];
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

async function openDoc(file, { reload = false } = {}) {
  if (reload) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });
    await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 15000 });
  } else {
    await page.evaluate(() => window.__soroban.back());
    await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 10000 });
  }
  await page.evaluate((target) => window.__soroban.openPath(target), file);
  await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 30000 });
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(900);
}

async function openChart(typeLabel, range) {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".fmt-btn")].find((item) => item.textContent?.includes("图表"));
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForSelector(".chart-studio", { timeout: 5000 });
  if (range) {
    await page.evaluate((value) => {
      const input = document.querySelector(".cs-field input");
      if (input instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, range);
  }
  await page.evaluate((label) => {
    const button = [...document.querySelectorAll(".cs-type")].find((item) => item.textContent?.includes(label));
    if (button instanceof HTMLElement) button.click();
  }, typeLabel);
  await sleep(500);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".cs-insert")][0];
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForFunction(() => !document.querySelector(".chart-studio"), { timeout: 5000 });
  await sleep(600);
}

await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
await openDoc(working, { reload: true });
const baseCharts = await page.evaluate(() => document.querySelectorAll(".chart-card").length);
await openChart("条形图", "A2:B5");
assert.equal(await page.evaluate(() => document.querySelectorAll(".chart-card").length), baseCharts + 1);
await openChart("组合图", "A2:C5");
assert.equal(await page.evaluate(() => document.querySelectorAll(".chart-card").length), baseCharts + 2);
await page.screenshot({ path: path.join(out, "004-1.0-charts.png") });

await page.evaluate(async (file) => await window.__soroban.savePath(file), saved);
await page.waitForFunction(() => window.__soroban.getState().dirty === false, { timeout: 15000 });

await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });
await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 15000 });
await page.evaluate((target) => window.__soroban.importCsv(target), tsv);
await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 30000 });
await page.waitForSelector(".sheet-tab", { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
await sleep(900);
assert.equal(await page.evaluate(() => window.__soroban.getState().screen), "editor");
assert.equal(await page.evaluate(() => window.__soroban.getState().sheets), 1);
const csv = await page.evaluate(() => window.__soroban.csvText());
assert.match(csv, /月份,销售额,成本/);
await page.screenshot({ path: path.join(out, "005-1.0-tsv.png") });

assert.equal(errors.length, 0, `控制台错误：${errors.join(" | ")}`);
fs.writeFileSync(path.join(out, "e2e-1.0-charts.txt"), "SOROBAN 1.0 CHARTS OK · 条形图 + 组合图 · TSV 导入\n", "utf8");
console.log("SOROBAN 1.0 CHARTS OK · 条形图 + 组合图 · TSV 导入");
await browser.disconnect();
