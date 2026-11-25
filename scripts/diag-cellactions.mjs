import puppeteer from "puppeteer-core";
import path from "node:path";
const root = "D:/20533/deskbox/fangwork/Papyra/Soroban";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9446", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
const click = (label) => page.evaluate((label) => {
  const buttons = [...document.querySelectorAll(".cell-tools button")];
  const btn = buttons.find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`button ${label} not found`);
  btn.click();
}, label);
await page.evaluate(() => window.__soroban.selectRange(0, 6, 2, 6));
await click("合并并居中");
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => window.__soroban.selectRange(2, 1, 4, 3));
await click("外框");
await new Promise((r) => setTimeout(r, 300));
const snap = await page.evaluate(() => window.__soroban.getSnapshot());
const sh = snap.sheets[snap.sheetOrder[0]];
console.log(JSON.stringify({
  mergeData: sh.mergeData,
  g1: sh.cellData?.[0]?.[6],
  styles: sh.styles,
  b3: sh.cellData?.[2]?.[1],
  c4: sh.cellData?.[3]?.[2],
  d5: sh.cellData?.[4]?.[3],
  bridge: await page.evaluate(() => ({ b3: window.__soroban.cellStyle(2,1), d5: window.__soroban.cellStyle(4,3), g1: window.__soroban.cellStyle(0,6) })),
}, null, 2));
await browser.disconnect();
