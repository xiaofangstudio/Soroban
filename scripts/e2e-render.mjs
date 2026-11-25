import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const large = path.join(root, "assets", "M1-十万行.xlsx");
const printFile = path.join(root, "assets", "M4-打印.xlsx");
const chartFile = path.join(root, "assets", "M2-图表.xlsx");
const out = process.env.SOROBAN_REVIEW_DIR || path.join(root, "review-0.6.1");
const cdp = process.env.SOROBAN_CDP || "9446";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");
await page.emulateMediaType("screen");
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.stack || String(error)));
const lines = [];
const log = (line) => {
  lines.push(line);
  console.log(line);
};

async function open(file, { width = 1280, height = 800, tab } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".welcome", { timeout: 30000 });
  await page.evaluate((target) => window.__soroban.openPath(target), file);
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 120000 });
  if (tab) {
    await page.evaluate((name) => {
      const target = [...document.querySelectorAll(".sheet-tab")].find((item) => item.textContent === name);
      if (target instanceof HTMLElement) target.click();
    }, tab);
    await sleep(400);
  }
  await sleep(1200);
}

async function gridAudit() {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: node.width,
        height: node.height,
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        scrollWidth: node.parentElement?.scrollWidth,
        scrollHeight: node.parentElement?.scrollHeight,
      };
    });
    const snapshot = window.__soroban.getSnapshot();
    const sheet = snapshot.sheets[snapshot.sheetOrder[0]];
    const grid = document.querySelector(".sheet-grid")?.getBoundingClientRect();
    return {
      dpr: devicePixelRatio,
      nodes: document.querySelectorAll("*").length,
      canvases,
      grid: grid && { width: Math.round(grid.width), height: Math.round(grid.height) },
      rows: sheet.rowCount,
      columns: sheet.columnCount,
      selection: window.__soroban.selectionA1(),
      nameBox: document.querySelector(".name-box")?.textContent,
      sheetHeight: Math.round(sheet.rowCount * (sheet.defaultRowHeight ?? 28)),
    };
  });
}

// 1. 十万行：画布尺寸必须等于视口，而不是整张 100001 行的高度
await open(large);
const largeView = await gridAudit();
const mainCanvas = largeView.canvases.reduce((best, item) => (item.width > best.width ? item : best), largeView.canvases[0]);
assert.ok(mainCanvas, "没有 Grid 画布");
assert.ok(mainCanvas.width <= largeView.grid.width * largeView.dpr + 2, `画布宽度超出视口 ${mainCanvas.width} > ${largeView.grid.width * largeView.dpr}`);
assert.ok(mainCanvas.height <= largeView.grid.height * largeView.dpr + 2, `画布高度超出视口 ${mainCanvas.height} > ${largeView.grid.height * largeView.dpr}`);
assert.ok(largeView.nodes < 400, `DOM 节点过多，疑似逐格建节点：${largeView.nodes}`);
assert.ok(largeView.sheetHeight > 1000000, "十万行表高度异常，测试样本不成立");
assert.equal(largeView.selection, "A1");
assert.equal(largeView.nameBox, "A1");
await page.screenshot({ path: path.join(out, "610-render-large.png") });
log(`RENDER LARGE OK · ${largeView.rows} 行 × ${largeView.columns} 列 · 画布 ${mainCanvas.cssWidth}×${mainCanvas.cssHeight} CSS · DOM ${largeView.nodes} · 选区 ${largeView.selection}`);

// 2. 滚动时仍然只重绘视口
await page.mouse.move(600, 400);
await page.evaluate(() => {
  window.__perf = { frames: [], done: false };
  const start = performance.now();
  let last = start;
  const step = (now) => {
    window.__perf.frames.push(now - last);
    last = now;
    if (now - start < 3000) requestAnimationFrame(step);
    else {
      window.__perf.done = true;
      window.__perf.total = now - start;
    }
  };
  requestAnimationFrame(step);
});
for (let index = 0; index < 24; index += 1) {
  await page.mouse.wheel({ deltaY: 40000 });
  await sleep(30);
}
await sleep(2300);
const perf = await page.evaluate(() => {
  const frames = window.__perf.frames.slice(2);
  const average = frames.reduce((sum, value) => sum + value, 0) / frames.length;
  return {
    frames: frames.length,
    averageFrame: Number(average.toFixed(2)),
    fps: Number((1000 / average).toFixed(1)),
    slow: frames.filter((value) => value > 33).length,
  };
});
const scrolled = await gridAudit();
assert.ok(perf.fps >= 55, `滚动帧率不足：${perf.fps}`);
assert.ok(perf.slow <= 2, `滚动卡顿帧过多：${perf.slow}`);
assert.ok(scrolled.canvases.every((item) => item.scrollHeight <= scrolled.grid.height + 2), "滚动后画布容器高度超过视口");
await page.screenshot({ path: path.join(out, "611-render-scrolled.png") });
log(`RENDER SCROLL OK · ${perf.fps} FPS · 平均帧 ${perf.averageFrame}ms · 慢帧 ${perf.slow}`);

// 3. 打印预览 10 页：屏幕态只排版视口附近纸页，DOM 不按 10 页全部铺满
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("soroban:print:")) localStorage.removeItem(key);
  }
});
await open(printFile);
await page.evaluate(() => {
  const button = document.querySelector('.tb-btn[title^="打印与分页预览"]');
  if (button instanceof HTMLElement) button.click();
});
await page.waitForSelector(".print-overlay", { timeout: 10000 });
await page.select(".print-field select", "100");
await sleep(700);
const preview = await page.evaluate(() => {
  const pages = [...document.querySelectorAll(".print-page")];
  const first = pages[0];
  return {
    count: pages.length,
    first: first ? { width: Math.round(first.getBoundingClientRect().width), height: Math.round(first.getBoundingClientRect().height) } : null,
    visibility: pages.map((node) => getComputedStyle(node).contentVisibility),
    intrinsic: first ? getComputedStyle(first).containIntrinsicSize : null,
    scrollHeight: document.querySelector(".print-pages")?.scrollHeight,
  };
});
assert.ok(preview.count >= 6, `打印预览页数不足：${preview.count}`);
assert.ok(preview.visibility.every((value) => value === "auto"), `打印预览未启用视口跳过：${preview.visibility.join(",")}`);
assert.ok(preview.intrinsic && preview.intrinsic !== "none", "打印预览缺少占位尺寸，滚动条会跳动");
assert.ok(preview.first && preview.first.width > 300, `打印纸张宽度异常 ${preview.first?.width}`);
await page.screenshot({ path: path.join(out, "612-render-print.png") });
log(`RENDER PRINT OK · ${preview.count} 页 · 屏幕态 content-visibility=auto · 纸张 ${preview.first.width}px`);

// 4. 打印态恢复全部纸页，避免只打出第一页
await page.emulateMediaType("print");
await sleep(300);
const printMedia = await page.evaluate(() => {
  const pages = [...document.querySelectorAll(".print-page")];
  return {
    count: pages.length,
    visibility: pages.map((node) => getComputedStyle(node).contentVisibility),
    zooms: pages.map((node) => getComputedStyle(node).zoom),
  };
});
assert.equal(printMedia.count, preview.count);
assert.ok(printMedia.visibility.every((value) => value === "visible"), `打印态没有恢复全部纸页：${printMedia.visibility.join(",")}`);
assert.ok(printMedia.zooms.every((value) => value === "1"), `打印态缩放未归位：${printMedia.zooms.join(",")}`);
const pdfPath = path.join(out, "render-print.pdf");
await page.pdf({
  path: pdfPath,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
const pdf = fs.readFileSync(pdfPath);
const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
assert.equal(pdfPages, preview.count, `打印 PDF 页数异常 ${pdfPages} / ${preview.count}`);
await page.emulateMediaType("screen");
log(`RENDER PRINT MEDIA OK · ${printMedia.count} 页全部恢复 · zoom=1 · PDF ${pdfPages} 页`);

// 5. 图表浮层同样只绘视口内卡片
await page.keyboard.press("Escape");
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("soroban:charts:path:")) localStorage.removeItem(key);
  }
});
await open(chartFile, { tab: "月度" });
await page.evaluate(() => window.__soroban.selectRange(0, 0, 12, 2));
await page.evaluate(() => document.querySelector(".fmt-btn.chart")?.click());
await page.waitForSelector(".chart-studio", { timeout: 5000 });
await page.evaluate(() => document.querySelector(".cs-insert")?.click());
await sleep(900);
await page.evaluate(() => window.__soroban.selectCell(0, 0));
await sleep(250);
const charts = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".chart-card")];
  return {
    count: cards.length,
    visibility: cards.map((node) => getComputedStyle(node).contentVisibility),
    inside: cards.map((node) => {
      const rect = node.getBoundingClientRect();
      const grid = document.querySelector(".sheet-grid")?.getBoundingClientRect();
      return Boolean(grid && rect.right > grid.left && rect.bottom > grid.top && rect.left < grid.right && rect.top < grid.bottom);
    }),
  };
});
assert.ok(charts.count > 0, "图表样本没有图表卡片");
assert.ok(charts.visibility.every((value) => value === "auto"), `图表卡片未启用视口跳过：${charts.visibility.join(",")}`);
assert.ok(charts.inside.every(Boolean), "视口内图表被错误裁掉");
await page.screenshot({ path: path.join(out, "613-render-charts.png") });
log(`RENDER CHARTS OK · ${charts.count} 张卡片 · 视口内可见 · content-visibility=auto`);
await page.evaluate((file) => {
  localStorage.removeItem(`soroban:charts:path:${file}`);
}, chartFile);

assert.deepEqual(errors, [], `控制台错误：${errors.join(" | ")}`);
fs.writeFileSync(path.join(out, process.env.SOROBAN_E2E_LOG || "render-e2e.txt"), `${lines.join("\n")}\n`, "utf8");
await browser.disconnect();
console.log("\nALL RENDER CHECKS PASSED");
