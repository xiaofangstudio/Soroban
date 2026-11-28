import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import JSZip from "jszip";

const root = process.cwd();
const out = path.join(root, "review-1.0");
const source = path.join(root, "assets", "M0-样本.xlsx");
const working = path.join(out, "M15-1.0-working.xlsx");
const saved = path.join(out, "M15-1.0.xlsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9450";
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(source, working);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#eafaf3"/><text x="24" y="46" font-family="sans-serif" font-size="20" fill="#0e9f6e">Soroban 1.0</text><rect x="24" y="70" width="60" height="80" fill="#0e9f6e"/><rect x="100" y="94" width="60" height="56" fill="#3ec494"/><rect x="176" y="58" width="60" height="92" fill="#75d9b1"/><text x="24" y="166" font-family="sans-serif" font-size="12" fill="#4f6b5e">浮动图片验收</text></svg>`;
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

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

async function openDoc(file, { reload = false, clear = false } = {}) {
  if (reload) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });
    await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 15000 });
  } else {
    await page.evaluate(() => window.__soroban.back());
    await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 10000 });
  }
  if (clear) await clearStorage();
  await page.evaluate((target) => window.__soroban.openPath(target), file);
  await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 30000 });
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(900);
}

await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
await openDoc(working, { reload: true, clear: true });
console.log("open", await page.evaluate(() => window.__soroban.getState()), "marks", await page.evaluate(() => document.querySelectorAll(".comment-mark").length));

await page.evaluate(() => window.__soroban.selectCell(2, 1));
await sleep(500);
await page.waitForSelector(".comment-mark", { timeout: 5000 });
console.log("click", await page.evaluate(() => document.querySelector(".comment-mark")?.className));
await page.click(".comment-mark");
await sleep(300);
console.log("panels", await page.evaluate(() => document.querySelectorAll(".comment-panel").length));
await page.waitForSelector(".comment-panel", { timeout: 5000 });
await page.type(".comment-compose textarea", "10 月续约金额要再和合同核对一次。");
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".comment-save")].find((item) => item.textContent?.includes("添加"));
  if (button instanceof HTMLElement) button.click();
});
await page.waitForSelector(".comment-item", { timeout: 5000 });
assert.equal(await page.evaluate(() => window.__soroban.commentCount()), 1);

assert.equal(await page.evaluate((url) => window.__soroban.addImage(url, "验收图.svg"), dataUrl), true);
await page.waitForSelector(".sheet-image-card", { timeout: 5000 });
assert.equal(await page.evaluate(() => window.__soroban.imageCount()), 1);

await page.evaluate(() => document.querySelector(".theme-btn")?.click());
await page.waitForFunction(() => document.documentElement.dataset.theme === "dark", { timeout: 5000 });
await sleep(700);
await page.screenshot({ path: path.join(out, "001-1.0-dark.png") });

await page.evaluate(() => document.querySelector(".theme-btn")?.click());
await page.waitForFunction(() => document.documentElement.dataset.theme === "light", { timeout: 5000 });
await sleep(500);
await page.screenshot({ path: path.join(out, "002-1.0-light.png") });

await page.evaluate(async (file) => await window.__soroban.savePath(file), saved);
await page.waitForFunction(() => window.__soroban.getState().dirty === false, { timeout: 15000 });

const zip = await JSZip.loadAsync(fs.readFileSync(saved));
assert.ok(zip.file("docProps/custom.xml"), "xlsx 缺少 custom.xml");
const xml = await zip.file("docProps/custom.xml").async("string");
const property = xml.match(/<Property\b(?=[^>]*name="SorobanData")[^>]*>([\s\S]*?)<\/Property>/);
assert.ok(property, "xlsx 缺少 SorobanData");
const encoded = property[1].match(/<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/)?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
assert.equal(meta.comments.length, 1);
assert.equal(meta.images.length, 1);
assert.match(meta.comments[0].text, /合同核对/);

await openDoc(saved, { reload: true, clear: true });
await page.evaluate(() => document.querySelector(".comment-mark")?.click());
await page.waitForSelector(".comment-item", { timeout: 5000 });
assert.equal(await page.evaluate(() => document.querySelectorAll(".sheet-image-card").length), 1);
await page.waitForSelector(".sheet-image-card", { timeout: 5000 });
await page.screenshot({ path: path.join(out, "003-1.0-reopen.png") });

assert.equal(errors.length, 0, `控制台错误：${errors.join(" | ")}`);
fs.writeFileSync(path.join(out, "e2e-1.0.txt"), `SOROBAN 1.0 OK · 批注 1 · 浮动图片 1 · 深色/浅色 · 清 localStorage 重开恢复\n`, "utf8");
console.log("SOROBAN 1.0 OK · 批注 1 · 浮动图片 1 · 深色/浅色 · 清 localStorage 重开恢复");
await browser.disconnect();
