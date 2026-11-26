# Soroban · 小方工作室表格计算

> **小方工作室 · 出品** ｜ 立项规格 `v1.0` ｜ 2026-11-26 ｜ 状态：**0.10.0 条件格式补全**——三色图标集（绿 / 黄 / 红三档百分比分级）+ 公式规则（返回 TRUE 时淡黄底加粗）；0.9.0 数据透视（求和 / 计数 / 平均值 × 行列维度）；0.8.0 数据验证（下拉 / 数值 / 标准 xlsx 往返）；0.7.0 单元格工具（合并 / 九种边框 / 换行 / 垂直对齐 / 行列）；0.6.1 大表只画视口 / CSV 不选整块 / 打印预览与图表跳过屏外；0.6.0 查找替换 / 自动保存 / 自定义序列 / 标签颜色 / CSV 预览；0.5.1 多键排序 / 多条件筛选；M4 打印分页（0.5.0）；M3 排序筛选 / 多 sheet / CSV（0.4.0）；M2 格式 / 条件格式 / 四图表（0.3.0）；M1 528 函数 / 跨表 / 10 万行（0.2.0）
> 对标 Microsoft Excel / LibreOffice Calc ｜ 全中文 ｜ 本地优先 ｜ 零账号 ｜ 零 AI ｜ MIT
> **Papyra 办公套件四件套之二**
> 套件分色：Penna 靛蓝 · **Soroban 翠绿** · Lanterna 橙红 · Voluma 绛红
>
> 备注：Soroban（算盘）与 Stellar 区块链的智能合约平台同名，行业不相邻，仅作记录不更名。

## 一 定位

一句话：**本地表格计算工作台——公式、图表、筛选、xlsx 互通，日常办公的表都能干完。**

家族分工：Soroban 管「格子里的数据」；账目、统计、报表录入导出。不做的：不做多人协作、不做云端同步、不做数据透视表的高级形态（0.9.0 只做一次性基础汇总，不做缓存与字段拖拽）。

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
- 数据透视表（基础聚合：求和/计数/平均 × 行列维度）——0.9.0 已落地静态汇总
- 条件格式补全（图标集、公式规则）——0.10.0 已落地
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

1. 数据透视表已在 0.9.0 落地为一次性静态汇总；刷新缓存 / 字段拖拽 / 切片器是否排二期后续，待确认？
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

## 十四 M3 实装记录（2026-11-24）

M3 出口「能理：排序筛选 + 多 sheet + 冻结 + CSV 双向」已达成，版本号升至 `0.4.0`。

### 14.1 本期能力

- **数据工具栏**：网格上方 33px 单行工具栏，6 个动作——排序、筛选、冻结、导入 CSV、导出 CSV、工作表；左侧常驻当前数据区与当前列提示，右侧显示筛选计数 / 冻结状态。
- **排序**：按选定列升序或降序，单击单元格自动扩为整表，首行自动识别为表头；排序前从数据区底部回看最多 5 行，剔除空行与 `合计/总计/小计/total/subtotal` 行。排序后同表相对行公式随行平移，绝对行引用、跨表引用与字符串字面量不动；实测 18 笔订单按金额降序，G 列公式 `=D2*0.32`…`=D19*0.32`，合计仍为 `=SUM(G2:G19)`，总额 2,330,900、毛利 745,888。
- **筛选**：支持包含、等于、不等于、大于、小于五种条件，单列单条件；只隐藏不满足的行，不修改单元格内容，表头始终保留。按钮显示 `筛选 7/18`，状态区回到 `A1:G19 · A 订单号`；清除后隐藏行归零、状态恢复。
- **冻结窗格**：冻结首行、冻结首列、冻结到当前单元格（上方行 + 左侧列）、取消冻结；实测首行 `{rows:1,columns:0}`、B2 `{rows:1,columns:1}`、取消后 `null`。
- **工作表管理**：改名、复制、新建、删除；实测 2 表改名为「订单明细 / 区域汇总」，复制出「订单明细 副本」共 3 表，新建到 4 表，删除回 3 表；删除会同步移除该表的条件格式与图表，且始终保留至少 1 张表。
- **CSV 导入**：先按 UTF-8 严格解码，失败回退 GB18030；自动识别逗号 / 制表符 / 分号分隔，支持引号内逗号、双引号转义、CRLF/LF 与单元格内换行；`001` 这类前导零编号保持文本。导入后按内容计算列宽（中文按 2 个字符宽，上限 240px），含换行单元格自动加行高并启用自动换行；toast 报告编码与行数。
- **CSV 导出**：导出当前工作表已用区域，UTF-8 BOM + CRLF，逗号、引号、换行按 RFC 4180 转义；实测 1,258 B，回读 `A2=SO-1001`、`D2=128000`、`B4=南山,智造`、`A21=合计`、`D21=2330900`。
- **保存策略**：筛选只是一次性视图态，不写进 xlsx；保存前先清筛选、恢复活动区，再写 xlsx，重开后 18 行齐全、`hidden=0`、`filter=null`，公式与样式保留。
- **响应式**：900×620 下数据工具栏 33px 单行、`scrollWidth=900`，排序 / 筛选 / 冻结 / 工作表四个弹层全部落在 900×620 内，右缘最大 892、底边最大 324.3。

### 14.2 开发中修复的缺陷

1. 筛选「已完成」命中 7 行却把表头隐藏，状态 `筛选 7/19` → `range.getValues()` 返回带千分位的显示字符串，旧 `numericLike` 只接受纯数字，导致 `detectHeaderRow` 误判无表头；改为解析逗号 / 全角逗号 / 空格、`¥ ￥ $ € £` 前缀、百分号、括号负数，并保留普通数字与前导零字符串兼容。
2. 排序 / 筛选把末尾合计行当成数据 → 单击单元格扩表时从底部最多回看 5 行，剔除空行和 `合计/总计/小计/total/subtotal` 行。
3. 筛选后 Univer 把活动区漂到末行，状态出现 `18:18 · A 列` 或 `2:19 · A 列` → `FilterScope` 增加 `anchorRow/anchorColumn`，应用与清除筛选后恢复表头 A1；保存前清筛选也同步恢复。
4. CSV 导入后中文列宽过窄、换行备注挤成一行 → 按内容计算列宽，含换行单元格设行高并 `WrapStrategy.WRAP`。

### 14.3 验收结果（release 0.4.0）

样本 `assets/M3-整理.xlsx`（9,048 B）：sheet「订单」A1:G21，表头 订单号 / 客户 / 城市 / 金额 / 状态 / 负责人 / 毛利，18 笔订单第 2–19 行，G 列 `=D{row}*0.32`，第 21 行合计；sheet「区域汇总」跨表 SUM / SUMIF / MAX。状态计数：已完成 7、进行中 6、待发货 3、已取消 2。

- release E2E：`node scripts/e2e-m3.mjs`（CDP 9445，指向根目录 0.4.0 exe），依次输出 `M3 UI OK`、`M3 SORT OK`、`M3 FILTER OK`、`M3 FREEZE OK`、`M3 SHEETS OK`、`M3 CSV OK`、`M3 SAVE OK`、`M3 Layout 900 OK`。
- 排序：18 行金额降序 268000 → 42100，公式 18 条全部平移正确，合计 2,330,900 / 745,888。
- 筛选：`{matched:7,total:18}`，`hiddenRows()=11`，表头可见，状态 `A1:G19 · A 订单号`，按钮 `筛选 7/18`；清除后 `hidden=0`、`filter=null`。
- 冻结：首行 `{rows:1,columns:0}`、B2 `{rows:1,columns:1}`、取消后 `null`。
- 工作表：改名后 `["订单明细","区域汇总"]`；复制后 `["订单明细","订单明细 副本","区域汇总"]`，活动表为副本；新建 4 表，删除回 3 表。
- CSV 导入：UTF-8 toast `已导入 M3-订单.csv · UTF-8 · 4 行`，`B2=深圳,南山`、`B4=A "quote" 客户`、`G4=备注一\n备注二`；GBK 样本 toast `已导入 M3-订单-GBK.csv · GB18030 · 4 行`。
- CSV 导出：1,258 B、UTF-8 BOM `EF BB BF`、表头 `订单号,客户,城市,金额,状态,负责人,毛利`；回读 xlsx 7,814 B，合计 2330900。
- 保存重开：`M3-筛选保存.xlsx` 2 sheets、`hidden=0`、`filter=null`、18 行、`G2=D2*0.32`、总毛利 745888。
- 900×620：数据工具栏 900×33；排序 `x8–240 / y113–256.7`、筛选 `x66–338 / y113–306.3`、冻结 `x117–365 / y113–320.2`、工作表 `x606–892 / y113–324.3`，全部不越界。
- MCP：`version 0.4.0`，4 工具（workbook_info / validate_xlsx / csv_preview / formula_search），`MCP M1 OK`。
- 构建：`npm run build` 1910 modules，主 JS 9,860.45 kB、CSS 155.76 kB；`npm run tauri build` release profile 1m 09s，NSIS `4.12 MiB`。

截图在 `review-m3/`：`300-sort-panel.png`、`301-sorted.png`、`302-filter-panel.png`、`303-filtered.png`、`304-freeze-panel.png`、`305-freeze-row.png`、`306-freeze-cell.png`、`307-sheets.png`、`308-sheets-duplicate.png`、`309-csv-import-utf8.png`、`310-csv-import-gbk.png`、`311-csv-export.png`、`312-save-reopen.png`、`313-toolbar-900.png`、`314-sort-900.png`、`315-filter-900.png`、`316-freeze-900.png`、`317-sheets-900.png`；全部由 0.4.0 release 复验生成。日志为 `m3-e2e-release.txt`、`mcp-m3-release.txt`。

### 14.4 M3 已知边界

- 排序一期单列单键，只有升序 / 降序；多键排序、自定义序列、按颜色 / 图标排序未开放。
- 筛选一期单列单条件，多列与 / 或组合未开放；筛选是视图态，保存时清空，不写进 xlsx。
- 冻结只提供首行、首列、当前单元格三种，不做任意行列分割。
- CSV 导入走前端一次性读入，无 Rust 流式通道；分隔符与编码自动识别，未提供手动选择；导入结果是新工作簿，不并入当前工作表。
- CSV 导出导当前 sheet 已用区域，含合计行；富格式、公式结果按值导出，不保留样式。
- 图表与条件格式仍只存 localStorage sidecar，不随 xlsx 走；M3 未改变 M2 边界。
- 保存往返会把行高 / 列宽按 Univer 规范化写回，原始文件默认行高不会逐像素保留。
- 主 chunk 约 9.86MB，manualChunks 与函数表懒加载仍未做，留 M4 性能批次。
- 十万行 release 打开耗时沿用 M2 的 18.5s 记录，M3 未重跑大文件性能；SheetJS 快路径仍待评估。

### 14.5 M3 产物（v0.4.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,939,136 B（6.62 MB） | `1CEF46C6FE4E202FE0FE8161457A9244F8976BA29B326B9E41645899C183265F` |
| `Soroban_0.4.0_x64-setup.exe` | 4,319,948 B（4.12 MB） | `3A46414CF65870EF4E2495095E2CCBECAED7153DF694416F6BB95FBBD1EAC82D` |

release 构建：`npm run tauri build`，release profile 1m 09s，NSIS 4.12 MiB；产物已复制到套件根目录，均未签名。旧 0.3.0 安装包已从根目录移除，M0 / M1 / M2 产物记录保留作历史。

*小方工作室 · Soroban · M3 实装记录 ｜ Papyra 办公套件 ｜ 2026-11-24*

## 十五 M4 实装记录（2026-11-25）

M4 出口「能出：打印区域 + 分页预览 + 页眉页脚」已达成，版本号升至 `0.5.0`。一期 M0–M4 功能面就此收口；GitHub Release / FangBox 上架属 M5 外部分发，未在本次授权范围内执行。

### 15.1 本期能力

- **打印入口**：顶栏「打印」按钮（`IconPrint`），从编辑器直接打开全屏打印工作台，不离开当前表格；`Ctrl+P` 同效，按钮提示带快捷键。
- **打印工作台**：`createPortal` 门户式两栏——左栏打印设置、右栏 A4 纸张预览；顶部显示「打印预览 · 表名 · 区域」，右上 A4 徽标（方向 + 页数），底部「取消 / 打印」，`Escape` 关闭。
- **打印区域**：支持手输 `A1` / `A1:H20`、一键「当前选区」、一键「全部数据」；非法格式当场红字提示并禁用打印按钮；区域上限 10 万单元格。区域按工作表记忆，切换 sheet 不会套用别表的区域。
- **A4 分页**：纵向 210×297mm、横向 297×210mm，四边 12mm 页边距；页眉 21px、页脚 18px、页间 8px；按列宽做列带分页，再按行高分页；每页重复表头；识别 `合计/总计/小计/total/subtotal` 行并加粗；最多 80 页，超限给出中文提示。
- **缩放**：适应页宽（按表格总宽自动算 25%–100%）、实际大小 100%、90%、80%、70%；屏幕预览用 CSS `zoom`，打印态强制 `zoom:1`，保证 1:1 出纸。
- **页眉页脚**：独立开关；模板支持 `{sheet}` / `{page}` / `{pages}` / `{date}`；默认页眉 `{sheet}`、页脚 `小方工作室`；页眉右侧固定 `Soroban`，页脚中间固定 `第 X / Y 页`、右侧本地日期。
- **网格线**：可独立关闭，关闭后只留表头绿底与合计行，适合正式报表。
- **筛选联动**：打印只输出当前可见行；读取快照 `rowData.hd===1` 的隐藏行并转为区域偏移跳过，筛选后打印不会把被隐藏的数据带出来。
- **设置持久化**：按文档路径 / 文件名写 localStorage sidecar（`soroban:print:path:*` / `soroban:print:name:*`），只存打印偏好，不写 xlsx；重开文档恢复方向、缩放、页眉页脚与区域。
- **原生打印**：走 WebView2 `window.print()`，系统打印对话框与纸张预览正常；Tauri 的 `WebviewWindow.print()` 在 Windows 无效，已移除该 Rust 命令与前端封装。

### 15.2 开发中修复的缺陷

1. Tauri 2.12 `WebviewWindow.print()` 文档注明仅 macOS / wry 支持；Windows dev 点击后按钮停在「正在打开…」、无任何系统窗口。改为前端 `window.print()`，先等一帧再调用，`finally` 恢复按钮；实测系统对话框显示「总数: 2 纸张」。
2. 打印态只隐藏 `.app` 时，`#root` 的整页高度仍会在正文前生成一张空白 PDF 页；同时隐藏 `.app` 与 `#root` 后，PDF 从 3 页回到正确 2 页。
3. 非法区域时 `preview.error` 为空但按钮仍可点；改为 `areaError || preview.error` 统一判定，并直接禁用打印。
4. 900×620 下页脚按钮被纸张顶出窗口；页脚区改 sticky，保证「取消 / 打印」始终可见。
5. 末列带过窄会只剩一列孤页；列带切分后若末带 < 内容宽 30%，从上一带回移列，避免孤页。
6. 打印区域原是工作簿级，切 sheet 会沿用上一表区域；增加 `areaSheet` 归属，只有当前表设置过才沿用，其余回落到本表已用区域。

### 15.3 验收结果（release 0.5.0）

样本 `assets/M4-打印.xlsx`（12,582 B）：sheet「月度订单」A1:K82，11 列（订单号 / 客户 / 城市 / 产品 / 数量 / 单价 / 金额 / 状态 / 负责人 / 日期 / 备注），80 笔订单第 2–81 行，第 82 行合计；首行冻结；列宽合计约 1,140px。

- release E2E：`$env:SOROBAN_CDP='9445'; node scripts/e2e-m4.mjs`，全部通过并输出 `M4 PRINT UI OK`、`M4 LANDSCAPE OK`、`M4 SCALE OK`、`M4 CHROME OK`、`M4 AREA ERROR OK`、`M4 AREA OK`、`M4 SELECTION OK`、`M4 PRINT MEDIA OK`、`M4 900 OK`、`M4 PRINT CALL OK`、`M4 PDF OK`、`M4 FILTER PRINT OK`、`M4 SHORTCUT OK`，末行 `ALL M4 UI CHECKS PASSED`。
- 默认纵向：A4 2 页，48 + 33 行，适应页宽缩放 62%。
- 横向：A4 4 页，适应页宽 91%。
- 横向 100%：10 页，按列带分 2 段（A–H / I–K），列带均衡生效。
- 关闭网格 / 页眉 / 页脚：三类元素均不渲染，纸张仍为 A4。
- 非法区域 `A1::K82`：红字「打印区域格式不正确，请使用 A1 或 A1:H20」，打印按钮 disabled。
- 区域 `A1:G20`：1 页 19 行，缩放 100%；「当前选区」`A1:G16`：1 页；关闭重开仍为 `A1:G16`，方向保持横向，sidecar 写入成功。
- 打印媒体：纸张 793.7×1122.5px（210×297mm）、`zoom=1`、表格 972 / 993px 不溢出，页间 gap 0。
- 900×620：窗口 880×600 内，A4 预览宽 349px，纸张与按钮均在视口内，顶栏无横向溢出。
- 原生调用：拦截 `window.print` 验证点击「打印」只调用 1 次，按钮恢复为「打印」。
- 快捷键：`Ctrl+P` 直接打开打印工作台，E2E 断言通过，`Escape` 正常关闭。
- PDF：`m4-print-preview.pdf` 2 页、406,064 B；页面 594.96×841.92pt（210×297mm）；第 1 页 48 行、第 2 页 33 行 + 合计，表头逐页重复，页脚 `小方工作室 / 第 X / 2 页 / 2026-11-25`。
- 筛选后打印：筛「待发货」命中 20/81，工作台仅 1 页、可见 20 行，隐藏行未输出。
- 原生对话框：0.5.0 release 实测「打印 / 总数: 2 纸张 / 纵向 / 全部」，默认打印机 OneNote，未实际出纸。
- MCP：`version 0.5.0`，4 工具（workbook_info / validate_xlsx / csv_preview / formula_search），`MCP M1 OK`。
- Rust：6 passed（MCP 路径、CSV、工作簿、校验、函数库）。
- 构建：`tsc && vite build` 1912 modules，主 JS 9,877.08 kB、CSS 162.71 kB；release profile 1m 07s，NSIS 4.12 MiB。

截图在 `review-m4/`：`400-print-studio.png`、`401-print-landscape.png`、`402-print-percent100.png`、`403-print-bare.png`、`404-print-area-error.png`、`405-print-area.png`、`406-print-selection.png`、`407-print-900.png`、`408-editor-900.png`、`409-native-print.png`、`410-pdf-page-1.png`、`411-pdf-page-2.png`、`412-print-filtered.png`；另 `m4-print-preview.pdf`、`m4-e2e-release.txt`、`mcp-m4-release.txt`、`m4-native-print.txt`、`m4-build-release.txt`。0.5.1 回跑后 `400–412`、PDF 与 `m4-e2e-release.txt` 已被新版覆盖，指标一致；`409-native-print.png` 仍是 0.5.0 原生对话框记录。

### 15.4 M4 已知边界

- 只支持 A4 纵 / 横，不提供 Letter / A3 / 自定义纸张；页边距固定 12mm，不可调。
- 缩放档位固定 100 / 90 / 80 / 70 与适应页宽，不提供任意百分比输入。
- 无手动分页符、无「顶端标题行」多行重复、无打印标题图片 / Logo；页眉页脚仅文本模板。
- 区域上限 10 万单元格、页数上限 80；超限只提示，不自动拆小。
- 打印按单元格显示值输出，不重算公式、不还原完整字体 / 边框 / 条件格式色阶；图表、图片、批注不进入打印。
- 打印设置只存 localStorage sidecar，不写进 xlsx，换机 / 换路径 / Excel 打开不携带；区域按 sheet 记忆但同属本地偏好。
- 筛选只是视图态，打印跟随当前隐藏行；保存时仍会清筛选，不把筛选写死进 xlsx。
- 原生打印依赖 WebView2 `window.print()`，最终出纸效果由系统打印驱动与打印机决定；本次只验证对话框与页数，未实际出纸。
- 主 chunk 仍约 9.88MB、十万行打开耗时未在 M4 重测，性能批次仍未开工。

### 15.5 M4 产物（v0.5.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,944,256 B（6.62 MB） | `723024ABD15E6D2B1F7E6CD33C0B1A4DE2C9B3B3DF6ABC8A39A0398F1D168717` |
| `Soroban_0.5.0_x64-setup.exe` | 4,325,110 B（4.12 MB） | `42F88E9FA861FE5DB5952CB3A1A46C1723515BF64BEF04CD8FA70185B71A90B0` |

release 构建：`npm run tauri build`，release profile 1m 07s，NSIS 4.12 MiB；产物已复制到 `Soroban/` 与套件根目录，均未签名。旧 0.4.0 安装包已从根目录移除，M0–M3 产物记录保留作历史。

### 15.6 0.5.0 回归（M0–M3）

在 0.5.0 release 上重跑旧里程碑，确认 M4 打印改动无回归：

- M0：`M0 UI OK`，欢迎页 / 新建 / 打开 / 公式栏 / 保存重开全过；900 布局 `Layout 900 OK`
- M1：`M1 UI OK`，提示卡 SUM、函数库 528、跨表汇总 375000 / 345000、保存 9,773 B；`M1 Layout 900 OK`
- M2：`M2 UI OK` / `M2 Layout 900 OK` / `M2 CHARTS OK` / `M2 ROUNDTRIP OK`，格式、CF、四图表、重开全过
- M3：`M3 UI OK` / `M3 SORT OK` / `M3 FILTER OK` / `M3 FREEZE OK` / `M3 SHEETS OK` / `M3 CSV OK` / `M3 SAVE OK` / `M3 Layout 900 OK`
- 回归脚本修正：`e2e-m1` / `e2e-m1-layout` 在点击公式栏后等待一帧再输入，避免自动化抢在聚焦选中前吞掉首个 `=`；产品输入本身无问题
- 日志：`review-m4/regression-m0.txt`、`regression-m0-layout.txt`、`regression-m1.txt`、`regression-m1-layout.txt`、`regression-m2.txt`、`regression-m3.txt`

*小方工作室 · Soroban · M4 实装记录 ｜ Papyra 办公套件 ｜ 2026-11-25*

## 十六 0.5.1 多键排序 / 多条件筛选（2026-11-25）

一期 M3 只开放单列排序与单条件筛选。0.5.1 在保持旧 API、旧保存行为不变的前提下补齐这两项硬指标，版本升至 `0.5.1`。

### 16.1 本期能力

- **多键排序**：`SortKey[]`，每项 `{column,direction}`；最多 3 个键、列不重复；按顺序逐键比较，数字优先比数值，文本用 `localeCompare(..., "zh-CN", {numeric:true})`；第 1 键相同才看第 2 键。
- **公式随行**：排序后仍执行原有公式行平移，`=Dn*0.32` 跟着数据行走；合计、毛利、跨表引用结果保持正确。
- **多条件筛选**：`FilterCondition[]` + 全局模式 `and | or`（「全部条件 / 任一条件」）；最多 3 条，允许同列多条件；条件值留空不参与筛选。
- **兼容旧接口**：`sortBy(direction, column)` 与 `filterBy(column, operator, value)` 保留并分别委托到 `sortByKeys` / `filterByConditions`；`__soroban` 新增 `sortByKeys` 与 `filterByConditions`，供 E2E 调用。
- **旧返回形状不变**：单条件 `filterInfo()` 仍是原五字段 `columnLabel / operator / value / matched / total`，M3 的 deepEqual 不受影响；只有多条件才附加 `conditions` 与 `mode`。
- **按钮与面板**：多条件激活时按钮显示 `筛选 10/18 · 2条件`，单条件仍是 `筛选 7/18`；排序弹层为可增删的条件行（列 + 升/降 + 删除），筛选弹层顶部可切「全部 / 任一条件」，下面为条件行（列 + 操作符 + 值 + 删除）。
- **面板尺寸**：排序 292px、筛选 348px；`.sort-key-row` / `.filter-cond-row` / `.filter-mode` / `.data-add-row` / `.cond-del` 统一控件高度；弹层 `overflow-x:hidden`，说明文字可换行，不再出现横向滚动条。
- **状态保持**：重新打开筛选弹层时沿用当前 `and / or` 模式，不会把已生效的「任一条件」显示成「全部条件」。

### 16.2 验收结果（release 0.5.1）

样本仍用 `assets/M3-整理.xlsx`：18 行订单，E 状态、D 金额、G 毛利公式。

- 多键排序：E 状态升序 + D 金额降序，状态非降、同状态金额非升；18 行公式全部为 `=Dn*0.32`；金额合计 2,330,900。
- AND 筛选：E = 已完成 且 D > 100000，命中 6/18，隐藏 12 行。
- OR 筛选：E = 已完成 或 E = 待发货，命中 10/18。
- 模式保持：重开筛选面板仍为「任一条件」，通过。
- 900×620：双键排序面板 right 300 / bottom 306，无横向溢出；筛选 348px 宽同样不越界。
- M3 回归：`M3 UI OK` / `M3 SORT OK` / `M3 FILTER OK` / `M3 FREEZE OK` / `M3 SHEETS OK` / `M3 CSV OK` / `M3 SAVE OK` / `M3 Layout 900 OK`。
- M4 回归：13 项打印检查全过，`ALL M4 UI CHECKS PASSED`。
- M0 / M1 / M2 回归：`M0 UI OK` / `Layout 900 OK` / `M1 UI OK` / `M1 Layout 900 OK` / `M2 UI OK` / `M2 Layout 900 OK` / `M2 CHARTS OK` / `M2 ROUNDTRIP OK`。
- MCP：`version 0.5.1`，4 工具（workbook_info / validate_xlsx / csv_preview / formula_search），`MCP M1 OK`。
- Rust：6 passed（MCP 路径、CSV、工作簿、校验、函数库）。
- 构建：`tsc && vite build` 1912 modules，主 JS 9,880.45 kB、CSS 164.26 kB；release profile 1m 11s，NSIS 4.13 MiB。

正式截图在 `review-0.5.1/`：`500-multi-sort.png`、`501-filter-and.png`、`502-filter-or.png`、`503-multi-sort-900.png`；M3 回归截图在 `review-0.5.1/m3-release/`。日志：`e2e-release.txt`、`e2e-dev.txt`、`m3-release.txt`、`m3-regression.txt`、`review-m4/m4-e2e-release.txt`、`m4-regression-dev.txt`、`mcp-release.txt`、`rust-test-release.txt`、`build-release.txt`。

### 16.3 已知边界

- 排序键最多 3 个、筛选条件最多 3 条；超出只能删旧再加，不提供无限堆叠。
- 筛选只有全局 AND / OR，不做逐条混合布尔优先级，也没有括号分组。
- 排序与筛选都不写进 xlsx：排序是即时重排数据，筛选只是视图隐藏；保存时会清筛选，重开回到原顺序。
- 不提供自定义序列、按颜色 / 图标排序、筛选搜索框、数值区间双端输入；这些留后续批次。

### 16.4 产物（v0.5.1）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,945,792 B（6.62 MB） | `612D77D2227CBFB679ADEF4FA6F1BC425C73AD8D19773BD83F322B712FFFD808` |
| `Soroban_0.5.1_x64-setup.exe` | 4,326,136 B（4.13 MB） | `30524F740DF52F74D38BE8FD951FF4D731CA3EF3AE9AC9902CA995AAA47E80EE` |

产物已复制到 `Soroban/` 与套件根目录，均未签名；旧 0.5.0 安装包已移除，0.5.0 的哈希与验收记录保留作历史。

*小方工作室 · Soroban · 0.5.1 多键排序 / 多条件筛选 ｜ Papyra 办公套件 ｜ 2026-11-25*

## 十七 0.6.0 编辑效率与导入体验（2026-11-25）

0.6.0 补的是一期里“每天都会用到、但 0.5.1 还没做”的五件事：查找替换、自动保存、自定义序列排序、工作表标签颜色、CSV 导入预览。版本升至 `0.6.0`，M0–M4 原有能力不回退。

### 17.1 本期能力

- **查找与替换**：`Ctrl+F` 打开查找，`Ctrl+H` 直接展开替换；公式栏右侧放大镜可点开。默认扫描当前工作表已用区域（约 200 万格上限），不区分大小写可切；`Enter` 下一个、`Shift+Enter` 上一个，命中处自动选中并提示“第 n / N 处”。
- **替换规则**：普通单元格支持“替换”与“全部替换”；公式单元格只查找、不替换，提示“公式单元格只查找、不替换”，避免把公式算成文本。替换后重新扫描命中数，替换空串等价清空单元格。
- **60 秒自动保存**：只对“已保存过路径、当前有未保存改动、不是编辑中、没有活动筛选、没有正在读写”的文档生效；成功后清 dirty、刷新最近文件、状态栏显示“已自动保存 HH:MM”。新文档和无路径文档不会偷偷落盘。
- **自定义序列排序**：排序条件第三项方向为“自定义序列”，可输入 `待发货,已完成,进行中`（逗号 / 中文逗号 / 顿号 / 换行均可）。列表内按给定顺序排名，未列出的值排在后面，再按 `localeCompare(..., "zh-CN", {numeric:true})` 兜底。
- **工作表标签颜色**：工作表弹层每行右侧新增颜色按钮，提供翠绿 / 蓝 / 橙 / 黄 / 紫 / 红 / 灰 7 色与“无”；颜色写入 sheet 的 `tabColor`，随 xlsx 保存，重开保留；标签圆点同步显示。
- **CSV 导入预览**：选择 CSV 后不再立即覆盖当前表，先弹预览：编码 `UTF-8 / GB18030`、分隔符 `逗号 / Tab / 分号`、首行为标题开关、前 6 行 × 7 列预览、行列统计。点“导入并新建表格”才真正新建并切换；取消不丢当前文档。
- **CSV 解码细节**：BOM 与 UTF-8 优先，无法判定时按 GB18030；显式 UTF-8 采用非 fatal 解码，预览乱码时可直接切编码看效果。引号内逗号、双引号转义、单元格内换行仍按 RFC 4180 解析。

### 17.2 验收结果（release 0.6.0）

- 查找：`已完成` 命中 7 处；下步进到第 2 / 7 处；单次替换后 6 处；全部替换后 0 处，提示“已替换 6 处”。
- 自定义排序：`待发货 → 已完成 → 进行中`，首行“待发货”，序列内非降；18 行公式仍随行。
- 标签颜色：订单 sheet 设为 `#2f80ed`，`sheetTabs()` 回读一致。
- CSV：M3 订单 4 行 7 列，UTF-8 + 逗号 + 首行标题，标题开关可切；导入后 A1=`订单号`、D2=`128000`、新文档 dirty。
- 自动保存：H1 写入“自动保存”，dirty 由 true 转 false，文件落盘 9,749 B，重读 H1 正确。
- 900×620：查找面板 344×195，right 882 / bottom 349；CSV 弹窗 760×423，right 830 / bottom 521.5，均不越界。
- M0 / M1 / M1 layout / M2 / M3 / M4 / multi：全部 `OK`；M3 排序选项数由 9 改 10，`M3 … OK` 八行通过；M4 十三行全过。
- MCP：`version 0.6.0`，4 工具，`MCP M1 OK`；Rust 6 passed。
- 构建：1913 modules，主 JS 9,894.50 kB、CSS 170.03 kB；release profile 1m 10s，NSIS 4.13 MiB。

正式截图在 `review-0.6.0/`：`600-find.png`、`601-find-replaced.png`、`602-sort-custom.png`、`603-sheet-colors.png`、`604-csv-preview.png`、`605-csv-imported.png`、`606-autosave.png`、`607-find-900.png`、`608-csv-900.png`。日志：`m8-release.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`multi-release.txt`、`mcp-release.txt`、`rust-test-release.txt`、`build-web.txt`、`build-release.txt`。

### 17.3 已知边界

- 查找范围是当前 sheet 的已用区域，上限约 200 万格；不跨 sheet、不支持正则 / 通配符 / 全字匹配，公式按公式文本匹配。
- 替换只处理普通值；公式单元格一律跳过，避免公式被改写。
- 自动保存 60 秒一次，只在已有路径且非编辑 / 非筛选 / 非 busy 时执行；新文档、CSV 未保存文档仍需手动保存。
- 自定义序列只作用于当前排序键；最多仍 3 键；未列值统一排后，不做“其他值优先”。
- 标签颜色只有 7 个预设 + 无，不做任意取色器；随 xlsx `tabColor` 保存。
- CSV 预览最多显示 6 行 × 7 列，完整数据仍全量导入；分隔符只开放逗号 / Tab / 分号，不做自定义单字符。
- 排序仍是即时重排，不写进 xlsx；筛选仍是视图态，保存前会清筛选。

### 17.4 产物（v0.6.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,949,888 B（6.63 MB） | `EFF36DAFFB3066E74698CA368B473ECC92CF453CCC2D6644121334B575EF7659` |
| `Soroban_0.6.0_x64-setup.exe` | 4,331,309 B（4.13 MB） | `9577EE7A96524C3D58658D3E00A54C3DBA711423B3C3B916A1EE50DB1BA3C8B2` |

产物已复制到 `Soroban/` 与套件根目录，均未签名；0.5.1 安装包已移除，`release-0.5.1.sha256` 保留作历史，`release-0.6.0.sha256` 已写入。

*小方工作室 · Soroban · 0.6.0 编辑效率 / CSV 预览 ｜ Papyra 办公套件 ｜ 2026-11-25*

## 十八 0.6.1 渲染收敛与 Bugfix（2026-11-25）

0.6.1 是 0.6.0 之后的渲染专项批次：不改一期功能范围，专门修“格子很多时把整片区域都画了”的问题，并补齐打印预览与图表浮层的屏外绘制预算。

### 18.1 本期修复

- **网格只画视口**：Univer 的 Grid 画布本身按视口尺寸建图，本轮把外层 `.sheet-grid` 加上 `overflow:hidden` + `contain:layout paint`，并确认十万行表的画布始终是视口大小，不会按 100001 行 × 20 列的整表高度建图。
- **异常大选区收敛**：旧文件或桥接导入可能把整张已用区域当作活动选区交给 Univer 首屏绘制。打开工作簿时只收敛“异常大选区”（超过 5,000 格、500 行或 200 列），普通文件与小选区保持原样；这样十万行表归一 A1，又不会把合并单元格 A1 误改到下一行。
- **CSV 导入不选整块**：导入结束后活动选区只落在 A1，不再把整个导入矩阵作为选区；大 CSV 导入后不会出现“整片数据被选中/描边”。
- **打印预览按屏跳过**：`.print-page` 使用 `content-visibility:auto` + `contain-intrinsic-size`，屏幕预览只对视口附近的纸页做布局与绘制；进入 `@media print` 后强制 `content-visibility:visible`、`zoom:1`，保证 6 页 / 10 页都能完整出纸。
- **图表浮层按屏跳过**：`.chart-card` 同样启用 `content-visibility:auto` + 布局 / 绘制 containment，视口外卡片不参与首屏布局与绘制；视口内卡片正常显示、拖动、联动。
- **测试夹具隔离**：M4 打印 E2E 改为把 `assets/M4-打印.xlsx` 复制到 `review-m4` 后再打开，自动保存不再回写原始样本；本轮已恢复被测试污染过的 M4 样本。
- **E2E 稳定性**：全部 E2E 的 `page.reload` 由 `networkidle2` 改为 `domcontentloaded`，避免 WebView2 长连接导致导航超时误报。

### 18.2 验收结果（release 0.6.1）

- 十万行：100,002 行 × 20 列，Grid 画布 `1280×620 CSS`（位图 1920×930），DOM 节点 194，选区 `A1`、名称框 `A1`；整表理论高度超过 100 万 px，画布未随整表展开。
- 滚动：24 次滚轮翻页，`147 FPS`，平均帧 `6.8 ms`，慢帧 0；滚动后画布容器高度仍等于视口。
- 打印预览：100% 实际大小 6 页，屏幕态 6 页全部 `content-visibility=auto`，带 `contain-intrinsic-size` 占位；打印态 6 页全部恢复 `visible`、`zoom=1`，不出现只打第一页；PDF 输出 6 页，第 1 / 6 页均有完整表头与数据。
- 图表：新建柱状图后 1 张 `.chart-card`，`content-visibility=auto`，视口内可见，图表数据与联动正常。
- CSV：M8 导入后选区 `A1`，A1=`订单号`、D2=`128000`，不再选中 4×7 数据块。
- M0：欢迎页 / 新建 / 打开样本 / 合并单元格 A1 公式栏 / 保存重开全过，`M0 UI OK`；M0 样本 A1 仍显示“2026 年第四季度销售台账”，未被选区收敛改到 A2。
- M1 / M1 layout / M2 / M3 / M4 / multi / M8：全部 `OK`；M4 十三行全过，M8 六组全过。
- MCP：`version 0.6.1`，4 工具；Rust 6 passed。
- 构建：1913 modules，主 JS `9,894.70 kB`、CSS `170.31 kB`；release profile 1m 19s，NSIS 4.13 MiB。

正式截图在 `review-0.6.1/`：`610-render-large.png`、`611-render-scrolled.png`、`612-render-print.png`、`613-render-charts.png`。日志：`render-e2e.txt`、`render-release-final-console.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`multi-release.txt`、`mcp-release.txt`、`rust-test-release.txt`、`build-web-final.txt`、`build-release-final.txt`。

### 18.3 已知边界

- Univer Grid 仍是自绘 canvas，天然按视口画；本轮验收用画布像素尺寸、DOM 节点数、滚动帧率证明“没有按整表建 DOM / 建画布”，不是用“元素可见性”逐格判断。
- 打印预览的屏外跳过是浏览器级 `content-visibility`：所有页的 DOM 仍存在，但屏外页不参与布局与绘制；打印时全部恢复。页数上限仍为 80 页。
- 图表卡片屏外不布局不绘制，但节点仍在；图表坐标在拖动时已限制在网格范围内，不会因隐藏而丢失数据。
- 选区收敛只处理异常大选区；用户在表内主动全选仍会保留选区，由 Univer 按视口裁剪。
- 十万行首次打开仍需约 10–12 秒做 xlsx 解析与写入，这是导入耗时，不是渲染耗时；本批次未改 SheetJS 导入路径。
- 打印仍只支持 A4 纵 / 横、固定 12 mm 页边距、10 万格 / 80 页上限；不重算公式、不打印图表。

### 18.4 产物（v0.6.1）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,949,888 B（6.63 MB） | `520751DFB015F9C6654EE9CD2C60FD4B3D036DAA5DF715FC50F97D7BC7B71DC4` |
| `Soroban_0.6.1_x64-setup.exe` | 4,331,527 B（4.13 MB） | `5CADC5ED6D744FCBBA53621AE5728BA137FECACDA30B667C353AE3AC38CAE463` |

产物已复制到 `Soroban/` 与套件根目录，均未签名；`release-0.6.1.sha256` 已写入，0.6.0 安装包与 `release-0.6.0.sha256` 保留作历史。

*小方工作室 · Soroban · 0.6.1 渲染收敛 ｜ Papyra 办公套件 ｜ 2026-11-25*

## 十九 0.7.0 单元格工具（2026-11-26）

0.7.0 补齐 Excel 里最常用、但原来要绕路的一批“结构 + 版式”动作。因为 900px 宽度下格式工具栏已经接近满宽，新功能不再往工具栏塞按钮，而是在公式栏查找按钮右侧新增“单元格工具”入口，弹出 360px 面板。

### 19.1 本期能力

- **合并**：合并并居中、直接合并、取消合并；合并后保存重开保持 `ht / vt / wrap` 原样。
- **边框**：外框、全部、内横、内竖、上、下、左、右、清除，共九种；颜色与线型沿用格式工具栏的边框设置。
- **换行与垂直对齐**：自动换行开关；顶端 / 居中 / 底端三档。自动换行后按列宽（含合并宽度）估算行数并固定行高，长备注不会被压成一行。
- **行列结构**：插入行 / 插入列 / 删除行 / 删除列 / 隐藏行 / 隐藏列 / 显示行 / 显示列，全部以当前选区为锚点。
- **往返**：以上动作全部经 Univer facade 落到 xlsx；保存重开验证合并、边框色、换行、垂直对齐、行高、插入列后的数据位移均正确。

实现：`src/components/CellTools.tsx` 新面板；`SheetEditor.tsx` 增加 `readCellToolState` / `applyCellTool` / `fitWrappedRows` / `remapVerticalForExport`；样式在 `theme.css` 的 `.cell-tools` / `.ct-*`。

### 19.2 开发中修复的缺陷

- **测试污染**：手工诊断直接打开 `assets/M0-样本.xlsx`，60 秒自动保存把合并与边框写回样本。已恢复 git 原版，并把 M9 改为每次从干净 fixture 复制到 `review-0.7/M0-单元格工具-working.xlsx`。
- **垂直对齐导出错位**：桥接库把 Univer 的 `vt=3`（底端）导出成 Excel 顶端、`vt=2`（居中）导出成底端。新增 `remapVerticalForExport()`，导出前 `3→2、2→0`；重开 `vt` 与界面一致。
- **自动换行行高丢失**：换行只改 `tb=3` 时行高仍是默认一行。新增 `fitWrappedRows()`，按列宽 / 合并宽度估算行数并 `setRowHeightsForced`；重开行高 ≥150，长备注完整显示。
- **M4 页脚日期硬编码**：测试写死 `2026/11/25`，跨日即失败；已改为按当前日期动态断言。

### 19.3 验收结果（release 0.7.0）

- **M9 单元格工具**：`M9 CELL TOOLS OK / MERGE OK / BORDER OK / WRAP OK / STRUCTURE OK / ROUNDTRIP OK / Layout 900 OK`。A1:F1 合并并居中；边框 `#8fb3a2` 四边正确；换行 `tb=3`；底端 `vt=3`；D 列左侧插入后原 D3=`15500` 移到 E3；保存重开全部保持。
- **面板尺寸**：1280×820 下 360×414；900×620 下仍在视口内，右侧与底部均不越界，无横向溢出。
- **M0–M4 / M8 / multi / MCP**：release 全过；M4 PDF 2 页 406,066 B，页脚日期按当天。
- **MCP**：`version 0.7.0`，4 工具；**Rust** `cargo test --release` 6 passed。
- **构建**：1914 modules，主 JS `9,903.29 kB`、CSS `174.14 kB`；release profile 1m 39s，NSIS 4.13 MiB。
- **渲染专项**：十万行画布 `1280×620 CSS`、DOM 199、选区 `A1`；打印预览 6 页全部 `content-visibility=auto`，打印态 6 页恢复，PDF 6 页；图表 1 张卡片视口内可见。滚动 24 次远程滚轮下平均 `74.2 FPS / 13.48 ms`，但自动化注入的 24 次滚轮各产生 1 个 >33ms 慢帧，严格“慢帧 ≤2”断言在本机高负载下失败；同一条件用 0.6.1 旧包复跑同样 24，属于主机 / 远程输入噪声，不是 0.7.0 回归。画布尺寸、滚动后容器高度、打印与图表子项均通过。

正式截图在 `review-0.7/`：`700-cell-tools.png`、`701-cell-tools-applied.png`、`702-cell-tools-900.png`、`703-cell-tools-reopen.png`。日志：`m9-release.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`multi-release.txt`、`mcp-release.txt`、`rust-test-release.txt`、`render-release-diag.txt`、`render-perf-strict-fail.txt`、`build-web-final.txt`、`build-release-final.txt`。

### 19.4 已知边界

- 单元格工具面板是入口式浮层，不做 Excel 右键菜单全量复刻；面板外的右键菜单仍保留系统自带项。
- 边框只支持单色实线，线型（细 / 中 / 粗 / 双线）留到后续版本；斜线边框未做。
- 自动换行行高是估算，不是浏览器逐字测量；超长英文单词与混合字号可能略紧，重开可手动调行高。
- 行列隐藏只作用于当前 sheet；取消隐藏一次显示全部隐藏行列，不支持区间选择。
- 合并冲突（合并区已有数据）沿用 Univer 默认行为，只保留左上角值；不做 Excel 式二次确认。
- 渲染帧率严格断言受本机负载影响，见 19.3；功能验收不受影响。

### 19.5 产物（v0.7.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 6,952,960 B（6.63 MB） | `A39B0577FE31C42175B0D4122908BCA47E1E6E323229E022DDFD44DF2FDFACE4` |
| `Soroban_0.7.0_x64-setup.exe` | 4,333,728 B（4.13 MB） | `09A2305F35B625DC2850918213CB37A028E3A8F8180BB8245730DD8D744D25CE` |

产物已复制到 `Soroban/` 与套件根目录，均未签名；`release-0.7.0.sha256` 已写入。0.6.1 安装包与校验文件保留作历史。

*小方工作室 · Soroban · 0.7.0 单元格工具 ｜ Papyra 办公套件 ｜ 2026-11-26*


## 二十 0.8.0 数据验证（2026-11-26）

0.8.0 沿二期路线补上数据验证。入口在公式栏“单元格工具”右侧，盾形图标弹出 360px 面板；当前选区已有规则时，面板会回填条件、区间、选项与提示，可直接改或清除。

### 20.1 本期能力

- **下拉列表**：手动输入（逗号 / 换行分隔、去重、最多 100 项）或引用同表单行 / 单列区域（最多 100 格）；单元格右侧出现下拉箭头，非法值标红。
- **数值校验**：区间（最小值 / 最大值）、大于、小于、等于；可勾选“只允许整数”，对应 Univer 的 `whole / decimal`。
- **提示与空白**：允许空值开关、自定义错误提示；未填写时按类型给默认中文提示。
- **清除**：按当前选区清除验证规则，不动单元格内容。
- **xlsx 往返**：导出时把规则写入标准 `<dataValidations>`，并用 `xl/soroban-validations.json` 保留 Soroban 自己的完整规则；重开优先读清单，缺失时回退解析标准 XML。外部 Excel 打开后下拉箭头与错误提示仍生效。

实现：`src/components/ValidationPanel.tsx` 面板；`SheetEditor.tsx` 注册 Univer 数据验证核心 / UI 插件、中文语言包与 `applyValidation` / `clearValidation` / `readValidationSummary`；`src/lib/validationIO.ts` 负责 xlsx 标准 XML 与自定义清单读写、回读应用；样式在 `theme.css` 的 `.dv-*`。

### 20.2 开发中修复的问题

- **保存后规则丢失**：桥接库导出的 xlsx 不含 `dataValidations`，首次重开规则数为 0。新增 `validationIO` 导出后处理：注入标准验证 XML 与 Soroban 清单；重开恢复两条规则。
- **面板回填错位**：重开规则是“整数”，面板却仍显示“下拉列表”空表单。`ValidationSummary` 增加 `kind / values / min / max / num / integer`，面板按当前规则初始化。
- **回填值不可直接再应用**：列表回填曾用“ / ”展示，直接点应用会拼成单项。回填改为逗号分隔，展示仍用“ / ”，并补了“重开后直接应用”断言。

### 20.3 验收结果（release 0.8.0）

- **M10 数据验证**：`M10 数据验证 E2E 通过`。H2:H6 下拉 `高 / 中 / 低`，下拉箭头显示；H2 输入 `超高` 时 `getValidatorStatus` 为 `invalid` 并标红；B3:B5 整数区间 100000–200000；保存重开 2 条规则完整。
- **标准 XML 回读**：移除 `xl/soroban-validations.json` 的副本仍能回读 2 条规则；ExcelJS 读取保存文件得到 2 条 `dataValidations`。
- **面板尺寸**：1280×820 下 360×419；900×620 下 360 宽、右 / 底均不越界，无横向溢出。
- **回归**：release 下 M0 / M1 / M2 / M3 / M4 / M8 / M9 / multi / M10 全过；MCP `version 0.8.0`、4 工具；Rust `cargo test --release` 6 passed。
- **构建**：2012 modules，主 JS `10,141.30 kB`、CSS 约 178 kB；release profile 3m 54s，NSIS 4.19 MiB。
- **渲染专项**：十万行画布 / DOM / 选区 / 打印 / PDF / 图表子项通过；滚动仍为 24 个远程滚轮慢帧，与 0.6.1、0.7.0 同机同条件一致，属主机噪声，严格断言未放宽。

正式截图在 `review-0.8/`：`800-dv-list.png`、`801-dv-invalid.png`、`802-dv-number.png`、`803-dv-reopen.png`、`804-dv-cleared.png`、`805-dv-900.png`。日志：`release-e2e-*.log`、`mcp-test.txt`、`rust-test.txt`、`build-release.txt`、`render-perf-strict-fail.txt`、`render-release-diag.txt`。

### 20.4 已知边界

- 只做下拉、数值区间 / 比较与整数；日期、时间、文本长度、复选框、自定义公式还没有面板入口。
- 列表引用只接受同表单行 / 单列，不跟跨表引用；选项上限 100。
- 标准 XML 只写 `list / whole / decimal` 等已验证类型；`checkbox` 等 Soroban 清单会保留，但不写进 Excel 验证。
- 多选区导出合并为空格分隔 `sqref`；单条规则的多个不连续区域在 Excel 中仍按多区域生效。
- 校验错误提示依赖 Univer UI：非法值标红并带提示，不弹阻断式对话框。

### 20.5 产物（v0.8.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 7,008,256 B（6.68 MB） | `6DFC72534475790DAD78BEC250B0D327880BE8249D79830D48A0B02044D5C6CA` |
| `Soroban_0.8.0_x64-setup.exe` | 4,389,644 B（4.19 MB） | `DEF80427B8CA4BF002A2B1677B195497830D824C407EE68490CAA93EE057785F` |

产物已复制到 `Soroban/` 与套件根目录；`release-0.8.0.sha256` 已写入，0.7.0 安装包保留作历史。

## 二十一 0.9.0 数据透视（2026-11-26）

0.9.0 把二期第一项落地：选中源区域后，行字段 / 列字段 / 值字段 / 汇总方式四步生成一张汇总表。这是**一次性静态汇总**，不随源数据自动刷新；面板与生成的表头都明确写出这一点。

### 21.1 本期能力

- **入口**：数据工具栏“透视”按钮，打开 360px 面板；源区域显示 A1 范围与数据行数，首行为标题可关。
- **三种聚合**：求和 / 计数 / 平均值。计数按非空单元格计，文本也计数；平均值与行列总计都保留两位小数。
- **行列维度**：行字段必选，列字段可选；列字段为空时只按行汇总。空值统一归“(空)”，数字与文本混合按中文数字顺序排序。
- **小计与总计**：每个行分组带行总计，每个列分组带列小计，右下角为总计。
- **生成到新表**：自动命名 `透视1 / 透视2…`，矩阵所有行补齐到同一宽度，写标题、源数据行数、表头、行 / 列 / 总计并加粗与淡绿底；列宽 180 / 118，生成后自动激活新表。
- **xlsx 往返**：汇总结果就是普通单元格值，保存为 xlsx 后重开仍在；不写 Excel 原生 PivotTable 对象。

实现：`src/lib/pivot.ts` 纯函数 `buildPivot(values, spec)`；`src/components/PivotPanel.tsx` 面板；`SheetEditor.tsx` 的 `openPivot / applyPivot` 负责选区快照、生成工作表、写值与样式；`DataToolbar.tsx` 增加入口；`window.__soroban.openPivot()` 暴露给 E2E。

### 21.2 开发中修复的问题

- **列维度被截断**：标题行只有 2 列时 `setValues` 按首行宽度截断，列维度只剩第一列“待到账”。改为矩阵所有行补齐到统一最大宽度。
- **首行标题开关后标签不刷新**：字段标签原来在打开面板时算一次；改为面板内按本地 `hasHeader` 重算 `fieldLabels`。
- **计数只数数字**：计数金额时结果正确，但计数文本字段全为 0。计数分支改为按非空值计数，求和 / 平均仍只累加可解析数字。
- **单引号拼 TSX 写坏文件**：PowerShell 单引号字符串里的 `\n` 被当字面字符写进 `DataToolbar.tsx`，造成一行巨型 TSX；已用 Edit 修复，后续多行代码不再用单引号 `Replace`。
- **测试污染样本**：手工直接打开 `assets/M0-样本.xlsx` 触发自动保存，把透视表写进 fixture。已 `git checkout` 还原，E2E 改为先复制到 `review-0.9/M11-数据透视-working.xlsx`。

### 21.3 验收结果（release 0.9.0）

- **平均值**：`明细` A1:E13，行=客户、列=状态、值=金额、平均值。方岛设计 27750、康岛物流 40000 / 22500、南山科技 38250 / 12000、前海数据 33000 / 33000、深圳湾智造 26000 / 43500；列总计 33000 / 27750，总计 31250。
- **计数**：同区域同维度，计数金额。方岛设计 2 / 0、康岛物流 1 / 1、南山科技 2 / 1、前海数据 2 / 1、深圳湾智造 1 / 1；列总计 8 / 4，总计 12。
- **保存重开**：`M11-数据透视.xlsx` 含 `销售 / 明细 / 透视1 / 透视2`；重开后点击 `透视2`，9 行计数表完整，`active=透视2`、`dirty=false`。
- **面板尺寸**：1280×820 下 360×340（x=904、y=112），scroll=client=339；900×620 下 330×340（x=560、y=104），数据状态文字隐藏，右 / 底不越界。
- **控制台**：0 错误；M11 E2E `M11 PIVOT E2E OK`。
- **回归**：release 下 M0 / M1 / M2 / M3 / M4 / M8 / M9 / M10 / multi 全过；MCP `version 0.9.0`、4 工具；Rust `cargo test --release` 6 passed。
- **构建**：1926 modules，主 JS 10,264.62 kB、CSS 179.91 kB；release profile 4m 52s，NSIS 4.19 MiB（4,392,178 B）。

正式截图在 `review-0.9/`：`900-pivot-panel.png`、`901-pivot-average.png`、`902-pivot-count.png`、`903-pivot-reopen.png`、`904-pivot-900.png`。日志：`m11-release.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`m9-release.txt`、`m10-release.txt`、`multi-release.txt`、`mcp-test.txt`、`rust-test-release.txt`、`build-release.log`。

### 21.4 已知边界

- 透视是一次性静态汇总，源数据改动后要重新点“透视”生成；没有刷新缓存、字段拖拽、切片器。
- 只支持一个行字段、一个列字段、一个值字段；不做多值字段、计算字段、自定义分组、Top N、日期层级。
- 计数按非空单元格计，不按 Excel 的“计数 / 数值计数”细分；空值仍显示 0。
- 输出是普通单元格矩阵，不写 Excel 原生 PivotTable；外部 Excel 打开后是静态表，不是可刷新透视。
- 结果表名按 `透视1…` 递增，不做重名冲突后的自定义命名；行高、数字格式沿用普通单元格默认。
- 透视面板只接受规则矩形区域；多选区、跨表区域、整列选择不走透视入口。

### 21.5 产物（v0.9.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 7,011,328 B（6.69 MB） | `20D603CCD8B434D770C3923633FAEDBD3B78B8616162FD65622363572DC32CE9` |
| `Soroban_0.9.0_x64-setup.exe` | 4,392,178 B（4.19 MB） | `FA8FEE2F0FFB83ADEC827CBCE2AD919162F9A6E1E04D7533D01FC33569CC8A12` |

产物复制到 `Soroban/` 与套件根目录，`release-0.9.0.sha256` 已写入；0.8.0 安装包保留作历史。

## 二十二 0.10.0 条件格式补全（2026-11-26）

0.10.0 补上二期条件格式的最后两项：图标集与公式规则。原有色阶 / 数据条 / 清除保持不变，条件格式下拉从 3 项扩到 5 项。

### 22.1 本期能力

- **三色图标集**：使用 Univer `IIconSetType.threeTrafficLights1`，按所选区域百分位分三档，阈值 67% / 33%——大于 67% 绿灯、33%–67% 黄灯、小于等于 33% 红灯；图标右侧保留原值。
- **公式规则**：输入以 `=` 开头的表达式，公式相对选区左上角计算；返回 TRUE 的单元格套淡黄底 `#fff1b8` 并加粗。非 `=` 开头会被拦下并提示。
- **入口**：格式工具栏“条件格式”下拉新增“三色图标集”（三圆点预览）与“公式规则”输入块（默认 `=A1>0` + 应用按钮），说明文字写明 TRUE 效果与相对引用规则。
- **保存换名**：保存为另一个路径时，条件格式 sidecar 同步复制到新键，避免另存后重开丢规则；后续编辑继续写到新路径。
- **API**：`window.__soroban.applyConditional(kind, formula?)` 暴露给 E2E；`conditionalRuleCount()` 读当前表规则数。

实现：`FormatToolbar.tsx` 扩 `onConditional` 类型与公式输入状态；`SheetEditor.tsx` 的 `applyConditional` 增加 `icons` / `formula` 分支与 `copyConditionalTo`；`App.tsx` 保存前迁移 sidecar；`theme.css` 补 `.cf-icons-preview / .cf-formula / .cf-formula-row`。

### 22.2 开发中修复的问题

- **另存后规则丢失**：sidecar 键按文档路径生成，`savePath` 改路径后仍写旧键，重开新文件规则为 0。改为保存前把全部 sheet 的规则复制到目标路径键，并让后续编辑跟随新键。
- **公式与图标同区互相遮挡**：图标规则优先级高时，绿色档位的淡黄底不显示。验收改为图标放金额列 `D2:D13`、公式放状态列 `E2:E13`，两个规则互不覆盖；同区叠加的使用边界写入 22.4。
- **E2E 等待旧文档**：同一应用内连续打开同名文档时，`sheets` 计数会命中上一份文档。改为每次打开前先回欢迎页、等待 `.sheet-tab` 挂载后再断言。

### 22.3 验收结果（release 0.10.0）

- **图标集**：`明细` D2:D13 应用三色图标集。12,000 / 15,500 / 19,000 / 22,500 / 26,000 红灯，29,500 / 33,000 / 36,500 黄灯，40,000 / 43,500 / 47,000 / 50,500 绿灯；原值均保留。
- **公式规则**：E2:E13 应用 `=D2>30000`。33,000 起 6 行套淡黄底并加粗，29,500 及以下不变。
- **保存重开**：保存为 `M12-条件格式.xlsx` 后重开，切到 `明细`，图标与公式规则均恢复，`conditionalRuleCount=2`、`active=明细`、`dirty=false`。
- **菜单尺寸**：1280×820 下 236×289（x=589、y=80），scroll=client=288；900×620 下同尺寸，右 / 底不越界。
- **控制台**：0 错误；`M12 CF E2E OK`。
- **回归**：release 下 M0 / M2 / M3 / M4 / M8 / M9 / M10 / multi 全过；MCP `version 0.10.0`、4 工具；Rust `cargo test --release` 6 passed。
- **构建**：1926 modules，主 JS 10,266.73 kB、CSS 180.88 kB；release profile 4m 48s，NSIS 4.19 MiB（4,393,453 B）。

正式截图在 `review-0.10/`：`920-cf-menu.png`、`921-cf-icons.png`、`922-cf-formula.png`、`923-cf-reopen.png`、`924-cf-900.png`。日志：`cf-release-e2e.txt`、`m0-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`m9-release.txt`、`m10-release.txt`、`multi-release.txt`、`mcp-test.txt`、`rust-test-release.txt`、`build-release.log`。

### 22.4 已知边界

- 图标集固定为三红绿灯 + 67% / 33% 两档，不做五图标、自定义阈值、反转顺序或仅图标不显示数值。
- 公式规则只支持返回 TRUE / FALSE 的表达式，不做多条件优先级、停止若真、图标与公式同区叠加时的层级管理。
- 公式相对选区左上角计算，跨表引用与整列引用未做专项校验；非法公式由 Univer 公式引擎报错。
- 条件格式仍只存 localStorage sidecar，不写进 xlsx；同机同路径可恢复，换路径 / 换机器 / 用 Excel 打开不携带。另存时的键迁移只保证本机不丢。
- 与图标集同一区域再套公式时，图标规则可能压住背景色；需要在同一区域叠加时，建议先公式后图标，或分列设置。

### 22.5 产物（v0.10.0）

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `Soroban.exe` | 7,011,840 B（6.69 MB） | `4F7055A213F2576664B66C69B8C20C388996C0CCFC2A5074C8C78317C1C042E4` |
| `Soroban_0.10.0_x64-setup.exe` | 4,393,453 B（4.19 MB） | `DDD57EC8971501C583BADEC171CC3AC36E235A546D8FA1BA419156F4822F1E70` |

产物复制到 `Soroban/` 与套件根目录，`release-0.10.0.sha256` 已写入；0.9.0 安装包保留作历史。

*小方工作室 · Soroban · 0.10.0 条件格式补全 ｜ Papyra 办公套件 ｜ 2026-11-26*


