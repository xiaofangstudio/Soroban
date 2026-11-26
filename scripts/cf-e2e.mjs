import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const out = path.join(root, "review-0.10");
const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9447";
fs.mkdirSync(out, { recursive: true });
const source = path.join(root, "assets", "M0-样本.xlsx");
const working = path.join(out, "M12-条件格式-working.xlsx");
const saved = path.join(out, "M12-条件格式.xlsx");
fs.copyFileSync(source, working);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("1423")) || pages[0];
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(String(error)));
await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });
await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
await page.evaluate(() => {
  Object.keys(localStorage)
    .filter((key) => key.startsWith("soroban:cf:"))
    .forEach((key) => localStorage.removeItem(key));
});

async function openDoc(file) {
  await page.evaluate(() => window.__soroban.back());
  await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 10000 });
  await page.evaluate(async (target) => await window.__soroban.openPath(target), file);
  await page.waitForSelector(".sheet-tab", { timeout: 30000 });
  await page.waitForFunction(() => window.__soroban.getState().sheets >= 2, { timeout: 30000 });
  await sleep(700);
}

await openDoc(working);
await page.evaluate(() => {
  const tab = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent?.trim() === "明细");
  if (tab instanceof HTMLElement) tab.click();
});
await sleep(400);
await page.evaluate(() => window.__soroban.selectRange(1, 3, 12, 3));
await sleep(150);

async function openConditionalMenu() {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".fmt-btn")].find((item) => item.textContent?.includes("条件格式"));
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForSelector(".cf-pop", { timeout: 5000 });
  await sleep(200);
}

await openConditionalMenu();
await page.screenshot({ path: path.join(out, "920-cf-menu.png") });

await page.evaluate(() => {
  const item = [...document.querySelectorAll(".cf-item")].find((node) => node.textContent?.includes("三色图标集"));
  if (item instanceof HTMLElement) item.click();
});
await sleep(450);
await page.screenshot({ path: path.join(out, "921-cf-icons.png") });

await page.evaluate(() => window.__soroban.selectRange(1, 4, 12, 4));
await sleep(150);
await page.evaluate(() => window.__soroban.applyConditional("formula", "=D2>30000"));
await sleep(500);
const applied = await page.evaluate(() => ({ count: window.__soroban.conditionalRuleCount(), a1: window.__soroban.selectionA1() }));
console.log("APPLIED", JSON.stringify(applied));
await page.screenshot({ path: path.join(out, "922-cf-formula.png") });
if (applied.count !== 2) throw new Error("条件格式规则数不足");

await page.evaluate(async (file) => await window.__soroban.savePath(file), saved);
await sleep(900);
await openDoc(saved);
await page.evaluate(() => {
  const tab = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent?.trim() === "明细");
  if (tab instanceof HTMLElement) tab.click();
});
await sleep(400);
await page.evaluate(() => window.__soroban.selectRange(1, 4, 12, 4));
await sleep(300);
const reopened = await page.evaluate(() => ({
  count: window.__soroban.conditionalRuleCount(),
  dirty: window.__soroban.getState().dirty,
  active: window.__soroban.activeSheetName(),
}));
console.log("REOPEN", JSON.stringify(reopened));
await page.screenshot({ path: path.join(out, "923-cf-reopen.png") });
if (reopened.count !== 2 || reopened.dirty) throw new Error("条件格式保存重开失败");

await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1 });
await sleep(450);
await openConditionalMenu();
const compact = await page.evaluate(() => {
  const element = document.querySelector(".cf-pop");
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), scroll: element.scrollHeight, client: element.clientHeight };
});
console.log("MENU900", JSON.stringify(compact));
await page.screenshot({ path: path.join(out, "924-cf-900.png") });
if (compact.x < 0 || compact.y < 0 || compact.x + compact.w > 900 || compact.y + compact.h > 620) throw new Error("900 条件格式菜单越界");

console.log("ERRORS", JSON.stringify(errors));
if (errors.length) throw new Error(`控制台错误 ${errors.length} 条`);
console.log("M12 CF E2E OK");
await browser.disconnect();
