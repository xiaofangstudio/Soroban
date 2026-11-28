import type { IConditionFormattingRule } from "@univerjs/sheets-conditional-formatting";

export type ChartType = "column" | "bar" | "line" | "area" | "combo" | "pie";
export type ChartSeries = {
  name: string;
  values: number[];
};

export type ChartData = {
  labels: string[];
  series: ChartSeries[];
  hasHeader: boolean;
};

export type ChartSpec = {
  id: string;
  type: ChartType;
  title: string;
  sheetName: string;
  range: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const CHART_TYPE_LABEL: Record<ChartType, string> = {
  column: "柱状图",
  bar: "条形图",
  line: "折线图",
  area: "面积图",
  combo: "组合图",
  pie: "饼图",
};

export const CHART_COLORS = ["#0e9f6e", "#3ec494", "#75d9b1", "#0b7f59", "#8ad8bd"];

export function makeChartId(): string {
  return `chart-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export function parseA1Range(text: string): { startRow: number; startColumn: number; endRow: number; endColumn: number } | null {
  const clean = text.trim().replace(/\$/g, "").toUpperCase();
  const single = clean.match(/^([A-Z]+)(\d+)$/);
  if (single) {
    const row = Number(single[2]) - 1;
    const column = columnIndex(single[1]);
    if (row < 0 || column < 0) return null;
    return { startRow: row, startColumn: column, endRow: row, endColumn: column };
  }
  const range = clean.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!range) return null;
  const r1 = Number(range[2]) - 1;
  const c1 = columnIndex(range[1]);
  const r2 = Number(range[4]) - 1;
  const c2 = columnIndex(range[3]);
  if (r1 < 0 || c1 < 0 || r2 < 0 || c2 < 0) return null;
  return {
    startRow: Math.min(r1, r2),
    startColumn: Math.min(c1, c2),
    endRow: Math.max(r1, r2),
    endColumn: Math.max(c1, c2),
  };
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const char of letters) n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}

export function isNumericLike(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const clean = value.trim().replace(/,/g, "").replace(/[¥￥$%]/g, "");
  if (!clean) return false;
  return Number.isFinite(Number(clean));
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/,/g, "").replace(/[¥￥$%]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function normalizeChartData(raw: unknown[][]): ChartData {
  const rows = raw.filter((row) => row.some((cell) => cell !== null && cell !== "" && cell !== undefined));
  if (rows.length === 0) return { labels: [], series: [], hasHeader: false };

  const width = Math.max(...rows.map((row) => row.length));
  const firstRow = rows[0] ?? [];
  const hasHeader =
    firstRow.filter((cell) => typeof cell === "string" && cell.trim() !== "").length >= Math.max(1, Math.ceil(width / 2));

  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length === 0) return { labels: [], series: [], hasHeader };

  const firstColumnText = body.filter((row) => typeof row[0] === "string" && !isNumericLike(row[0])).length;
  const useFirstColumnAsLabels = firstColumnText >= Math.max(1, Math.floor(body.length / 2));

  const valueColumns: number[] = [];
  for (let col = useFirstColumnAsLabels ? 1 : 0; col < width; col += 1) {
    const count = body.filter((row) => toNumber(row[col]) !== null).length;
    if (count >= Math.max(1, Math.floor(body.length / 2))) valueColumns.push(col);
  }
  if (valueColumns.length === 0) return { labels: [], series: [], hasHeader };

  const labels = body.map((row, index) => {
    if (useFirstColumnAsLabels) {
      const label = row[0];
      return label === null || label === undefined || String(label).trim() === ""
        ? `${index + 1}`
        : String(label);
    }
    return `${index + 1}`;
  });

  const headerRow = hasHeader ? rows[0] : [];
  const series = valueColumns.map((col) => ({
    name:
      hasHeader && headerRow[col] !== null && headerRow[col] !== undefined && String(headerRow[col]).trim() !== ""
        ? String(headerRow[col])
        : `第 ${col + 1} 列`,
    values: body.map((row) => toNumber(row[col]) ?? 0),
  }));

  return { labels, series, hasHeader };
}

export function sidecarKey(kind: "charts" | "cf", docPath: string | null, docName: string): string {
  return `soroban:${kind}:${docPath ? `path:${docPath}` : `name:${docName}`}`;
}

export function chartStorageKey(docPath: string | null, docName: string): string {
  return sidecarKey("charts", docPath, docName);
}

export function cfStorageKey(docPath: string | null, docName: string): string {
  return sidecarKey("cf", docPath, docName);
}

export type CfRuleGroup = {
  sheetName: string;
  rules: IConditionFormattingRule[];
};

export function loadCfRules(key: string): CfRuleGroup[] {
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return [];
    const parsed = JSON.parse(text) as CfRuleGroup[];
    return Array.isArray(parsed)
      ? parsed.filter((group) => group && typeof group.sheetName === "string" && Array.isArray(group.rules))
      : [];
  } catch {
    return [];
  }
}

export function saveCfRules(key: string, groups: CfRuleGroup[]): void {
  try {
    if (groups.every((group) => group.rules.length === 0)) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(groups));
  } catch {
    /* 本地存储写满时不影响表格 */
  }
}

export function loadCharts(key: string): ChartSpec[] {
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return [];
    const parsed = JSON.parse(text) as ChartSpec[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.range === "string") : [];
  } catch {
    return [];
  }
}

export function saveCharts(key: string, charts: ChartSpec[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(charts));
  } catch {
    /* 本地存储写满时不影响表格 */
  }
}

export function chartSlot(count: number, containerWidth: number): { x: number; y: number; width: number; height: number } {
  const width = containerWidth < 1000 ? 340 : 400;
  const height = containerWidth < 1000 ? 200 : 245;
  const gap = containerWidth < 1000 ? 10 : 14;
  const columns = Math.max(1, Math.floor((containerWidth - gap * 3) / (width + gap)));
  const col = count % columns;
  const row = Math.floor(count / columns);
  return { x: gap + col * (width + gap), y: gap + row * (height + gap), width, height };
}
