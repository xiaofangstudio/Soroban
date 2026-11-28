import { useRef } from "react";
import type { ChartData, ChartSpec, ChartType } from "../lib/charts";
import { CHART_TYPE_LABEL } from "../lib/charts";
import { ChartSvg } from "./ChartSvg";

type StudioProps = {
  type: ChartType;
  title: string;
  range: string;
  data: ChartData;
  error: string;
  onType: (type: ChartType) => void;
  onTitle: (title: string) => void;
  onRange: (range: string) => void;
  onUseSelection: () => void;
  onInsert: () => void;
  onClose: () => void;
};

const TYPES: { type: ChartType; hint: string }[] = [
  { type: "column", hint: "比较大小" },
  { type: "bar", hint: "横向排名" },
  { type: "line", hint: "看趋势" },
  { type: "area", hint: "看累积" },
  { type: "combo", hint: "柱线同图" },
  { type: "pie", hint: "看占比" },
];

function TypeGlyph({ type }: { type: ChartType }) {
  if (type === "pie") {
    return (
      <svg viewBox="0 0 24 20" aria-hidden>
        <circle cx="11" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M11 10L18.2 6.2A8 8 0 0 0 11 2Z" fill="currentColor" opacity=".75" />
      </svg>
    );
  }
  if (type === "line") {
    return (
      <svg viewBox="0 0 24 20" aria-hidden>
        <path d="M2 16L7 9L12 12L17 4L22 7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (type === "area") {
    return (
      <svg viewBox="0 0 24 20" aria-hidden>
        <path d="M2 16L7 9L12 12L17 4L22 7V18H2Z" fill="currentColor" opacity=".3" />
        <path d="M2 16L7 9L12 12L17 4L22 7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (type === "bar") {
    return (
      <svg viewBox="0 0 24 20" aria-hidden>
        <rect x="3" y="3" width="15" height="3" rx="1.2" fill="currentColor" opacity=".62" />
        <rect x="3" y="8.5" width="11" height="3" rx="1.2" fill="currentColor" />
        <rect x="3" y="14" width="18" height="3" rx="1.2" fill="currentColor" opacity=".78" />
      </svg>
    );
  }
  if (type === "combo") {
    return (
      <svg viewBox="0 0 24 20" aria-hidden>
        <rect x="3" y="9" width="4" height="8" rx="1" fill="currentColor" opacity=".55" />
        <rect x="10" y="5" width="4" height="12" rx="1" fill="currentColor" opacity=".75" />
        <rect x="17" y="8" width="4" height="9" rx="1" fill="currentColor" opacity=".55" />
        <path d="M3 8L9 4L15 9L21 3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 20" aria-hidden>
      <rect x="3" y="10" width="4" height="7" rx="1" fill="currentColor" opacity=".55" />
      <rect x="10" y="5" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="17" y="8" width="4" height="9" rx="1" fill="currentColor" opacity=".72" />
    </svg>
  );
}

export function ChartStudio({
  type,
  title,
  range,
  data,
  error,
  onType,
  onTitle,
  onRange,
  onUseSelection,
  onInsert,
  onClose,
}: StudioProps) {
  const canInsert = data.labels.length > 0 && data.series.length > 0;

  return (
    <aside className="chart-studio" aria-label="新建图表">
      <header className="cs-head">
        <div>
          <div className="cs-title">新建图表</div>
          <div className="cs-sub">数据改了，图表跟着变</div>
        </div>
        <button className="cs-close" onClick={onClose} title="关闭图表面板">
          ×
        </button>
      </header>

      <div className="cs-types">
        {TYPES.map((item) => (
          <button
            key={item.type}
            className={`cs-type${type === item.type ? " active" : ""}`}
            onClick={() => onType(item.type)}
            title={CHART_TYPE_LABEL[item.type]}
          >
            <TypeGlyph type={item.type} />
            <span>{CHART_TYPE_LABEL[item.type]}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      <label className="cs-field">
        <span>数据区域</span>
        <div className="cs-range-row">
          <input
            value={range}
            onChange={(event) => onRange(event.target.value.toUpperCase())}
            spellCheck={false}
            placeholder="例如 A1:B13"
          />
          <button onClick={onUseSelection} title="把当前选区填入">
            当前选区
          </button>
        </div>
      </label>

      <label className="cs-field">
        <span>图表标题</span>
        <input value={title} onChange={(event) => onTitle(event.target.value)} maxLength={60} />
      </label>

      <div className="cs-preview">
        <ChartSvg type={type} data={data} />
      </div>
      {error ? <div className="cs-error">{error}</div> : null}

      <footer className="cs-foot">
        <span className="cs-meta">
          {data.series.length > 0
            ? `${data.labels.length} 项 · ${data.series.length} 个系列`
            : "先选中含数字的区域"}
        </span>
        <button className="cs-cancel" onClick={onClose}>
          取消
        </button>
        <button className="cs-insert" onClick={onInsert} disabled={!canInsert}>
          插入图表
        </button>
      </footer>
    </aside>
  );
}

type CardProps = {
  chart: ChartSpec;
  data: ChartData;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
};

export function ChartCard({ chart, data, onMove, onDelete }: CardProps) {
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  return (
    <div
      className="chart-card"
      style={{ left: chart.x, top: chart.y, width: chart.width, height: chart.height }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="chart-card-head"
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: chart.x,
            originY: chart.y,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          onMove(
            chart.id,
            Math.max(0, current.originX + event.clientX - current.startX),
            Math.max(0, current.originY + event.clientY - current.startY),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        title="拖动图表"
      >
        <div className="chart-card-title">
          <span className="chart-type-dot" />
          {chart.title || CHART_TYPE_LABEL[chart.type]}
        </div>
        <div className="chart-card-actions">
          <span className="chart-range">{chart.range}</span>
          <button
            className="chart-close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(chart.id)}
            title="删除图表"
          >
            ×
          </button>
        </div>
      </div>
      <div className="chart-card-body">
        <ChartSvg type={chart.type} data={data} />
      </div>
    </div>
  );
}
