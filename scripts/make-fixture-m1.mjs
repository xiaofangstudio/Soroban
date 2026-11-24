import ExcelJS from "@zwight/exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "M1-跨表.xlsx");
const months = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const profits = [...Array(11).fill(30000), 45000];

const wb = new ExcelJS.Workbook();
wb.creator = "小方工作室";
wb.created = new Date("2026-11-24T00:00:00Z");

const detail = wb.addWorksheet("明细", {
  views: [{ state: "frozen", ySplit: 1 }],
  properties: { defaultRowHeight: 24 },
});
detail.columns = [
  { key: "month", width: 12 },
  { key: "sales", width: 16 },
  { key: "cost", width: 16 },
  { key: "profit", width: 16 },
  { key: "note", width: 18 },
];
const heads = ["月份", "销售额", "成本", "毛利", "备注"];
function styleHead(row, values) {
  const line = row;
  values.forEach((value, index) => {
    const cell = line.getCell(index + 1);
    cell.value = value;
    cell.font = { name: "Microsoft YaHei", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "thin", color: { argb: "FF0C8A5F" } }, bottom: { style: "thin", color: { argb: "FF0C8A5F" } } };
  });
  row.height = 28;
}
styleHead(detail.getRow(1), heads);

months.forEach((month, index) => {
  const row = detail.getRow(index + 2);
  const sales = 100000 + index * 1000;
  const profit = profits[index];
  row.getCell(1).value = `${month} 月`;
  row.getCell(2).value = sales;
  row.getCell(3).value = sales - profit;
  row.getCell(4).value = profit;
  row.getCell(5).value = index < 3 ? "老客户" : "常规";
  for (const col of [2, 3, 4]) row.getCell(col).numFmt = "#,##0.00";
  row.getCell(5).alignment = { horizontal: "left" };
  row.height = 24;
});
detail.autoFilter = { from: "A1", to: "E13" };

const summary = wb.addWorksheet("汇总", {
  properties: { defaultRowHeight: 24 },
});
summary.columns = [{ width: 26 }, { width: 18 }, { width: 38 }];
summary.mergeCells("A1:C1");
summary.getCell("A1").value = "2026 年毛利汇总";
summary.getCell("A1").font = { name: "Microsoft YaHei", size: 16, bold: true, color: { argb: "FF0E9F6E" } };
summary.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
summary.getRow(1).height = 38;

styleHead(summary.getRow(3), ["指标", "结果", "公式说明"]);
const metrics = [
  ["全年毛利合计", "SUM(明细!D2:D13)", "跨表求和 明细!D2:D13"],
  ["平均单月毛利", "AVERAGE(明细!D2:D13)", "跨表平均"],
  ["最高单月毛利", "MAX(明细!D2:D13)", "跨表最大值"],
  ["明细行数", "COUNTA(明细!A2:A13)", "跨表计数"],
];
metrics.forEach(([label, formula, note], index) => {  const row = summary.getRow(index + 4);
  row.getCell(1).value = label;
  row.getCell(2).value = { formula };
  row.getCell(2).numFmt = "#,##0.00";
  row.getCell(3).value = note;
  row.getCell(3).font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF4F6B5E" } };
  row.height = 26;
});
const textRow = summary.getRow(8);
textRow.getCell(1).value = "合计（千分位文本）";
textRow.getCell(2).value = { formula: 'TEXT(B4,"#,##0.00")' };
textRow.getCell(3).value = "文本函数";

const functionHead = summary.getRow(10);
styleHead(functionHead, ["函数验证", "计算结果", "期望"]);
const checks = [
  ["ROUND", "ROUND(3.14159,2)", 3.14, "3.14"],
  ["COUNTIF", 'COUNTIF(明细!D2:D13,">=45000")', 1, "1"],
  ["SUMIFS", 'SUMIFS(明细!D2:D13,明细!B2:B13,">100000")', 345000, "345000"],
  ["IFERROR", 'IFERROR(1/0,"错误")', "错误", "错误"],
  ["VLOOKUP", 'VLOOKUP("12 月",明细!A2:D13,4,FALSE)', 30000, "30000"],
  ["INDEX", "INDEX(明细!D2:D13,3)", 30000, "30000"],
  ["MATCH", 'MATCH("12 月",明细!A2:A13,0)', 3, "3"],
  ["TEXTJOIN", 'TEXTJOIN("、",TRUE,明细!A2:A4)', "10 月、11 月、12 月", "10 月、11 月、12 月"],
  ["LET", "LET(x,明细!B4,y,2,x*y)", 204000, "204000"],
  ["FILTER", "FILTER(明细!D2:D13,明细!D2:D13=45000)", 45000, "45000"],
];
checks.forEach(([name, formula, , expected], index) => {
  const row = summary.getRow(index + 11);
  row.getCell(1).value = name;
  row.getCell(1).font = { name: "Consolas", size: 10, bold: true };
  row.getCell(2).value = { formula };
  row.getCell(2).numFmt = "#,##0.00";
  row.getCell(2).alignment = { horizontal: "right" };
  row.getCell(3).value = expected;
  row.getCell(3).font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF8BA79A" } };
  row.getCell(3).alignment = { horizontal: "right" };
  row.height = 24;
});

await wb.xlsx.writeFile(out);
console.log("written", out);

