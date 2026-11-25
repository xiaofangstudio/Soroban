import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { IconClose, IconPrint } from "./Icons";
import { fillPrintTemplate, printPageSize } from "../lib/print";
import type { PrintPage, PrintPreview, PrintSettings } from "../lib/print";

type Props = {
  settings: PrintSettings;
  preview: PrintPreview | null;
  printing: boolean;
  onClose: () => void;
  onChange: (patch: Partial<PrintSettings>) => void;
  onApplyArea: (value: string) => { ok: boolean; message?: string };
  onUseSelection: () => void;
  onUseAll: () => void;
  onPrint: () => void;
};

function dateLabel(): string {
  return new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function headText(text: string, preview: PrintPreview | null, page: PrintPage): string {
  return fillPrintTemplate(text, {
    sheet: preview?.sheetName ?? "",
    page: page.number,
    pages: page.total,
    date: dateLabel(),
  });
}

function PrintPageView({ page, preview, settings }: { page: PrintPage; preview: PrintPreview; settings: PrintSettings }) {
  const { width, height } = printPageSize(settings.orientation);
  const fontSize = Math.max(8, 12 * preview.scale);
  const padY = Math.max(2, 5 * preview.scale);
  const padX = Math.max(4, 8 * preview.scale);
  const style = {
    width: `${width}mm`,
    height: `${height}mm`,
    "--print-font": `${fontSize}px`,
    "--print-pad-y": `${padY}px`,
    "--print-pad-x": `${padX}px`,
  } as CSSProperties;

  return (
    <section className="print-page" style={style} aria-label={`第 ${page.number} 页`}>
      {settings.showHeader ? (
        <header className="print-page-head">
          <span>{headText(settings.header, preview, page)}</span>
          <span>Soroban</span>
        </header>
      ) : null}
      <div className="print-page-body">
        <table className={`print-table${settings.showGrid ? " grid" : ""}`} style={{ width: `${page.width}px` }}>
          {page.head ? (
            <thead>
              <tr>
                {page.head.cells.map((cell, index) => (
                  <th key={index} style={{ width: `${page.columns[index]?.width ?? 0}px`, height: `${page.head?.height ?? 24}px` }}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.index} className={row.total ? "total" : undefined} style={{ height: `${row.height}px` }}>
                {row.cells.map((cell, index) => {
                  const numeric = /^-?[\d,.¥￥$€£%]+$/.test(cell.trim()) && /\d/.test(cell);
                  return (
                    <td key={index} className={numeric ? "num" : undefined}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {settings.showFooter ? (
        <footer className="print-page-foot">
          <span>{headText(settings.footer, preview, page)}</span>
          <span className="print-page-no">
            第 {page.number} / {page.total} 页
          </span>
          <span>{dateLabel()}</span>
        </footer>
      ) : null}
    </section>
  );
}

export function PrintStudio({ settings, preview, printing, onClose, onChange, onApplyArea, onUseSelection, onUseAll, onPrint }: Props) {
  const [areaDraft, setAreaDraft] = useState(preview?.areaA1 ?? "");
  const [areaError, setAreaError] = useState("");

  useEffect(() => {
    setAreaDraft(preview?.areaA1 ?? "");
    setAreaError("");
  }, [preview?.areaA1]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const applyArea = () => {
    const result = onApplyArea(areaDraft);
    if (!result.ok) {
      setAreaError(result.message || "打印区域格式不正确");
      return;
    }
    setAreaError("");
  };

  const error = areaError || preview?.error || "";
  const scaleLabel =
    settings.scaleMode === "fit"
      ? `适应页宽 ${preview ? Math.round(preview.scale * 100) : 0}%`
      : `${settings.percent}%`;

  const overlay = (
    <div className="print-overlay" role="dialog" aria-modal="true" aria-label="打印预览">
      <style>{`@page { size: A4 ${settings.orientation}; margin: 0; }`}</style>
      <div className="print-shell">
        <aside className="print-side">
          <div className="print-side-head">
            <div>
              <span className="print-kicker">打印</span>
              <h2>打印设置</h2>
            </div>
            <button className="print-icon-btn" onClick={onClose} title="关闭打印预览" aria-label="关闭打印预览">
              <IconClose width={16} height={16} />
            </button>
          </div>

          <div className="print-field">
            <span className="print-label">打印区域</span>
            <div className="print-area-row">
              <input
                value={areaDraft}
                onChange={(event) => setAreaDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyArea();
                  }
                }}
                spellCheck={false}
                aria-label="打印区域"
                placeholder="A1:G20"
              />
              <button onClick={applyArea}>应用</button>
            </div>
            <div className="print-area-actions">
              <button onClick={onUseSelection}>当前选区</button>
              <button onClick={onUseAll}>全部数据</button>
            </div>
          </div>

          <div className="print-field">
            <span className="print-label">纸张方向</span>
            <div className="print-segment" role="group" aria-label="纸张方向">
              <button
                className={settings.orientation === "portrait" ? "active" : ""}
                onClick={() => onChange({ orientation: "portrait" })}
              >
                纵向
              </button>
              <button
                className={settings.orientation === "landscape" ? "active" : ""}
                onClick={() => onChange({ orientation: "landscape" })}
              >
                横向
              </button>
            </div>
            <span className="print-hint">A4 · {settings.orientation === "portrait" ? "210 × 297 mm" : "297 × 210 mm"}</span>
          </div>

          <div className="print-field">
            <span className="print-label">缩放</span>
            <select value={settings.scaleMode === "fit" ? "fit" : String(settings.percent)} onChange={(event) => {
              const value = event.target.value;
              if (value === "fit") onChange({ scaleMode: "fit" });
              else onChange({ scaleMode: "percent", percent: Number(value) });
            }}>
              <option value="fit">适应页宽</option>
              <option value="100">实际大小 100%</option>
              <option value="90">缩放 90%</option>
              <option value="80">缩放 80%</option>
              <option value="70">缩放 70%</option>
            </select>
            <span className="print-hint">当前 {scaleLabel} · 分页 {preview?.pageCount ?? 0} 页</span>
          </div>

          <div className="print-field">
            <label className="print-toggle">
              <input type="checkbox" checked={settings.showGrid} onChange={(event) => onChange({ showGrid: event.target.checked })} />
              打印网格线
            </label>
          </div>

          <div className="print-field">
            <label className="print-toggle">
              <input type="checkbox" checked={settings.showHeader} onChange={(event) => onChange({ showHeader: event.target.checked })} />
              页眉
            </label>
            <input
              className="print-text"
              value={settings.header}
              disabled={!settings.showHeader}
              onChange={(event) => onChange({ header: event.target.value })}
              aria-label="页眉文字"
            />
          </div>

          <div className="print-field">
            <label className="print-toggle">
              <input type="checkbox" checked={settings.showFooter} onChange={(event) => onChange({ showFooter: event.target.checked })} />
              页脚
            </label>
            <input
              className="print-text"
              value={settings.footer}
              disabled={!settings.showFooter}
              onChange={(event) => onChange({ footer: event.target.value })}
              aria-label="页脚文字"
            />
            <span className="print-hint">可用 {"{sheet}"} {"{page}"} {"{pages}"} {"{date}"}</span>
          </div>

          {error ? <div className="print-error">{error}</div> : null}

          <div className="print-side-foot">
            <button className="print-cancel" onClick={onClose}>取消</button>
            <button className="print-go" onClick={onPrint} disabled={printing || Boolean(error) || !preview?.pageCount}>
              <IconPrint width={15} height={15} />
              {printing ? "正在打开…" : "打印"}
            </button>
          </div>
        </aside>

        <main className="print-preview">
          <div className="print-preview-top">
            <div>
              <span className="print-preview-title">打印预览</span>
              <span className="print-preview-sub">
                {preview?.sheetName || "当前工作表"} · {preview?.areaA1 || "未设置区域"}
              </span>
            </div>
            <span className="print-badge">A4 · {settings.orientation === "portrait" ? "纵向" : "横向"} · {preview?.pageCount ?? 0} 页</span>
          </div>
          <div className="print-pages">
            {preview?.pages?.length ? (
              preview.pages.map((page) => <PrintPageView key={page.number} page={page} preview={preview} settings={settings} />)
            ) : (
              <div className="print-empty">{error || "没有可预览的页面"}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
