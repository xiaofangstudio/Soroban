import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import JSZip from "jszip";
import XLSX from "xlsx";

const root = process.cwd();
const out = path.join(root, "review-0.11");
const source = path.join(root, "assets", "M2-图表.xlsx");
const working = path.join(out, "M13-元数据-working.xlsx");
const saved = path.join(out, "M13-元数据.xlsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9448";
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(source, working);

const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421")) || pages[0];
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

async function clearStorage() {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("soroban:")) localStorage.removeItem(key);
  });
}

async function openDoc(file, { reload = false, tab = "月度", clear = false } = {}) {
  if (reload) {
    await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });
  } else {
    await page.evaluate(() => window.__soroban.back());
    await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 10000 });
  }
  if (clear) await clearStorage();
  await page.evaluate((target) => window.__soroban.openPath(target), file);
  await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 30000 });
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.evaluate((name) => {
    const tab = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent?.trim() === name);
    if (tab instanceof HTMLElement) tab.click();
  }, tab);
  await sleep(900);
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
}

async function openConditionalMenu() {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".fmt-btn")].find((item) => item.textContent?.includes("条件格式"));
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForSelector(".cf-pop", { timeout: 5000 });
  await sleep(200);
}

async function chartCount() {
  return page.evaluate(() => document.querySelectorAll(".chart-card").length);
}

async function printInfo() {
  return page.evaluate(() => window.__soroban.printInfo());
}

assert.ok(fs.existsSync(source), "缺少 M2 图表样本");

await openDoc(working, { clear: true });

// 1. 图表
await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
await page.waitForSelector(".fmt-btn.chart", { timeout: 10000 });
await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
await page.waitForSelector(".chart-studio", { timeout: 8000 });
await sleep(300);
await page.evaluate(() => document.querySelector(".cs-insert")?.click());
await sleep(700);
assert.equal(await chartCount(), 1, "图表未插入");

// 2. 条件格式
await page.evaluate(() => window.__soroban.selectRange(1, 1, 12, 1));
await openConditionalMenu();
await page.evaluate(() => document.querySelectorAll(".cf-item")[0]?.click());
await sleep(900);
const cfCount = await page.evaluate(() => window.__soroban.conditionalRuleCount());
assert.equal(cfCount, 1, "条件格式未应用");

// 3. 打印设置
await page.evaluate(() => window.__soroban.openPrint());
await page.waitForSelector(".print-overlay", { timeout: 5000 });
await sleep(500);
await page.click(".print-area-row input");
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.keyboard.type("A1:C13");
await page.keyboard.press("Enter");
await sleep(300);
await page.select(".print-side select", "90");
await sleep(500);
const beforePrint = await printInfo();
assert.equal(beforePrint.settings.scaleMode, "percent");
assert.equal(beforePrint.settings.percent, 90);
assert.equal(beforePrint.settings.area, "A1:C13");
await page.evaluate(() => document.querySelector(".print-cancel")?.click());
await sleep(300);

// 4. 保存并检查标准 xlsx 的自定义属性
await page.evaluate(async (file) => await window.__soroban.savePath(file), saved);
await sleep(900);
assert.ok(fs.existsSync(saved), "保存文件不存在");

const zip = await JSZip.loadAsync(fs.readFileSync(saved));
assert.ok(zip.file("docProps/custom.xml"), "xlsx 缺少 docProps/custom.xml");
assert.ok(zip.file("[Content_Types].xml"), "xlsx 缺少 content types");
assert.ok(zip.file("_rels/.rels"), "xlsx 缺少 package rels");
const types = await zip.file("[Content_Types].xml").async("string");
assert.match(types, /PartName="\/docProps\/custom\.xml"/);
const rels = await zip.file("_rels/.rels").async("string");
assert.match(rels, /relationships\/custom-properties/);
assert.match(rels, /docProps\/custom\.xml/);
const custom = await zip.file("docProps/custom.xml").async("string");
assert.match(custom, /name="SorobanData"/);
assert.match(custom, /<vt:lpwstr>/);
const xmlParts = Object.keys(zip.files).filter((name) => name.endsWith(".xml"));
assert.ok(xmlParts.length >= 5, "xlsx XML 部件不足");

const workbook = XLSX.readFile(saved);
assert.ok(workbook.SheetNames.length >= 2, "xlsx 工作表无法解析");
assert.equal(workbook.SheetNames.includes("月度"), true);

// 5. 清空所有本地 sidecar，重开只靠 xlsx
await openDoc(saved, { clear: true });
const reopenedCharts = await chartCount();
const reopenedCf = await page.evaluate(() => window.__soroban.conditionalRuleCount());
const reopenedPrint = await printInfo();
assert.equal(reopenedCharts, 1, "清空 localStorage 后图表未从 xlsx 恢复");
assert.equal(reopenedCf, 1, "清空 localStorage 后条件格式未从 xlsx 恢复");
assert.equal(reopenedPrint.settings.percent, 90, "清空 localStorage 后打印缩放未恢复");
assert.equal(reopenedPrint.settings.area, "A1:C13", "清空 localStorage 后打印区域未恢复");
assert.equal(await page.evaluate(() => window.__soroban.getState().dirty), false);
assert.deepEqual(errors, []);

await page.screenshot({ path: path.join(out, "001-metadata-reopen.png") });
console.log("XLSX META OK · 图表 1 · 条件格式 1 · 打印 90% / A1:C13");
console.log("XLSX STRUCTURE OK · custom.xml + content type + relation + workbook parse");
console.log("LOCALSTORAGE CLEARED · 重开仍恢复 · 控制台 0 错误");
await browser.disconnect();
