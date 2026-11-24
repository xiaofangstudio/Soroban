# Soroban · 构建与验收

> 小方工作室 · Papyra 办公套件 ｜ 适用 M0 / M1 / M2（v0.3.0）
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
    tauri.conf.json         1280×820，最小 900×600，v0.3.0
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

不设 `SOROBAN_EXE` 时用 `src-tauri/target/debug/soroban.exe`；正式验收必须指向根目录 0.3.0 exe。依次调用 initialize / tools/list / workbook_info / validate / csv_preview / formula_search，首行 `serverInfo.version` 应为 `0.3.0`，末行 `MCP M1 OK`。

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

## 七 M0 / M1 / M2 验收记录

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

### M0 产物（历史，根目录已由 0.3.0 替换）

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

## 八 已知问题

- Univer OSS 无 xlsx 转换后端，导出走 MIT 桥接库；图片等复杂对象仍未验证
- 图表与条件格式只存 localStorage sidecar（`soroban:charts:*` / `soroban:cf:*`），不随 xlsx 走：换路径、换机器或 Excel 打开都看不到
- 图表仅支持单表区域、首行表头 + 首列分类；无多区域 / 跨表 / 堆叠 / 次坐标轴 / 缩放
- 桥接库控制台会打印大量 `[LuckyFile]` / `[PACKAGE]` 日志，暂保留以便排查
- Vite 打包主 chunk 约 9.8MB（Univer + exceljs + SheetJS），M3 做 manualChunks 与函数表懒加载
- 十万行 / 10MB 首次导入 release 18.5s、M1 记录 14.8s；M3 评估 SheetJS 快路径
- M1 记录的绿色小角标在 M2 验收截图中未复现；值 / 公式 / 保存正常，继续观察
- 最近文件存在 localStorage，不含缩略图；M3 接入 `sheet_thumb` 后补卡片预览

*小方工作室 · Soroban · BUILD ｜ 2026-11-24*
