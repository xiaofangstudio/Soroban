import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const count = Number(process.argv[2] || 100000);
const areas = ["华南", "华东", "华北", "西南"];
const products = ["标准版", "专业版", "团队版", "旗舰版"];
const rows = [["序号", "日期", "区域", "产品", "数量", "单价", "金额", "状态"]];
for (let index = 1; index <= count; index += 1) {
  const quantity = (index % 20) + 1;
  const price = 80 + (index % 9) * 10;
  rows.push([
    index,
    `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    areas[index % areas.length],
    products[index % products.length],
    quantity,
    price,
    quantity * price,
    index % 13 === 0 ? "待复核" : "已完成",
  ]);
}

const ws = XLSX.utils.aoa_to_sheet(rows, { dense: true });
ws["!cols"] = [
  { wch: 8 },
  { wch: 12 },
  { wch: 8 },
  { wch: 10 },
  { wch: 8 },
  { wch: 9 },
  { wch: 12 },
  { wch: 10 },
];
ws["!freeze"] = { xSplit: 0, ySplit: 1 };
ws["!autofilter"] = { ref: `A1:H${count + 1}` };

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "十万行");
const out = path.join(root, "assets", `M1-${count === 100000 ? "十万行" : `${count}行`}.xlsx`);
const started = Date.now();
XLSX.writeFile(wb, out, { compression: true });
console.log("written", out, `${Date.now() - started}ms`);
