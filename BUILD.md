# Soroban · 构建与验收

> 小方工作室 · Papyra 办公套件 ｜ 适用 M0 / M1 / M2 / M3 / M4 / M8 / M9 / M10 / 透视 / 条件格式（v0.10.0）
> 开发机：Windows 10/11 + PowerShell 7 + Node 22 + Rust stable + VS Build Tools（Tauri 2 需要 WebView2 与 MSVC）

## 一 环境

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| Node.js | ≥ 22 | Vite / TypeScript / 验收脚本 |
| Rust | stable（cargo 1.8x） | Tauri 后端、MCP |
| WebView2 Runtime | Windows 11 自带 | 运行窗口 |
| MSVC Build Tools | 2022 | Tauri 编译 |

首次安装：

```powershell
cd D:\20533\deskbox\fangwork\Papyra\Soroban
npm install
```

图标由矢量源生成，不手改 PNG：

```powershell
npm run icons
```

## 二 开发

```powershell
cd D:\20533\deskbox\fangwork\Papyra\Soroban
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9446'
npm run tauri dev
```

- Vite 端口固定 **1421**（1420 常被本机其他 Node 进程占用）
- dev 调试端口 **9446**；release 验收用 **9445**，两套分开避免端口冲突
- 调试端口仅供验收；正式运行不需要设置该环境变量

只跑前端：

```powershell
npm run dev
```

## 三 目录

```
Soroban/
  index.html
  src/
    App.tsx                 启动页 / 欢迎页 / 编辑器三态，打开、保存、最近文件
    main.tsx                入口，引入 Univer 样式与主题
    theme.css               家族令牌、顶栏、公式栏、标签、欢迎页、900 窄窗
    components/
      SheetEditor.tsx       Univer 实例、导入导出、公式归一化、公式栏、函数提示、sheet 标签、格式 / CF / 图表接入
      FormulaHelper.tsx     提示卡与函数库面板
      FormatToolbar.tsx     自研格式工具栏、颜色 / 边框 / 条件格式弹层
      ChartSvg.tsx          柱 / 折 / 面积 / 饼四种 SVG 图
      ChartLayer.tsx        图表工作室与浮动图表卡
      TopBar.tsx            文件 / 编辑按钮、文件名、保存状态
      Welcome.tsx           左栏入口 + 最近文件卡
      Splash.tsx            620ms 启动页
      Icons.tsx             线性图标
    lib/
      tauri.ts              read_document / write_document / 文件探测
      recents.ts            最近文件 localStorage
      formulas.ts           528 函数表、常用排序、搜索/前缀匹配
      charts.ts             图表类型 / 数据归一化 / sidecar 读写
  src-tauri/
    src/lib.rs              窗口入口、二进制读写、原子保存
    src/mcp.rs              --mcp stdio 服务（4 个只读工具）
    src/formula_catalog.json 528 函数目录（由脚本生成，编译期内嵌）
    tauri.conf.json         1280×820，最小 900×600，v0.6.0
    capabilities/           仅 core + dialog
    icons/                  由 assets/*.svg 生成
  assets/
    M0-样本.xlsx            2 sheet、公式、样式、合并、冻结
    M0-样本.csv             中文 CSV 预览样本
    M1-跨表.xlsx            2 sheet、跨表公式、15 项常用函数实算
    M1-十万行.xlsx          100,001 行 × 8 列，10,300,431 B
    soroban-icon*.svg       图标矢量源
  scripts/
    make-fixture.mjs        生成 M0 样本
    make-fixture-m1.mjs     生成 M1 跨表样本（ExcelJS 带样式）
    make-large-fixture.mjs  生成十万行样本
    make-formula-catalog.mjs 从引擎 zh-CN 表生成 Rust JSON
    make-icons.mjs          SVG → PNG/ICO
    e2e-m0.mjs              M0 真实 WebView 全链路
    e2e-layout.mjs          M0 900×620 窄窗
    e2e-m1.mjs              M1 提示卡 / 函数库 / 跨表往返
    e2e-m1-layout.mjs       M1 900×620 面板与表格布局
    e2e-m1-perf.mjs         十万行深滚帧率
    e2e-mcp.mjs             MCP stdio 验收（4 工具）
  review-m0/                M0 验收日志与截图
  review-m1/                M1 验收日志与截图
```

## 四 测试

### 4.1 Rust 单测

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

覆盖：xlsx workbook 解析、样本校验、CSV 预览、拒绝相对路径。

### 4.2 真实 WebView 端到端

先按第二节启动 dev（带 9446 调试端口），再执行：

```powershell
$env:SOROBAN_CDP='9446'
node scripts/e2e-m0.mjs
node scripts/e2e-layout.mjs
```

`e2e-m0.mjs` 断言：

1. 欢迎页有「新建 / 打开」，无横向溢出
2. 空白新建后网格键入 `45`、`=A1*2`，B1 = 90
3. 打开 `M0-样本.xlsx`：2 个标签「销售 / 明细」，公式重算 54000 / 473700，`dirty=false`
4. 切到明细、A14 写 `=SUM(D2:D13)` → 375000
5. 撤销清空、重做恢复
6. 保存到 `M0-编辑.xlsx`，重开 A14 公式与结果都在
7. 控制台零 error，末行 `M0 UI OK`

`e2e-layout.mjs` 断言 900×620 下顶栏最右元素 ≤ 900、无横向滚动、标签可见。

### 4.3 MCP

```powershell
$env:SOROBAN_EXE='.\Soroban.exe'
node scripts/e2e-mcp.mjs
```

不设 `SOROBAN_EXE` 时用 `src-tauri/target/debug/soroban.exe`；正式验收必须指向根目录当前版本 exe。依次调用 initialize / tools/list / workbook_info / validate / csv_preview / formula_search，首行 `serverInfo.version` 应与当前版本一致（0.7.0），末行 `MCP M1 OK`。

也可直接验证：

```powershell
.\Soroban.exe --mcp
```

### 4.4 M1 公式与性能

```powershell
$env:SOROBAN_CDP='9445'
node scripts/e2e-m1.mjs
node scripts/e2e-m1-layout.mjs
node scripts/e2e-m1-perf.mjs
```

- `e2e-m1.mjs`：`=SU` 提示卡、点选 SUM 算 1+2+3、函数库 528 个、按「日期」搜索、跨表公式 15 项、保存重开，末行 `M1 UI OK`
- `e2e-m1-layout.mjs`：900×620 下提示卡 / 函数库 / 汇总表不越界，末行 `M1 Layout 900 OK`
- `e2e-m1-perf.mjs`：打开 `M1-十万行.xlsx`，校验 100,001 数据行，深滚采样 3.2s，要求 `fps ≥ 55`、慢帧 ≤ 2，末行 `M1 PERF OK`
- 高刷屏可能报 120–165fps；60Hz 机器以 60 为上限，55 是验收下限

样本重建：

```powershell
node scripts/make-fixture-m1.mjs
node scripts/make-large-fixture.mjs 100000
node scripts/make-formula-catalog.mjs
```

### 4.5 M2 格式 / 条件格式 / 图表

```powershell
$env:SOROBAN_CDP='9445'
node scripts/e2e-m2.mjs
```

- 五段全跑：格式工具栏（B 列人民币、D 列加粗 + 填充、按钮 active）、CF 色阶→清除→数据条、图表工作室与四类型 + 插入 + 联动、保存重开、900×620 布局
- 末行依次输出 `M2 UI OK`、`M2 Layout 900 OK`、`M2 CHARTS OK`、`M2 ROUNDTRIP OK`
- dev 环境用 `$env:SOROBAN_CDP='9446'`；release 用 9445
- 样本重建：`node scripts/make-fixture-m2.mjs`

### 4.6 M3 排序 / 筛选 / 冻结 / 工作表 / CSV

```powershell
$env:SOROBAN_CDP='9445'
node scripts/e2e-m3.mjs
```

- 八段全跑：数据工具栏与排序弹层、18 行降序与公式平移、筛选 7/18 与清除、三种冻结、工作表改名 / 复制 / 新建 / 删除、UTF-8 与 GB18030 CSV 导入、CSV 导出 BOM 与回读、筛选状态保存重开、900×620 四类弹层边界
- 末行依次输出 `M3 UI OK`、`M3 SORT OK`、`M3 FILTER OK`、`M3 FREEZE OK`、`M3 SHEETS OK`、`M3 CSV OK`、`M3 SAVE OK`、`M3 Layout 900 OK`
- dev 环境用 `$env:SOROBAN_CDP='9446'`；release 用 9445
- 样本重建：`node scripts/make-fixture-m3.mjs`
- E2E 会生成 `review-m3/M3-筛选保存.xlsx`、`M3-导出.csv`、`M3-导出回读.xlsx`，跑完需清理，正式截图只留 `300–317`

### 4.7 M4 打印 / A4 分页 / 页眉页脚

```powershell
$env:SOROBAN_CDP='9445'
node scripts/e2e-m4.mjs
```

- 十三段全跑：工作台与 A4 纵向 2 页、横向 4 页、100% 10 页、关闭网格 / 页眉 / 页脚、非法区域拦截、`A1:G20` 单页、当前选区 + sidecar 重开、打印媒体尺寸、900×620、`window.print` 调用、打印态 PDF、筛选后只打印可见行、`Ctrl+P` 快捷键
- 末行依次输出 `M4 PRINT UI OK`、`M4 LANDSCAPE OK`、`M4 SCALE OK`、`M4 CHROME OK`、`M4 AREA ERROR OK`、`M4 AREA OK`、`M4 SELECTION OK`、`M4 PRINT MEDIA OK`、`M4 900 OK`、`M4 PRINT CALL OK`、`M4 PDF OK`、`M4 FILTER PRINT OK`、`M4 SHORTCUT OK`，最后 `ALL M4 UI CHECKS PASSED`
- dev 环境用 `$env:SOROBAN_CDP='9446'`；release 用 9445。E2E 会覆盖生成 `review-m4/400–412` 截图与 `m4-print-preview.pdf`
- 样本重建：`node scripts/make-fixture-m4.mjs`
- 原生对话框单独复验：release 打开样本 → 打印 → 打印，系统窗口应显示「总数: 2 纸张」；截图 `review-m4/409-native-print.png`
- E2E 退出后如需清理文档状态，杀掉 Soroban 进程再重开，避免打印预览窗口挡住后续操作

### 4.8 多键排序 / 多条件筛选

```powershell
$env:SOROBAN_CDP='9445'
node scripts/e2e-multi.mjs
```

- 五段全跑：E 状态升序 + D 金额降序的双键排序、AND 双条件 6/18、OR 双条件 10/18、重开筛选面板保持「任一条件」、900×620 双键面板不越界
- 末行依次输出 `MULTI SORT OK`、`MULTI FILTER AND OK`、`MULTI FILTER OR OK`、`MULTI FILTER MODE PERSIST OK`、`MULTI 900 OK`，最后 `ALL MULTI SORT / FILTER CHECKS PASSED`
- dev 用 9446，release 用 9445；截图写入 `review-0.5.1/500–503`
- 样本同 M3：`assets/M3-整理.xlsx`

### 4.9 单元格工具（0.7.0）

```powershell
$env:SOROBAN_CDP='9445'
node scripts/e2e-m9.mjs
```

- 七段全跑：公式栏「单元格工具」入口与 360px 面板；A1:F1 合并并居中；九种边框取四边；自动换行 + 底端对齐；行插入与 D 列左侧插入（原 D3 15500 移到 E3）；保存重开校验合并 / 边框色 / `tb=3` / `vt=3` / 行高 ≥150；900×620 面板不越界
- 末行依次输出 `M9 CELL TOOLS OK`、`MERGE OK`、`BORDER OK`、`WRAP OK`、`STRUCTURE OK`、`ROUNDTRIP OK`、`Layout 900 OK`
- 每次运行前从 `assets/M0-样本.xlsx` 复制到 `review-0.7/M0-单元格工具-working.xlsx`，禁止直接打开 `assets` 原始样本（自动保存会回写）
- dev 用 9446，release 用 9445；截图写入 `review-0.7/700–703`
- 保存样本：`review-0.7/M9-单元格工具.xlsx`

### 4.10 渲染专项（大表 / 打印 / 图表）

```powershell
$env:SOROBAN_CDP='9445'
$env:SOROBAN_REVIEW_DIR='review-0.7'
node scripts/e2e-render.mjs
```

- 十万行画布必须等于视口、DOM < 400、选区 A1；打印预览 6 页 `content-visibility=auto`、打印态恢复、PDF 6 页；图表卡片视口内可见
- 严格帧率断言为 `fps ≥ 55`、慢帧 ≤ 2；本机高负载时远程注入滚轮会每个事件产生 1 个慢帧，0.6.1 旧包同条件同样 24，属于环境噪声。功能子项通过时以 `render-release-diag.txt` 记录实际 FPS，不以放宽断言掩盖

## 五 构建

```powershell
cd D:\20533\deskbox\fangwork\Papyra\Soroban
npx tsc --noEmit
npx tauri build --no-bundle
npx tauri bundle --bundles nsis
Copy-Item src-tauri\target\release\soroban.exe .\Soroban.exe -Force
```

先出 exe 再打 NSIS；`tauri bundle` 会给 target 里的 exe 补 bundle 元信息，所以最后复制的应是 bundle 之后的 `target\release\soroban.exe`，不要用更早的副本。

## 六 文件 IO 说明

- **读**：前端 `invoke("read_document")`，Rust 用 `tauri::ipc::Response` 返回 `Vec<u8>`，整份文件一次进内存
- **写**：前端把 Univer 快照经 `@mertdeveci55/univer-import-export` 生成 xlsx buffer，再 `invoke("write_document", { path, data })`
- **原子替换**：先写 `*.soroban-tmp`；若目标存在先改名为 `*.soroban-bak`，rename 成功再删备份；失败回滚原文件
- **公式导入**：桥接库把公式放在 `v`（字符串）或 `f` 缓存值两种形态。`normalizeFormulas()` 统一改成 `f`、清掉 `v` 缓存；建簿后调用 `univerAPI.getFormula().executeCalculation()` 重算
- **版式修复**：部分 xlsx 不带行高，桥接库返回 `h=0 / ah=0` 会让网格空白；`normalizeLayout()` 回填 `defaultRowHeight` / `defaultColumnWidth`，零宽列同步修复
- **大小上限**：M0 前端限制 80MB；超出直接中文报错，不尝试解析

## 七 M0 / M1 / M2 / M3 / M4 验收记录

| 项 | 结果 |
| --- | --- |
| 打开样本 | 2 sheet，值 / 公式 / 样式 / 合并 / 冻结保留 |
| 空白编辑 | 45 + `=A1*2` → 90 |
| 公式栏 | A14 `=SUM(D2:D13)` → 375000 |
| 撤销 / 重做 | 清空 / 恢复正确 |
| 保存重开 | 公式、结果、2 sheet 全部保留 |
| 900 窄窗 | 无横向溢出 |
| MCP | 3 工具全过 |
| Rust | 4 passed |
| 控制台 | 0 error |
| Release exe 真实 WebView | `M0 UI OK` / `Layout 900 OK` |
| Release exe MCP | `MCP M0 OK` |

日志：`review-m0/m0-ui-release.txt`、`review-m0/m0-mcp-release.txt`、`review-m0/m0-layout-release.txt`、`review-m0/m0-rust-test.txt`。

### M0 产物（历史，根目录已由 0.5.0 替换）

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,753,280 B | `CA205A0D3F8DD40FE17FA83A4962094940030FDA5BB22D5695D3A98B50965AB2` |
| `Soroban_0.1.0_x64-setup.exe` | 4,228,882 B | `41B4DBBBEF6AE8C4588E737B8CC90FC099E3BBEF12A1FD998CAF943EAFD1CAEA` |

均未签名。

### 7.5 M1 验收记录

| 项 | 结果 |
| --- | --- |
| 公式提示 | `=SU` 6 项，SUM 填入 `1,2,3)` → 6 |
| 函数库 | 528 个，搜索「日期」命中 TODAY / DATEDIF |
| 跨表 | 15 项函数实算全对，SUM 375000、SUMIFS 345000 |
| 保存重开 | `M1-跨表-编辑.xlsx` 9,772 B，公式与结果保留 |
| 900 窄窗 | 提示卡 / 函数库 / 汇总表不越界，`M1 Layout 900 OK` |
| 十万行 | 14.8s 打开，100,002 行，164.4fps，slow 0 |
| MCP | 4 工具，函数检索 total 528，`MCP M1 OK` |
| Rust | 6 passed |
| M0 回归 | `M0 UI OK` |
| Release exe | `M1 UI OK` / `M1 PERF OK` / `MCP M1 OK` |

日志：`review-m1/m1-ui-release.txt`、`m1-layout-release.txt`、`m1-perf-release.txt`、`m1-mcp-release.txt`、`m0-ui-regression-release.txt`、`m1-rust-test.txt`。

### 7.6 M1 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,872,064 B | `005278B537ACA836A8A0BD5CB64FDA28A5A52B71F2001A8537E2056AECF9D28A` |
| `Soroban_0.2.0_x64-setup.exe` | 4,252,344 B | `547DE3AF6D7EFA84AFDF3D3DD75D457BA0EF0184987E5A177F96B8F2B2E4D621` |

均未签名。旧 0.1.0 安装包已从根目录移除。

### 7.7 M2 验收记录（v0.3.0）

| 项 | 结果 |
| --- | --- |
| 格式 | B 列 `¥#,##0.00`；D 列加粗 + `#d3f4e6`；B 按钮 active |
| 条件格式 | 色阶 1 → 清除 0 → 数据条 1；色阶 / 数据条均渲染 |
| 图表 | 工作室 A1:C13 / `柱状图 · 月度` / sum 3213000；柱折面积饼四卡 |
| 联动 | B2 128000→260000，sum 3345000，柱高与纵轴同步 |
| 纵轴 | 0 / 7.5万 / 15万 / 22.5万 / 30万，不再把 26 万抬到 50 万 |
| 保存重开 | `M2-图表-编辑.xlsx`，CF=1、cards=1、sum 3213000 |
| 900 窄窗 | 工具栏 lastRight 892；工作室 right 888 / bottom 545；四卡 2×2，右 700 / 底 532 |
| M2 E2E | `M2 UI OK` / `M2 Layout 900 OK` / `M2 CHARTS OK` / `M2 ROUNDTRIP OK` |
| M0 回归 | `M0 UI OK` |
| M1 回归 | `M1 UI OK` / `M1 Layout 900 OK` |
| 十万行 | 18.5s 打开，100,002 行，163.7fps，slow 0，`M1 PERF OK` |
| MCP | version 0.3.0，4 工具，`MCP M1 OK` |
| Rust | 6 passed |

日志：`review-m2/m2-ui-release.txt`、`m0-ui-regression-release.txt`、`m0-layout-regression-release.txt`、`m1-ui-regression-release.txt`、`m1-layout-regression-release.txt`、`m1-perf-regression-release.txt`、`mcp-m2-release.txt`、`rust-test-m2.txt`。

### 7.8 M2 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,932,480 B | `19F698619E9BACDD42EBD539CDC980EDD5992D5D8536D2F8230EF91276653509` |
| `Soroban_0.3.0_x64-setup.exe` | 4,312,164 B | `B816E2908CF2F5E15FE21ED072BC227D5D9832B64D312C5A31CAFA7CC244B1B8` |

均未签名。旧 0.2.0 安装包已从根目录移除。

### 7.9 M3 验收记录（v0.4.0）

| 项 | 结果 |
| --- | --- |
| 排序 | 18 行金额降序 268000→42100；`G2:G19` 公式平移正确；合计 2330900 / 745888 |
| 筛选 | `{matched:7,total:18}`，hidden 11，表头可见，`筛选 7/18`；清除后恢复 |
| 冻结 | 首行 `{1,0}`、B2 `{1,1}`、取消 `null` |
| 工作表 | 2 表改名 / 复制 3 表 / 新建 4 表 / 删除 3 表 |
| CSV 导入 | UTF-8 4 行、GB18030 4 行；逗号 / 引号 / 单元格换行正确 |
| CSV 导出 | 1,258 B，UTF-8 BOM；回读 xlsx 7,814 B，合计 2330900 |
| 保存重开 | 2 sheets、hidden 0、filter null、18 行、`G2=D2*0.32`、总毛利 745888 |
| 900 窄窗 | 工具栏 900×33；四类弹层全部在 900×620 内 |
| M3 E2E | `M3 UI OK` / `M3 SORT OK` / `M3 FILTER OK` / `M3 FREEZE OK` / `M3 SHEETS OK` / `M3 CSV OK` / `M3 SAVE OK` / `M3 Layout 900 OK` |
| MCP | version 0.4.0，4 工具，`MCP M1 OK` |

截图：`review-m3/300-sort-panel.png` 至 `317-sheets-900.png`，共 18 张，由 release 0.4.0 复验生成；日志 `m3-e2e-release.txt`、`mcp-m3-release.txt`。

### 7.10 M3 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,939,136 B | `1CEF46C6FE4E202FE0FE8161457A9244F8976BA29B326B9E41645899C183265F` |
| `Soroban_0.4.0_x64-setup.exe` | 4,319,948 B | `3A46414CF65870EF4E2495095E2CCBECAED7153DF694416F6BB95FBBD1EAC82D` |

均未签名。旧 0.3.0 安装包已从根目录移除。

### 7.11 M4 验收记录（v0.5.0）

| 项 | 结果 |
| --- | --- |
| 默认纵向 | A4 2 页，48 + 33 行，适应页宽 62% |
| 横向 | A4 4 页，适应页宽 91% |
| 横向 100% | 10 页，列带 A–H / I–K 两段，末带均衡 |
| 关闭装饰 | 网格 / 页眉 / 页脚均不渲染，纸张仍为 A4 |
| 非法区域 | `A1::K82` 红字提示，打印按钮 disabled |
| 指定区域 | `A1:G20` 1 页 19 行；当前选区 `A1:G16` 1 页 |
| sidecar | 关闭重开仍 `A1:G16`、横向、适应页宽 |
| 打印媒体 | 793.7×1122.5px、`zoom=1`、表格 972 / 993px、页间 0 |
| 900 窄窗 | 窗口 880×600，纸张宽 349px，按钮可见，顶栏无溢出 |
| 原生调用 | `window.print` 拦截计数 1，按钮恢复「打印」 |
| PDF | 2 页、406,064 B、594.96×841.92pt；表头逐页重复、合计加粗 |
| 筛选打印 | 「待发货」20/81，工作台 1 页、只输出 20 行 |
| 快捷键 | `Ctrl+P` 打开打印工作台，Escape 关闭 |
| 原生对话框 | 「总数: 2 纸张」、纵向、全部，未实际出纸 |
| MCP | version 0.5.0，4 工具，`MCP M1 OK` |
| Rust | 6 passed |
| M0–M3 回归 | `M0 UI OK` / `Layout 900 OK` / `M1 UI OK` / `M1 Layout 900 OK` / `M2 UI OK` / `M2 Layout 900 OK` / `M2 CHARTS OK` / `M2 ROUNDTRIP OK` / `M3 八行 OK` |
| M4 E2E | 十三行 `M4 … OK`，末行 `ALL M4 UI CHECKS PASSED` |

截图：`review-m4/400-print-studio.png` 至 `412-print-filtered.png`，另 `410/411-pdf-page-*.png`；全部由 release 0.5.0 复验生成。日志 `m4-e2e-release.txt`、`mcp-m4-release.txt`、`m4-native-print.txt`、`m4-build-release.txt`。

### 7.12 M4 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,944,256 B | `723024ABD15E6D2B1F7E6CD33C0B1A4DE2C9B3B3DF6ABC8A39A0398F1D168717` |
| `Soroban_0.5.0_x64-setup.exe` | 4,325,110 B | `42F88E9FA861FE5DB5952CB3A1A46C1723515BF64BEF04CD8FA70185B71A90B0` |

均未签名。旧 0.4.0 安装包已从根目录移除。

回归日志：`review-m4/regression-m0.txt`、`regression-m0-layout.txt`、`regression-m1.txt`、`regression-m1-layout.txt`、`regression-m2.txt`、`regression-m3.txt`。

### 7.13 0.5.1 多键排序 / 多条件筛选验收记录

| 项 | 结果 |
| --- | --- |
| 双键排序 | E 状态升序 + D 金额降序；18 行公式 `=Dn*0.32`；金额合计 2,330,900 |
| AND 双条件 | E=已完成 且 D>100000 → 6/18，隐藏 12 行 |
| OR 双条件 | E=已完成 或 E=待发货 → 10/18 |
| 模式保持 | 重开筛选面板仍为「任一条件」 |
| 900 窄窗 | 排序面板 right 300 / bottom 306，无横向溢出 |
| M3 回归 | 八行 `M3 … OK`，含新排序弹层 |
| M4 回归 | 十三行 `M4 … OK`，`ALL M4 UI CHECKS PASSED`；`review-m4/400–412` 与 PDF 已由 0.5.1 覆盖，409 原生对话框仍是 0.5.0 记录 |
| M0 / M1 / M2 回归 | `M0 UI OK` / `Layout 900 OK` / `M1 UI OK` / `M1 Layout 900 OK` / `M2 UI OK` / `M2 Layout 900 OK` / `M2 CHARTS OK` / `M2 ROUNDTRIP OK` |
| MCP | version 0.5.1，4 工具，`MCP M1 OK` |
| Rust | 6 passed |

截图：`review-0.5.1/500-multi-sort.png` 至 `503-multi-sort-900.png`，由 release 0.5.1 生成；M3 回归截图在 `review-0.5.1/m3-release/`。日志 `e2e-release.txt`、`e2e-dev.txt`、`m3-release.txt`、`m3-regression.txt`、`review-m4/m4-e2e-release.txt`、`m4-regression-dev.txt`、`mcp-release.txt`、`rust-test-release.txt`、`build-release.txt`。

### 7.14 0.5.1 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,945,792 B | `612D77D2227CBFB679ADEF4FA6F1BC425C73AD8D19773BD83F322B712FFFD808` |
| `Soroban_0.5.1_x64-setup.exe` | 4,326,136 B | `30524F740DF52F74D38BE8FD951FF4D731CA3EF3AE9AC9902CA995AAA47E80EE` |

均未签名。旧 0.5.0 安装包已从根目录移除；0.5.0 的哈希与验收记录保留作历史。

### 7.15 0.6.0 编辑效率 / CSV 预览

| 项 | 结果 |
| --- | --- |
| 查找替换 | `已完成` 7 处；步进第 2/7；单次替换后 6 处；全部替换后 0 处，提示“已替换 6 处”；公式单元格跳过 |
| 自动保存 | H1 写入后 dirty=false，落盘 9,749 B；仅已保存路径 / 非编辑 / 非筛选 / 非 busy 生效，60 秒一次 |
| 自定义序列 | `待发货 → 已完成 → 进行中`，首行“待发货”，序列内非降，未列值排后 |
| 标签颜色 | 订单 sheet 设为 `#2f80ed`，`sheetTabs()` 回读一致，随 xlsx tabColor 保存 |
| CSV 预览 | 4 行 7 列，UTF-8 / 逗号 / 首行标题；标题开关可切；导入后 A1=`订单号`、D2=`128000` |
| 900 窄窗 | 查找面板 344×195，right 882 / bottom 349；CSV 弹窗 760×423，right 830 / bottom 521.5 |
| M8 E2E | `M8 FIND OK` / `CUSTOM SORT OK` / `TAB COLOR OK` / `CSV PREVIEW OK` / `AUTOSAVE OK` / `Layout 900 OK`，末行 `ALL 0.6.0 CHECKS PASSED` |
| M0 / M1 / M2 / M3 / M4 | release 全部通过；M3 八行 `M3 … OK`，排序选项数改为 10；M4 十三行全过 |
| MCP | version 0.6.0，4 工具，`MCP M1 OK` |
| Rust | 6 passed |
| 构建 | 1913 modules，主 JS 9,894.50 kB、CSS 170.03 kB；release 1m 10s；NSIS 4.13 MiB |

截图：`review-0.6.0/600-find.png` 至 `608-csv-900.png`，由 release 0.6.0 生成；M3/M4 release 截图在 `review-0.6.0/m3-release/`、`m4-release/`。日志 `m8-release.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`multi-release.txt`、`mcp-release.txt`、`rust-test-release.txt`、`build-web.txt`、`build-release.txt`。

### 7.16 0.6.0 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,949,888 B | `EFF36DAFFB3066E74698CA368B473ECC92CF453CCC2D6644121334B575EF7659` |
| `Soroban_0.6.0_x64-setup.exe` | 4,331,309 B | `9577EE7A96524C3D58658D3E00A54C3DBA711423B3C3B916A1EE50DB1BA3C8B2` |

均未签名。0.5.1 安装包已从 `Soroban/` 与套件根移除；`release-0.5.1.sha256` 保留作历史，`release-0.6.0.sha256` 已写入。

### 7.17 0.6.1 渲染收敛 / Bugfix 验收记录

| 项 | 结果 |
| --- | --- |
| 十万行画布 | 100,002 行 × 20 列；Grid 画布 1280×620 CSS（位图 1920×930），DOM 194，选区 A1、名称框 A1 |
| 滚动 | 24 次滚轮翻页，147 FPS，平均帧 6.8 ms，慢帧 0；画布容器高度始终等于视口 |
| 打印预览 | 100% 六页；屏幕态 6 页 `content-visibility=auto` + `contain-intrinsic-size`；打印态 6 页全部 `visible`、`zoom=1`；PDF 输出 6 页，第 1 / 6 页均有完整表头与数据 |
| 图表浮层 | 新建柱状图 1 张，`content-visibility=auto`，视口内可见，数据联动正常 |
| CSV 选区 | 导入后选区 A1，不再选中 4×7 数据块 |
| M0 | `M0 UI OK`；合并单元格 A1 公式栏仍显示“2026 年第四季度销售台账”，未被误改到 A2 |
| M1 / M2 / M3 / M4 / M8 | release 全部通过；M4 十三行、M8 六组全过 |
| multi / MCP / Rust | multi 五项全过；MCP version 0.6.1 四工具；Rust 6 passed |
| 构建 | 1913 modules，主 JS 9,894.70 kB、CSS 170.31 kB；release 1m 19s；NSIS 4.13 MiB |

截图：`review-0.6.1/610-render-large.png`、`611-render-scrolled.png`、`612-render-print.png`、`613-render-charts.png`，由 release 0.6.1 生成；打印 PDF 为 `review-0.6.1/render-print.pdf`（6 页）。日志：`render-e2e.txt`、`render-release-final-console.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`multi-release.txt`、`mcp-release.txt`、`rust-test-release.txt`、`build-web-final.txt`、`build-release-final.txt`。

### 7.18 0.6.1 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,949,888 B | `520751DFB015F9C6654EE9CD2C60FD4B3D036DAA5DF715FC50F97D7BC7B71DC4` |
| `Soroban_0.6.1_x64-setup.exe` | 4,331,527 B | `5CADC5ED6D744FCBBA53621AE5728BA137FECACDA30B667C353AE3AC38CAE463` |

均未签名。0.6.0 安装包保留作历史；`release-0.6.1.sha256` 已写入。

### 7.19 0.7.0 单元格工具验收记录

| 项 | 结果 |
| --- | --- |
| M9 面板 | 360×414，1280×820 与 900×620 均在视口内 |
| 合并 | A1:F1 合并并居中，重开保持 `ht / vt / wrap` |
| 边框 | `#8fb3a2` 四边正确，重开保留 |
| 换行 / 垂直 | `tb=3` 自动换行；`vt=3` 底端；重开行高 ≥150，长备注完整 |
| 行列结构 | 插入行、D 列左侧插入，原 D3 15500 移到 E3；删除 / 隐藏 / 显示通过 |
| 保存重开 | `review-0.7/M9-单元格工具.xlsx` 全部保持 |
| M0–M4 / M8 / multi | release 全部通过；M4 PDF 2 页 406,066 B，页脚日期按当天 |
| 渲染专项 | 画布 1280×620 CSS、DOM 199、选区 A1；打印 6 页 / PDF 6 页；图表卡片视口内；滚动平均 74.2 FPS，严格慢帧断言见 4.10 |
| MCP / Rust | version 0.7.0 四工具；`cargo test --release` 6 passed |
| 构建 | 1914 modules，主 JS 9,903.29 kB、CSS 174.14 kB；release 1m 39s；NSIS 4.13 MiB |

截图：`review-0.7/700-cell-tools.png`、`701-cell-tools-applied.png`、`702-cell-tools-900.png`、`703-cell-tools-reopen.png`。日志：`m9-release.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`multi-release.txt`、`mcp-release.txt`、`rust-test-release.txt`、`render-release-diag.txt`、`render-perf-strict-fail.txt`、`build-web-final.txt`、`build-release-final.txt`。

### 7.20 0.7.0 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 6,952,960 B | `A39B0577FE31C42175B0D4122908BCA47E1E6E323229E022DDFD44DF2FDFACE4` |
| `Soroban_0.7.0_x64-setup.exe` | 4,333,728 B | `09A2305F35B625DC2850918213CB37A028E3A8F8180BB8245730DD8D744D25CE` |

均未签名。0.6.1 安装包保留作历史；`release-0.7.0.sha256` 已写入。

### 7.21 0.8.0 数据验证验收记录

| 项 | 结果 |
| --- | --- |
| M10 面板 | 360×419，1280×820 与 900×620 均在视口内，无横向溢出 |
| 下拉列表 | H2:H6 写入 `高 / 中 / 低`；单元格右侧下拉箭头显示；`超高` 状态为 `invalid` 并标红 |
| 数值规则 | B3:B5 整数区间 100000–200000；面板回填“数值区间 / 只允许整数” |
| 清除 | H2:H6 清除后规则数 2→1，下拉箭头消失，B 列规则保留 |
| 保存重开 | 2 条规则完整；重开后直接应用不被拼成单项 |
| 标准 XML | 删除 `xl/soroban-validations.json` 后仍回读 2 条；ExcelJS 读到 2 条 `dataValidations` |
| M0–M4 / M8 / M9 / multi | release 全过 |
| MCP / Rust | version 0.8.0 四工具；`cargo test --release` 6 passed |
| 构建 | 2012 modules，主 JS 10,141.30 kB；release 3m 54s；NSIS 4.19 MiB |
| 渲染专项 | 画布 / DOM / 选区 / 打印 / PDF / 图表通过；滚动 24 慢帧与旧版同条件一致，见 4.10 |

截图：`review-0.8/800-dv-list.png`、`801-dv-invalid.png`、`802-dv-number.png`、`803-dv-reopen.png`、`804-dv-cleared.png`、`805-dv-900.png`。日志：`release-e2e-*.log`、`mcp-test.txt`、`rust-test.txt`、`build-release.txt`、`render-perf-strict-fail.txt`、`render-release-diag.txt`。

### 7.22 0.8.0 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 7,008,256 B | `6DFC72534475790DAD78BEC250B0D327880BE8249D79830D48A0B02044D5C6CA` |
| `Soroban_0.8.0_x64-setup.exe` | 4,389,644 B | `DEF80427B8CA4BF002A2B1677B195497830D824C407EE68490CAA93EE057785F` |

均未签名。0.7.0 安装包保留作历史；`release-0.8.0.sha256` 已写入。

### 7.23 0.9.0 数据透视验收记录

| 项 | 结果 |
| --- | --- |
| 平均值 | 客户 × 状态 × 金额：方岛 27750、康岛 40000/22500、南山 38250/12000、前海 33000/33000、深圳湾 26000/43500；总计 31250 |
| 计数 | 同维度：行总计 2/2/3/3/2，列小计 8/4，总计 12 |
| 保存重开 | `M11-数据透视.xlsx` 四表；重开点击 `透视2`，9 行计数表完整，active=透视2，dirty=false |
| 面板 1280 | 360×340（x=904、y=112），scroll=client=339 |
| 面板 900 | 330×340（x=560、y=104），数据状态文字隐藏，无越界 |
| M0–M4 / M8–M10 / multi | release 全过 |
| MCP / Rust | version 0.9.0 四工具；`cargo test --release` 6 passed |
| 构建 | 1926 modules，主 JS 10,264.62 kB；release 4m 52s；NSIS 4.19 MiB |

截图：`review-0.9/900-pivot-panel.png`、`901-pivot-average.png`、`902-pivot-count.png`、`903-pivot-reopen.png`、`904-pivot-900.png`。日志：`m11-release.txt`、`m0-release.txt`、`m1-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`m9-release.txt`、`m10-release.txt`、`multi-release.txt`、`mcp-test.txt`、`rust-test-release.txt`、`build-release.log`。

### 7.24 0.9.0 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 7,011,328 B | `20D603CCD8B434D770C3923633FAEDBD3B78B8616162FD65622363572DC32CE9` |
| `Soroban_0.9.0_x64-setup.exe` | 4,392,178 B | `FA8FEE2F0FFB83ADEC827CBCE2AD919162F9A6E1E04D7533D01FC33569CC8A12` |

均未签名。0.8.0 安装包保留作历史；`release-0.9.0.sha256` 已写入。

### 7.25 0.10.0 条件格式验收记录

| 项 | 结果 |
| --- | --- |
| 三色图标集 | D2:D13，67% / 33% 两档：12,000–26,000 红、29,500–36,500 黄、40,000–50,500 绿，原值保留 |
| 公式规则 | E2:E13，`=D2>30000`：33,000 起 6 行淡黄底加粗 |
| 保存重开 | `M12-条件格式.xlsx` 重开切 `明细`，规则数 2，active=明细，dirty=false |
| 菜单 1280 | 236×289（x=589、y=80），scroll=client=288 |
| 菜单 900 | 236×289（x=589、y=80），右 / 底不越界 |
| 另存迁移 | sidecar 从 working 路径复制到目标路径，重开目标文件规则仍在 |
| M0 / M2–M4 / M8–M10 / multi | release 全过 |
| MCP / Rust | version 0.10.0 四工具；`cargo test --release` 6 passed |
| 构建 | 1926 modules，主 JS 10,266.73 kB、CSS 180.88 kB；release 4m 48s；NSIS 4.19 MiB |

截图：`review-0.10/920-cf-menu.png`、`921-cf-icons.png`、`922-cf-formula.png`、`923-cf-reopen.png`、`924-cf-900.png`。日志：`cf-release-e2e.txt`、`m0-release.txt`、`m2-release.txt`、`m3-release.txt`、`m4-release.txt`、`m8-release.txt`、`m9-release.txt`、`m10-release.txt`、`multi-release.txt`、`mcp-test.txt`、`rust-test-release.txt`、`build-release.log`。

### 7.26 0.10.0 产物

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `Soroban.exe` | 7,011,840 B | `4F7055A213F2576664B66C69B8C20C388996C0CCFC2A5074C8C78317C1C042E4` |
| `Soroban_0.10.0_x64-setup.exe` | 4,393,453 B | `DDD57EC8971501C583BADEC171CC3AC36E235A546D8FA1BA419156F4822F1E70` |

均未签名。0.9.0 安装包保留作历史；`release-0.10.0.sha256` 已写入。

## 八 已知问题

- Univer OSS 无 xlsx 转换后端，导出走 MIT 桥接库；图片等复杂对象仍未验证
- 数据验证已在 0.8.0 写入标准 `<dataValidations>` 与 `xl/soroban-validations.json`；外部 Excel 只显示标准子集（下拉 / 数值），Soroban 专属类型以清单为准
- 数据透视 0.9.0 是一次性静态汇总：单行字段 + 单列字段 + 单值字段，不写 Excel 原生 PivotTable，不自动刷新，无字段拖拽 / 切片器 / Top N / 日期分组
- 条件格式 0.10.0 图标集固定三红绿灯 + 67% / 33%；公式规则只认 TRUE / FALSE，图标与公式同区叠加时层级由 Univer 决定，可能压住背景色
- 图表与条件格式只存 localStorage sidecar（`soroban:charts:*` / `soroban:cf:*`），不随 xlsx 走：换路径、换机器或 Excel 打开都看不到
- 图表仅支持单表区域、首行表头 + 首列分类；无多区域 / 跨表 / 堆叠 / 次坐标轴 / 缩放
- 排序最多 3 键，方向支持升 / 降 / 自定义序列；自定义未列值统一排后，无按颜色 / 图标排序；排序不写进 xlsx
- 筛选最多 3 条、只有全局 AND / OR；不做逐条混合布尔优先级与括号分组；筛选只是视图态，保存时清空
- CSV 导入为前端一次性读入，无 Rust 流式通道；支持 UTF-8 / GB18030、逗号 / Tab / 分号、首行标题与预览确认；导入结果为新工作簿；导出含合计行、公式按值写出
- 查找只扫当前 sheet 已用区域（约 200 万格上限），不跨 sheet、不支持正则 / 通配符；公式单元格只查不换
- 自动保存 60 秒一次，仅对已保存路径、非编辑 / 非筛选 / 非 busy 文档生效；新文档与 CSV 未保存文档仍需手动保存
- 标签颜色只有 7 个预设 + 无，不做任意取色器
- 保存往返按 Univer 行高 / 列宽规范化写回，默认行高不逐像素保留
- 桥接库控制台会打印大量 `[LuckyFile]` / `[PACKAGE]` 日志，暂保留以便排查
- Vite 打包主 chunk 约 9.86MB（Univer + exceljs + SheetJS），manualChunks 与函数表懒加载留 M4
- 打印仅 A4 纵 / 横，页边距固定 12mm；无手动分页符、多行标题、图片 Logo；上限 10 万格 / 80 页
- 打印预览 `content-visibility` 只跳过屏外页的布局与绘制，页 DOM 仍全量存在；打印前恢复全部页
- 图表卡屏外同样跳过布局 / 绘制但保留 DOM；图表坐标拖动时已限制在网格内
- 选区收敛只处理超过 5,000 格 / 500 行 / 200 列的异常大选区，用户在表内主动全选仍由 Univer 按视口裁剪
- 打印输出按单元格显示值，不重算公式、不还原完整字体 / 边框 / 条件格式，图表与图片不进打印
- 打印设置只存 localStorage sidecar，不写 xlsx；区域按 sheet 记忆但换机 / 换路径不携带
- 原生打印依赖 WebView2 `window.print()`，只验证对话框与页数，未实际出纸
- 十万行 / 10MB 首次导入 release 0.6.1 实测约 10–12s（xlsx 解析与写入瓶颈，非渲染）；SheetJS 快路径仍未改
- M1 记录的绿色小角标在 M2 / M3 验收截图中未复现；值 / 公式 / 保存正常，继续观察
- 最近文件存在 localStorage，不含缩略图；`sheet_thumb` 卡片预览留 M4

*小方工作室 · Soroban · BUILD ｜ 2026-11-26*




