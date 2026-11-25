import { isNumericLike, parseA1Range } from "./charts";

export type PrintOrientation = "portrait" | "landscape";
export type PrintScaleMode = "fit" | "percent";

export type PrintSettings = {
  area: string | null;
  areaSheet: string | null;
  orientation: PrintOrientation;
  scaleMode: PrintScaleMode;
  percent: number;
  showHeader: boolean;
  showFooter: boolean;
  showGrid: boolean;
  header: string;
  footer: string;
};

export type PrintRow = {
  index: number;
  height: number;
  cells: string[];
  total: boolean;
};

export type PrintPage = {
  number: number;
  total: number;
  columns: { index: number; width: number }[];
  head: PrintRow | null;
  rows: PrintRow[];
  width: number;
};

export type PrintPreview = {
  sheetName: string;
  areaA1: string;
  pages: PrintPage[];
  pageCount: number;
  scale: number;
  tableWidth: number;
  contentWidth: number;
  hasHeader: boolean;
  error: string;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  area: null,
  areaSheet: null,
  orientation: "portrait",
  scaleMode: "fit",
  percent: 100,
  showHeader: true,
  showFooter: true,
  showGrid: true,
  header: "{sheet}",
  footer: "小方工作室",
};

const MM_TO_PX = 96 / 25.4;
const PADDING_MM = 12;
const HEADER_H = 21;
const FOOTER_H = 18;
const PAGE_GAP = 8;
const MAX_PAGES = 80;

export function printStorageKey(docPath: string | null, docName: string): string {
  return `soroban:print:${docPath ? `path:${docPath}` : `name:${docName}`}`;
}

export function loadPrintSettings(key: string): PrintSettings {
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return { ...DEFAULT_PRINT_SETTINGS };
    const parsed = JSON.parse(text) as Partial<PrintSettings>;
    return normalizePrintSettings(parsed);
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
}

export function savePrintSettings(key: string, settings: PrintSettings): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    /* 本地存储写满时不影响表格 */
  }
}

export function normalizePrintSettings(input: Partial<PrintSettings>): PrintSettings {
  const percent = Number(input.percent);
  return {
    area: typeof input.area === "string" && input.area.trim() ? input.area.replace(/\s+/g, "").toUpperCase() : null,
    areaSheet: typeof input.areaSheet === "string" && input.areaSheet.trim() ? input.areaSheet : null,
    orientation: input.orientation === "landscape" ? "landscape" : "portrait",
    scaleMode: input.scaleMode === "percent" ? "percent" : "fit",
    percent: [100, 90, 80, 70].includes(percent) ? percent : 100,
    showHeader: input.showHeader !== false,
    showFooter: input.showFooter !== false,
    showGrid: input.showGrid !== false,
    header: typeof input.header === "string" && input.header.trim() ? input.header : "{sheet}",
    footer: typeof input.footer === "string" ? input.footer : "小方工作室",
  };
}

export function fillPrintTemplate(text: string, ctx: { sheet: string; page: number; pages: number; date: string }): string {
  return text
    .replace(/\{sheet\}/g, ctx.sheet)
    .replace(/\{page\}/g, String(ctx.page))
    .replace(/\{pages\}/g, String(ctx.pages))
    .replace(/\{date\}/g, ctx.date);
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object" && "v" in (value as Record<string, unknown>)) {
    return cleanText((value as Record<string, unknown>).v);
  }
  return String(value);
}

function looksLikeHeader(first: string[], second: string[]): boolean {
  if (!second.length) return false;
  const firstText = first.filter((cell) => cell.trim() !== "");
  if (firstText.length < 2) return false;
  const firstNumeric = first.some((cell) => isNumericLike(cell));
  const secondNumeric = second.some((cell) => isNumericLike(cell));
  return !firstNumeric && secondNumeric;
}

function totalLike(text: string): boolean {
  return /^(合计|总计|小计|total|subtotal)$/i.test(text.trim());
}

function paperSize(orientation: PrintOrientation): { width: number; height: number } {
  return orientation === "landscape" ? { width: 297, height: 210 } : { width: 210, height: 297 };
}

export function buildPrintPreview(input: {
  sheetName: string;
  area: string | null;
  usedArea: string;
  values: unknown[][];
  columnWidths: number[];
  rowHeights: number[];
  hiddenRows?: number[];
  settings: PrintSettings;
}): PrintPreview {
  const settings = normalizePrintSettings(input.settings);
  const areaText = settings.area || input.usedArea;
  const parsed = parseA1Range(areaText);
  const empty: PrintPreview = {
    sheetName: input.sheetName,
    areaA1: areaText,
    pages: [],
    pageCount: 0,
    scale: 1,
    tableWidth: 0,
    contentWidth: 0,
    hasHeader: false,
    error: "",
  };
  if (!parsed) return { ...empty, error: "打印区域格式不正确，请使用 A1 或 A1:H20" };
  if (!input.values.length || !input.values[0]?.length) return { ...empty, error: "打印区域没有内容" };

  const values: string[][] = input.values.map((row) => row.map(cleanText));
  const columnWidths = input.columnWidths.map((width) => (Number.isFinite(width) && width > 0 ? width : 72));
  const rowHeights = input.rowHeights.map((height) => (Number.isFinite(height) && height > 0 ? height : 28));
  const hiddenRows = new Set(input.hiddenRows ?? []);

  const paper = paperSize(settings.orientation);
  const pageWidth = paper.width * MM_TO_PX;
  const pageHeight = paper.height * MM_TO_PX;
  const padding = PADDING_MM * MM_TO_PX;
  const contentWidth = pageWidth - padding * 2;
  const contentHeight = pageHeight - padding * 2 - (settings.showHeader ? HEADER_H : 0) - (settings.showFooter ? FOOTER_H : 0) - PAGE_GAP;

  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const fitScale = tableWidth > 0 ? contentWidth / tableWidth : 1;
  const scale = settings.scaleMode === "fit" ? Math.max(0.25, Math.min(1, fitScale)) : settings.percent / 100;
  const scaledWidths = columnWidths.map((width) => Math.max(24, width * scale));

  // 按列宽贪心切带，再把最后一两条过窄的列移到末带，避免只剩一列孤页
  const columnBands: number[][] = [];
  let currentColumns: number[] = [];
  let usedWidth = 0;
  scaledWidths.forEach((width, index) => {
    if (currentColumns.length && usedWidth + width > contentWidth + 0.5) {
      columnBands.push(currentColumns);
      currentColumns = [];
      usedWidth = 0;
    }
    currentColumns.push(index);
    usedWidth += width;
  });
  if (currentColumns.length) columnBands.push(currentColumns);

  if (columnBands.length > 1) {
    const last = columnBands[columnBands.length - 1];
    const prev = columnBands[columnBands.length - 2];
    let lastWidth = last.reduce((sum, index) => sum + scaledWidths[index], 0);
    while (lastWidth < contentWidth * 0.3 && prev.length > 1) {
      const moved = prev.pop();
      if (moved === undefined) break;
      last.unshift(moved);
      lastWidth += scaledWidths[moved];
    }
  }

  const hasHeader = looksLikeHeader(values[0], values[1] ?? []);
  const dataStart = hasHeader ? 1 : 0;
  const headRawHeight = hasHeader ? Math.max(24, rowHeights[0] * scale) : 0;

  const pages: PrintPage[] = [];
  for (const band of columnBands) {
    const bodyAvailable = contentHeight - headRawHeight;
    let usedHeight = 0;
    let chunk: PrintRow[] = [];
    const flush = () => {
      if (!chunk.length) return;
      const head = hasHeader
        ? {
            index: 0,
            height: headRawHeight,
            cells: band.map((column) => values[0]?.[column] ?? ""),
            total: false,
          }
        : null;
      const width = band.reduce((sum, column) => sum + scaledWidths[column], 0);
      pages.push({
        number: pages.length + 1,
        total: 0,
        columns: band.map((column) => ({ index: column, width: scaledWidths[column] })),
        head,
        rows: chunk,
        width,
      });
      chunk = [];
      usedHeight = 0;
    };
    for (let index = dataStart; index < values.length; index += 1) {
      if (hiddenRows.has(index)) continue;
      const height = Math.max(18, (rowHeights[index] ?? 28) * scale);
      if (chunk.length && usedHeight + height > bodyAvailable + 0.5) flush();
      const cells = band.map((column) => values[index]?.[column] ?? "");
      chunk.push({
        index,
        height,
        cells,
        total: totalLike(cells[0] ?? ""),
      });
      usedHeight += height;
      if (height > bodyAvailable) {
        flush();
      }
    }
    flush();
  }

  if (!pages.length) return { ...empty, error: "打印区域没有可打印的行" };
  if (pages.length > MAX_PAGES) {
    return {
      ...empty,
      pageCount: pages.length,
      error: `分页过多（${pages.length} 页），请缩小打印区域或调整缩放`,
    };
  }
  for (const page of pages) page.total = pages.length;
  return {
    sheetName: input.sheetName,
    areaA1: areaText,
    pages,
    pageCount: pages.length,
    scale,
    tableWidth,
    contentWidth,
    hasHeader,
    error: "",
  };
}

export function printPageSize(orientation: PrintOrientation): { width: number; height: number } {
  return paperSize(orientation);
}
