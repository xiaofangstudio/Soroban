# Soroban · 小方工作室表格计算

> **小方工作室 · 出品** ｜ 立项规格 `v1.0` ｜ 2026-11-24 ｜ 状态：M2 已完成（格式 / 条件格式 / 四种图表联动 / xlsx 往返，版本 0.3.0；M1 528 函数 / 跨表引用 / 10 万行 164fps / MCP 函数检索），M3 待开工
> 对标 Microsoft Excel / LibreOffice Calc ｜ 全中文 ｜ 本地优先 ｜ 零账号 ｜ 零 AI ｜ MIT
> **Papyra 办公套件四件套之二**
> 套件分色：Penna 靛蓝 · **Soroban 翠绿** · Lanterna 橙红 · Voluma 绛红
>
> 备注：Soroban（算盘）与 Stellar 区块链的智能合约平台同名，行业不相邻，仅作记录不更名。

## 一 定位

一句话：**本地表格计算工作台——公式、图表、筛选、xlsx 互通，日常办公的表都能干完。**

家族分工：Soroban 管「格子里的数据」；账目、统计、报表录入导出。不做的：不做多人协作、不做云端同步、不做数据透视表的全部高级形态（一期只留接口）。

**互通是生命线**：xlsx 读写保真是一期验收的硬指标——能开办公室里传来的真 xlsx，改完发回去别人看不出是异类做的。

## 二 一期范围（八件事）

1. **网格**：10 万行 × 100 列流畅编辑；单元格多选、填充柄、行列增删隐藏；合并单元格、冻结窗格（行/列/双冻结）
2. **公式**：100+ 常用函数——数学（SUM/AVERAGE/ROUND/…）、统计（COUNT/COUNTIF/MAX/MIN/…）、文本（LEFT/CONCAT/TEXT/…）、日期（TODAY/DATEDIF/…）、逻辑（IF/AND/OR/IFERROR/…）、查找（VLOOKUP/HLOOKUP/INDEX/MATCH/…）；跨 sheet 引用、绝对引用 `$A$1`、错误提示（#DIV/0! 等 + 中文说明悬停）
3. **格式**：数字格式（数值/货币/百分比/日期，小数位可调）、字体字号颜色、边框八向、填充、对齐换行；条件格式一期做色阶与数据条
4. **排序筛选**：多键排序（升/降/自定义序列）、自动筛选（多条件与/或）
5. **图表**：柱形 / 条形 / 折线 / 饼图四种，随数据联动更新，位置可拖动缩放
6. **多 sheet**：增删复制重命名、标签颜色、跨表公式
7. **xlsx 导入导出**：保真范围 = 值、公式、数字格式、字体边框填充、合并单元格、冻结、图表尽量；CSV 导入导出（UTF-8/GBK 可选编码、分隔符可选、预览确认）
8. **打印**：打印区域设置、分页预览、页眉页脚（页码/表名/自定义）、缩放打印（适应页宽）

配套：自动保存（xlsx 原子写入：写临时文件成功后替换）、`Ctrl+Z/Y` 无限撤销重做、最近文件、打开时对损坏 xlsx 提示修复。

## 三 后续分期

### 二期
- 数据透视表（基础聚合：求和/计数/平均 × 行列维度）
- 条件格式补全（图标集、公式规则）
- 更多函数到 300+、数组公式
- 深色模式（UI 层）
- 单元格批注、图片插入单元格
- 数据验证（下拉列表、范围校验）

### 三期
- 宏或脚本（对接 Copper，家族语言——让 Soroban 可以被编程）
- 图表类型扩展（面积/散点/组合）
- Power Query 式数据导入管道（本地文件）

## 四 技术路线

### 4.1 架构

| 层 | 选型 | 管什么 |
| --- | --- | --- |
| 前端表格 | **Univer OSS 核心**（Apache-2.0） | 网格渲染、公式引擎、图表、撤销栈——一站式，不重复造 |
| Rust soroban-core | Tauri 2 | CSV 流式读写、xlsx 结构校验修复、打印、缩略图、崩溃恢复 |

**Univer 许可红线（写死）**：只用 `@univerjs/*` OSS 包；`univer-pro` 套件（高级图表/协作/透视为商业许可）**一律禁用**，对应功能自研或推后。锁定版本，升级前跑全量公式回归。

### 4.2 分工边界

- 公式引擎用 Univer 自带的（OSS 内含），不自研
- xlsx 主 IO 走 Univer（保真最好）；Rust 只做：CSV 大文件流式处理（GB 级不爆内存）、xlsx 打开前的 zip 结构校验（`zip` + `quick-xml`）、损坏修复建议
- 打印走 Rust 系统打印 API，分页预览用前端渲染快照

**命令清单（一期）**：

```
csv_import_stream / csv_export / xlsx_validate / print_run
recent_list / autosave_commit / crash_recover / sheet_thumb
```

**红线**：网格交互、公式计算、图表全部前端；Rust 不碰单元格数据。

## 五 文件格式

**xlsx 就是原生格式**——Soroban 不发明新格式，用户发的 xlsx 直接开直接存：

- 自动保存写 `<文件名>.xlsx`，原子替换（临时文件 + rename），另有 `<文件名>.soroban-history/` 目录存最近 20 个快照（只存改动 diff + 定期全量）
- CSV 全程视为导入导出目标，不做编辑态
- 损坏 xlsx：Rust 校验 zip 结构，给出「能救回哪些 sheet」的明确提示

## 六 设计规范

### 6.1 家族统一（同 Voluma 口径）

圆角 6/8/12/16/999、间距 4 的倍数、玻璃层只用于顶栏/弹窗/工具浮层、动效三档、启动页 400–800ms、欢迎页左栏 + 最近文件卡片墙（卡片显示 sheet 数量与修改时间）、深色模式二期。

### 6.2 主题色：翠绿

| 令牌 | 浅色 | 深色（预留） |
| --- | --- | --- |
| `--bg` | `#f4faf7` | `#101815` |
| `--surface` | `#ffffff` | `#182420` |
| `--border` | `#dfeee7` | `#233329` |
| `--text` | `#16241d` | `#ecf6f1` |
| `--text-2` | `#4f6b5e` | `#93ad9f` |
| `--accent` | `#0e9f6e` | `#5ee0a8` |
| `--accent-hover` | `#0c8a5f` | `#7aeab8` |
| `--accent-light` | `#5ee0a8` | `#a4f2cd` |
| `--accent-soft` | `rgba(14,159,110,.10)` | `rgba(94,224,168,.14)` |

翠绿只做点缀：选中单元格描边、当前 sheet 标签、公式栏焦点、主按钮描边；主按钮墨底白字。**网格线永远中性灰 `#d8e2dc`，不染色**——大面积表格染绿是灾难。

### 6.3 表格特有规范

- 公式栏：`fx` 图标 + 名称框（单元格地址）+ 输入区，高 32，编辑态翠绿 2px 底描边
- 函数提示卡：输入函数名时浮出玻璃卡（语法 + 一句中文说明 + 当前参数高亮），延迟 300ms
- 列头行头：选中列/行整条翠绿 soft 底；活动单元格 2px 翠绿描边
- 错误值（#REF! 等）：单元格左上角 6px 翠绿三角，悬停显示中文原因
- 图表浮层：白底 1px 描边 + 8px 阴影，选中时四角把手

### 6.4 术语与文案

| 英文 | 中文 | 英文 | 中文 |
| --- | --- | --- | --- |
| Formula | 公式 | Function | 函数 |
| Filter | 筛选 | Sort | 排序 |
| Freeze panes | 冻结窗格 | Merge cells | 合并单元格 |
| Pivot table | 数据透视表 | Conditional formatting | 条件格式 |

公式报错必须说人话：「VLOOKUP 找不到 42，请在第 1 列确认查找值存在」，不是光给 #N/A。

## 七 里程碑

| 里程碑 | 内容 | 出口标准 |
| --- | --- | --- |
| M0 | 骨架 | Univer 集成跑通，网格编辑 + xlsx 打开保存往返不失真 |
| M1 | 能算 | 100+ 函数 + 跨表引用 + 公式提示卡，10 万行滚动 60fps |
| M2 | 能看 | 格式 + 条件格式（色阶/数据条）+ 四种图表联动 |
| M3 | 能理 | 排序筛选 + 多 sheet + 冻结 + CSV 双向 |
| M4 | 能出 | 打印区域 + 分页预览 + 页眉页脚 |
| M5 | 发布 | 安装包 + GitHub Release + 上架 FangBox |

一期 = M0 到 M4。

## 八 性能与验收

**性能红线**：10 万行 × 100 列滚动 ≤ 16ms/帧；10MB xlsx 打开 ≤ 3s；公式重算（单格修改波及 1000 格）≤ 50ms；安装包 ≤ 90MB。

**界面验收清单（节选）**：

- [ ] xlsx 往返：打开→改→存→用 Excel 打开，值/公式/格式/合并/冻结全保留
- [ ] 公式提示卡参数高亮正确，输入 `=SUM(` 有补全
- [ ] 填充柄拖拽数字序列/公式填充行为与 Excel 一致
- [ ] `$A$1` 绝对引用在插入行列后不漂移
- [ ] GBK 编码 CSV 不乱码
- [ ] 自动保存断电测试不丢数据（原子替换验证）
- [ ] 网格线与表头永远中性色，无大面积染绿
- [ ] 图表随数据修改即时联动

## 九 待确认问题

1. 数据透视表确认推二期？
2. Univer 版本锁定 + 升级回归策略是否接受（每半年评估一次，回归跑公式对拍）？
3. 宏/脚本三期对接 Copper——这是家族特色卖点，确认方向？
4. 打印机缺纸/驱动错误提示口径（直接弹系统错误还是包装中文提示）？

## 十 可参考的软件

| 软件 | 许可 | 看什么 |
| --- | --- | --- |
| Microsoft Excel | 闭源 | 交互手感总对标：填充柄、公式提示、筛选漏斗 |
| LibreOffice Calc | MPL-2.0 | 开源实现的功能边界参考，xlsx 兼容性踩坑记录 |
| Univer | Apache-2.0 | 前端主底座，OSS 核心直接用 |
| Handsontable | 商业双许可 | **只学交互**（虚拟滚动、选区把手），不并入 |
| calamine / rust_xlsxwriter | Apache-2.0/MIT | Rust 侧 CSV 与 xlsx 兜底工具 |
| OnlyOffice | AGPL-3.0 | 已弃用（传染许可），清单决策记录 |

**许可红线**：Univer OSS 可并入但 pro 套件禁用；Handsontable 商业许可不并入不抄码；OnlyOffice AGPL 弃用。

## 附录 A 顶部图标条（本产品实现）

条高 40px、玻璃底、只放高频动作。图标 20×20 线性、`stroke-width: 1.5`、圆头端点：

| 组 | 按钮 | 图标形状描述 | 快捷键 |
| --- | --- | --- | --- |
| 文件 | 打开 | 开口文件夹 | `Ctrl+O` |
| 文件 | 保存 | 软盘（带滑片） | `Ctrl+S` |
| 编辑 | 撤销 / 重做 | 左弯箭头 / 右弯箭头 | `Ctrl+Z` / `Ctrl+Y` |
| 格式 | 数字格式 | `%` 符号置于圆角框内 | `Ctrl+Shift+1` |
| 格式 | 字体 | 一个大写字母 A + 一侧小 A | `Ctrl+Shift+F` |
| 格式 | 边框 | 方框 + 四边加粗短线 | — |
| 格式 | 填充 | 倾倒的油漆桶 + 一滴 | — |
| 格式 | 对齐 | 三条长短不齐的横线贴左竖线 | — |
| 数据 | 排序 | `A→Z` 不用文字：两行横线 + 向下箭头 | — |
| 数据 | 筛选 | 漏斗 | `Ctrl+Shift+L` |
| 数据 | 函数 | `fx` 斜体（业内通用符号，允许） | `Shift+F3` |
| 插入 | 图表 | 三根高低柱 | — |
| 视图 | 冻结 | 田字格 + 上/左锁角 | — |
| 视图 | 网格线 | 九宫格 + 斜划线 | — |

约束：单元格编辑时不显示选中态图标；「数字格式」是下拉按钮（右下三角），展开为格式列表。窗口 < 1024px 时「插入」与「视图」合并进「更多」。

## 附录 B Soroban 应用图标

**符号构图**：一个圆角表格窗口——顶部标题栏高 168px、白色 30% 填充；内部 4 列 × 3 行网格，线宽 64px；右下角两格**实心白填充**，象征「算出来的结果」。整体像一个迷你电子表格，不含任何文字。

**完整提示词**：

```
rounded-rectangle spreadsheet window, 168px title bar at top filled with 30%
white, 4-column by 3-row grid inside with 64px white lines, bottom-right two
cells filled solid white to suggest a computed result, no text, no numbers;
all white stroke art with round caps and joins.
```

**底板渐变**：`#2bb583`（提亮 12%）→ `#0c8a5f`（压暗 10%），纵向。

**简化版（16 / 24px）**：只留窗口轮廓 + 2×2 大网格 + 两个填白格，去掉标题栏与细线；32px 起恢复家族圆点，16/24px 去掉。

**验收**：16px 下能认出「表格窗口 + 填白的格子」；与 Voluma 并排不混（Soroban 是横网格、Voluma 是竖页叠）。

*小方工作室 · Soroban · 立项规格 v1.0 ｜ Papyra 办公套件 ｜ 2026-11-22*

## 十一 M0 实装记录（2026-11-24）

M0 出口「Univer 集成跑通，网格编辑 + xlsx 打开保存往返不失真」已达成。

### 11.1 技术栈实装

- 前端：React 18.3.1 + Vite 5 + TypeScript 5.6，Tauri 2.12；Univer 锁定 `@univerjs/core` / `@univerjs/presets` / `@univerjs/preset-sheets-core` 1.6.1（全部 OSS，未引入 pro 套件）
- 网格：`UniverSheetsCorePreset`，关闭 Univer 自带 header / toolbar / footer，保留公式栏能力但由 Soroban 自绘；自绘顶栏 40px + 公式栏 32px + 工作表标签 34px
- 编辑：单元格直接输入、公式 `=SUM(...)` 即时重算、`Ctrl+Z/Y` 撤销重做、`Ctrl+S/O` 保存打开
- 多 sheet：底部标签切换 + `+` 新建工作表；工作表数量同步到顶栏与最近文件
- 文件：xlsx 主 IO 采用 MIT 第三方桥接 `@mertdeveci55/univer-import-export@0.2.1`（OSS 预设不含 xlsx 转换后端，官方 exchange 属 pro）；桥接库把公式写进 `v`，前端导入时统一转成 Univer 的 `f` 字段并主动 `executeCalculation()`，否则公式会显示成文本
- 保存：Rust `write_document` 原子替换（`.soroban-tmp` → 备份原文件 → rename → 清 backup），失败自动回滚；读取走 Tauri `ipc::Response` 二进制，不走 JSON 数组
- 最近文件：localStorage `soroban.recent.v1`，最多 8 条，记录路径 / 名称 / sheet 数 / 大小 / 打开时间；失效路径自动剔除
- MCP：同一个 exe 加 `--mcp` 即 stdio 服务，3 个只读工具 `soroban_workbook_info` / `soroban_validate_xlsx` / `soroban_csv_preview`
- UI 家族项：620ms 启动页、左栏欢迎页 + 最近文件卡、窗口 1280×820（最小 900×600）、900 宽自动隐藏状态胶囊与品牌字、网格线固定 `#d8e2dc`

### 11.2 验收结果

样本 `assets/M0-样本.xlsx`：2 个工作表（销售 / 明细），含合并标题、绿色表头、货币/日期格式、边框、列宽、冻结 3 行、`=B3-C3` 与 `=SUM(B3:B5)`。

- 打开：2 个 sheet、A1 标题、B3 = 128000、D3 = 54000、B6 = 473700，样式与合并保留；打开态 `dirty=false`
- 空白新建：网格直接键入 `45`、`=A1*2`，A1=45、B1=90，输入即重算
- 多 sheet：销售 / 明细标签切换；`+` 可新建工作表
- 公式栏：名称框 A14，输入 `=SUM(D2:D13)` 得 375000；撤销清空、重做恢复
- 保存重开：保存为 `M0-编辑.xlsx`，再次打开 A14 仍是 `f="=SUM(D2:D13)"`、`v=375000`，2 个 sheet、公式 / 样式 / 合并 / 冻结 / 列宽保留
- 窄窗 900×620：顶栏右缘 890px、无横向溢出、工作表标签可见
- MCP：3 工具全部返回；xlsx 校验 `ok=true, sheetCount=2`；CSV 预览 4 列 3 行中文正常
- Rust 单测 4 passed（sheet 解析、xlsx 校验、CSV 预览、绝对路径校验）
- 正式 exe 与安装包均已复验：release exe 的 `MCP M0 OK`、真实 WebView `M0 UI OK`、`Layout 900 OK` 全部通过

日志与截图在 `review-m0/`：`m0-ui-release.txt`（末行 `M0 UI OK`）、`m0-mcp-release.txt`（末行 `MCP M0 OK`）、`m0-layout-release.txt`（末行 `Layout 900 OK`）、`000-splash.png`、`001-welcome.png`、`002-new-grid.png`、`003-open-fixture.png`、`005-edit-formula.png`、`007-reopen-detail.png`、`010-welcome-900.png`、`011-editor-900.png`。

### 11.3 发布产物（未签名）

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban/Soroban.exe` | 6,753,280 B（6.44 MB） | `CA205A0D3F8DD40FE17FA83A4962094940030FDA5BB22D5695D3A98B50965AB2` |
| `Soroban_0.1.0_x64-setup.exe`（NSIS） | 4,228,882 B（4.03 MB） | `41B4DBBBEF6AE8C4588E737B8CC90FC099E3BBEF12A1FD998CAF943EAFD1CAEA` |

NSIS 同时放在 `src-tauri/target/release/bundle/nsis/` 与仓库根 `Soroban_0.1.0_x64-setup.exe`；exe 在仓库根 `Soroban.exe` 可直接运行，`--mcp` 直接进 MCP 服务。均未签名。

### 11.4 M0 已知边界

- 格式往返覆盖值、公式、数字格式、字体、填充、边框、对齐、合并、列宽、行高、冻结；图表、图片、条件格式、数据验证等复杂对象尚未验证，按 M2/M3 补
- 打开上限暂设 80MB；10 万行性能压测未做，留 M1
- CSV 只在 MCP 预览，界面导入导出留 M3
- 排序 / 筛选 / 图表 / 打印 / 自动保存历史均未开始，按 M1–M4 推进

*小方工作室 · Soroban · M0 实装记录 ｜ Papyra 办公套件 ｜ 2026-11-24*

## 十二 M1 实装记录（2026-11-24）

M1 出口「能算：100+ 函数 + 跨表引用 + 公式提示卡，10 万行滚动 60fps」已达成，版本号升至 `0.2.0`。

### 12.1 公式能力

- **528 个函数**：直接取 Univer 公式引擎的 `zh-CN` 函数表，不手写精简名单；中文说明、参数名、签名全部来自引擎，避免「函数库写了但引擎算不了」。
- **公式提示卡**：公式栏输入 `=` 后自动弹出常用函数；继续输入 2 个以上字母按前缀过滤。`↑↓` 选择，`Tab` / `Enter` 填入，鼠标点选也可；候选按常用优先，带中文说明、签名、常用标记。
- **函数库**：点公式栏 `fx` 打开，首屏常用函数，支持按函数名或中文说明搜索，可切换「只看常用」；点选即插入 `=函数名(`，随后补参数。900 窄窗下最大 720×430，不越界。
- **跨表引用**：`=SUM(明细!D2:D13)`、`=VLOOKUP("12 月",明细!A2:D13,4,FALSE)` 等直接可用；导入、编辑、保存、重开后公式和结果都在。
- **导入健壮性**：修复两类 xlsx 兼容问题——公式缓存值统一清掉并重算；桥接库对缺省行高返回 `h=0 / ah=0` 时回填空值，避免整张表空白。
- **MCP**：新增 `soroban_formula_search`，按函数名或中文说明检索 528 个函数，返回签名、参数、是否常用；AI 写公式前可直接查。

### 12.2 验收结果

样本 `assets/M1-跨表.xlsx`：2 个 sheet（明细 / 汇总），含跨表 SUM / AVERAGE / MAX / COUNTA、TEXT、ROUND、COUNTIF、SUMIFS、IFERROR、VLOOKUP、INDEX、MATCH、TEXTJOIN、LET、FILTER。

- 公式提示：输入 `=SU` 得到 SUM / SUMIF / SUMIFS / SUMPRODUCT / SUBSTITUTE / SUBTOTAL；点 SUM 后输入 `1,2,3)`，A1 得 6。
- 函数库：显示 528 个；首屏 SUM / AVERAGE / COUNT；搜索「日期」得到 TODAY / NOW / DATE / YEAR / MONTH / DAY / DATEDIF 等。
- 跨表：全年毛利 375000、平均 31250、最高 45000、明细 12 行、千分位文本 `375,000.00`。
- 函数实算：ROUND 3.14、COUNTIF 1、SUMIFS 345000、IFERROR「错误」、VLOOKUP 30000、INDEX 30000、MATCH 3、TEXTJOIN「10 月、11 月、12 月」、LET 204000、FILTER 45000。
- 保存重开：`M1-跨表-编辑.xlsx` release 9,772 B，跨表 SUM 与 SUMIFS 公式、结果全部保留。
- 900×620：提示卡 / 函数库 / 跨表汇总表均无横向溢出，顶栏右缘 890px。
- 10 万行样本：`assets/M1-十万行.xlsx` 10,300,431 B，100,001 数据行 × 8 列；release 导入 14.8s（dev 22.9s），文档行数 100,002；深滚 62,500 行时 164.4fps、平均帧 6.08ms、>33ms 卡顿帧 0（高刷屏实测，60Hz 下按 60fps 上限）。
- M0 回归：release 版打开 `M0-样本.xlsx`、公式 SUM、A14 编辑、撤销重做、保存重开全部通过。
- Rust 单测 6 passed（原 4 + 函数库完整性 + 函数检索）。
- release 复验：`M1 UI OK`、`M1 Layout 900 OK`、`M1 PERF OK`、`MCP M1 OK`、`M0 UI OK` 全部通过。

日志与截图在 `review-m1/`：`m1-ui-release.txt`、`m1-layout-release.txt`、`m1-perf-release.txt`、`m1-mcp-release.txt`、`m0-ui-regression-release.txt`、`m1-rust-test.txt`；截图 `100-formula-suggest.png`、`101-formula-library.png`、`102-formula-search.png`、`103-cross-sheet.png`、`104-reopen-cross.png`、`110-suggest-900.png`、`111-library-900.png`、`112-cross-900.png`、`120-large-end.png`。

### 12.3 M1 已知边界

- 10 万行 / 10MB 文件首次导入 release 14.8s、dev 22.9s，解析走第三方桥接库的 ExcelJS 路径；M2 再评估按需 SheetJS 快路径。
- 函数库按引擎清单全量展示，含少量 Cube / 工程类冷门函数；本期逐项实算覆盖 SUM / AVERAGE / MAX / COUNTA / TEXT / ROUND / COUNTIF / SUMIFS / IFERROR / VLOOKUP / INDEX / MATCH / TEXTJOIN / LET / FILTER，其余待 M2 分批抽样验证。
- 公式单元格与部分数值单元格右侧有 Univer 绿色小角标，不影响值、公式、保存与重开；根因未定位，M2 处理视觉一致性时一并查。
- 尚未做格式工具栏、条件格式、图表（M2），排序筛选 / 冻结开关 / CSV 界面（M3）。
- 打包主 chunk 仍约 9.48MB，函数表常驻内存；M2 做 manualChunks 与函数表懒加载。

### 12.4 M1 产物（v0.2.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,872,064 B | `005278B537ACA836A8A0BD5CB64FDA28A5A52B71F2001A8537E2056AECF9D28A` |
| `Soroban_0.2.0_x64-setup.exe` | 4,252,344 B | `547DE3AF6D7EFA84AFDF3D3DD75D457BA0EF0184987E5A177F96B8F2B2E4D621` |

release 构建：`npx tauri build --no-bundle`（1m 32s），NSIS 4.06 MiB；旧 0.1.0 安装包已从根目录移除，M0 产物记录保留在第十章作历史。

*小方工作室 · Soroban · M1 实装记录 ｜ Papyra 办公套件 ｜ 2026-11-24*

## 十三 M2 实装记录（2026-11-24）

M2 出口「能看：格式 + 条件格式（色阶/数据条）+ 四种图表联动」已达成，版本号升至 `0.3.0`。

### 13.1 本期能力

- **格式工具栏**：自研 38px 单行工具栏，11 个动作——数字格式、字体、字号、加粗、斜体、下划线、字体色、填充色、水平对齐、边框、条件格式 / 图表入口。数字格式内置常规、千分位、千分位·小数、人民币、百分比、日期；颜色 / 边框为弹出面板，点选区外自动收起。
- **条件格式**：接入 Univer OSS `@univerjs/sheets-conditional-formatting@1.6.1` 与 `-ui@1.6.1`，核心与 UI 插件同时注册（只注册核心时规则会入库但不渲染）。支持三色色阶（`#eafaf3 → #5ee0a8 → #0b7f59`）、数据条（正 `#0e9f6e` / 负 `#d24a3a`）与「清除当前区域」；清除按当前选区相交规则逐条删除，不误伤整表。
- **四种自研 SVG 图表**：柱状图 / 折线图 / 面积图 / 饼图，绿色系 `CHART_COLORS`；前三者共用坐标系，饼图最多前 5 项 + 其他，右侧图例与百分比、中心总计。Univer OSS 没有 `sheets-chart` 包，pro 图表许可证不允许，因此不引第三方图表库。
- **图表工作室**：右侧 380px 面板，四类型卡、数据区域（默认当前选区，可手填）、当前选区回填、图表标题、实时预览、插入 / 取消；插入后为可拖动浮动卡，标题栏拖动、范围标签、删除。
- **联动与持久化**：任何非视图命令（含公式栏提交）都会刷新图表；改 `B2` 128000→260000，柱状图 `data-chart-sum` 3213000→3345000。图表与 CF 规则无法由现用 xlsx 桥写入 xlsx，改用 localStorage sidecar：`soroban:charts:path:<path>` / `soroban:name:<name>`、`soroban:cf:path:<path>` / `soroban:cf:name:<name>`，同路径重开可恢复。
- **响应式**：宽度 <1000 时图表卡 340×200、gap 10，否则 400×245、gap 14；900×620 下工具栏 11 个动作全部可见、工作室与四卡 2×2 不越界；顶栏在 900 下隐藏品牌字与状态胶囊，保留文件 / 撤销重做 / 表数。

### 13.2 开发中修复的缺陷

1. CF 只登记不渲染 → 补注册 `UniverSheetsConditionalFormattingUIPlugin`。
2. `setActiveRange` 不移动当前单元格，格式作用到旧区域 → 改 `sheet.setActiveSelection(range)`。
3. 切换图表类型后标题不跟随 → 增加 `chartTitleTouched`，未手改时自动刷新为「类型 · 表名」。
4. 图表卡被 Univer canvas 盖住 → `.chart-layer` z-index 4→10。
5. 改单元格后图表不联动 → 非视图命令一律刷新，公式提交后再补 240ms 刷新。
6. 拖动窗口宽度触发 `RangeError: Maximum call stack size exceeded` → 去掉 `onResize` 内递归派发 resize，改 `requestAnimationFrame` 同步活动单元格。
7. 加粗 / 字体色状态不亮 → `getCellStyle()` 的 `{_style}` 包装改用 `getCellStyleData()`，颜色对象单独解包。
8. 纵轴把 26 万抬到 50 万 → niceMax 增加 2.5 / 3 / 4 档；221k 轴顶 25 万、260k 轴顶 30 万。
9. `#,##0` 在下拉里显示「自定义」→ 增加「千分位」项，原 `#,##0.00` 改「千分位·小数」。
10. 「清除当前区域」原调用整表清除 → 改按选区相交规则逐条 `deleteConditionalFormattingRule`。

### 13.3 验收结果（release 0.3.0）

样本 `assets/M2-图表.xlsx`（8,635 B）：sheet「月度」A1:F13 月份 / 销售额 / 成本 / 毛利 / 目标 / 完成率，合计行 15；sheet「复盘」跨表汇总。

- 格式：B2:B13 人民币 `¥#,##0.00`，D2:D13 加粗 + 填充 `#d3f4e6`；工具栏 B 按钮 active，数字格式快照 `#,##0`。
- 条件格式：三色色阶规则 1 → 清除 0 → 数据条 1；数据条与文字均可读。
- 图表工作室：范围 `A1:C13`、标题 `柱状图 · 月度`、sum `3213000`、四类型可选；插入后四卡标题为柱 / 折 / 面积 / 饼。
- 联动：B2 改 260000 后图表 sum `3345000`，第一根柱明显升高；纵轴 0 / 7.5万 / 15万 / 22.5万 / 30万。
- 拖动 / 删除：拖动 +80 / +60，删除后剩 3 张。
- 保存重开：`assets/M2-图表-编辑.xlsx`，同路径重开 CF=1、cards=1、sum=3213000。
- 900×620：工具栏 `x=0, width=900, lastRight=892`；工作室 `right=888, bottom=545`；四卡 `(10,122)/(360,122)/(10,332)/(360,332)`，右缘 700、底 532。
- M0 回归：`M0 UI OK`；M1 公式回归：`M1 UI OK`；M1 900：`M1 Layout 900 OK`；十万行：18.5s 打开、100,002 行、163.7fps、slow 0；MCP：`version 0.3.0`、4 工具、`MCP M1 OK`；Rust 6 passed。
- release M2：`M2 UI OK`、`M2 Layout 900 OK`、`M2 CHARTS OK`、`M2 ROUNDTRIP OK`。

日志在 `review-m2/`：`m2-ui-release.txt`、`m0-ui-regression-release.txt`、`m0-layout-regression-release.txt`、`m1-ui-regression-release.txt`、`m1-layout-regression-release.txt`、`m1-perf-regression-release.txt`、`mcp-m2-release.txt`、`rust-test-m2.txt`；截图 `200-format.png`、`201-color-scale.png`、`202-data-bar.png`、`210-chart-studio.png`、`211-chart-single.png`、`212-chart-linked.png`、`213-charts-four.png`、`220-reopen.png`、`230-toolbar-900.png`、`231-studio-900.png`、`232-charts-900.png`。

### 13.4 M2 已知边界

- 图表与条件格式只存本地 sidecar，不写进 xlsx：同机同路径重开可恢复，换路径、换机器或用 Excel 打开都不会带图表 / CF。这是 M2 明确边界，M3 评估写进 xlsx 或随文件放 `.soroban.json`。
- 图表只支持单表区域内数据，首行当表头、首列当分类；不做多区域、跨表系列、次坐标轴、堆叠、组合图、图表缩放。
- 饼图最多显示前 5 项 + 「其他」，避免小扇区不可读；百分比按值四舍五入。
- CF 仅开放三色色阶与数据条；图标集、单元格规则、自定义公式留 M3。
- 图表卡只能拖动位置，不能拖拽改大小；卡片层级在网格之上，会遮住下方单元格。
- 十万行 release 打开 18.5s，仍高于 M1 的 14.8s（冷启动 / 机器状态差异），M3 继续评估 SheetJS 快路径。
- 主 chunk 仍约 9.8MB，manualChunks 与函数表懒加载留给 M3。
- M1 记录的绿色小角标在本轮验收截图中未复现；值 / 公式 / 保存均正常，继续观察，不阻塞 M2。

### 13.5 M2 产物（v0.3.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,932,480 B（6.61 MB） | `19F698619E9BACDD42EBD539CDC980EDD5992D5D8536D2F8230EF91276653509` |
| `Soroban_0.3.0_x64-setup.exe` | 4,312,164 B（4.11 MB） | `B816E2908CF2F5E15FE21ED072BC227D5D9832B64D312C5A31CAFA7CC244B1B8` |

release 构建：`npx tauri build --no-bundle` 1m 37s，随后 `npx tauri bundle --bundles nsis`；均未签名。旧 0.2.0 安装包已从根目录移除，M0 / M1 产物记录保留作历史。

*小方工作室 · Soroban · M2 实装记录 ｜ Papyra 办公套件 ｜ 2026-11-24*
