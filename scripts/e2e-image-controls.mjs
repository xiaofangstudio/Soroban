import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import JSZip from "jszip";

const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9450";
const out = path.resolve("review-features");
fs.mkdirSync(out, { recursive: true });
const source = path.resolve("assets", "M0-样本.xlsx");
const working = path.join(out, "soroban-image-working.xlsx");
fs.copyFileSync(source, working);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`断言失败：${name} ${detail}`);
};

let browser;
try {
  browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
  const page = (await browser.pages()).find((item) => item.url().includes("1421") || item.url().includes("tauri")) || (await browser.pages())[0];
  page.on("dialog", (dialog) => void dialog.accept());
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.waitForFunction(() => Boolean(window.__soroban), { timeout: 30000 });
  await page.setViewport({ width: 1360, height: 880, deviceScaleFactor: 1 });
  await page.evaluate((target) => {
    for (const key of Object.keys(localStorage)) {
      if (key.includes("soroban:images") && key.includes(target)) localStorage.removeItem(key);
    }
  }, working);
  await page.evaluate((target) => window.__soroban.openPath(target), working);
  await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 20000 });
  await page.waitForFunction(() => window.__soroban.imageCount() >= 0, { timeout: 10000 });
  await sleep(800);
  check("样本工作簿没有旧图片", await page.evaluate(() => window.__soroban.imageCount()) === 0);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 360, 220);
    g.addColorStop(0, "#0b7285");
    g.addColorStop(1, "#c92a2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 360, 220);
    ctx.fillStyle = "#fff";
    ctx.font = "700 42px sans-serif";
    ctx.fillText("SOROBAN", 48, 118);
    return canvas.toDataURL("image/png");
  });
  let added = false;
  for (let i = 0; i < 12 && !added; i += 1) {
    added = await page.evaluate((src) => window.__soroban.addImage(src, "封面图.png"), dataUrl);
    if (!added) await sleep(350);
  }
  check("插入第一张图片", added);
  await sleep(500);
  const rotate = await page.evaluate(() => {
    const button = [...document.querySelectorAll(".sheet-image-tool")].find((item) => item.getAttribute("title") === "顺时针旋转 90°");
    button?.click();
    return Boolean(button);
  });
  check("旋转按钮存在", rotate);
  await sleep(400);
  const rotated = await page.evaluate(() => {
    const card = document.querySelector(".sheet-image-card");
    const frame = document.querySelector(".sheet-image-frame");
    return {
      width: card?.style.width,
      height: card?.style.height,
      transform: frame?.style.transform,
      frameW: frame?.style.width,
      frameH: frame?.style.height,
    };
  });
  check("旋转后占位宽高互换", rotated.width === "180px" && rotated.height === "280px", JSON.stringify(rotated));
  check("图片帧旋转 90°", rotated.transform === "rotate(90deg)");
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".sheet-image-tool")].find((item) => item.getAttribute("title") === "锁定图片（禁止拖动和缩放）");
    button?.click();
  });
  await sleep(300);
  const locked = await page.evaluate(() => ({
    locked: document.querySelector(".sheet-image-card")?.classList.contains("locked"),
    handle: Boolean(document.querySelector(".sheet-image-resize")),
  }));
  check("锁定后无缩放手柄", locked.locked && !locked.handle, JSON.stringify(locked));

  await page.evaluate((src) => window.__soroban.addImage(src, "第二张.png"), dataUrl);
  await sleep(500);
  check("图片数量为 2", await page.evaluate(() => window.__soroban.imageCount()) === 2);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".sheet-image-card")];
    const first = cards.find((card) => card.querySelector(".sheet-image-head span")?.textContent === "封面图.png");
    const button = [...first.querySelectorAll(".sheet-image-tool")].find((item) => item.getAttribute("title") === "置顶图片");
    button?.click();
  });
  await sleep(300);
  const z = await page.evaluate(() => [...document.querySelectorAll(".sheet-image-card")].map((card) => ({
    name: card.querySelector(".sheet-image-head span")?.textContent,
    z: card.style.zIndex,
  })));
  const raised = z.find((item) => item.name === "封面图.png");
  check("置顶后压过第二张", Number(raised?.z) > Math.max(...z.filter((item) => item.name !== "封面图.png").map((item) => Number(item.z))), JSON.stringify(z));

  const beforePaste = await page.evaluate(() => window.__soroban.imageCount());
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2da44e";
    ctx.fillRect(0, 0, 120, 80);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "剪贴板截图.png", { type: "image/png" });
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { items: [{ type: "image/png", getAsFile: () => file }] },
      });
      window.dispatchEvent(event);
    }, "image/png");
  });
  await sleep(1200);
  check("Ctrl+V 剪贴板图片进入表格", await page.evaluate(() => window.__soroban.imageCount()) === beforePaste + 1, `${beforePaste} → ${await page.evaluate(() => window.__soroban.imageCount())}`);

  const xlsxPath = path.join(out, "soroban-image.xlsx");
  await page.evaluate((target) => window.__soroban.savePath(target), xlsxPath);
  await sleep(1000);
  const xlsx = fs.readFileSync(xlsxPath);
  const zip = await JSZip.loadAsync(xlsx);
  const custom = await zip.file("docProps/custom.xml").async("string");
  const encoded = custom.match(/<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/)?.[1] || "";
  const meta = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const cover = meta.images.find((image) => image.name === "封面图.png");
  check("xlsx 保存旋转/锁定/层级", cover?.rotation === 90 && cover?.locked === true && cover?.z >= 3, JSON.stringify({ rotation: cover?.rotation, locked: cover?.locked, z: cover?.z }));
  await page.screenshot({ path: path.join(out, "soroban-image-controls.png") });
  check("控制台无错误", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (error) {
  results.push(`FAIL EXCEPTION — ${error?.stack || String(error)}`);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.disconnect().catch(() => undefined);
  fs.writeFileSync(path.join(out, "soroban-features.txt"), `Soroban 图片控制烟测\n${results.join("\n")}\n`, "utf8");
  console.log(results.join("\n"));
}
