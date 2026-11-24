import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import formulaLocale from "@univerjs/engine-formula/locale/zh-CN";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const common = [
  "SUM", "AVERAGE", "COUNT", "COUNTA", "MAX", "MIN",
  "IF", "IFS", "AND", "OR", "NOT", "IFERROR",
  "SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS", "AVERAGEIF", "AVERAGEIFS", "SUMPRODUCT",
  "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "INT", "MOD", "POWER", "SQRT",
  "VLOOKUP", "XLOOKUP", "HLOOKUP", "INDEX", "MATCH", "XMATCH", "OFFSET", "INDIRECT",
  "TEXT", "TEXTJOIN", "CONCAT", "CONCATENATE", "LEFT", "RIGHT", "MID", "LEN",
  "TRIM", "UPPER", "LOWER", "FIND", "SEARCH", "SUBSTITUTE", "REPLACE",
  "TODAY", "NOW", "DATE", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND",
  "DATEDIF", "EOMONTH", "WEEKDAY", "NETWORKDAYS",
  "LARGE", "SMALL", "RANK", "MEDIAN", "STDEV",
  "UNIQUE", "FILTER", "SORT", "SORTBY", "SEQUENCE", "LET", "LAMBDA",
];

const raw = formulaLocale["engine-formula"].functionList;
const rank = new Map(common.map((name, index) => [name, index]));
const list = Object.entries(raw)
  .map(([name, info]) => {
    const params = Object.values(info.functionParameter ?? {})
      .map((param) => param.name)
      .filter(Boolean);
    return {
      name,
      common: rank.has(name),
      description: (info.description ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      parameters: params,
      signature: params.length
        ? `${name}(${params.slice(0, 4).join(", ")}${params.length > 4 ? ", …" : ""})`
        : `${name}()`,
    };
  })
  .sort((a, b) => (rank.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.name) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));

const out = path.join(root, "src-tauri", "src", "formula_catalog.json");
fs.writeFileSync(out, JSON.stringify(list));
console.log("written", out, list.length, "functions", `${(fs.statSync(out).size / 1024).toFixed(1)}KB`);
