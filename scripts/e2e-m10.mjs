import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "assets", "M0-样本.xlsx");
const out = path.join(root, "review-0.8");
const working = path.join(out, "M0-数据验证-working.xlsx");
const saved = path.join(out, "M10-数据验证.xlsx");
const noManifest = path.join(out, "M10-仅标准验证.xlsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cdp = process.env.SOROBAN_CDP || "9446";

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(fixture, working);

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdp}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
if (!page) throw new Error("找不到 Soroban 窗口页面");

let errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.stack || String(e)));
const waitReady = async () => {
  await page.waitForSelector(".sheet-tab", { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
  await sleep(800);
};
const open = async (file) => {
  await page.evaluate((p) => window.__soroban.openPath(p), file);
  await waitReady();
  await page.evaluate(() => {
    const item = [...document.querySelectorAll(".sheet-tab")].find((x) => x.textContent === "销售");
    if (item instanceof HTMLElement) item.click();
  });
  await sleep(500);
};
const openPanel = async () => {
  if (!(await page.evaluate(() => Boolean(document.querySelector(".dv-panel"))))) {
    await page.evaluate(() => document.querySelector(".dv-mark")?.click());
  }
  await sleep(220);
};
const clickKind = async (label) => {
  await page.evaluate((label) => {
    const btn = [...document.querySelectorAll(".dv-kind")].find((b) => b.textContent?.trim() === label);
    if (!(btn instanceof HTMLElement)) throw new Error(`验证类型不存在：${label}`);
    btn.click();
  }, label);
  await sleep(180);
};
const barSet = async (row, column, text) => {
  await page.evaluate((r, c) => window.__soroban.selectCell(r, c), row, column);
  await sleep(180);
  await page.click(".fx-input");
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await sleep(320);
};
const cellValue = async (row, column) => {
  const snap = await page.evaluate(() => window.__soroban.getSnapshot());
  const sheet = snap.sheets[snap.sheetOrder[0]];
  return sheet.cellData?.[row]?.[column]?.v ?? null;
};

await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1.5 });
await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".welcome", { timeout: 30000 });
await open(working);

// 1. 下拉列表：H2:H6
await page.evaluate(() => window.__soroban.selectRange(1, 7, 5, 7));
await sleep(200);
await openPanel();
const panel = await page.evaluate(() => {
  const el = document.querySelector(".dv-panel");
  const r = el?.getBoundingClientRect();
  return {
    width: r?.width,
    height: r?.height,
    right: r?.right,
    bottom: r?.bottom,
    range: document.querySelector(".dv-panel .ct-range")?.textContent,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
assert.equal(panel.width, 360);
assert.ok(panel.right <= 1280 && panel.bottom <= 820, "数据验证面板越界");
assert.equal(panel.range, "H2:H6");
assert.equal(panel.overflow, false);
await page.evaluate(() => {
  const area = document.querySelector(".dv-textarea");
  if (!(area instanceof HTMLTextAreaElement)) throw new Error("找不到下拉选项输入框");
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(area, "高, 中, 低");
  area.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(120);
await page.click(".dv-apply");
await sleep(450);
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 1);
const h2Rule = await page.evaluate(() => window.__soroban.validationForCell(1, 7));
assert.equal(h2Rule?.type, "下拉列表");
assert.equal(h2Rule?.range, "H2:H6");
assert.match(h2Rule?.detail ?? "", /高\s*\/\s*中\s*\/\s*低/);
await page.evaluate(() => {
  const el = document.querySelector(".dv-mark");
  if (el instanceof HTMLElement) el.click();
});
await page.evaluate(() => window.__soroban.selectRange(1, 7, 5, 7));
await sleep(350);
await page.screenshot({ path: path.join(out, "800-dv-list.png") });

// 2. 下拉值写入与非法值状态
await barSet(1, 7, "高");
await barSet(2, 7, "中");
await barSet(3, 7, "低");
assert.equal(await cellValue(1, 7), "高");
assert.equal(await cellValue(2, 7), "中");
assert.equal(await cellValue(3, 7), "低");
assert.equal(await page.evaluate(() => window.__soroban.validationStatus(1, 7)), "valid");
await barSet(1, 7, "超高");
await sleep(350);
assert.equal(await page.evaluate(() => window.__soroban.validationStatus(1, 7)), "invalid");
await page.screenshot({ path: path.join(out, "801-dv-invalid.png") });
await barSet(1, 7, "高");
await sleep(350);
assert.equal(await page.evaluate(() => window.__soroban.validationStatus(1, 7)), "valid");

// 3. 数值区间：B3:B5
await page.evaluate(() => window.__soroban.selectRange(2, 1, 4, 1));
await sleep(200);
await openPanel();
await clickKind("数值区间");
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".dv-pair input")];
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  const set = (el, value) => {
    if (!(el instanceof HTMLInputElement)) throw new Error("找不到数值输入框");
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  set(inputs[0], "100000");
  set(inputs[1], "200000");
});
await sleep(120);
await page.click(".dv-apply");
await sleep(450);
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 2);
const b3Rule = await page.evaluate(() => window.__soroban.validationForCell(2, 1));
assert.equal(b3Rule?.type, "整数");
assert.equal(b3Rule?.range, "B3:B5");
assert.match(b3Rule?.detail ?? "", /介于\s+100000\s+200000/);
await page.evaluate(() => window.__soroban.selectRange(2, 1, 4, 1));
await sleep(200);
await openPanel();
await page.screenshot({ path: path.join(out, "802-dv-number.png") });

// 4. 保存 xlsx 并重开，验证规则持久化
await page.evaluate(() => {
  const el = document.querySelector(".dv-mark");
  if (el instanceof HTMLElement) el.click();
});
await page.evaluate((p) => window.__soroban.savePath(p), saved);
await sleep(1200);
assert.ok(fs.existsSync(saved), "数据验证样张未保存");
const zip = await JSZip.loadAsync(fs.readFileSync(saved));
zip.remove("xl/soroban-validations.json");
fs.writeFileSync(noManifest, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
await open(noManifest);
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 2, "仅标准 XML 的验证未回读");
assert.equal((await page.evaluate(() => window.__soroban.validationForCell(1, 7)))?.type, "下拉列表");
await open(saved);
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 2);
assert.equal((await page.evaluate(() => window.__soroban.validationForCell(1, 7)))?.type, "下拉列表");
assert.equal((await page.evaluate(() => window.__soroban.validationForCell(2, 1)))?.type, "整数");
await page.evaluate(() => window.__soroban.selectRange(1, 7, 5, 7));
await sleep(220);
await openPanel();
await page.screenshot({ path: path.join(out, "803-dv-reopen.png") });

// 4b. 重开后直接应用现有规则，值不应被拼成单项
await page.click(".dv-apply");
await sleep(450);
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 2);
assert.match((await page.evaluate(() => window.__soroban.validationForCell(1, 7)))?.detail ?? "", /高\s*\/\s*中\s*\/\s*低/);

// 5. 清除当前区域
await openPanel();
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 2);
await page.click(".dv-clear");
await sleep(450);
assert.equal(await page.evaluate(() => window.__soroban.validationCount()), 1);
assert.equal(await page.evaluate(() => window.__soroban.validationForCell(1, 7)), null);
await page.screenshot({ path: path.join(out, "804-dv-cleared.png") });

// 6. 900×620 布局
await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1.5 });
await sleep(600);
await page.evaluate(() => window.__soroban.selectRange(1, 7, 5, 7));
await sleep(200);
await openPanel();
const small = await page.evaluate(() => {
  const el = document.querySelector(".dv-panel");
  const r = el?.getBoundingClientRect();
  return {
    width: r?.width,
    right: r?.right,
    bottom: r?.bottom,
    overflow: document.documentElement.scrollWidth > innerWidth,
    fxMark: document.querySelector(".dv-mark")?.getBoundingClientRect().right,
  };
});
assert.equal(small.width, 360);
assert.ok(small.right <= 900 && small.bottom <= 620, "900×620 数据验证面板越界");
assert.ok(small.fxMark <= 900, "900×620 数据验证入口越界");
assert.equal(small.overflow, false);
await page.screenshot({ path: path.join(out, "805-dv-900.png") });

assert.deepEqual(errors, [], `控制台错误：${errors.join(" | ")}`);
console.log("M10 数据验证 E2E 通过");
await browser.disconnect();
