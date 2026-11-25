import ExcelJS from "@zwight/exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "M4-打印.xlsx");

const cities = ["深圳", "广州", "东莞", "佛山", "珠海", "惠州", "中山", "肇庆"];
const customers = ["华强电子", "南山科技", "莞城五金", "珠江物流", "前海数据", "佛山照明", "惠州电池", "珠海模组", "宝安包装", "松山湖软件"];
const products = ["控制板", "传感器", "连接器", "电源模块", "结构件", "线束组件", "散热模组", "测试夹具"];
const owners = ["王敏", "李然", "陈可", "周原", "赵岚"];
const states = ["已完成", "进行中", "待发货", "已取消"];

const rows = [];
let seed = 20261125;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
for (let index = 1; index <= 80; index += 1) {
  const quantity = 20 + Math.floor(rand() * 180);
  const price = 320 + Math.floor(rand() * 1800);
  const amount = quantity * price;
  const day = String(1 + ((index * 3) % 28)).padStart(2, "0");
  rows.push([
    `SO-26${String(index).padStart(3, "0")}`,
    customers[index % customers.length],
    cities[index % cities.length],
    products[index % products.length],
    quantity,
    price,
    amount,
    states[index % states.length],
    owners[index % owners.length],
    `2026-11-${day}`,
    index % 7 === 0 ? "加急，客户要求分两批发货" : index % 5 === 0 ? "含税，月结 30 天" : "",
  ]);
}

const wb = new ExcelJS.Workbook();
wb.creator = "小方工作室";
wb.created = new Date("2026-11-25T00:00:00Z");
const sheet = wb.addWorksheet("月度订单", { properties: { defaultRowHeight: 24 } });
sheet.columns = [
  { width: 12 },
  { width: 18 },
  { width: 9 },
  { width: 16 },
  { width: 8 },
  { width: 11 },
  { width: 14 },
  { width: 10 },
  { width: 10 },
  { width: 13 },
  { width: 24 },
];
sheet.addRow(["订单号", "客户", "城市", "产品", "数量", "单价", "金额", "状态", "负责人", "日期", "备注"]);
for (const row of rows) {
  const added = sheet.addRow([...row, null]);
  added.getCell(7).value = { formula: `E${added.number}*F${added.number}`, result: row[6] };
  added.getCell(6).numFmt = "#,##0";
  added.getCell(7).numFmt = "#,##0";
}
const total = sheet.addRow(["合计", null, null, null, rows.reduce((sum, row) => sum + row[4], 0), null, rows.reduce((sum, row) => sum + row[6], 0), null, null, null, `${rows.length} 笔`]);
total.font = { bold: true };
total.getCell(5).numFmt = "#,##0";
total.getCell(7).numFmt = "#,##0";

for (let col = 1; col <= 11; col += 1) {
  const cell = sheet.getCell(1, col);
  cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9F6E" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
sheet.getRow(1).height = 30;
sheet.views = [{ state: "frozen", ySplit: 1 }];

await wb.xlsx.writeFile(out);
console.log(out);
