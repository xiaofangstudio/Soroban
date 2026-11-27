import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import JSZip from "jszip";

const root = process.cwd();
const out = path.join(root, "review-0.11");
const source = path.join(root, "assets", "M2-图表.xlsx");
const working = path.join(out, "M14-已有属性-working.xlsx");
const saved = path.join(out, "M14-已有属性.xlsx");
const cdp = process.env.SOROBAN_CDP || "http://127.0.0.1:9450";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const zip = await JSZip.loadAsync(fs.readFileSync(source));
const custom = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="团队"><vt:lpwstr>研发</vt:lpwstr></Property></Properties>';
zip.file("docProps/custom.xml", custom);
let types = await zip.file("[Content_Types].xml").async("string");
types = types.replace(/<\/Types>\s*$/, '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>');
zip.file("[Content_Types].xml", types);
let rels = await zip.file("_rels/.rels").async("string");
rels = rels.replace(/<\/Relationships>\s*$/, '<Relationship Id="rIdExistingProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>');
zip.file("_rels/.rels", rels);
fs.writeFileSync(working, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((item) => item.url().includes("1421") || item.url().includes("tauri.localhost")) || pages[0];
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(String(error)));

await page.evaluate(async (file) => await window.__soroban.openPath(file), working);
await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 30000 });
await page.waitForSelector(".sheet-tab", { timeout: 30000 });
await sleep(600);
await page.evaluate(async (file) => await window.__soroban.savePath(file), saved);
await sleep(800);

const resultZip = await JSZip.loadAsync(fs.readFileSync(saved));
const xml = await resultZip.file("docProps/custom.xml").async("string");
const tags = [...xml.matchAll(/<Property\b[^>]*>/g)].map((match) => match[0]);
const names = tags.map((tag) => tag.match(/\bname="([^"]+)"/)?.[1] ?? "");
const pids = tags.map((tag) => Number(tag.match(/\bpid="(\d+)"/)?.[1] ?? 0));
assert.ok(names.includes("团队"), "原有自定义属性被覆盖");
assert.ok(names.includes("SorobanData"), "SorobanData 未写入");
assert.equal(new Set(pids).size, pids.length, "自定义属性 pid 重复");
assert.match(xml, /<vt:lpwstr>/);
assert.deepEqual(errors, []);

await page.evaluate(() => window.__soroban.back());
await page.waitForFunction(() => window.__soroban.getState().screen === "welcome", { timeout: 10000 });
await page.evaluate(async (file) => await window.__soroban.openPath(file), saved);
await page.waitForFunction(() => window.__soroban.getState().screen === "editor", { timeout: 30000 });
await sleep(500);
assert.equal(await page.evaluate(() => window.__soroban.conditionalRuleCount()), 0);

console.log("CUSTOM PROPERTIES MERGE OK · 原有属性保留 · pid 不重复");
console.log(JSON.stringify({ names, pids }));
await page.screenshot({ path: path.join(out, "002-meta-merge.png") });
await browser.disconnect();
