import ExcelJS from "@zwight/exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "M0-样本.xlsx");

const wb = new ExcelJS.Workbook();
wb.creator = "小方工作室";
wb.created = new Date("2026-11-24T00:00:00Z");

const sales = wb.addWorksheet("销售", {
  views: [{ state: "frozen", ySplit: 3 }],
  properties: { defaultRowHeight: 22 },
});
sales.columns = [
  { key: "month", width: 14 },
  { key: "amount", width: 18 },
  { key: "cost", width: 18 },
  { key: "profit", width: 18 },
  { key: "note", width: 26 },
];
sales.mergeCells("A1:E1");
sales.getCell("A1").value = "2026 年第四季度销售台账";
sales.getCell("A1").font = { name: "Microsoft YaHei", size: 16, bold: true, color: { argb: "FF0E9F6E" } };
sales.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
sales.getRow(1).height = 34;

const heads = ["月份", "销售额", "成本", "毛利", "备注"];
heads.forEach((h, i) => {
  const cell = sales.getCell(2, i + 1);
  cell.value = h;
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD8E2DC" } },
    left: { style: "thin", color: { argb: "FFD8E2DC" } },
    bottom: { style: "thin", color: { argb: "FFD8E2DC" } },
    right: { style: "thin", color: { argb: "FFD8E2DC" } },
  };
});

const data = [
  ["10 月", 128000, 74000, "=B3-C3", "老客户续约"],
  ["11 月", 156400, 88200, "=B4-C4", "新增两家渠道"],
  ["12 月", 189300, 101500, "=B5-C5", "年末冲刺"],
];
data.forEach((row, r) => {
  row.forEach((value, c) => {
    const cell = sales.getCell(3 + r, c + 1);
    cell.value = value;
    cell.font = { name: "Microsoft YaHei", size: 11 };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD8E2DC" } },
      left: { style: "thin", color: { argb: "FFD8E2DC" } },
      bottom: { style: "thin", color: { argb: "FFD8E2DC" } },
      right: { style: "thin", color: { argb: "FFD8E2DC" } },
    };
    if (c === 1 || c === 2) cell.numFmt = '#,##0.00';
    if (c === 3) cell.numFmt = '#,##0.00';
    if (c === 1) cell.alignment = { horizontal: "left", vertical: "middle" };
  });
});

sales.getCell("A6").value = "合计";
sales.getCell("A6").font = { name: "Microsoft YaHei", size: 11, bold: true };
sales.getCell("B6").value = "=SUM(B3:B5)";
sales.getCell("C6").value = "=SUM(C3:C5)";
sales.getCell("D6").value = "=SUM(D3:D5)";
for (const col of ["B", "C", "D"]) {
  const cell = sales.getCell(`${col}6`);
  cell.numFmt = '#,##0.00';
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAFAF3" } };
}

const detail = wb.addWorksheet("明细");
detail.columns = [
  { key: "no", width: 8 },
  { key: "date", width: 16 },
  { key: "client", width: 24 },
  { key: "amount", width: 16 },
  { key: "status", width: 14 },
];
["序号", "日期", "客户", "金额", "状态"].forEach((h, i) => {
  const cell = detail.getCell(1, i + 1);
  cell.value = h;
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FF16241D" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3F4E6" } };
});
const clients = ["南山科技", "前海数据", "方岛设计", "康岛物流", "深圳湾智造"];
for (let i = 0; i < 12; i += 1) {
  const row = detail.getRow(i + 2);
  row.getCell(1).value = i + 1;
  row.getCell(2).value = new Date(2026, 9, 1 + i);
  row.getCell(2).numFmt = "yyyy-mm-dd";
  row.getCell(3).value = clients[i % clients.length];
  row.getCell(4).value = 12000 + i * 3500;
  row.getCell(4).numFmt = '#,##0';
  row.getCell(5).value = i % 3 === 0 ? "已回款" : "待到账";
}

await wb.xlsx.writeFile(out);
console.log("fixture written:", out);
