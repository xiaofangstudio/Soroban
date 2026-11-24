import ExcelJS from "@zwight/exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "M2-图表.xlsx");

const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const sales = [128000, 143000, 121000, 168000, 156000, 182000, 174000, 159000, 196000, 188000, 205000, 221000];
const cost = [74000, 83000, 72000, 96000, 90000, 104000, 99000, 92000, 111000, 108000, 117000, 126000];
const target = 180000;

const wb = new ExcelJS.Workbook();
wb.creator = "小方工作室";
wb.created = new Date("2026-11-24T00:00:00Z");

const sheet = wb.addWorksheet("月度", {
  views: [{ state: "frozen", ySplit: 1 }],
  properties: { defaultRowHeight: 24 },
});
sheet.columns = [
  { key: "month", width: 11 },
  { key: "sales", width: 15 },
  { key: "cost", width: 15 },
  { key: "profit", width: 15 },
  { key: "target", width: 15 },
  { key: "rate", width: 12 },
];

sheet.addRow(["月份", "销售额", "成本", "毛利", "目标", "完成率"]);
for (let i = 0; i < 12; i++) {
  const row = sheet.addRow([
    months[i],
    sales[i],
    cost[i],
    null,
    target,
    null,
  ]);
  row.getCell(4).value = { formula: `B${row.number}-C${row.number}`, result: sales[i] - cost[i] };
  row.getCell(6).value = { formula: `B${row.number}/E${row.number}`, result: sales[i] / target };
  row.getCell(6).numFmt = "0.0%";
}

sheet.addRow([]);
sheet.addRow(["合计", null, null, null, null, null]);
const totalRow = sheet.lastRow;
totalRow.getCell(2).value = { formula: "SUM(B2:B13)", result: sales.reduce((a, b) => a + b, 0) };
totalRow.getCell(3).value = { formula: "SUM(C2:C13)", result: cost.reduce((a, b) => a + b, 0) };
totalRow.getCell(4).value = { formula: "SUM(D2:D13)", result: sales.reduce((a, b) => a + b, 0) - cost.reduce((a, b) => a + b, 0) };

for (let col = 1; col <= 6; col++) {
  const cell = sheet.getCell(1, col);
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
for (let row = 2; row <= 15; row++) {
  sheet.getCell(row, 2).numFmt = "#,##0";
  sheet.getCell(row, 3).numFmt = "#,##0";
  sheet.getCell(row, 4).numFmt = "#,##0";
  sheet.getCell(row, 5).numFmt = "#,##0";
}
sheet.getRow(1).height = 30;
sheet.getRow(15).font = { bold: true };

const summary = wb.addWorksheet("复盘", { properties: { defaultRowHeight: 24 } });
summary.columns = [{ width: 16 }, { width: 16 }, { width: 30 }];
summary.addRow(["指标", "结果", "说明"]);
summary.addRow(["全年销售额", { formula: "SUM(月度!B2:B13)", result: sales.reduce((a, b) => a + b, 0) }, "12 个月合计"]);
summary.addRow(["全年毛利", { formula: "SUM(月度!D2:D13)", result: sales.reduce((a, b) => a + b, 0) - cost.reduce((a, b) => a + b, 0) }, "销售额减成本"]);
summary.addRow(["最高月", { formula: "MAX(月度!B2:B13)", result: Math.max(...sales) }, "11 月"]);
summary.addRow(["达标月数", { formula: "COUNTIF(月度!B2:B13,\">=\"&180000)", result: sales.filter((v) => v >= target).length }, "目标 18 万"]);
for (let col = 1; col <= 3; col++) {
  const cell = summary.getCell(1, col);
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
summary.getColumn(2).numFmt = "#,##0";

await wb.xlsx.writeFile(out);
console.log(out);
