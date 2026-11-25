import puppeteer from "puppeteer-core";
import path from "node:path";
const root = "D:/20533/deskbox/fangwork/Papyra/Soroban";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9446", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("1421") || p.url().includes("tauri")) || pages[0];
await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".welcome", { timeout: 20000 });
await page.evaluate((p) => window.__soroban.openPath(p), path.join(root, "assets", "M0-样本.xlsx"));
await page.waitForSelector(".univer-container", { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector(".sheet-loading"), { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => window.__soroban.selectCell(1, 1));
await page.mouse.click(150, 320, { button: "right" });
await new Promise((r) => setTimeout(r, 500));
console.log(await page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden";
  };
  return [...document.querySelectorAll("*")]
    .filter((el) => /menu|context/i.test(String(el.className)) && visible(el))
    .slice(0, 12)
    .map((el) => ({ cls: String(el.className), text: (el.textContent || "").slice(0, 500) }));
}));
await page.screenshot({ path: path.join(root, "review-0.7", "diag-cellmenu.png") });
await browser.disconnect();
