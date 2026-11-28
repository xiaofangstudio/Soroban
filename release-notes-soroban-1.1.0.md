# Soroban 1.1.0 发布说明

> 小方工作室 · Papyra 办公套件之二 · 2026-11-28

1.1.0 补齐浮动图片的日常控制，并让剪贴板里的截图可以直接进表。

## 新增

- **旋转 90°**：图片标题栏一键顺时针旋转，卡片宽高互换，图片按中心显示。
- **锁定 / 解锁**：锁定后不能拖动或缩放，缩放手柄隐藏；旋转、置顶、删除仍可用。
- **置顶**：把当前图片提到最上层；层级写入 `SheetImage.z`。
- **剪贴板粘贴**：工作表内 `Ctrl+V` 直接粘贴截图或图片，上限 8MB。
- **网格落点**：新图片按当前网格排成行列，不再全部叠在同一个偏移点。

## 兼容

- `SheetImage` 新增 `rotation / locked / z`；旧文件缺字段时补 `0 / false / 0`，已有图片不受影响。
- 图片元数据仍写 `docProps/custom.xml` 的 `SorobanData`，重开恢复旋转、锁定与层级；真实 Excel 不显示浮动图片，这是既有边界。

## 验收

- `npm run build` PASS。
- `scripts/e2e-image-controls.mjs` 11 PASS / 0 FAIL：旋转、锁定、置顶、粘贴、xlsx 回读，控制台 0 错误。
- 截图：`review-features/soroban-image-controls.png`。

## 文件

- `Soroban.exe`：Windows x64 发布件
- `Soroban_1.1.0_x64-setup.exe`：NSIS 安装包
- `Soroban-1.1.0-portable-win64.zip`：便携包（exe + LICENSE）

未签名。Windows SmartScreen 首次运行可能提示。
