import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = process.env.SOROBAN_EXE
  ? path.resolve(process.env.SOROBAN_EXE)
  : path.join(root, "src-tauri", "target", "debug", "soroban.exe");
const xlsx = path.join(root, "assets", "M0-样本.xlsx");
const csv = path.join(root, "assets", "M0-样本.csv");

const fail = (message) => {
  console.error(`MCP FAIL: ${message}`);
  process.exit(1);
};

const proc = spawn(exe, ["--mcp"], { stdio: ["pipe", "pipe", "pipe"] });
let buffer = "";
const pending = new Map();
proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      console.log("non-json", line);
    }
  }
});
proc.stderr.on("data", (d) => console.log("mcp-stderr:", d.toString().trim()));
proc.on("exit", (code) => console.log("mcp-exit", code));

let id = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    id += 1;
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 10000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "soroban-e2e" },
});
console.log("init", init.result?.serverInfo, init.result?.capabilities);
if (!init.result?.serverInfo?.name) fail("initialize 无 serverInfo");

const list = await rpc("tools/list", {});
console.log("tools", list.result?.tools?.map((t) => t.name));
if ((list.result?.tools?.length ?? 0) !== 4) fail("tools/list 不是 4 个工具");

const textOf = (res) => {
  try {
    return JSON.parse(res.result?.content?.[0]?.text ?? "null");
  } catch {
    return null;
  }
};

const info = await rpc("tools/call", {
  name: "soroban_workbook_info",
  arguments: { path: xlsx },
});
console.log("info", info.result?.content?.[0]?.text);
const infoData = textOf(info);
if (infoData?.sheetCount !== 2 || infoData?.sheets?.join("/") !== "销售/明细") {
  fail("workbook_info sheet 解析错误");
}

const validate = await rpc("tools/call", {
  name: "soroban_validate_xlsx",
  arguments: { path: xlsx },
});
console.log("validate", validate.result?.content?.[0]?.text);
const validateData = textOf(validate);
if (!validateData?.ok || validateData?.sheetCount !== 2) fail("validate 未通过");

const csvRes = await rpc("tools/call", {
  name: "soroban_csv_preview",
  arguments: { path: csv, rows: 5 },
});
console.log("csv", csvRes.result?.content?.[0]?.text);
const csvData = textOf(csvRes);
if (csvData?.columns !== 4 || csvData?.rows !== 3 || csvData?.headers?.length !== 4) {
  fail("CSV 预览列行数不符");
}

const formulaRes = await rpc("tools/call", {
  name: "soroban_formula_search",
  arguments: { query: "sum", limit: 8 },
});
console.log("formula", formulaRes.result?.content?.[0]?.text);
const formulaData = textOf(formulaRes);
if (formulaData?.total !== 528 || formulaData?.formulas?.[0]?.name !== "SUM") {
  fail("函数库检索不符");
}

const dateRes = await rpc("tools/call", {
  name: "soroban_formula_search",
  arguments: { query: "日期", limit: 10 },
});
const dateData = textOf(dateRes);
if (!dateData?.formulas?.some?.((item) => item.name === "TODAY")) {
  fail("按说明检索日期函数失败");
}
console.log("formula-date", dateData.formulas.slice(0, 5).map((item) => item.name).join(","));

proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "exit" })}\n`);
proc.stdin.end();
await new Promise((r) => setTimeout(r, 500));
proc.kill();
console.log("MCP M1 OK");
