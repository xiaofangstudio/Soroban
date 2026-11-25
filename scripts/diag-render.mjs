import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const large = path.join(root, "assets", "M1-十万行.xlsx");
const out = path.join(root, "review-0.6.0");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cdp = process.env.SOROBAN_CDP || "9446";
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("tauri") || p.url().includes("1421")) || pages[0];
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".welcome", { timeout: 30000 });
const started = Date.now();
await page.evaluate((file) => window.__soroban.openPath(file), large);
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 120000 });
await sleep(1200);

const report = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll("canvas")].map((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      scrollWidth: canvas.parentElement?.scrollWidth,
      scrollHeight: canvas.parentElement?.scrollHeight,
      parentClass: canvas.parentElement?.className?.toString().slice(0, 80),
    };
  });
  const nodes = [...document.querySelectorAll("*")].length;
  const grid = document.querySelector(".univer-render-canvas")?.parentElement;
  const layer = document.querySelector(".univer-render-canvas");
  return {
    canvases,
    nodes,
    container: (() => {
      const rect = document.querySelector(".univer-container")?.getBoundingClientRect();
      return rect && { width: rect.width, height: rect.height };
    })(),
    grid: grid && {
      scrollWidth: grid.scrollWidth,
      scrollHeight: grid.scrollHeight,
      clientWidth: grid.clientWidth,
      clientHeight: grid.clientHeight,
    },
    layer: layer && {
      width: layer.getBoundingClientRect().width,
      height: layer.getBoundingClientRect().height,
      transform: getComputedStyle(layer).transform,
    },
    cells: (() => {
      const snap = window.__soroban.getSnapshot();
      const sheet = snap.sheets[snap.sheetOrder[0]];
      return { rows: sheet.rowCount, columns: sheet.columnCount };
    })(),
    selection: window.__soroban.selectionA1(),
    status: document.querySelector(".data-status")?.textContent,
    nameBox: document.querySelector(".name-box")?.textContent,
  };
});
console.log(JSON.stringify({ openMs: Date.now() - started, ...report }, null, 2));
await page.screenshot({ path: path.join(out, "diag-render-initial.png") });

await page.mouse.move(600, 400);
for (let index = 0; index < 20; index += 1) {
  await page.mouse.wheel({ deltaY: 8000 });
  await sleep(50);
}
await sleep(1200);
const after = await page.evaluate(() => ({
  canvases: [...document.querySelectorAll("canvas")].map((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    top: Math.round(canvas.getBoundingClientRect().top),
    left: Math.round(canvas.getBoundingClientRect().left),
  })),
  layer: (() => {
    const node = document.querySelector(".univer-render-canvas");
    return node && { width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, transform: getComputedStyle(node).transform };
  })(),
}));
console.log("AFTER", JSON.stringify(after, null, 2));
await page.screenshot({ path: path.join(out, "diag-render-scrolled.png") });
await browser.disconnect();
