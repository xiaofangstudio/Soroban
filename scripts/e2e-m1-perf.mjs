import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const large = path.join(root, "assets", "M1-十万行.xlsx");
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
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector(".welcome", { timeout: 20000 });
const started = Date.now();
await page.evaluate((file) => window.__soroban.openPath(file), large);
await page.waitForFunction(
  () => [...document.querySelectorAll(".sheet-tab")].some((tab) => tab.textContent === "十万行"),
  { timeout: 120000 },
);
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 120000 });
const openMs = Date.now() - started;
await sleep(1500);
const info = await page.evaluate(() => {
  const snapshot = window.__soroban.getSnapshot();
  const sheet = snapshot.sheets[snapshot.sheetOrder[0]];
  return {
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    first: sheet.cellData?.[0]?.[0]?.v,
    last: sheet.cellData?.[sheet.rowCount - 2]?.[0]?.v,
    sheets: window.__soroban.getState().sheets,
  };
});
assert.ok(info.rowCount >= 100001, `行数不足：${info.rowCount}`);
assert.equal(info.first, "序号");
assert.equal(info.last, 100000);

await page.mouse.move(600, 400);
await page.evaluate(() => {
  window.__perf = { frames: [], done: false };
  const start = performance.now();
  let last = start;
  const step = (now) => {
    window.__perf.frames.push(now - last);
    last = now;
    if (now - start < 3200) requestAnimationFrame(step);
    else {
      window.__perf.done = true;
      window.__perf.total = now - start;
    }
  };
  requestAnimationFrame(step);
});
for (let index = 0; index < 30; index += 1) {
  await page.mouse.wheel({ deltaY: 50000 });
  await sleep(30);
}
await sleep(2500);
const perf = await page.evaluate(() => {
  const frames = window.__perf.frames.slice(2);
  const average = frames.reduce((sum, value) => sum + value, 0) / frames.length;
  return {
    frames: frames.length,
    total: window.__perf.total,
    averageFrame: Number(average.toFixed(2)),
    fps: Number((1000 / average).toFixed(1)),
    slow: frames.filter((value) => value > 33).length,
  };
});
assert.ok(perf.fps >= 55, `帧率不足：${perf.fps}`);
assert.ok(perf.slow <= 2, `卡顿帧过多：${perf.slow}`);
assert.deepEqual(errors, []);
await page.screenshot({ path: shot("120-large-end.png") });

console.log("open", { ms: openMs, rows: info.rowCount, columns: info.columnCount, bytes: fs.statSync(large).size });
console.log("perf", perf);
console.log("M1 PERF OK");
await browser.disconnect();
