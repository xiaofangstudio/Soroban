import ExcelJS from "@zwight/exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "M3-整理.xlsx");
const csvOut = path.join(root, "assets", "M3-订单.csv");

const orders = [
  ["SO-1001", "华强电子", "深圳", 128000, "已完成", "王敏"],
  ["SO-1002", "南山科技", "深圳", 96500, "进行中", "李然"],
  ["SO-1003", "南山,智造", "深圳", 214000, "已完成", "王敏"],
  ["SO-1004", "莞城五金", "东莞", 73500, "待发货", "陈可"],
  ["SO-1005", "珠江物流", "广州", 156800, "已完成", "李然"],
  ["SO-1006", "前海数据", "深圳", 182000, "进行中", "周原"],
  ["SO-1007", "佛山照明", "佛山", 64200, "已取消", "陈可"],
  ["SO-1008", "惠州电池", "惠州", 118000, "已完成", "王敏"],
  ["SO-1009", "龙岗精密", "深圳", 88500, "待发货", "周原"],
  ["SO-1010", "珠海模组", "珠海", 135600, "进行中", "李然"],
  ["SO-1011", "宝安包装", "深圳", 42100, "已完成", "陈可"],
  ["SO-1012", "中山灯饰", "中山", 76800, "待发货", "王敏"],
  ["SO-1013", "盐田港务", "深圳", 198500, "进行中", "周原"],
  ["SO-1014", "肇庆陶瓷", "肇庆", 53400, "已取消", "陈可"],
  ["SO-1015", "光明材料", "深圳", 149000, "已完成", "李然"],
  ["SO-1016", "松山湖软件", "东莞", 268000, "进行中", "周原"],
  ["SO-1017", "广州港", "广州", 112400, "已完成", "王敏"],
  ["SO-1018", "坪山装备", "深圳", 173600, "进行中", "李然"],
];

const wb = new ExcelJS.Workbook();
wb.creator = "小方工作室";
wb.created = new Date("2026-11-24T00:00:00Z");

const sheet = wb.addWorksheet("订单", { properties: { defaultRowHeight: 24 } });
sheet.columns = [
  { key: "id", width: 12 },
  { key: "customer", width: 18 },
  { key: "city", width: 10 },
  { key: "amount", width: 14 },
  { key: "status", width: 11 },
  { key: "owner", width: 10 },
  { key: "profit", width: 14 },
];

sheet.addRow(["订单号", "客户", "城市", "金额", "状态", "负责人", "毛利"]);
for (const [id, customer, city, amount, status, owner] of orders) {
  const row = sheet.addRow([id, customer, city, amount, status, owner, null]);
  row.getCell(7).value = { formula: `D${row.number}*0.32`, result: Math.round(amount * 0.32) };
  row.getCell(4).numFmt = "#,##0";
  row.getCell(7).numFmt = "#,##0";
}

sheet.addRow([]);
const totalRow = sheet.addRow(["合计", null, null, null, null, null, null]);
totalRow.getCell(4).value = { formula: "SUM(D2:D19)", result: orders.reduce((sum, row) => sum + row[3], 0) };
totalRow.getCell(7).value = { formula: "SUM(G2:G19)", result: orders.reduce((sum, row) => sum + Math.round(row[3] * 0.32), 0) };
totalRow.font = { bold: true };

for (let col = 1; col <= 7; col += 1) {
  const cell = sheet.getCell(1, col);
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
sheet.getRow(1).height = 30;

const summary = wb.addWorksheet("区域汇总", { properties: { defaultRowHeight: 24 } });
summary.columns = [{ width: 16 }, { width: 16 }, { width: 18 }];
summary.addRow(["指标", "结果", "说明"]);
summary.addRow(["订单总额", { formula: "SUM(订单!D2:D19)", result: orders.reduce((sum, row) => sum + row[3], 0) }, "18 笔订单"]);
summary.addRow(["已完成额", { formula: "SUMIF(订单!E2:E19,\"已完成\",订单!D2:D19)", result: orders.filter((row) => row[4] === "已完成").reduce((sum, row) => sum + row[3], 0) }, "按状态汇总"]);
summary.addRow(["最大单笔", { formula: "MAX(订单!D2:D19)", result: Math.max(...orders.map((row) => row[3])) }, "松山湖软件"]);
summary.addRow(["深圳订单", { formula: "SUMIF(订单!C2:C19,\"深圳\",订单!D2:D19)", result: orders.filter((row) => row[2] === "深圳").reduce((sum, row) => sum + row[3], 0) }, "按城市汇总"]);

for (let col = 1; col <= 3; col += 1) {
  const cell = summary.getCell(1, col);
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
summary.getColumn(2).numFmt = "#,##0";

await wb.xlsx.writeFile(out);

const csvRows = [
  ["订单号", "客户", "城市", "金额", "状态", "负责人", "备注"],
  ["SO-2001", "深圳,南山", "深圳", "128000", "已完成", "王敏", "优先排产"],
  ["SO-2002", "东莞五金", "东莞", "73500", "进行中", "陈可", "含税"],
  ["SO-2003", "A \"quote\" 客户", "广州", "156800", "已完成", "李然", "备注一\n备注二"],
];
const escape = (value) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
fs.writeFileSync(csvOut, csvRows.map((row) => row.map(escape).join(",")).join("\r\n"), "utf8");
console.log(out);
console.log(csvOut);
