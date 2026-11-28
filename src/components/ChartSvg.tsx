import type { ChartData, ChartType } from "../lib/charts";
import { CHART_COLORS } from "../lib/charts";

type Props = {
  type: ChartType;
  data: ChartData;
};

const W = 400;
const H = 220;
const LEFT = 46;
const TOP = 24;
const PLOT_W = 340;
const PLOT_H = 166;

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 3 ? 3 : normalized <= 4 ? 4 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (abs >= 10) return `${Math.round(value)}`;
  return `${Math.round(value * 100) / 100}`;
}

function GridLines({ max }: { max: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((index) => {
        const y = TOP + (PLOT_H / 4) * index;
        const value = max - (max / 4) * index;
        return (
          <g key={index}>
            <line x1={LEFT} x2={LEFT + PLOT_W} y1={y} y2={y} stroke={index === 4 ? "#c7d5cd" : "#e8f0eb"} strokeWidth={1} />
            <text x={LEFT - 7} y={y + 3} textAnchor="end" fontSize={9} fill="#7d9488">
              {compact(value)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function XLabels({ labels }: { labels: string[] }) {
  const step = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <>
      {labels.map((label, index) => {
        if (index % step !== 0 && index !== labels.length - 1) return null;
        const x = LEFT + (PLOT_W / Math.max(1, labels.length)) * (index + 0.5);
        return (
          <text key={`${label}-${index}`} x={x} y={H - 7} textAnchor="middle" fontSize={9} fill="#5f776b">
            {label.length > 6 ? `${label.slice(0, 5)}…` : label}
          </text>
        );
      })}
    </>
  );
}

function Legend({ data }: { data: ChartData }) {
  if (data.series.length <= 1) return null;
  let x = LEFT;
  return (
    <>
      {data.series.slice(0, 4).map((series, index) => {
        const label = series.name.length > 7 ? `${series.name.slice(0, 6)}…` : series.name;
        const item = (
          <g key={series.name} transform={`translate(${x}, 12)`}>
            <rect width={12} height={3} rx={1.5} y={4} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            <text x={16} y={8} fontSize={9} fill="#5f776b">
              {label}
            </text>
          </g>
        );
        x += 22 + Math.min(7, series.name.length) * 8;
        return item;
      })}
    </>
  );
}

export function ChartSvg({ type, data }: Props) {
  if (!data.labels.length || !data.series.length) {
    return (
      <div className="chart-empty">
        <span>没有可绘制的数值</span>
        <span>选择包含标题、分类与数字的区域</span>
      </div>
    );
  }

  if (type === "pie") return <PieChart data={data} />;
  if (type === "bar") return <BarChart data={data} />;

  const rawMax = Math.max(
    0,
    ...data.series.flatMap((series) => series.values.map((value) => Math.abs(value))),
  );
  const max = niceMax(rawMax);
  const baseline = TOP + PLOT_H;
  const groupWidth = PLOT_W / data.labels.length;
  const sum = data.series.reduce(
    (total, series) => total + series.values.reduce((part, value) => part + value, 0),
    0,
  );
  const barSeries = type === "combo" ? data.series.slice(0, 1) : data.series;
  const lineSeries = type === "combo" ? data.series.slice(1) : data.series.filter(() => type === "line");

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      data-chart-sum={Math.round(sum * 100) / 100}
      data-chart-max={rawMax}
    >
      <Legend data={data} />
      <GridLines max={max} />
      {(type === "column" || type === "combo")
        ? barSeries.map((series, seriesIndex) =>
            series.values.map((value, index) => {
              const barWidth = Math.max(3, Math.min(24, (groupWidth * 0.7) / barSeries.length));
              const groupOffset = LEFT + groupWidth * index + groupWidth / 2;
              const x =
                groupOffset -
                (barWidth * barSeries.length) / 2 +
                barWidth * seriesIndex;
              const h = Math.max(0, (value / max) * PLOT_H);
              return (
                <rect
                  key={`${series.name}-${index}`}
                  x={x}
                  y={baseline - h}
                  width={barWidth}
                  height={h}
                  rx={2}
                  fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
                  fillOpacity={0.92}
                />
              );
            }),
          )
        : null}
      {(type === "line" || type === "combo")
        ? lineSeries.map((series, seriesIndex) => {
            const colorIndex = (type === "combo" ? seriesIndex + 1 : seriesIndex) % CHART_COLORS.length;
            const points = series.values
              .map((value, index) => {
                const x = LEFT + groupWidth * (index + 0.5);
                const y = baseline - (value / max) * PLOT_H;
                return `${x},${y}`;
              })
              .join(" ");
            return (
              <g key={series.name}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={CHART_COLORS[colorIndex]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {series.values.map((value, index) => (
                  <circle
                    key={index}
                    cx={LEFT + groupWidth * (index + 0.5)}
                    cy={baseline - (value / max) * PLOT_H}
                    r={2.4}
                    fill="#fff"
                    stroke={CHART_COLORS[colorIndex]}
                    strokeWidth={1.4}
                  />
                ))}
              </g>
            );
          })
        : null}
      {type === "area"
        ? data.series.map((series, seriesIndex) => {
            const line = series.values.map((value, index) => {
              const x = LEFT + groupWidth * (index + 0.5);
              const y = baseline - (value / max) * PLOT_H;
              return `${x},${y}`;
            });
            const area = `${LEFT + groupWidth * 0.5},${baseline} ${line.join(" ")} ${LEFT + groupWidth * (series.values.length - 0.5)},${baseline}`;
            const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
            return (
              <g key={series.name}>
                <polygon points={area} fill={color} fillOpacity={seriesIndex === 0 ? 0.35 : 0.16} />
                <polyline points={line.join(" ")} fill="none" stroke={color} strokeWidth={2} />
              </g>
            );
          })
        : null}
      <line x1={LEFT} x2={LEFT + PLOT_W} y1={baseline} y2={baseline} stroke="#c7d5cd" strokeWidth={1} />
      <XLabels labels={data.labels} />
    </svg>
  );
}

function BarChart({ data }: { data: ChartData }) {
  const rawMax = Math.max(0, ...data.series.flatMap((series) => series.values.map((value) => Math.abs(value))));
  const max = niceMax(rawMax);
  const left = 96;
  const plotW = 288;
  const top = 30;
  const plotH = 158;
  const rowH = plotH / Math.max(1, data.labels.length);
  const seriesCount = Math.max(1, data.series.length);
  const barH = Math.max(4, Math.min(18, (rowH * 0.72) / seriesCount));
  const sum = data.series.reduce(
    (total, series) => total + series.values.reduce((part, value) => part + value, 0),
    0,
  );

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      data-chart-sum={Math.round(sum * 100) / 100}
      data-chart-max={rawMax}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const x = left + (plotW / 4) * index;
        return (
          <line
            key={index}
            x1={x}
            x2={x}
            y1={top}
            y2={top + plotH}
            stroke={index === 0 ? "#c7d5cd" : "#e8f0eb"}
            strokeWidth={1}
          />
        );
      })}
      {data.series.map((series, seriesIndex) =>
        series.values.map((value, index) => {
          const y =
            top +
            rowH * index +
            (rowH - barH * seriesCount) / 2 +
            barH * seriesIndex;
          const w = Math.max(0, (Math.abs(value) / max) * plotW);
          return (
            <rect
              key={`${series.name}-${index}`}
              x={left}
              y={y}
              width={w}
              height={barH}
              rx={2}
              fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
              fillOpacity={0.9}
            />
          );
        }),
      )}
      {data.labels.map((label, index) => (
        <text
          key={`${label}-${index}`}
          x={left - 8}
          y={top + rowH * (index + 0.5) + 3}
          textAnchor="end"
          fontSize={9}
          fill="#5f776b"
        >
          {label.length > 7 ? `${label.slice(0, 6)}…` : label}
        </text>
      ))}
      <text x={left + plotW} y={top + plotH + 16} textAnchor="end" fontSize={9} fill="#7d9488">
        {compact(max)}
      </text>
      <Legend data={data} />
    </svg>
  );
}

function PieChart({ data }: { data: ChartData }) {
  const values = data.series[0]?.values ?? [];
  let items = data.labels.map((label, index) => ({ label, value: Math.max(0, values[index] ?? 0) }));
  if (items.length > 6) {
    const first = items.slice(0, 5);
    const rest = items.slice(5).reduce((sum, item) => sum + item.value, 0);
    items = [...first, { label: "其他", value: rest }];
  }
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return <div className="chart-empty"><span>饼图需要正数数据</span></div>;
  }

  const cx = 143;
  const cy = 124;
  const radius = 80;
  let angle = -Math.PI / 2;

  const slices = items.map((item, index) => {
    const sweep = (item.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path =
      sweep >= Math.PI * 2 - 0.0001
        ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
    return (
      <path
        key={`${item.label}-${index}`}
        d={path}
        fill={CHART_COLORS[index % CHART_COLORS.length]}
        fillOpacity={0.92}
        stroke="#fff"
        strokeWidth={1.5}
      />
    );
  });

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      data-chart-sum={Math.round(total * 100) / 100}
      data-chart-max={Math.max(...items.map((item) => item.value))}
    >
      {slices}
      <circle cx={cx} cy={cy} r={32} fill="#fff" />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={9} fill="#7d9488">
        {data.series[0]?.name ?? "合计"}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={13} fontWeight={650} fill="#16241d">
        {compact(total)}
      </text>
      {items.map((item, index) => {
        const y = 50 + index * 25;
        const percent = Math.round((item.value / total) * 100);
        return (
          <g key={`${item.label}-legend`} transform={`translate(252, ${y})`}>
            <rect width={10} height={10} rx={5} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            <text x={17} y={9} fontSize={9.5} fill="#295042">
              {item.label.length > 8 ? `${item.label.slice(0, 7)}…` : item.label}
            </text>
            <text x={126} y={9} textAnchor="end" fontSize={9.5} fill="#60796d">
              {percent}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
