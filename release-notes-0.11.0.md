# Soroban 0.11.0 · xlsx 自包含

发布日期：2026-11-27

## 这一版改了什么

- **图表、条件格式、打印设置写进 xlsx 本身**。保存时在标准 `docProps/custom.xml` 写入 `SorobanData` 自定义属性，补全 Content Types 与 package relationship；Excel 仍按普通 xlsx 打开，Soroban 重开可恢复。
- **换路径、换机器、清浏览器数据都不丢**。不再把文档路径当唯一键；打开文件先读 xlsx 内元数据，再水合本地状态。旧版只存 localStorage 的文档仍可读，保存一次即迁移。
- **外部自定义属性一并保留**。保存桥会重新生成 xlsx，0.11.0 在嵌入前把原文件 `docProps/custom.xml` 里的其他属性并回来，SorobanData 取下一个空 pid。实测 `团队`（pid 2）与 `SorobanData`（pid 3）共存。
- **保存临时文件改用通用 `.tmp` / `.bak`**。不再出现品牌专属临时后缀；原子替换与失败回滚保持不变。
- **保存提示更明确**：toast 写“图表与条件格式已写入 xlsx”。

## 验收

- 1 个柱状图 + 1 条色阶 + 打印 A1:C13 / 90%，保存为 10,364 B 的 `M13-元数据.xlsx`；清空全部 `soroban:*` localStorage 后重开，三项全部恢复，dirty=false。
- 18 个 ZIP 条目、全部 XML / rels 解析 0 错误；`docProps/custom.xml` 含 1 个 `SorobanData` 属性；SheetJS 可读两张工作表。
- 预置 `团队` 自定义属性后保存，`团队`（pid 2）+ `SorobanData`（pid 3）共存，pid 不重复。
- M0 / M2 / M12 条件格式 / M4 打印回归通过；MCP 4 工具、`version 0.11.0`；`cargo test` 7 passed；控制台 0 错误。

## 已知边界

- 自定义属性按标准 OPC 写入，设计上 Excel 会保留；本轮未用真实 Excel 打开验证，只用 SheetJS 验证工作簿可解析。Excel 不渲染 Soroban 浮动图表卡；条件格式样式本身可见。
- 第三方工具重写 xlsx 若删除自定义属性，图表 / 打印设置会丢；单元格数据、公式和已应用的条件格式样式仍在。
- 不建旁挂历史目录或版本时间线。

## 文件格式

- 原生保存：标准 `.xlsx`，无旁挂 `.soroban.json`、无 `.soroban-history/`。
- 导入 / 导出：`.xlsx` / `.csv`。
- 内部临时文件：同目录 `.xlsx.tmp` / `.xlsx.bak`，保存结束即清理。

*小方工作室 · Soroban · 0.11.0 ｜ Papyra 办公套件*
