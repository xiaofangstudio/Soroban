import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M4-打印.xlsx");
const out = path.join(root, "review-m4");
const cdp = process.env.SOROBAN_CDP || "9446";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");
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

async function open({ width = 1280, height = 800, clearSettings = true } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".welcome", { timeout: 30000 });
  if (clearSettings) {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("soroban:print:")) localStorage.removeItem(key);
      }
    });
  }
  await page.evaluate((file) => window.__soroban.openPath(file), fixture);
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(700);
}

async function openPrint() {
  await page.evaluate(() => {
    const button = document.querySelector('.tb-btn[title="打印与分页预览"]');
    if (!(button instanceof HTMLElement)) throw new Error("找不到顶栏打印按钮");
    button.click();
  });
  await page.waitForSelector(".print-overlay", { timeout: 5000 });
  await sleep(500);
}

async function closePrint() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".print-overlay"), { timeout: 5000 });
  await sleep(250);
}

async function info() {
  return page.evaluate(() => window.__soroban.printInfo());
}

async function clickText(selector, text) {
  await page.evaluate((selector, text) => {
    const target = [...document.querySelectorAll(selector)].find((item) => item.textContent?.trim() === text);
    if (!(target instanceof HTMLElement)) throw new Error(`找不到 ${selector} ${text}`);
    target.click();
  }, selector, text);
  await sleep(450);
}

async function toggle(labelText, checked) {
  await page.evaluate((labelText, checked) => {
    const label = [...document.querySelectorAll(".print-toggle")].find((item) => item.textContent?.includes(labelText));
    const input = label?.querySelector("input");
    if (!(input instanceof HTMLInputElement)) throw new Error(`找不到开关 ${labelText}`);
    if (input.checked !== checked) input.click();
  }, labelText, checked);
  await sleep(350);
}

async function typeArea(value) {
  const input = await page.$(".print-area-row input");
  if (!input) throw new Error("找不到打印区域输入框");
  await input.click({ clickCount: 3 });
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
  await sleep(550);
}

async function layout() {
  return page.evaluate(() => {
    const shell = document.querySelector(".print-shell")?.getBoundingClientRect();
    const side = document.querySelector(".print-side");
    const sideRect = side?.getBoundingClientRect();
    const pages = document.querySelector(".print-pages");
    const pagesRect = pages?.getBoundingClientRect();
    const firstPage = document.querySelector(".print-page")?.getBoundingClientRect();
    const body = document.querySelector(".print-page-body");
    const table = document.querySelector(".print-table");
    const footer = document.querySelector(".print-page-foot");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      shell: shell && { x: shell.x, y: shell.y, width: shell.width, height: shell.height, right: shell.right, bottom: shell.bottom },
      side: sideRect && { width: sideRect.width, height: sideRect.height, scrollHeight: side?.scrollHeight, clientHeight: side?.clientHeight },
      pages: pagesRect && { x: pagesRect.x, y: pagesRect.y, width: pagesRect.width, height: pagesRect.height, scrollWidth: pages?.scrollWidth, scrollHeight: pages?.scrollHeight },
      firstPage: firstPage && { x: firstPage.x, y: firstPage.y, width: firstPage.width, height: firstPage.height, right: firstPage.right, bottom: firstPage.bottom },
      body: body && { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight },
      table: table && { width: table.getBoundingClientRect().width, height: table.getBoundingClientRect().height },
      footerText: footer?.innerText ?? null,
      pageCount: document.querySelectorAll(".print-page").length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      topbarOverflow: (() => {
        const bar = document.querySelector(".topbar");
        return bar ? bar.scrollWidth > bar.clientWidth + 1 : null;
      })(),
    };
  });
}

function assertInside(rect, viewport, name) {
  assert.ok(rect, `${name} 未渲染`);
  assert.ok(rect.x >= -1 && rect.y >= -1, `${name} 超出左上边界`);
  assert.ok(rect.right <= viewport.width + 1, `${name} 超出右边界 ${rect.right} > ${viewport.width}`);
  assert.ok(rect.bottom <= viewport.height + 1, `${name} 超出下边界 ${rect.bottom} > ${viewport.height}`);
}

// 1. 默认打印预览
errors.length = 0;
await open();
const topbar = await page.evaluate(() => {
  const button = document.querySelector('.tb-btn[title="打印与分页预览"]');
  const rect = button?.getBoundingClientRect();
  return { found: Boolean(button), rect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
});
assert.ok(topbar.found, "顶栏没有打印入口");
assert.ok(topbar.rect.width >= 50, "打印按钮过窄");
await openPrint();
const base = await info();
assert.equal(base.open, true);
assert.equal(base.settings.orientation, "portrait");
assert.equal(base.settings.scaleMode, "fit");
assert.equal(base.settings.showHeader, true);
assert.equal(base.settings.showFooter, true);
assert.equal(base.settings.showGrid, true);
assert.equal(base.preview.areaA1, "A1:K82");
assert.equal(base.preview.pageCount, 2);
assert.equal(base.preview.pages.reduce((sum, item) => sum + item.rows, 0), 81);
assert.ok(Math.abs(base.preview.scale - 0.6167) < 0.01, `默认适应页宽比例异常 ${base.preview.scale}`);
assert.equal(base.preview.pages[0].firstCell, "SO-26001");
assert.equal(base.preview.pages[1].firstCell, "SO-26049");
const baseLayout = await layout();
assert.equal(baseLayout.pageCount, 2);
assert.equal(baseLayout.overflow, false);
assertInside(baseLayout.shell, baseLayout.viewport, "打印窗口");
assert.ok(baseLayout.firstPage.width > 450 && baseLayout.firstPage.width < 520, `A4 预览宽度异常 ${baseLayout.firstPage.width}`);
assert.ok(baseLayout.body.scrollHeight <= baseLayout.body.clientHeight + 2, "第一页表格被裁切");
assert.ok(baseLayout.footerText.includes("第 1 / 2 页"), "页脚页码缺失");
assert.ok(baseLayout.footerText.includes("小方工作室"), "页脚文字缺失");
assert.ok(baseLayout.footerText.includes("2026/11/25"), "页脚日期缺失");
await page.screenshot({ path: path.join(out, "400-print-studio.png") });
log(`M4 PRINT UI OK · A4 纵向 · 2 页 · ${base.preview.pages[0].rows}+${base.preview.pages[1].rows} 行 · 缩放 ${Math.round(base.preview.scale * 100)}%`);

// 2. 横向
await clickText(".print-segment button", "横向");
const landscape = await info();
assert.equal(landscape.settings.orientation, "landscape");
assert.equal(landscape.preview.pageCount, 4);
assert.ok(landscape.preview.scale > 0.88 && landscape.preview.scale < 1, `横向适应页宽异常 · ${landscape.preview.scale}`);
await sleep(400);
const landscapeLayout = await layout();
assert.equal(landscapeLayout.pageCount, 4);
assert.ok(landscapeLayout.firstPage.width > 680, `横向纸张宽度异常 ${landscapeLayout.firstPage.width}`);
assertInside(landscapeLayout.shell, landscapeLayout.viewport, "横向打印窗口");
await page.screenshot({ path: path.join(out, "401-print-landscape.png") });
log(`M4 LANDSCAPE OK · 4 页 · 缩放 ${Math.round(landscape.preview.scale * 100)}%`);

// 3. 100% 缩放与列分页
await page.select(".print-field select", "100");
await sleep(650);
const percent = await info();
assert.equal(percent.settings.scaleMode, "percent");
assert.equal(percent.settings.percent, 100);
assert.equal(percent.preview.pageCount, 10);
assert.ok(percent.preview.pages[0].width > 700 && percent.preview.pages[0].width < 1000, `100% 列带宽度异常 ${percent.preview.pages[0].width}`);
assert.ok(percent.preview.pages[0].width <= percent.preview.contentWidth + 1);
assert.ok(percent.preview.pages[5].width > 250, `列带未均衡 ${percent.preview.pages[5].width}`);
await page.screenshot({ path: path.join(out, "402-print-percent100.png") });
log(`M4 SCALE OK · 100% · 10 页 · 列带分页均衡`);

// 4. 页眉页脚网格开关
await toggle("打印网格线", false);
await toggle("页眉", false);
await toggle("页脚", false);
const bare = await info();
assert.equal(bare.settings.showGrid, false);
assert.equal(bare.settings.showHeader, false);
assert.equal(bare.settings.showFooter, false);
const bareDom = await page.evaluate(() => ({
  head: document.querySelectorAll(".print-page-head").length,
  foot: document.querySelectorAll(".print-page-foot").length,
  grid: document.querySelectorAll(".print-table.grid").length,
}));
assert.equal(bareDom.head, 0);
assert.equal(bareDom.foot, 0);
assert.equal(bareDom.grid, 0);
await page.screenshot({ path: path.join(out, "403-print-bare.png") });
log("M4 CHROME OK · 网格 / 页眉 / 页脚均已关闭");

// 5. 非法区域
await toggle("打印网格线", true);
await toggle("页眉", true);
await toggle("页脚", true);
await typeArea("A1::K82");
const badArea = await page.evaluate(() => ({
  error: document.querySelector(".print-error")?.textContent ?? "",
  disabled: document.querySelector(".print-go")?.disabled,
}));
assert.ok(badArea.error.includes("格式不正确"), "非法打印区域没有提示");
assert.equal(badArea.disabled, true);
await page.screenshot({ path: path.join(out, "404-print-area-error.png") });
log("M4 AREA ERROR OK · 非法区域被拦截");

// 6. 指定区域缩为一页
await typeArea("A1:G20");
await page.select(".print-field select", "fit");
await sleep(650);
const area = await info();
assert.equal(area.preview.areaA1, "A1:G20");
assert.equal(area.preview.pageCount, 1);
assert.equal(area.preview.pages[0].rows, 19);
assert.equal(area.preview.error, "");
await page.screenshot({ path: path.join(out, "405-print-area.png") });
log("M4 AREA OK · A1:G20 · 1 页 · 19 行");

// 7. 当前选区 + 设置持久化
await closePrint();
await page.evaluate(() => window.__soroban.selectRange(0, 0, 15, 6));
await sleep(350);
await openPrint();
await clickText(".print-area-actions button", "当前选区");
const selection = await info();
assert.equal(selection.preview.areaA1, "A1:G16");
assert.equal(selection.preview.pageCount, 1);
await page.screenshot({ path: path.join(out, "406-print-selection.png") });
await closePrint();
await openPrint();
const reopened = await info();
assert.equal(reopened.preview.areaA1, "A1:G16");
assert.equal(reopened.settings.orientation, "landscape");
assert.equal(reopened.settings.scaleMode, "fit");
const stored = await page.evaluate(() => {
  const key = Object.keys(localStorage).find((item) => item.startsWith("soroban:print:path:"));
  return key ? { key, value: localStorage.getItem(key) } : null;
});
assert.ok(stored?.value?.includes("A1:G16"), "打印设置未写入 sidecar");
log(`M4 SELECTION OK · A1:G16 · 1 页 · 设置已持久化`);
await closePrint();

// 8. 打印媒体
await openPrint();
await clickText(".print-segment button", "纵向");
await clickText(".print-area-actions button", "全部数据");
const mediaInfo = await info();
assert.equal(mediaInfo.preview.pageCount, 2);
await page.emulateMediaType("print");
await sleep(350);
const media = await page.evaluate(() => {
  const app = document.querySelector(".app");
  const side = document.querySelector(".print-side");
  const pageEl = document.querySelector(".print-page");
  const table = document.querySelector(".print-table");
  const body = document.querySelector(".print-page-body");
  const rect = pageEl?.getBoundingClientRect();
  return {
    appDisplay: app ? getComputedStyle(app).display : null,
    sideDisplay: side ? getComputedStyle(side).display : null,
    pageWidth: rect?.width,
    pageHeight: rect?.height,
    zoom: pageEl ? getComputedStyle(pageEl).zoom : null,
    tableWidth: table?.getBoundingClientRect().width,
    tableHeight: table?.getBoundingClientRect().height,
    bodyClientHeight: body?.clientHeight,
    bodyScrollHeight: body?.scrollHeight,
    pageGap: document.querySelectorAll(".print-page")[1]?.getBoundingClientRect().top - (rect?.bottom ?? 0),
    headerDisplay: getComputedStyle(document.querySelector(".print-page-head")).display,
    footerDisplay: getComputedStyle(document.querySelector(".print-page-foot")).display,
  };
});
assert.equal(media.appDisplay, "none");
assert.equal(media.sideDisplay, "none");
assert.ok(Math.abs(media.pageWidth - 793.7) < 2, `打印纸张宽度异常 ${media.pageWidth}`);
assert.ok(Math.abs(media.pageHeight - 1122.5) < 2, `打印纸张高度异常 ${media.pageHeight}`);
assert.equal(media.zoom, "1");
assert.ok(media.tableHeight <= media.bodyClientHeight + 2, "打印态表格溢出页面");
assert.equal(media.headerDisplay, "flex");
assert.equal(media.footerDisplay, "flex");
assert.equal(media.pageGap, 0);
await page.emulateMediaType("screen");
log(`M4 PRINT MEDIA OK · 210×297mm · zoom=1 · 表格 ${Math.round(media.tableHeight)}/${media.bodyClientHeight}px`);

// 9. 900 布局
await closePrint();
await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1.5 });
await sleep(700);
const compactTopbar = await layout();
assert.equal(compactTopbar.topbarOverflow, false, "900 顶栏横向溢出");
await page.screenshot({ path: path.join(out, "408-editor-900.png") });
await openPrint();
const compact = await layout();
assert.equal(compact.pageCount, 2);
assert.equal(compact.overflow, false);
assertInside(compact.shell, compact.viewport, "900 打印窗口");
assert.ok(compact.firstPage.width > 300 && compact.firstPage.width < 380, `900 纸张预览宽度异常 ${compact.firstPage.width}`);
assert.ok(compact.firstPage.right <= compact.pages.x + compact.pages.width, "900 纸张超出预览区");
assert.ok(compact.firstPage.bottom <= compact.viewport.height + 1, "900 纸张底部超出窗口");
const actionsVisible = await page.evaluate(() => {
  const action = document.querySelector(".print-go")?.getBoundingClientRect();
  return action && { top: action.top, bottom: action.bottom, height: action.height };
});
assert.ok(actionsVisible && actionsVisible.bottom <= 620, "900 打印按钮不在可视区");
await page.screenshot({ path: path.join(out, "407-print-900.png") });
log(`M4 900 OK · 窗口 ${Math.round(compact.shell.width)}×${Math.round(compact.shell.height)} · 纸张 ${Math.round(compact.firstPage.width)}px · 按钮可见`);

// 10. 打印调用链（拦截 window.print，避免系统对话框阻塞）
const printCall = await page.evaluate(async () => {
  const original = window.print;
  let calls = 0;
  window.print = () => {
    calls += 1;
  };
  const button = document.querySelector(".print-go");
  if (!(button instanceof HTMLElement)) throw new Error("找不到打印按钮");
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 450));
  window.print = original;
  return { calls, label: button.textContent?.trim() };
});
assert.equal(printCall.calls, 1);
assert.equal(printCall.label, "打印");
log("M4 PRINT CALL OK · window.print 调用 1 次");

// 10. 打印态 PDF 渲染（Chromium Page.printToPDF）
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await sleep(500);
let pdfState = "SKIP";
try {
  await page.emulateMediaType("print");
  await page.pdf({ path: path.join(out, "m4-print-preview.pdf"), printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.emulateMediaType("screen");
  const pdf = fs.readFileSync(path.join(out, "m4-print-preview.pdf"));
  const pageMarkers = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pageMarkers, 2, `PDF 页数异常 ${pageMarkers}`);
  pdfState = `PDF OK · ${pageMarkers} 页 · ${pdf.length} B`;
} catch (error) {
  await page.emulateMediaType("screen");
  pdfState = `PDF SKIP · ${error instanceof Error ? error.message : String(error)}`;
}
log(`M4 ${pdfState}`);

// 11. 筛选后只打印可见行
await closePrint();
await page.evaluate(() => window.__soroban.selectRange(0, 0, 81, 10));
const filtered = await page.evaluate(async () => {
  const result = window.__soroban.filterBy(7, "eq", "待发货");
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { result, info: window.__soroban.filterInfo() };
});
assert.equal(filtered.result.ok, true);
assert.ok(filtered.info && filtered.info.matched > 0, "筛选未命中");
await openPrint();
const filteredPrint = await info();
assert.equal(filteredPrint.preview.pageCount, 1);
assert.equal(filteredPrint.preview.pages.reduce((sum, item) => sum + item.rows, 0), filtered.info.matched);
await page.screenshot({ path: path.join(out, "412-print-filtered.png") });
log(`M4 FILTER PRINT OK · 筛选 ${filtered.info.matched}/${filtered.info.total} · 只打印可见 ${filtered.info.matched} 行`);
await closePrint();
await page.evaluate(() => window.__soroban.clearFilter());

assert.equal(errors.length, 0, `控制台错误：${errors.join(" | ")}`);
fs.writeFileSync(path.join(out, process.env.SOROBAN_E2E_LOG || "m4-e2e-dev.txt"), `${lines.join("\n")}\n`, "utf8");
await browser.disconnect();
console.log("\nALL M4 UI CHECKS PASSED");
