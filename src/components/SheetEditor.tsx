import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import "@univerjs/sheets-numfmt/facade";
import "@univerjs/sheets-conditional-formatting/facade";
import "@univerjs/sheets-data-validation/facade";
import { CFNumberOperator, CFValueType, IIconSetType, UniverSheetsConditionalFormattingPlugin } from "@univerjs/sheets-conditional-formatting";
import { UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/sheets-conditional-formatting-ui";
import { UniverSheetsDataValidationPlugin } from "@univerjs/sheets-data-validation";
import { UniverSheetsDataValidationUIPlugin } from "@univerjs/sheets-data-validation-ui";
import UniverSheetsDataValidationZhCN from "@univerjs/sheets-data-validation/locale/zh-CN";
import UniverSheetsDataValidationUIZhCN from "@univerjs/sheets-data-validation-ui/locale/zh-CN";
import type { FUniver } from "@univerjs/presets";
import type { FRange, FWorkbook, FWorksheet } from "@univerjs/sheets/facade";
import type { IWorkbookData } from "@univerjs/core";
import { WrapStrategy } from "@univerjs/core";
import LuckyExcel from "@mertdeveci55/univer-import-export";
import { FORMULA_COUNT, searchFormulas, suggestFormulas } from "../lib/formulas";
import type { FormulaInfo } from "../lib/formulas";
import {
  CHART_TYPE_LABEL,
  cfStorageKey,
  chartSlot,
  chartStorageKey,
  loadCfRules,
  loadCharts,
  makeChartId,
  normalizeChartData,
  parseA1Range,
  saveCfRules,
  saveCharts,
} from "../lib/charts";
import type { ChartData, ChartSpec, ChartType } from "../lib/charts";
import {
  addressOf,
  commentStorageKey,
  imageStorageKey,
  loadComments,
  loadImages,
  makeCommentId,
  makeImageId,
  normalizeComments,
  normalizeImages,
  saveComments,
  saveImages,
} from "../lib/annotations";
import type { CellComment, SheetImage } from "../lib/annotations";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFileBytes } from "../lib/tauri";
import { ChartCard, ChartStudio } from "./ChartLayer";
import { CommentPanel, ImageCard } from "./Annotations";
import { CellTools } from "./CellTools";
import type { CellToolAction, CellToolState } from "./CellTools";
import { ValidationPanel } from "./ValidationPanel";
import type { ValidationDraft, ValidationSummary } from "./ValidationPanel";
import { PivotPanel } from "./PivotPanel";
import type { PivotSource } from "./PivotPanel";
import { buildPivot, PIVOT_AGGREGATE_LABEL } from "../lib/pivot";
import type { PivotSpec } from "../lib/pivot";
import { DataToolbar } from "./DataToolbar";
import type {
  DataContext,
  FilterCondition,
  FilterInfo,
  FilterMode,
  FilterOperator,
  SheetTab,
  SortKey,
} from "./DataToolbar";
import { FormulaHelper } from "./FormulaHelper";
import { FormatToolbar } from "./FormatToolbar";
import type { FormatCommand, FormatState } from "./FormatToolbar";
import { PrintStudio } from "./PrintStudio";
import {
  buildPrintPreview,
  loadPrintSettings,
  normalizePrintSettings,
  printStorageKey,
  savePrintSettings,
} from "../lib/print";
import type { PrintPreview, PrintSettings } from "../lib/print";
import { columnLabel, shiftFormulaRows, valuesToCsv } from "../lib/data";
import type { CsvCell } from "../lib/data";
import {
  applyValidationRecords,
  collectValidationRecords,
  readValidationRecords,
  writeValidationRecords,
} from "../lib/validationIO";
import type { SheetValidationRecords } from "../lib/validationIO";
import type { FDataValidation } from "@univerjs/sheets-data-validation/facade";
import type { WorkbookMeta } from "../lib/workbookMeta";

const VALIDATION_TYPE_LABEL: Record<string, string> = {
  list: "下拉列表",
  listMultiple: "多选列表",
  whole: "整数",
  decimal: "数值",
  date: "日期",
  time: "时间",
  textLength: "文本长度",
  custom: "自定义公式",
  checkbox: "复选框",
  any: "任意值",
  none: "无",
};

const VALIDATION_OPERATOR_LABEL: Record<string, string> = {
  between: "介于",
  notBetween: "不介于",
  equal: "等于",
  notEqual: "不等于",
  greaterThan: "大于",
  greaterThanOrEqual: "大于等于",
  lessThan: "小于",
  lessThanOrEqual: "小于等于",
};

function validationListText(raw: string | undefined, separator = " / "): string {
  let text = (raw ?? "").trim();
  if (!text) return "";
  if (text.startsWith("=")) {
    const ref = text.replace(/^=/, "");
    return ref;
  }
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/""/g, '"');
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(separator);
  } catch {
    /* 非 JSON 列表按分隔符处理 */
  }
  return text
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(separator);
}

function summarizeValidationRule(rule: FDataValidation): {
  type: string;
  detail: string;
  range: string;
  kind?: "list" | "between" | "greater" | "less" | "equal";
  values?: string;
  min?: string;
  max?: string;
  num?: string;
  integer?: boolean;
  allowBlank?: boolean;
  message?: string;
} {
  const type = String(rule.getCriteriaType());
  const [operator, first, second] = rule.getCriteriaValues();
  let detail = "";
  let kind: "list" | "between" | "greater" | "less" | "equal" | undefined;
  let values = "";
  if (type === "list" || type === "listMultiple") {
    detail = validationListText(first);
    values = validationListText(first, ", ");
    kind = "list";
  } else if (type === "whole" || type === "decimal" || type === "date" || type === "time") {
    const op = VALIDATION_OPERATOR_LABEL[operator ?? ""] ?? operator ?? "";
    detail = [op, first, second].filter((item) => item !== undefined && item !== "").join(" ");
    if (operator === "between" || operator === "notBetween") kind = "between";
    else if (operator === "equal" || operator === "notEqual") kind = "equal";
    else if ((operator ?? "").startsWith("greater")) kind = "greater";
    else if ((operator ?? "").startsWith("less")) kind = "less";
  } else if (type === "custom") {
    detail = first ?? "";
  }
  const range = rule
    .getRanges()
    .map((item) => item.getA1Notation().replaceAll("$", ""))
    .join(", ");
  return {
    type: VALIDATION_TYPE_LABEL[type] ?? type,
    detail,
    range,
    kind,
    values,
    min: first,
    max: second,
    num: first,
    integer: type === "whole",
    allowBlank: rule.rule.allowBlank !== false,
    message: rule.rule.error,
  };
}


export type EditorHandle = {
  saveBuffer: () => Promise<Uint8Array>;
  workbookMeta: () => WorkbookMeta;
  isEditing: () => boolean;
  openFind: (replace?: boolean) => void;
  findState: () => { open: boolean; query: string; matches: number; index: number };
  getSnapshot: () => IWorkbookData | null;
  undo: () => void;
  redo: () => void;
  sheetCount: () => number;
  selectCell: (row: number, column: number) => void;
  selectRange: (startRow: number, startColumn: number, endRow: number, endColumn: number) => void;
  selectionA1: () => string | null;
  conditionalRuleCount: () => number;
  applyConditional: (kind: "scale" | "bar" | "icons" | "formula" | "clear", formula?: string) => void;
  copyConditionalTo: (path: string, name: string) => void;
  validationCount: () => number;
  validationForCell: (row: number, column: number) => { type: string; detail: string; range: string } | null;
  validationStatus: (row: number, column: number) => Promise<string | null>;
  openPivot: () => boolean;
  cellStyle: (row: number, column: number) => Record<string, unknown> | null;
  sortBy: (direction: "asc" | "desc", column?: number) => { ok: boolean; message: string };
  sortByKeys: (keys: SortKey[]) => { ok: boolean; message: string };
  filterBy: (column: number, operator: FilterOperator, value: string) => { ok: boolean; message: string };
  filterByConditions: (conditions: FilterCondition[], mode?: FilterMode) => { ok: boolean; message: string };
  clearFilter: () => void;
  filterInfo: () => FilterInfo | null;
  freeze: (kind: "first-row" | "first-col" | "at-cell" | "none") => { ok: boolean; message: string };
  freezeState: () => { rows: number; columns: number } | null;
  sheetNames: () => string[];
  activeSheetName: () => string;
  renameSheet: (name: string) => boolean;
  setSheetColor: (sheetId: string, color: string) => boolean;
  sheetTabs: () => { id: string; name: string; color?: string }[];
  duplicateSheet: () => string | null;
  deleteSheet: () => boolean;
  csvText: () => string;
  hiddenRows: () => number;
  openPrint: () => void;
  addImage: (dataUrl: string, name: string) => boolean;
  commentCount: () => number;
  imageCount: () => number;
  printInfo: () => {
    open: boolean;
    settings: PrintSettings;
    preview: {
      areaA1: string;
      pageCount: number;
      scale: number;
      error: string;
      pages: { number: number; total: number; rows: number; width: number; firstCell: string }[];
    } | null;
  };
};

type Props = {
  docKey: string;
  docPath: string | null;
  name: string;
  bytes: Uint8Array | null;
  dark: boolean;
  initialRows?: CsvCell[][] | null;
  initialSheetName?: string;
  onReady: (sheets: number) => void;
  onSheetCount: (sheets: number) => void;
  onDirty: () => void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
  onCsvImport: () => void;
  onCsvExport: () => void;
  onState: (state: "loading" | "ready" | "error", message?: string) => void;
};

const DEFAULT_FORMAT: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  fontFamily: "",
  fontSize: 12,
  fontColor: "#16241d",
  fill: "",
  horizontal: "left",
  numberFormat: "General",
};

const EMPTY_CHART_DATA: ChartData = { labels: [], series: [], hasHeader: false };

const EMPTY_DATA_CONTEXT: DataContext = {
  rangeA1: "A1",
  currentColumn: 0,
  currentLabel: "A 列",
  columns: [{ index: 0, label: "A 列" }],
  rowCount: 1,
};

const EMPTY_CELL_TOOLS: CellToolState = {
  merged: false,
  wrap: false,
  vertical: "middle",
};

type FilterScope = {
  sheetId: string;
  startRow: number;
  endRow: number;
  anchorRow: number;
  anchorColumn: number;
};

function cellPrimitive(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if ("v" in record) return cellPrimitive(record.v);
  if ("text" in record) return record.text;
  if ("body" in record && record.body && typeof record.body === "object") {
    const body = record.body as { dataStream?: string };
    if (typeof body.dataStream === "string") return body.dataStream;
  }
  return value;
}

function toCellText(value: unknown): string {
  const primitive = cellPrimitive(value);
  if (primitive === null || primitive === undefined) return "";
  return typeof primitive === "string" ? primitive : String(primitive);
}

function replaceTextAll(source: string, query: string, replacement: string, caseSensitive: boolean): string {
  if (!query) return source;
  const haystack = caseSensitive ? source : source.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let from = 0;
  let out = "";
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) {
      out += source.slice(from);
      break;
    }
    out += source.slice(from, at) + replacement;
    from = at + needle.length;
  }
  return out;
}

function numericLike(value: unknown): number | null {
  const primitive = cellPrimitive(value);
  if (typeof primitive === "number" && Number.isFinite(primitive)) return primitive;
  if (typeof primitive === "string") {
    let text = primitive.trim();
    if (text === "") return null;
    const percent = text.endsWith("%");
    if (percent) text = text.slice(0, -1);
    text = text.replace(/[,\s，]/g, "").replace(/^[¥￥$€£]/, "");
    if (text.startsWith("(") && text.endsWith(")")) text = `-${text.slice(1, -1)}`;
    if (!/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    return percent ? parsed / 100 : parsed;
  }
  return null;
}

function detectHeaderRow(values: unknown[][]): boolean {
  const first = values[0] ?? [];
  const second = values[1] ?? [];
  const labels = first.filter((cell) => toCellText(cell).trim() !== "");
  if (labels.length === 0) return false;
  const allLabelsText = labels.every((cell) => numericLike(cell) === null && toCellText(cell).trim() !== "");
  const secondHasNumber = second.some((cell) => numericLike(cell) !== null);
  return allLabelsText && secondHasNumber;
}

function filterOperatorLabel(operator: FilterOperator): string {
  if (operator === "contains") return "包含";
  if (operator === "eq") return "等于";
  if (operator === "ne") return "不等于";
  if (operator === "gt") return "大于";
  return "小于";
}

function matchFilter(value: unknown, operator: FilterOperator, needle: string): boolean {
  const text = toCellText(value);
  if (operator === "contains") return text.toLowerCase().includes(needle.toLowerCase());
  const leftNumber = numericLike(value);
  const rightNumber = numericLike(needle);
  if (leftNumber !== null && rightNumber !== null) {
    if (operator === "eq") return leftNumber === rightNumber;
    if (operator === "ne") return leftNumber !== rightNumber;
    if (operator === "gt") return leftNumber > rightNumber;
    return leftNumber < rightNumber;
  }
  if (operator === "eq") return text === needle;
  if (operator === "ne") return text !== needle;
  if (operator === "gt") return text.localeCompare(needle, "zh-CN") > 0;
  return text.localeCompare(needle, "zh-CN") < 0;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function formulaToken(text: string, caret: number): string | null {
  const before = text.slice(0, Math.max(0, caret));
  if (!before.startsWith("=")) return null;
  if (before === "=") return "";
  const match = before.match(/([A-Za-z][A-Za-z0-9._]*)$/);
  if (!match) return null;
  if (match[1].length < 2) return null;
  const start = before.length - match[1].length;
  const lead = before.charAt(start - 1);
  if (start !== 1 && !["(", ",", "+", "-", "*", "/", "^", "&", "<", ">", "="].includes(lead)) {
    return null;
  }
  return match[1];
}

function normalizeFormulas(snapshot: IWorkbookData): IWorkbookData {
  for (const sheet of Object.values(snapshot.sheets ?? {})) {
    const cells = sheet?.cellData;
    if (!cells) continue;
    for (const row of Object.values(cells)) {
      if (!row) continue;
      for (const cell of Object.values(row)) {
        if (!cell || typeof cell !== "object") continue;
        const record = cell as { v?: unknown; f?: string };
        if (record.f) {
          // 缓存值可能与实际数据不一致，统一交给公式引擎重算
          delete record.v;
          continue;
        }
        if (typeof record.v === "string" && record.v.startsWith("=")) {
          record.f = record.v;
          delete record.v;
        }
      }
    }
  }
  return snapshot;
}

/** 部分 xlsx 不带行高/列宽，桥接库会给出 h=0 / w=0，导致网格整块空白 */
function normalizeLayout(snapshot: IWorkbookData): IWorkbookData {
  for (const sheet of Object.values(snapshot.sheets ?? {})) {
    if (!sheet) continue;
    const rowHeight =
      typeof sheet.defaultRowHeight === "number" && sheet.defaultRowHeight > 0
        ? sheet.defaultRowHeight
        : 24;
    const columnWidth =
      typeof sheet.defaultColumnWidth === "number" && sheet.defaultColumnWidth > 0
        ? sheet.defaultColumnWidth
        : 72;
    sheet.defaultRowHeight = rowHeight;
    sheet.defaultColumnWidth = columnWidth;
    const rows = sheet.rowData as
      | Record<string, { h?: number; ah?: number; hd?: number }>
      | undefined;
    for (const row of Object.values(rows ?? {})) {
      if (!row || row.hd === 1) continue;
      if (typeof row.h === "number" && row.h <= 0) row.h = rowHeight;
      if (!(typeof row.ah === "number" && row.ah > 0)) row.ah = rowHeight;
    }
    const columns = sheet.columnData as Record<string, { w?: number; hd?: number }> | undefined;
    for (const column of Object.values(columns ?? {})) {
      if (!column) continue;
      if (typeof column.w === "number" && column.w <= 0 && column.hd !== 1) column.w = columnWidth;
    }
  }
  return snapshot;
}

function normalizeSnapshot(snapshot: IWorkbookData): IWorkbookData {
  return normalizeLayout(normalizeFormulas(snapshot));
}

function xlsxToSnapshot(bytes: Uint8Array, name: string): Promise<IWorkbookData> {
  return new Promise((resolve, reject) => {
    const owner = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(owner).set(bytes);
    const file = new File([owner], name || "workbook.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    LuckyExcel.transformExcelToUniver(
      file,
      (snapshot) => {
        if (!snapshot) reject(new Error("xlsx 解析结果为空"));
        else resolve(normalizeSnapshot(snapshot));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    ).catch((err) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

/** 桥接库把 Univer 的 vt=3(底端) 写成 Excel 顶端，导出前做一次数值映射 */
function remapVerticalForExport(snapshot: IWorkbookData): IWorkbookData {
  const styles = snapshot.styles as Record<string, Record<string, unknown>> | undefined;
  if (!styles) return snapshot;
  const mapped: Record<string, Record<string, unknown>> = {};
  for (const [id, style] of Object.entries(styles)) {
    const next = { ...style };
    const vertical = Number(next.vt);
    if (vertical === 3) next.vt = 2;
    else if (vertical === 2) next.vt = 0;
    mapped[id] = next;
  }
  return { ...snapshot, styles: mapped as IWorkbookData["styles"] };
}

function snapshotToXlsx(snapshot: IWorkbookData): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    LuckyExcel.transformUniverToExcel({
      snapshot: remapVerticalForExport(snapshot),
      fileName: "soroban.xlsx",
      getBuffer: true,
      success: (buffer) => {
        if (!buffer) {
          reject(new Error("xlsx 生成失败"));
          return;
        }
        resolve(new Uint8Array(buffer as ArrayBuffer));
      },
      error: (err) => reject(err instanceof Error ? err : new Error(String(err))),
    }).catch((err) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

function readFormatState(range: FRange): FormatState {
  const style = (range.getCellStyleData() ?? {}) as Record<string, unknown>;
  const background = range.getBackground();
  const horizontal = range.getHorizontalAlignment();
  const colorValue = style.cl;
  const fontColor =
    typeof colorValue === "string"
      ? colorValue
      : typeof (colorValue as { rgb?: unknown })?.rgb === "string"
        ? String((colorValue as { rgb: string }).rgb)
        : "#16241d";
  let numberFormat = "General";
  try {
    numberFormat = range.getNumberFormat() || "General";
  } catch {
    /* 数字格式插件未就绪时退回常规 */
  }
  return {
    bold: Number(style.bl) > 0,
    italic: Number(style.it) > 0,
    underline: Boolean(style.ul && Number((style.ul as { s?: number })?.s ?? style.ul) > 0),
    fontFamily: typeof style.ff === "string" ? style.ff : "",
    fontSize: typeof style.fs === "number" && style.fs > 0 ? style.fs : 12,
    fontColor,
    fill: background && background !== "rgb(255, 255, 255)" ? background : "",
    horizontal: horizontal === "center" ? "center" : horizontal === "normal" || horizontal === "right" ? "right" : "left",
    numberFormat,
  };
}

function readCellToolState(sheet: FWorksheet, row: number, column: number): CellToolState {
  const merged = Boolean(sheet.getCellMergeData(row, column));
  let wrap = false;
  let vertical: CellToolState["vertical"] = "middle";
  try {
    const range = sheet.getRange(row, column);
    wrap = range.getWrap();
    const raw = range.getVerticalAlignment();
    if (raw === "top" || raw === "bottom" || raw === "middle") vertical = raw;
  } catch {
    /* 单元格样式未就绪时沿用默认 */
  }
  return { merged, wrap, vertical };
}

/** 开自动换行后按列宽估算行数并固定行高，避免保存重开后文字被压成一行 */
function fitWrappedRows(sheet: FWorksheet, range: FRange): void {
  const values = range.getValues();
  const rowCount = values.length;
  const columnCount = values[0]?.length ?? 0;
  for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
    let maxLines = 1;
    for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
      const value = values[rowOffset]?.[columnOffset];
      if (value === null || value === undefined || value === "") continue;
      const row = range.getRow() + rowOffset;
      const column = range.getColumn() + columnOffset;
      const merge = sheet.getCellMergeData(row, column) as unknown as {
        startRow: number;
        endRow: number;
        startColumn: number;
        endColumn: number;
      } | null;
      if (merge && (merge.startRow !== row || merge.startColumn !== column)) continue;
      const endColumn = merge?.endColumn ?? column;
      let width = 0;
      for (let index = column; index <= endColumn; index += 1) width += sheet.getColumnWidth(index);
      const charsPerLine = Math.max(4, Math.floor((width - 8) / 10.5));
      const lines = Math.max(1, Math.ceil(String(value).length / charsPerLine));
      if (lines > maxLines) maxLines = lines;
    }
    if (maxLines > 1) {
      sheet.setRowHeightsForced(range.getRow() + rowOffset, 1, Math.min(409, Math.max(24, maxLines * 24 + 8)));
    }
  }
}

export const SheetEditor = forwardRef<EditorHandle, Props>(function SheetEditor(
  { docKey, docPath, name, bytes, dark, initialRows, initialSheetName, onReady, onSheetCount, onDirty, onError, onInfo, onCsvImport, onCsvExport, onState },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<FUniver | null>(null);
  const bookRef = useRef<FWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("正在准备表格…");
  const [activeAddr, setActiveAddr] = useState("A1");
  const [cellText, setCellText] = useState("");
  const [formulaEditing, setFormulaEditing] = useState(false);
  const [caret, setCaret] = useState(0);
  const [suggestPrefix, setSuggestPrefix] = useState<string | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCommon, setLibraryCommon] = useState(false);
  const [libraryIndex, setLibraryIndex] = useState(0);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [findReplace, setFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findReplacement, setFindReplacement] = useState("");
  const [findCase, setFindCase] = useState(false);
  const [findMatches, setFindMatches] = useState<{ row: number; column: number; formula: boolean }[]>([]);
  const [findIndex, setFindIndex] = useState(0);
  const [findNotice, setFindNotice] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("");
  const [formatState, setFormatState] = useState<FormatState>(DEFAULT_FORMAT);
  const [cellToolsOpen, setCellToolsOpen] = useState(false);
  const [cellToolState, setCellToolState] = useState<CellToolState>(EMPTY_CELL_TOOLS);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary>({ count: 0, current: null });
  const [pivotOpen, setPivotOpen] = useState(false);
  const [pivotSource, setPivotSource] = useState<PivotSource | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("column");
  const [chartTitle, setChartTitle] = useState("");
  const [chartTitleTouched, setChartTitleTouched] = useState(false);
  const [chartRange, setChartRange] = useState("A1:B13");
  const [chartError, setChartError] = useState("");
  const [chartTick, setChartTick] = useState(0);
  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [comments, setComments] = useState<CellComment[]>([]);
  const [images, setImages] = useState<SheetImage[]>([]);
  const [commentOpen, setCommentOpen] = useState(false);
  const [activeRow, setActiveRow] = useState(0);
  const [activeColumn, setActiveColumn] = useState(0);
  const [dataContext, setDataContext] = useState<DataContext>(EMPTY_DATA_CONTEXT);
  const [filterInfo, setFilterInfo] = useState<FilterInfo | null>(null);
  const [freezeInfo, setFreezeInfo] = useState<{ rows: number; columns: number } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(() =>
    loadPrintSettings(printStorageKey(docPath, name)),
  );
  const [printPreview, setPrintPreview] = useState<PrintPreview | null>(null);
  const chartKeyRef = useRef(chartStorageKey(docPath, name));
  const cfKeyRef = useRef(cfStorageKey(docPath, name));
  const printKeyRef = useRef(printStorageKey(docPath, name));
  const commentKeyRef = useRef(commentStorageKey(docPath, name));
  const imageKeyRef = useRef(imageStorageKey(docPath, name));
  const filterScopeRef = useRef<FilterScope | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipSelectRef = useRef(false);
  const editingRef = useRef(false);
  const formulaOriginalRef = useRef("");
  const callbacksRef = useRef({ onReady, onSheetCount, onDirty, onError, onInfo, onState });
  callbacksRef.current = { onReady, onSheetCount, onDirty, onError, onInfo, onState };
  const suggestions = useMemo(
    () => (suggestPrefix === null ? [] : suggestFormulas(suggestPrefix)),
    [suggestPrefix],
  );
  const libraryItems = useMemo(
    () => searchFormulas(libraryQuery, libraryCommon, 240),
    [libraryQuery, libraryCommon],
  );
  const suggestOpen = formulaEditing && !libraryOpen && suggestPrefix !== null && suggestions.length > 0;

  const readFreezeState = useCallback((): { rows: number; columns: number } | null => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return null;
    const rows = sheet.getFrozenRows();
    const columns = sheet.getFrozenColumns();
    return rows > 0 || columns > 0 ? { rows, columns } : null;
  }, []);

  const refreshTabs = useCallback(() => {
    const book = apiRef.current?.getActiveWorkbook();
    if (!book) return;
    const sheets = book.getSheets();
    setTabs(sheets.map((s) => ({ id: s.getSheetId(), name: s.getSheetName(), color: s.getTabColor() })));
    setActiveTab(book.getActiveSheet()?.getSheetId() ?? "");
    setFreezeInfo(readFreezeState());
    callbacksRef.current.onSheetCount(sheets.length);
  }, [readFreezeState]);

  const activeSheetName = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.name ?? "", [activeTab, tabs]);

  const updateCharts = useCallback((next: ChartSpec[]) => {
    setCharts(next);
    saveCharts(chartKeyRef.current, next);
  }, []);

  const updateComments = useCallback((next: CellComment[]) => {
    setComments(next);
    saveComments(commentKeyRef.current, next);
    callbacksRef.current.onDirty();
  }, []);

  const updateImages = useCallback((next: SheetImage[]) => {
    setImages(next);
    saveImages(imageKeyRef.current, next);
    callbacksRef.current.onDirty();
  }, []);

  const addComment = useCallback((text: string) => {
    const sheetName = apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getSheetName();
    if (!sheetName) return;
    const comment: CellComment = {
      id: makeCommentId(),
      sheetName,
      row: activeRow,
      column: activeColumn,
      text: text.trim(),
      author: "本机用户",
      createdAt: Date.now(),
      resolved: false,
    };
    updateComments([...comments, comment]);
    callbacksRef.current.onInfo(`已在 ${addressOf(activeRow, activeColumn)} 添加批注`);
  }, [activeColumn, activeRow, comments, updateComments]);

  const patchComment = useCallback((id: string, patch: Partial<CellComment>) => {
    updateComments(comments.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, [comments, updateComments]);

  const deleteComment = useCallback((id: string) => {
    updateComments(comments.filter((item) => item.id !== id));
  }, [comments, updateComments]);

  const jumpComment = useCallback((comment: CellComment) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getSheetByName(comment.sheetName);
    if (!book || !sheet) return;
    book.setActiveSheet(sheet);
    const range = sheet.getRange(comment.row, comment.column, 1, 1);
    sheet.setActiveSelection(range);
    setActiveAddr(addressOf(comment.row, comment.column));
    setActiveRow(comment.row);
    setActiveColumn(comment.column);
  }, []);

  const placeImage = useCallback((dataUrl: string, fileName: string) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheetName = book?.getActiveSheet()?.getSheetName();
    if (!book || !sheetName) return false;
    const sheetCount = images.filter((item) => item.sheetName === sheetName).length;
    const grid = gridRef.current;
    const stepX = 300;
    const stepY = 200;
    const columns = Math.max(1, Math.floor(((grid?.clientWidth ?? 900) - 48) / stepX));
    const slotX = (sheetCount % columns) * stepX;
    const slotY = Math.floor(sheetCount / columns) * stepY;
    const image: SheetImage = {
      id: makeImageId(),
      sheetName,
      name: fileName || "图片",
      dataUrl,
      x: 24 + slotX,
      y: 24 + slotY,
      width: 280,
      height: 180,
      rotation: 0,
      locked: false,
      z: Math.max(0, ...images.map((item) => item.z ?? 0)) + 1,
    };
    updateImages([...images, image]);
    callbacksRef.current.onInfo(`已插入 ${image.name}`);
    return true;
  }, [images, updateImages]);

  /** 截图或复制的图片可以直接 Ctrl+V 放进当前工作表。 */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const clipboard = event.clipboardData;
      if (!clipboard?.items) return;
      const item = Array.from(clipboard.items).find((entry) => entry.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      if (file.size > 8 * 1024 * 1024) {
        callbacksRef.current.onError("剪贴板图片超过 8MB，暂不插入");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
        placeImage(reader.result, file.name || `剪贴板图片-${stamp}.png`);
      };
      reader.onerror = () => callbacksRef.current.onError("读取剪贴板图片失败");
      reader.readAsDataURL(file);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [placeImage]);

  const insertImage = useCallback(async () => {    try {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (!path || Array.isArray(path)) return;
      const bytes = await readFileBytes(path);
      if (bytes.length > 8 * 1024 * 1024) {
        callbacksRef.current.onError("图片超过 8MB，暂不插入");
        return;
      }
      const ext = path.split(".").pop()?.toLowerCase() ?? "png";
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const copy = new Uint8Array(bytes);
        const blob = new Blob([copy.buffer as ArrayBuffer], { type: mime });
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
        reader.readAsDataURL(blob);
      });
      placeImage(dataUrl, path.split(/[\\/]/).pop() ?? "图片");
    } catch (err) {
      callbacksRef.current.onError(err instanceof Error ? err.message : String(err));
    }
  }, [placeImage]);

  const moveImage = useCallback((id: string, x: number, y: number) => {
    updateImages(images.map((item) => (item.id === id ? { ...item, x, y } : item)));
  }, [images, updateImages]);

  const resizeImage = useCallback((id: string, width: number, height: number) => {
    updateImages(images.map((item) => (item.id === id ? { ...item, width, height } : item)));
  }, [images, updateImages]);

  const patchImage = useCallback((id: string, patch: Partial<SheetImage>) => {
    updateImages(images.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, [images, updateImages]);

  const raiseImage = useCallback((id: string) => {
    const top = Math.max(0, ...images.map((item) => item.z ?? 0));
    updateImages(images.map((item) => (item.id === id ? { ...item, z: top + 1 } : item)));
  }, [images, updateImages]);

  const deleteImage = useCallback((id: string) => {
    updateImages(images.filter((item) => item.id !== id));
  }, [images, updateImages]);

  const persistCf = useCallback(() => {
    const book = apiRef.current?.getActiveWorkbook();
    if (!book) return;
    const groups = book.getSheets().map((sheet) => ({
      sheetName: sheet.getSheetName(),
      rules: sheet.getConditionalFormattingRules(),
    }));
    saveCfRules(cfKeyRef.current, groups);
  }, []);

  const selectedDataRange = useCallback((): FRange | null => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return null;
    const active = sheet.getSelection()?.getActiveRange();
    if (!active) return null;
    if (active.getWidth() === 1 && active.getHeight() === 1) {
      const rows = Math.max(1, sheet.getLastRow() + 1);
      const cols = Math.max(1, sheet.getLastColumn() + 1);
      let endRow = rows - 1;
      // 单击单元格时自动扩到整表，但不要把末尾空行、合计行当成数据参与排序/筛选
      const tailStart = Math.max(0, endRow - 4);
      const tail = sheet.getRange(tailStart, 0, endRow - tailStart + 1, cols).getValues() as unknown[][];
      for (let index = tail.length - 1; index >= 0 && endRow > 0; index -= 1) {
        const texts = (tail[index] ?? []).map((cell) => toCellText(cell).trim()).filter(Boolean);
        const isBlank = texts.length === 0;
        const isTotal = texts.some((text) => /^(合计|总计|小计|total|subtotal)$/i.test(text));
        if (!isBlank && !isTotal) break;
        endRow -= 1;
      }
      return sheet.getRange(0, 0, endRow + 1, cols);
    }
    return active;
  }, []);

  const buildDataContext = useCallback((sheet: FWorksheet, range: FRange): DataContext => {
    const startRow = range.getRow();
    const startColumn = range.getColumn();
    const rowCount = range.getHeight();
    const columnCount = range.getWidth();
    let head: unknown[][] = [];
    try {
      head = sheet.getRange(startRow, startColumn, Math.min(2, rowCount), columnCount).getValues() as unknown[][];
    } catch {
      head = [];
    }
    const hasHeader = detectHeaderRow(head);
    const labels = hasHeader ? head[0] ?? [] : [];
    const columns = Array.from({ length: columnCount }, (_, offset) => {
      const index = startColumn + offset;
      const header = toCellText(labels[offset]).trim();
      const label = header === ""
        ? `${columnLabel(index)} 列`
        : `${columnLabel(index)} ${header}`;
      return { index, label };
    });
    const current = sheet.getSelection()?.getCurrentCell();
    const currentColumn = current?.startColumn ?? startColumn;
    return {
      rangeA1: range.getA1Notation(),
      currentColumn,
      currentLabel: columns.find((column) => column.index === currentColumn)?.label ?? `${columnLabel(currentColumn)} 列`,
      columns,
      rowCount,
    };
  }, []);

  const refreshDataContext = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const range = selectedDataRange();
    if (!sheet || !range) {
      setDataContext(EMPTY_DATA_CONTEXT);
      setFreezeInfo(null);
      return;
    }
    setDataContext(buildDataContext(sheet, range));
    setFreezeInfo(readFreezeState());
  }, [buildDataContext, readFreezeState, selectedDataRange]);

  const clearFilterInternal = useCallback((quiet: boolean) => {
    const scope = filterScopeRef.current;
    const sheet = scope ? apiRef.current?.getActiveWorkbook()?.getSheetBySheetId(scope.sheetId) : null;
    if (scope && sheet) {
      sheet.showRows(scope.startRow, Math.max(1, scope.endRow - scope.startRow + 1));
      sheet.setActiveSelection(sheet.getRange(scope.anchorRow, scope.anchorColumn, 1, 1));
      filterScopeRef.current = null;
    }
    setFilterInfo(null);
    if (!quiet) callbacksRef.current.onInfo("已清除筛选");
  }, []);

  useEffect(() => {
    apiRef.current?.toggleDarkMode(dark);
  }, [dark]);

  useEffect(() => {
    const key = chartStorageKey(docPath, name);
    chartKeyRef.current = key;
    cfKeyRef.current = cfStorageKey(docPath, name);
    printKeyRef.current = printStorageKey(docPath, name);
    commentKeyRef.current = commentStorageKey(docPath, name);
    imageKeyRef.current = imageStorageKey(docPath, name);
    setCharts(loadCharts(key));
    setComments(loadComments(commentKeyRef.current));
    setImages(loadImages(imageKeyRef.current));
    setPrintSettings(loadPrintSettings(printKeyRef.current));
    setPrintOpen(false);
    setPrintPreview(null);
  }, [docKey, docPath, name]);

  const syncActiveCell = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const cell = sheet?.getSelection()?.getCurrentCell();
    if (!sheet || !cell) {
      setActiveAddr("A1");
      setFormatState(DEFAULT_FORMAT);
      setCellToolState(EMPTY_CELL_TOOLS);
      setDataContext(EMPTY_DATA_CONTEXT);
      setFreezeInfo(null);
      if (!editingRef.current) setCellText("");
      return;
    }
    setActiveAddr(`${columnLetter(cell.startColumn)}${cell.startRow + 1}`);
    setActiveRow(cell.startRow);
    setActiveColumn(cell.startColumn);
    setCellToolState(readCellToolState(sheet, cell.startRow, cell.startColumn));
    if (!editingRef.current) {
      const range = sheet.getRange(cell.startRow, cell.startColumn);
      const formula = range.getFormula();
      const value = range.getValue();
      setCellText(formula || (value === null || value === undefined ? "" : String(value)));
      setFormatState(readFormatState(range));
      setSuggestPrefix(null);
      setLibraryOpen(false);
    }
    refreshDataContext();
  }, [refreshDataContext]);

  const activateTab = (id: string) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getSheetBySheetId(id);
    if (!sheet) return;
    clearFilterInternal(true);
    sheet.activate();
    setActiveTab(id);
    window.setTimeout(() => {
      syncActiveCell();
      refreshTabs();
    }, 100);
  };

  const addSheet = () => {
    const book = apiRef.current?.getActiveWorkbook();
    if (!book) return;
    clearFilterInternal(true);
    const existing = new Set(book.getSheets().map((s) => s.getSheetName()));
    let n = book.getSheets().length + 1;
    while (existing.has(`Sheet${n}`)) n += 1;
    const sheet = book.create(`Sheet${n}`, 100, 20);
    sheet.activate();
    callbacksRef.current.onDirty();
    window.setTimeout(() => {
      syncActiveCell();
      refreshTabs();
    }, 120);
  };

  const openPivot = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const range = selectedDataRange();
    if (!sheet || !range) {
      callbacksRef.current.onError("请先选中要汇总的数据区域。");
      return false;
    }
    try {
      const values = range.getValues() as unknown[][];
      setPivotSource({
        rangeA1: range.getA1Notation(),
        values,
        hasHeader: detectHeaderRow(values.slice(0, 2)),
      });
      setPivotOpen(true);
      return true;
    } catch (reason) {
      callbacksRef.current.onError(String(reason));
      return false;
    }
  }, [selectedDataRange]);

  const applyPivot = useCallback(
    (spec: PivotSpec): string | null => {
      const book = apiRef.current?.getActiveWorkbook();
      if (!book || !pivotSource) return "表格尚未准备好。";
      const result = buildPivot(pivotSource.values, spec);
      if (result.sourceRows === 0) return "当前区域没有可汇总的数据行。";
      if (result.rows.length === 0) return "没有可用的行分组。";

      clearFilterInternal(true);
      const existing = new Set(book.getSheets().map((sheet) => sheet.getSheetName()));
      let index = 1;
      while (existing.has(`透视${index}`)) index += 1;
      const outputName = `透视${index}`;
      const output = book.create(outputName, Math.max(40, result.matrix.length + 4), Math.max(10, result.matrix[0].length));
      const columns = Math.max(2, ...result.matrix.map((row) => row.length));
      output.getRange(0, 0, result.matrix.length, columns).setValues(result.matrix as unknown as object[][]);
      const title = output.getRange(0, 0, 1, columns);
      title.setFontWeight("bold");
      title.setFontSize(16);
      title.setFontColor("#14532d");
      const meta = output.getRange(1, 0, 1, columns);
      meta.setFontSize(11);
      meta.setFontColor("#6b7280");
      const head = output.getRange(2, 0, 1, columns);
      head.setFontWeight("bold");
      head.setBackgroundColor("#e7f3ec");
      head.setFontColor("#14532d");
      const body = output.getRange(3, 0, Math.max(1, result.rows.length), columns);
      body.setHorizontalAlignment(result.columnKeys.length > 0 ? "center" : "normal");
      const total = output.getRange(result.matrix.length - 1, 0, 1, columns);
      total.setFontWeight("bold");
      total.setBackgroundColor("#f3f7f5");
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        output.setColumnWidth(columnIndex, columnIndex === 0 ? 180 : 118);
      }
      output.activate();
      callbacksRef.current.onDirty();
      callbacksRef.current.onInfo(
        `已生成 ${outputName}：${PIVOT_AGGREGATE_LABEL[spec.aggregate]} · ${result.sourceRows} 行`,
      );
      setPivotOpen(false);
      window.setTimeout(() => {
        syncActiveCell();
        refreshTabs();
        refreshDataContext();
      }, 120);
      return null;
    },
    [clearFilterInternal, pivotSource, refreshDataContext, refreshTabs, syncActiveCell],
  );

  const activeRange = useCallback((): FRange | null => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    return sheet?.getSelection()?.getActiveRange() ?? null;
  }, []);

  const applyFormat = useCallback(
    (command: FormatCommand) => {
      const range = activeRange();
      if (!range) return;
      try {
        switch (command.type) {
          case "bold":
            range.setFontWeight(formatState.bold ? null : "bold");
            break;
          case "italic":
            range.setFontStyle(formatState.italic ? null : "italic");
            break;
          case "underline":
            range.setFontLine(formatState.underline ? null : "underline");
            break;
          case "fontFamily":
            range.setFontFamily(command.value || null);
            break;
          case "fontSize":
            range.setFontSize(command.value);
            break;
          case "fontColor":
            range.setFontColor(command.value);
            break;
          case "fill":
            range.setBackgroundColor(command.value || "#ffffff");
            break;
          case "align":
            range.setHorizontalAlignment(command.value === "right" ? "normal" : command.value);
            break;
          case "border": {
            const api = apiRef.current;
            if (!api) break;
            if (command.value === "all") {
              range.setBorder(api.Enum.BorderType.ALL, api.Enum.BorderStyleTypes.THIN, "#b9cdc2");
            } else {
              range.setBorder(api.Enum.BorderType.NONE, api.Enum.BorderStyleTypes.THIN, "#b9cdc2");
            }
            break;
          }
          case "numberFormat":
            range.setNumberFormat(command.value);
            break;
          default:
            break;
        }
        callbacksRef.current.onDirty();
        window.setTimeout(() => {
          const current = activeRange();
          if (current) setFormatState(readFormatState(current));
        }, 60);
      } catch (err) {
        callbacksRef.current.onError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeRange, formatState.bold, formatState.italic, formatState.underline],
  );

  const applyCellTool = useCallback(
    (action: CellToolAction) => {
      const range = activeRange();
      const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
      const api = apiRef.current;
      if (!range || !sheet || !api) return;
      const row = range.getRow();
      const column = range.getColumn();
      const rows = Math.max(1, range.getHeight());
      const columns = Math.max(1, range.getWidth());
      const label: Record<string, string> = {
        "row-above": "已在选区上方插入行",
        "row-below": "已在选区下方插入行",
        "row-delete": "已删除选区行",
        "row-hide": "已隐藏选区行",
        "row-show": "已显示选区行",
        "col-left": "已在选区左侧插入列",
        "col-right": "已在选区右侧插入列",
        "col-delete": "已删除选区列",
        "col-hide": "已隐藏选区列",
        "col-show": "已显示选区列",
      };
      try {
        if (action.type === "merge") {
          if (action.mode === "unmerge") {
            const merge = sheet.getCellMergeData(row, column);
            (merge ?? range).breakApart();
          } else {
            if (rows < 2 && columns < 2) throw new Error("请先选中两个以上单元格再合并");
            range.merge({ defaultMerge: true, isForceMerge: true });
            if (action.mode === "center") {
              sheet
                .getRange(row, column, rows, columns)
                .setHorizontalAlignment("center")
                .setVerticalAlignment("middle")
                .setWrapStrategy(WrapStrategy.WRAP);
            }
          }
        } else if (action.type === "border") {
          const borderType =
            action.value === "outside"
              ? api.Enum.BorderType.OUTSIDE
              : action.value === "all"
                ? api.Enum.BorderType.ALL
                : action.value === "horizontal"
                  ? api.Enum.BorderType.HORIZONTAL
                  : action.value === "vertical"
                    ? api.Enum.BorderType.VERTICAL
                    : action.value === "top"
                      ? api.Enum.BorderType.TOP
                      : action.value === "bottom"
                        ? api.Enum.BorderType.BOTTOM
                        : action.value === "left"
                          ? api.Enum.BorderType.LEFT
                          : action.value === "right"
                            ? api.Enum.BorderType.RIGHT
                            : api.Enum.BorderType.NONE;
          range.setBorder(
            borderType,
            action.value === "none" ? api.Enum.BorderStyleTypes.NONE : api.Enum.BorderStyleTypes.THIN,
            "#8fb3a2",
          );
        } else if (action.type === "wrap") {
          range.setWrapStrategy(action.value ? WrapStrategy.WRAP : WrapStrategy.OVERFLOW);
          if (action.value) fitWrappedRows(sheet, range);
        } else if (action.type === "vertical") {
          range.setVerticalAlignment(action.value);
        } else {
          switch (action.value) {
            case "row-above":
              sheet.insertRowsBefore(row, rows);
              break;
            case "row-below":
              sheet.insertRowsAfter(row + rows - 1, rows);
              break;
            case "row-delete":
              sheet.deleteRows(row, rows);
              break;
            case "row-hide":
              sheet.hideRows(row, rows);
              break;
            case "row-show":
              sheet.showRows(row, rows);
              break;
            case "col-left":
              sheet.insertColumnsBefore(column, columns);
              break;
            case "col-right":
              sheet.insertColumnsAfter(column + columns - 1, columns);
              break;
            case "col-delete":
              sheet.deleteColumns(column, columns);
              break;
            case "col-hide":
              sheet.hideColumns(column, columns);
              break;
            case "col-show":
              sheet.showColumns(column, columns);
              break;
            default:
              break;
          }
        }
        callbacksRef.current.onDirty();
        if (action.type === "merge") {
          callbacksRef.current.onInfo(
            action.mode === "unmerge" ? "已取消合并单元格" : action.mode === "center" ? "已合并并居中" : "已合并单元格",
          );
        } else if (action.type === "border") {
          callbacksRef.current.onInfo(action.value === "none" ? "已清除选区边框" : "已应用选区边框");
        } else if (action.type === "wrap") {
          callbacksRef.current.onInfo(action.value ? "已开启自动换行" : "已关闭自动换行");
        } else if (action.type === "vertical") {
          callbacksRef.current.onInfo(
            action.value === "top" ? "已顶端对齐" : action.value === "bottom" ? "已底端对齐" : "已垂直居中",
          );
        } else {
          callbacksRef.current.onInfo(label[action.value] ?? "已修改表格结构");
        }
        window.setTimeout(() => {
          syncActiveCell();
          refreshDataContext();
          refreshTabs();
        }, 100);
      } catch (err) {
        callbacksRef.current.onError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeRange, refreshDataContext, refreshTabs, syncActiveCell],
  );

  const readValidationSummary = useCallback((): ValidationSummary => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const range = sheet?.getSelection()?.getCurrentCell();
    if (!sheet || !range) return { count: 0, current: null };
    const rule = sheet.getRange(range.startRow, range.startColumn).getDataValidation();
    return {
      count: sheet.getDataValidations().length,
      current: rule ? summarizeValidationRule(rule) : null,
    };
  }, []);

  const openValidation = useCallback(() => {
    setValidationSummary(readValidationSummary());
    setValidationOpen(true);
    setCellToolsOpen(false);
    setLibraryOpen(false);
  }, [readValidationSummary]);

  const applyValidation = useCallback(
    (draft: ValidationDraft): { ok: boolean; message: string } => {
      const api = apiRef.current;
      const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
      const range = activeRange();
      if (!api || !sheet || !range) return { ok: false, message: "请先在工作表中选择区域" };
      const a1 = range.getA1Notation().replaceAll("$", "");
      try {
        const builder = api.newDataValidation();
        if (draft.kind === "list") {
          if (draft.source === "range") {
            const ref = draft.range.trim().replaceAll("$", "");
            if (!ref) return { ok: false, message: "请输入引用区域，例如 K2:K9" };
            let source: FRange;
            try {
              source = sheet.getRange(ref);
            } catch {
              return { ok: false, message: `引用区域无效：${ref}` };
            }
            if (source.getWidth() * source.getHeight() > 100) {
              return { ok: false, message: "引用区域最多 100 个单元格" };
            }
            if (source.getWidth() > 1 && source.getHeight() > 1) {
              return { ok: false, message: "请引用单行或单列区域" };
            }
            builder.requireValueInRange(source, false, true);
          } else {
            const values = draft.values
              .split(/[,，\n]/)
              .map((item) => item.trim())
              .filter(Boolean)
              .filter((item, index, list) => list.indexOf(item) === index);
            if (values.length === 0) return { ok: false, message: "请至少输入一个选项" };
            if (values.length > 100) return { ok: false, message: "下拉选项最多 100 项" };
            builder.requireValueInList(values, false, true);
          }
        } else if (draft.kind === "between") {
          const min = Number(draft.min);
          const max = Number(draft.max);
          if (!draft.min.trim() || !draft.max.trim() || !Number.isFinite(min) || !Number.isFinite(max)) {
            return { ok: false, message: "请输入有效的最小值和最大值" };
          }
          if (min > max) return { ok: false, message: "最小值不能大于最大值" };
          builder.requireNumberBetween(min, max, draft.integer);
        } else {
          const num = Number(draft.num);
          if (!draft.num.trim() || !Number.isFinite(num)) return { ok: false, message: "请输入有效数值" };
          if (draft.kind === "greater") builder.requireNumberGreaterThan(num, draft.integer);
          else if (draft.kind === "less") builder.requireNumberLessThan(num, draft.integer);
          else builder.requireNumberEqualTo(num, draft.integer);
        }
        const message =
          draft.message.trim() ||
          (draft.kind === "list" ? "请从下拉列表中选择一个选项" : "输入值不符合此单元格的验证规则");
        const rule = builder
          .setAllowBlank(draft.allowBlank)
          .setOptions({
            showErrorMessage: true,
            error: message,
          })
          .build();
        range.setDataValidation(rule);
        callbacksRef.current.onDirty();
        callbacksRef.current.onInfo(`已为 ${a1} 设置数据验证`);
        setValidationSummary(readValidationSummary());
        return { ok: true, message: `已应用：${a1}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
    [activeRange, readValidationSummary],
  );

  const clearValidation = useCallback((): { ok: boolean; message: string } => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const range = activeRange();
    if (!sheet || !range) return { ok: false, message: "请先在工作表中选择区域" };
    const a1 = range.getA1Notation().replaceAll("$", "");
    try {
      range.setDataValidation(null);
      callbacksRef.current.onDirty();
      callbacksRef.current.onInfo(`已清除 ${a1} 的数据验证`);
      setValidationSummary(readValidationSummary());
      return { ok: true, message: `已清除：${a1}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }, [activeRange, readValidationSummary]);

  const applyConditional = useCallback(
    (kind: "scale" | "bar" | "icons" | "formula" | "clear", formula?: string) => {
      const range = activeRange();
      const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
      if (!range || !sheet) return;
      try {
        if (kind === "clear") {
          const target = range.getRange();
          const overlaps = (item: { startRow: number; endRow: number; startColumn: number; endColumn: number }) =>
            item.startRow <= target.endRow &&
            item.endRow >= target.startRow &&
            item.startColumn <= target.endColumn &&
            item.endColumn >= target.startColumn;
          sheet
            .getConditionalFormattingRules()
            .filter((rule) => rule.ranges.some(overlaps))
            .forEach((rule) => sheet.deleteConditionalFormattingRule(rule.cfId));
        } else {
          const builder = sheet.newConditionalFormattingRule();
          if (kind === "scale") {
            builder
              .setColorScale([
                { index: 0, color: "#eafaf3", value: { type: CFValueType.min } },
                { index: 1, color: "#5ee0a8", value: { type: CFValueType.percent, value: 50 } },
                { index: 2, color: "#0b7f59", value: { type: CFValueType.max } },
              ])
              .setRanges([range.getRange()]);
          } else if (kind === "bar") {
            builder
              .setDataBar({
                min: { type: CFValueType.min },
                max: { type: CFValueType.max },
                isGradient: true,
                positiveColor: "#0e9f6e",
                nativeColor: "#d24a3a",
                isShowValue: true,
              })
              .setRanges([range.getRange()]);
          } else if (kind === "icons") {
            builder
              .setIconSet({
                iconConfigs: [
                  {
                    iconType: IIconSetType.threeTrafficLights1,
                    iconId: "0",
                    operator: CFNumberOperator.greaterThan,
                    value: { type: CFValueType.percent, value: 67 },
                  },
                  {
                    iconType: IIconSetType.threeTrafficLights1,
                    iconId: "1",
                    operator: CFNumberOperator.greaterThan,
                    value: { type: CFValueType.percent, value: 33 },
                  },
                  {
                    iconType: IIconSetType.threeTrafficLights1,
                    iconId: "2",
                    operator: CFNumberOperator.lessThanOrEqual,
                    value: { type: CFValueType.percent, value: 33 },
                  },
                ],
                isShowValue: true,
              })
              .setRanges([range.getRange()]);
          } else {
            const expression = (formula ?? "").trim();
            if (!expression.startsWith("=")) {
              callbacksRef.current.onError("公式规则要以 = 开头，例如 =A1>0");
              return;
            }
            builder
              .whenFormulaSatisfied(expression)
              .setBackground("#fff1b8")
              .setBold(true)
              .setRanges([range.getRange()]);
          }
          sheet.addConditionalFormattingRule(builder.build());
        }
        persistCf();
        callbacksRef.current.onDirty();
      } catch (err) {
        callbacksRef.current.onError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeRange, persistCf],
  );

  const chartDataFor = useCallback((rangeText: string): ChartData => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const parsed = parseA1Range(rangeText);
    if (!sheet || !parsed) return EMPTY_CHART_DATA;
    try {
      const values = sheet
        .getRange(
          parsed.startRow,
          parsed.startColumn,
          parsed.endRow - parsed.startRow + 1,
          parsed.endColumn - parsed.startColumn + 1,
        )
        .getValues();
      return normalizeChartData(values as unknown[][]);
    } catch {
      return EMPTY_CHART_DATA;
    }
  }, []);

  const openChart = useCallback(() => {
    const range = activeRange();
    if (range) setChartRange(range.getA1Notation());
    setChartTitle(`${CHART_TYPE_LABEL[chartType]} · ${activeSheetName || "Sheet"}`);
    setChartTitleTouched(false);
    setChartError("");
    setChartOpen(true);
  }, [activeRange, activeSheetName, chartType]);

  const useSelectionForChart = useCallback(() => {
    const range = activeRange();
    if (!range) return;
    setChartRange(range.getA1Notation());
    setChartError("");
  }, [activeRange]);

  const insertChart = useCallback(() => {
    const data = chartDataFor(chartRange);
    if (!data.labels.length || !data.series.length) {
      setChartError("这个区域没有可绘制的数字，换一个包含分类和数值的区域");
      return;
    }
    const host = gridRef.current;
    const slot = chartSlot(charts.length, host?.clientWidth ?? 900);
    const spec: ChartSpec = {
      id: makeChartId(),
      type: chartType,
      title: chartTitle.trim() || `${CHART_TYPE_LABEL[chartType]} · ${activeSheetName}`,
      sheetName: activeSheetName || "Sheet1",
      range: chartRange,
      x: Math.min(slot.x, Math.max(0, (host?.clientWidth ?? 900) - slot.width - 8)),
      y: Math.min(slot.y, Math.max(0, (host?.clientHeight ?? 500) - slot.height - 8)),
      width: slot.width,
      height: slot.height,
    };
    updateCharts([...charts, spec]);
    callbacksRef.current.onDirty();
    setChartOpen(false);
    setChartError("");
  }, [activeSheetName, chartDataFor, chartRange, chartTitle, chartType, charts, updateCharts]);

  const moveChart = useCallback(
    (id: string, x: number, y: number) => {
      const host = gridRef.current;
      updateCharts(
        charts.map((chart) => {
          if (chart.id !== id) return chart;
          const maxX = Math.max(0, (host?.clientWidth ?? 900) - chart.width - 8);
          const maxY = Math.max(0, (host?.clientHeight ?? 500) - chart.height - 8);
          return { ...chart, x: Math.min(x, maxX), y: Math.min(y, maxY) };
        }),
      );
    },
    [charts, updateCharts],
  );

  const deleteChart = useCallback(
    (id: string) => {
      updateCharts(charts.filter((chart) => chart.id !== id));
      callbacksRef.current.onDirty();
    },
    [charts, updateCharts],
  );

  const studioData = useMemo(
    () => (chartOpen ? chartDataFor(chartRange) : EMPTY_CHART_DATA),
    [chartDataFor, chartOpen, chartRange, chartTick, activeTab],
  );

  const visibleCharts = useMemo(
    () =>
      charts
        .filter((chart) => chart.sheetName === activeSheetName)
        .map((chart) => ({ chart, data: chartDataFor(chart.range) })),
    [activeSheetName, chartDataFor, charts, chartTick, activeTab],
  );

  const visibleImages = useMemo(
    () => images.filter((image) => image.sheetName === activeSheetName),
    [activeSheetName, images],
  );

  const applyFormula = useCallback(
    (item: FormulaInfo, fromLibrary: boolean) => {
      const current = cellText;
      const input = inputRef.current;
      if (fromLibrary) {
        setLibraryOpen(false);
        setLibraryQuery("");
        setLibraryIndex(0);
        setSuggestPrefix(null);
        if (!(formulaEditing && current.startsWith("="))) {
          const next = `=${item.name}(`;
          skipSelectRef.current = true;
          editingRef.current = true;
          formulaOriginalRef.current = current;
          setFormulaEditing(true);
          setCellText(next);
          setCaret(next.length);
          window.requestAnimationFrame(() => {
            input?.focus();
            input?.setSelectionRange(next.length, next.length);
          });
          return;
        }
      }
      const position = input?.selectionStart ?? caret;
      const before = current.slice(0, position);
      const token = before.match(/([A-Za-z][A-Za-z0-9._]*)$/);
      const start = token ? position - token[1].length : position;
      const next = `${current.slice(0, start)}${item.name}(${current.slice(position)}`;
      const nextCaret = start + item.name.length + 1;
      editingRef.current = true;
      setFormulaEditing(true);
      setCellText(next);
      setCaret(nextCaret);
      setSuggestPrefix(null);
      setSuggestIndex(0);
      window.requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [caret, cellText],
  );

  const commitFormula = useCallback(() => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setFormulaEditing(false);
    setSuggestPrefix(null);
    setLibraryOpen(false);
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const cell = sheet?.getSelection()?.getCurrentCell();
    if (!sheet || !cell) return;
    const text = cellText;
    if (text === formulaOriginalRef.current) {
      syncActiveCell();
      return;
    }
    const range = sheet.getRange(cell.startRow, cell.startColumn);
    if (text.trim() === "") {
      range.setValue({ v: null, f: null, p: null });
    } else if (text.startsWith("=")) {
      range.setValue(text);
    } else if (/^-?\d+(\.\d+)?$/.test(text.trim())) {
      range.setValue(Number(text.trim()));
    } else {
      range.setValue(text);
    }
    try {
      apiRef.current?.getFormula().executeCalculation();
    } catch {
      /* ignore */
    }
    callbacksRef.current.onDirty();
    setChartTick((tick) => tick + 1);
    window.setTimeout(() => {
      syncActiveCell();
      setChartTick((tick) => tick + 1);
    }, 240);
  }, [cellText, syncActiveCell]);

  const sortByKeys = useCallback((keys: SortKey[]) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    const range = selectedDataRange();
    if (!book || !sheet || !range) return { ok: false, message: "没有可排序的数据区域" };
    const startRow = range.getRow();
    const startColumn = range.getColumn();
    const rowCount = range.getHeight();
    const columnCount = range.getWidth();
    if (rowCount < 2 || columnCount < 1) return { ok: false, message: "请先选中包含表头的数据区域" };

    const values = range.getValues() as unknown[][];
    const formulas = range.getFormulas();
    const seen = new Set<number>();
    const keyList: { column: number; offset: number; direction: SortKey["direction"]; order: string[] }[] = [];
    for (const key of keys) {
      const column = Math.min(Math.max(key.column, startColumn), startColumn + columnCount - 1);
      if (seen.has(column)) continue;
      seen.add(column);
      keyList.push({ column, offset: column - startColumn, direction: key.direction, order: key.order ?? [] });
    }
    if (!keyList.length) return { ok: false, message: "请至少设置一个排序条件" };
    const hasHeader = detectHeaderRow(values);
    const dataStart = hasHeader ? 1 : 0;
    const dataCount = rowCount - dataStart;
    if (dataCount < 2) return { ok: false, message: "数据行不足，无法排序" };

    clearFilterInternal(true);
    const order: Record<number, number> = {};
    const indexes = Array.from({ length: dataCount }, (_, index) => index);
    indexes.sort((a, b) => {
      for (const key of keyList) {
        const left = values[dataStart + a]?.[key.offset];
        const right = values[dataStart + b]?.[key.offset];
        const leftText = toCellText(left);
        const rightText = toCellText(right);
        if (key.direction === "custom" && key.order.length > 0) {
          const leftRank = key.order.findIndex((item) => item === leftText.trim());
          const rightRank = key.order.findIndex((item) => item === rightText.trim());
          if (leftRank >= 0 && rightRank >= 0 && leftRank !== rightRank) return leftRank - rightRank;
          if (leftRank >= 0 && rightRank < 0) return -1;
          if (leftRank < 0 && rightRank >= 0) return 1;
          const fallback = leftText.localeCompare(rightText, "zh-CN", { numeric: true });
          if (fallback !== 0) return fallback;
          continue;
        }
        const leftNumber = numericLike(left);
        const rightNumber = numericLike(right);
        if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
          return key.direction === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
        }
        if (leftNumber !== null && rightNumber === null) return -1;
        if (leftNumber === null && rightNumber !== null) return 1;
        const compared = leftText.localeCompare(rightText, "zh-CN", { numeric: true });
        if (compared !== 0) return key.direction === "asc" ? compared : -compared;
      }
      return 0;
    });

    for (let index = 0; index < dataCount; index += 1) {
      order[startRow + dataStart + index] = startRow + dataStart + indexes[index];
    }

    const executed = apiRef.current?.syncExecuteCommand("sheet.command.reorder-range", {
      unitId: book.getId(),
      subUnitId: sheet.getSheetId(),
      range: {
        startRow,
        startColumn,
        endRow: startRow + rowCount - 1,
        endColumn: startColumn + columnCount - 1,
      },
      order,
    });
    if (!executed) return { ok: false, message: "排序未执行，请重新选择数据区域" };

    // 行搬移后把同表相对行引用平移到新行，避免毛利 / 完成率等公式指到旧数据
    for (let index = 0; index < dataCount; index += 1) {
      const sourceRow = startRow + dataStart + indexes[index];
      const targetRow = startRow + dataStart + index;
      const delta = targetRow - sourceRow;
      for (let colOffset = 0; colOffset < columnCount; colOffset += 1) {
        const formula = formulas[dataStart + indexes[index]]?.[colOffset] ?? "";
        if (!formula) continue;
        const shifted = shiftFormulaRows(formula, delta);
        if (shifted !== formula) sheet.getRange(targetRow, startColumn + colOffset).setValue(shifted);
      }
    }

    try {
      apiRef.current?.getFormula().executeCalculation();
    } catch {
      /* ignore */
    }
    sheet.setActiveSelection(range);
    callbacksRef.current.onDirty();
    setChartTick((tick) => tick + 1);
    window.setTimeout(() => {
      syncActiveCell();
      setChartTick((tick) => tick + 1);
    }, 220);
    const keyLabel = keyList
      .map((key) => `${columnLabel(key.column)} ${key.direction === "asc" ? "升序" : key.direction === "desc" ? "降序" : "自定义序列"}`)
      .join("、");
    const message = `已按 ${keyLabel} 排列 ${dataCount} 行`;
    callbacksRef.current.onInfo(message);
    return { ok: true, message };
  }, [clearFilterInternal, selectedDataRange, syncActiveCell]);

  const sortBy = useCallback((direction: "asc" | "desc", explicitColumn?: number) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    const range = selectedDataRange();
    if (!book || !sheet || !range) return { ok: false, message: "没有可排序的数据区域" };
    const current = sheet.getSelection()?.getCurrentCell();
    const column = explicitColumn ?? current?.startColumn ?? range.getColumn();
    return sortByKeys([{ column, direction }]);
  }, [selectedDataRange, sortByKeys]);

  const filterByConditions = useCallback((conditions: FilterCondition[], mode: FilterMode = "and") => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    const range = selectedDataRange();
    if (!book || !sheet || !range) return { ok: false, message: "没有可筛选的数据区域" };
    const startRow = range.getRow();
    const startColumn = range.getColumn();
    const rowCount = range.getHeight();
    const columnCount = range.getWidth();
    const values = range.getValues() as unknown[][];
    const hasHeader = detectHeaderRow(values);
    const dataStart = hasHeader ? 1 : 0;
    const dataCount = rowCount - dataStart;
    if (dataCount < 1) return { ok: false, message: "数据行不足，无法筛选" };

    const valid = conditions
      .map((condition) => {
        const column = Math.min(Math.max(condition.column, startColumn), startColumn + columnCount - 1);
        return {
          column,
          offset: column - startColumn,
          operator: condition.operator,
          value: condition.value.trim(),
        };
      })
      .filter((condition) => condition.value !== "");
    if (!valid.length) return { ok: false, message: "请至少填写一个筛选值" };

    clearFilterInternal(true);
    const matchedRows: number[] = [];
    let hideStart = -1;
    for (let index = 0; index < dataCount; index += 1) {
      const absoluteRow = startRow + dataStart + index;
      const results = valid.map((condition) =>
        matchFilter(values[dataStart + index]?.[condition.offset], condition.operator, condition.value),
      );
      const matched = mode === "and" ? results.every(Boolean) : results.some(Boolean);
      if (matched) {
        matchedRows.push(absoluteRow);
        if (hideStart >= 0) {
          sheet.hideRows(hideStart, absoluteRow - hideStart);
          hideStart = -1;
        }
      } else if (hideStart < 0) {
        hideStart = absoluteRow;
      }
    }
    if (hideStart >= 0) sheet.hideRows(hideStart, startRow + rowCount - hideStart);

    filterScopeRef.current = {
      sheetId: sheet.getSheetId(),
      startRow: startRow + dataStart,
      endRow: startRow + rowCount - 1,
      anchorRow: startRow,
      anchorColumn: startColumn,
    };
    // hideRows 会把活动区漂到末行，筛选后回到表头，避免状态栏显示成一行
    sheet.setActiveSelection(sheet.getRange(startRow, startColumn, 1, 1));
    syncActiveCell();
    const labeled = valid.map((condition) => {
      const header = hasHeader ? toCellText(values[0]?.[condition.offset]).trim() : "";
      return {
        columnLabel: `${columnLabel(condition.column)}${header ? ` ${header}` : ""}`,
        operator: filterOperatorLabel(condition.operator),
        value: condition.value,
      };
    });
    setFilterInfo({
      columnLabel: labeled[0].columnLabel,
      operator: labeled[0].operator,
      value: labeled[0].value,
      matched: matchedRows.length,
      total: dataCount,
      ...(valid.length > 1 ? { conditions: labeled, mode } : {}),
    });
    const modeText = mode === "and" ? "全部满足" : "任一满足";
    const suffix = valid.length > 1 ? ` · ${valid.length} 个条件${modeText}` : "";
    callbacksRef.current.onInfo(`筛选命中 ${matchedRows.length}/${dataCount} 行${suffix}`);
    return { ok: true, message: `筛选命中 ${matchedRows.length}/${dataCount} 行${suffix}` };
  }, [clearFilterInternal, selectedDataRange, syncActiveCell]);

  const filterBy = useCallback((column: number, operator: FilterOperator, value: string) => {
    return filterByConditions([{ column, operator, value }], "and");
  }, [filterByConditions]);

  const clearFilter = useCallback(() => {
    clearFilterInternal(false);
    window.setTimeout(() => {
      syncActiveCell();
    }, 80);
  }, [clearFilterInternal, syncActiveCell]);

  const setFreeze = useCallback((kind: "first-row" | "first-col" | "at-cell" | "none") => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return { ok: false, message: "表格尚未就绪" };
    if (kind === "none") {
      sheet.cancelFreeze();
    } else if (kind === "first-row") {
      sheet.setFrozenRows(1);
    } else if (kind === "first-col") {
      sheet.setFrozenColumns(1);
    } else {
      const cell = sheet.getSelection()?.getCurrentCell();
      if (!cell || (cell.startRow === 0 && cell.startColumn === 0)) {
        return { ok: false, message: "请先把光标移到要冻结的分界单元格" };
      }
      sheet.setFreeze({
        startRow: cell.startRow,
        startColumn: cell.startColumn,
        xSplit: cell.startColumn,
        ySplit: cell.startRow,
      });
    }
    const freeze = readFreezeState();
    setFreezeInfo(freeze);
    callbacksRef.current.onDirty();
    const message = kind === "none"
      ? "已取消冻结"
      : `已冻结 ${freeze?.rows ?? 0} 行 ${freeze?.columns ?? 0} 列`;
    callbacksRef.current.onInfo(message);
    return { ok: true, message };
  }, [readFreezeState]);

  const renameSheet = useCallback((name: string) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    if (!book || !sheet) return false;
    const clean = name.trim().replace(/[\\/?*\[\]:]/g, "").slice(0, 31);
    if (!clean) {
      callbacksRef.current.onError("工作表名称不能为空");
      return false;
    }
    if (book.getSheets().some((item) => item.getSheetId() !== sheet.getSheetId() && item.getSheetName() === clean)) {
      callbacksRef.current.onError("工作表名称已存在");
      return false;
    }
    const oldName = sheet.getSheetName();
    if (oldName === clean) return true;
    sheet.setName(clean);
    if (charts.some((chart) => chart.sheetName === oldName)) {
      updateCharts(charts.map((chart) => chart.sheetName === oldName ? { ...chart, sheetName: clean } : chart));
    }
    if (comments.some((item) => item.sheetName === oldName)) {
      updateComments(comments.map((item) => item.sheetName === oldName ? { ...item, sheetName: clean } : item));
    }
    if (images.some((item) => item.sheetName === oldName)) {
      updateImages(images.map((item) => item.sheetName === oldName ? { ...item, sheetName: clean } : item));
    }
    refreshTabs();
    callbacksRef.current.onDirty();
    callbacksRef.current.onInfo(`工作表已改名为 ${clean}`);
    window.setTimeout(() => persistCf(), 180);
    return true;
  }, [charts, comments, images, persistCf, refreshTabs, updateCharts, updateComments, updateImages]);

  const setSheetColor = useCallback((sheetId: string, color: string) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getSheets().find((item) => item.getSheetId() === sheetId);
    if (!book || !sheet) return false;
    try {
      sheet.setTabColor(color || "");
    } catch {
      return false;
    }
    refreshTabs();
    callbacksRef.current.onDirty();
    callbacksRef.current.onInfo(color ? "已设置工作表标签颜色" : "已清除工作表标签颜色");
    return true;
  }, [refreshTabs]);

  const duplicateSheet = useCallback(() => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    if (!book || !sheet) return null;
    const copy = book.duplicateSheet(sheet);
    if (!copy) {
      callbacksRef.current.onError("复制工作表失败");
      return null;
    }
    const existing = new Set(book.getSheets().map((item) => item.getSheetName()));
    let name = `${sheet.getSheetName()} 副本`;
    let suffix = 2;
    while (existing.has(name)) {
      name = `${sheet.getSheetName()} 副本${suffix}`;
      suffix += 1;
    }
    copy.setName(name);
    copy.activate();
    refreshTabs();
    callbacksRef.current.onDirty();
    callbacksRef.current.onInfo(`已复制为 ${name}`);
    window.setTimeout(() => refreshDataContext(), 120);
    return name;
  }, [refreshDataContext, refreshTabs]);

  const deleteSheet = useCallback(() => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    if (!book || !sheet) return false;
    const sheets = book.getSheets();
    if (sheets.length <= 1) {
      callbacksRef.current.onError("至少保留一个工作表");
      return false;
    }
    const deletedName = sheet.getSheetName();
    const index = sheets.findIndex((item) => item.getSheetId() === sheet.getSheetId());
    const next = sheets[index + 1] ?? sheets[index - 1];
    clearFilterInternal(true);
    next.activate();
    book.deleteSheet(sheet);
    if (charts.some((chart) => chart.sheetName === deletedName)) {
      updateCharts(charts.filter((chart) => chart.sheetName !== deletedName));
    }
    if (comments.some((item) => item.sheetName === deletedName)) {
      updateComments(comments.filter((item) => item.sheetName !== deletedName));
    }
    if (images.some((item) => item.sheetName === deletedName)) {
      updateImages(images.filter((item) => item.sheetName !== deletedName));
    }
    refreshTabs();
    callbacksRef.current.onDirty();
    callbacksRef.current.onInfo(`已删除 ${deletedName}`);
    window.setTimeout(() => {
      persistCf();
      refreshDataContext();
    }, 180);
    return true;
  }, [charts, clearFilterInternal, comments, images, persistCf, refreshDataContext, refreshTabs, updateCharts, updateComments, updateImages]);

  const csvText = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return "";
    const lastRow = Math.max(0, sheet.getLastRow());
    const lastColumn = Math.max(0, sheet.getLastColumn());
    const values = sheet.getRange(0, 0, lastRow + 1, lastColumn + 1).getValues();
    return valuesToCsv(values as unknown[][]);
  }, []);

  const hiddenRows = useCallback(() => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    if (!book || !sheet) return 0;
    const snapshot = book.save();
    const sheetData = snapshot.sheets?.[sheet.getSheetId()] as { rowData?: Record<string, { hd?: number }> } | undefined;
    if (!sheetData?.rowData) return 0;
    return Object.values(sheetData.rowData).filter((row) => row && row.hd === 1).length;
  }, []);

  const usedRangeA1 = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return "A1";
    const lastRow = Math.max(0, sheet.getLastRow());
    const lastColumn = Math.max(0, sheet.getLastColumn());
    return `A1:${columnLabel(lastColumn)}${lastRow + 1}`;
  }, []);

  const buildPreview = useCallback(
    (settings: PrintSettings): PrintPreview => {
      const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
      const usedArea = usedRangeA1();
      if (!sheet) {
        return {
          sheetName: "",
          areaA1: settings.area || usedArea,
          pages: [],
          pageCount: 0,
          scale: 1,
          tableWidth: 0,
          contentWidth: 0,
          hasHeader: false,
          error: "表格尚未就绪",
        };
      }
      // 打印区域按工作表记忆：只有当前表设置过区域才沿用，避免切表后套用别的表的区域
      const activeArea = settings.areaSheet === sheet.getSheetId() ? settings.area : null;
      const areaText = activeArea || usedArea;
      const area = parseA1Range(areaText);
      if (!area) {
        return {
          sheetName: sheet.getSheetName(),
          areaA1: areaText,
          pages: [],
          pageCount: 0,
          scale: 1,
          tableWidth: 0,
          contentWidth: 0,
          hasHeader: false,
          error: "打印区域格式不正确，请使用 A1 或 A1:H20",
        };
      }
      const rows = area.endRow - area.startRow + 1;
      const columns = area.endColumn - area.startColumn + 1;
      if (rows < 1 || columns < 1) {
        return {
          sheetName: sheet.getSheetName(),
          areaA1: areaText,
          pages: [],
          pageCount: 0,
          scale: 1,
          tableWidth: 0,
          contentWidth: 0,
          hasHeader: false,
          error: "打印区域为空",
        };
      }
      if (rows * columns > 100000) {
        return {
          sheetName: sheet.getSheetName(),
          areaA1: areaText,
          pages: [],
          pageCount: 0,
          scale: 1,
          tableWidth: 0,
          contentWidth: 0,
          hasHeader: false,
          error: "打印区域过大，请控制在 10 万个单元格以内",
        };
      }
      const values = sheet.getRange(area.startRow, area.startColumn, rows, columns).getValues() as unknown[][];
      const columnWidths = Array.from({ length: columns }, (_, offset) => sheet.getColumnWidth(area.startColumn + offset));
      const rowHeights = Array.from({ length: rows }, (_, offset) => sheet.getRowHeight(area.startRow + offset));
      const snapshot = apiRef.current?.getActiveWorkbook()?.save();
      const sheetData = snapshot?.sheets?.[sheet.getSheetId()] as { rowData?: Record<string, { hd?: number }> } | undefined;
      const hiddenRows = Object.entries(sheetData?.rowData ?? {})
        .filter(([, row]) => row?.hd === 1)
        .map(([index]) => Number(index) - area.startRow)
        .filter((index) => index >= 0 && index < rows);
      return buildPrintPreview({
        sheetName: sheet.getSheetName(),
        area: activeArea,
        usedArea,
        values,
        columnWidths,
        rowHeights,
        hiddenRows,
        settings: { ...settings, area: activeArea },
      });
    },
    [usedRangeA1],
  );

  const updatePrintSettings = useCallback((patch: Partial<PrintSettings>) => {
    setPrintSettings((current) => {
      const next = normalizePrintSettings({ ...current, ...patch });
      savePrintSettings(printKeyRef.current, next);
      return next;
    });
  }, []);

  const applyPrintArea = useCallback((value: string) => {
    const text = value.replace(/\s+/g, "").toUpperCase();
    if (!parseA1Range(text)) return { ok: false, message: "打印区域格式不正确，请使用 A1 或 A1:H20" };
    const sheetId = apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getSheetId() ?? null;
    updatePrintSettings({ area: text, areaSheet: sheetId });
    return { ok: true };
  }, [updatePrintSettings]);

  const printUseSelection = useCallback(() => {
    const range = activeRange();
    if (!range) {
      callbacksRef.current.onError("请先在表格中选择打印区域");
      return;
    }
    const sheetId = apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getSheetId() ?? null;
    updatePrintSettings({ area: range.getA1Notation(), areaSheet: sheetId });
  }, [activeRange, updatePrintSettings]);

  const printUseAll = useCallback(() => {
    updatePrintSettings({ area: null, areaSheet: null });
  }, [updatePrintSettings]);

  const openPrint = useCallback(() => {
    setPrintPreview(buildPreview(printSettings));
    setPrintOpen(true);
  }, [buildPreview, printSettings]);

  const closePrint = useCallback(() => setPrintOpen(false), []);

  const runPrint = useCallback(async () => {
    if (!printPreview || printPreview.error || !printPreview.pageCount) return;
    setPrinting(true);
    try {
      // WebView2 的 window.print() 在三个平台都可用，Tauri 原生 print() 仅 macOS 支持
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
      window.print();
      callbacksRef.current.onInfo("已打开系统打印对话框");
    } catch (error) {
      callbacksRef.current.onError(`打印失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrinting(false);
    }
  }, [printPreview]);

  useEffect(() => {
    if (!printOpen) return;
    setPrintPreview(buildPreview(printSettings));
  }, [buildPreview, printOpen, printSettings]);

  const collectFindMatches = useCallback((query: string, caseSensitive: boolean) => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet || !query) return [];
    const lastRow = Math.max(0, sheet.getLastRow());
    const lastColumn = Math.max(0, sheet.getLastColumn());
    const columns = lastColumn + 1;
    const rows = Math.min(lastRow + 1, Math.max(1, Math.floor(2000000 / Math.max(1, columns))));
    if (rows <= 0) return [];
    const values = sheet.getRange(0, 0, rows, columns).getValues() as unknown[][];
    const formulas = sheet.getRange(0, 0, rows, columns).getFormulas();
    const needle = caseSensitive ? query : query.toLowerCase();
    const hits: { row: number; column: number; formula: boolean }[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const formula = formulas[row]?.[column] ?? "";
        const text = formula || toCellText(values[row]?.[column]);
        if (!text) continue;
        const hay = caseSensitive ? text : text.toLowerCase();
        if (hay.includes(needle)) hits.push({ row, column, formula: Boolean(formula) });
      }
    }
    return hits;
  }, []);

  const focusFindMatch = useCallback((item: { row: number; column: number } | undefined) => {
    if (!item) return;
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    sheet.setActiveSelection(sheet.getRange(item.row, item.column, 1, 1));
    syncActiveCell();
  }, [syncActiveCell]);

  const runFind = useCallback((rawQuery: string, caseSensitive: boolean) => {
    const query = rawQuery;
    if (!query) {
      setFindMatches([]);
      setFindIndex(0);
      setFindNotice("");
      return;
    }
    const hits = collectFindMatches(query, caseSensitive);
    setFindMatches(hits);
    setFindIndex(0);
    setFindNotice(hits.length ? `找到 ${hits.length} 处` : "没有匹配内容");
    focusFindMatch(hits[0]);
  }, [collectFindMatches, focusFindMatch]);

  const stepFind = useCallback((step: number) => {
    if (!findMatches.length) {
      const hits = collectFindMatches(findQuery, findCase);
      setFindMatches(hits);
      if (!hits.length) {
        setFindNotice(findQuery ? "没有匹配内容" : "");
        return;
      }
      setFindIndex(0);
      setFindNotice(`找到 ${hits.length} 处`);
      focusFindMatch(hits[0]);
      return;
    }
    const next = (findIndex + step + findMatches.length) % findMatches.length;
    setFindIndex(next);
    setFindNotice(`第 ${next + 1} / ${findMatches.length} 处`);
    focusFindMatch(findMatches[next]);
  }, [collectFindMatches, findCase, findIndex, findMatches, findQuery, focusFindMatch]);

  const replaceCurrent = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const item = findMatches[findIndex];
    if (!sheet || !findQuery || !item) {
      runFind(findQuery, findCase);
      return;
    }
    if (item.formula) {
      setFindNotice("公式单元格只查找、不替换");
      stepFind(1);
      return;
    }
    const range = sheet.getRange(item.row, item.column);
    const before = toCellText(range.getValue());
    const next = replaceTextAll(before, findQuery, findReplacement, findCase);
    range.setValue(next === "" ? { v: null, f: null, p: null } : next);
    try {
      apiRef.current?.getFormula().executeCalculation();
    } catch {
      /* ignore */
    }
    callbacksRef.current.onDirty();
    const hits = collectFindMatches(findQuery, findCase);
    setFindMatches(hits);
    const pos = Math.min(findIndex, Math.max(0, hits.length - 1));
    setFindIndex(pos);
    setFindNotice(`已替换 1 处 · 还剩 ${hits.length} 处`);
    focusFindMatch(hits[pos]);
    window.setTimeout(() => syncActiveCell(), 160);
  }, [collectFindMatches, findCase, findIndex, findMatches, findQuery, findReplacement, focusFindMatch, runFind, stepFind, syncActiveCell]);

  const replaceAll = useCallback(() => {
    const items = collectFindMatches(findQuery, findCase);
    if (!findQuery || !items.length) {
      setFindNotice(findQuery ? "没有匹配内容" : "");
      return;
    }
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    let count = 0;
    let skipped = 0;
    for (const item of items) {
      if (item.formula) {
        skipped += 1;
        continue;
      }
      const range = sheet.getRange(item.row, item.column);
      const before = toCellText(range.getValue());
      const next = replaceTextAll(before, findQuery, findReplacement, findCase);
      if (next === before) continue;
      range.setValue(next === "" ? { v: null, f: null, p: null } : next);
      count += 1;
    }
    try {
      apiRef.current?.getFormula().executeCalculation();
    } catch {
      /* ignore */
    }
    if (count) callbacksRef.current.onDirty();
    setFindMatches([]);
    setFindIndex(0);
    setFindNotice(
      count
        ? `已替换 ${count} 处${skipped ? `，跳过 ${skipped} 个公式单元格` : ""}`
        : "没有可替换的内容",
    );
    window.setTimeout(() => syncActiveCell(), 160);
  }, [collectFindMatches, findCase, findQuery, findReplacement, syncActiveCell]);

  const openFind = useCallback((replace = false) => {
    setFindOpen(true);
    setFindReplace(replace);
    window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 40);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "h") return;
      event.preventDefault();
      event.stopPropagation();
      openFind(key === "h");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openFind]);

  useImperativeHandle(
    ref,
    () => ({
      saveBuffer: async () => {
        const book = apiRef.current?.getActiveWorkbook();
        if (!book) throw new Error("表格尚未就绪");
        // 筛选只是视图态，保存前先把隐藏行恢复，避免把临时筛选写死进 xlsx
        if (filterScopeRef.current) {
          clearFilterInternal(true);
          await new Promise((resolve) => window.setTimeout(resolve, 80));
          syncActiveCell();
        }
        const snapshot = book.save();
        const buffer = await snapshotToXlsx(snapshot);
        const records = collectValidationRecords(book);
        return records.length > 0 ? writeValidationRecords(buffer, records) : buffer;
      },
      workbookMeta: () => {
        const book = apiRef.current?.getActiveWorkbook();
        const cf = book
          ? book.getSheets().map((sheet) => ({
              sheetName: sheet.getSheetName(),
              rules: sheet.getConditionalFormattingRules(),
            }))
          : [];
        return { version: 1, charts, cf, print: printSettings, comments, images };
      },
      isEditing: () => editingRef.current,
      openFind,
      findState: () => ({
        open: findOpen,
        query: findQuery,
        matches: findMatches.length,
        index: findMatches.length ? findIndex + 1 : 0,
      }),
      getSnapshot: () => apiRef.current?.getActiveWorkbook()?.save() ?? null,
      undo: () => {
        apiRef.current?.getActiveWorkbook()?.undo();
      },
      redo: () => {
        apiRef.current?.getActiveWorkbook()?.redo();
      },
      sheetCount: () => apiRef.current?.getActiveWorkbook()?.getSheets().length ?? 0,
      sheetTabs: () => tabs.map((tab) => ({ id: tab.id, name: tab.name, color: tab.color })),
      selectCell: (row, column) => {
        apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getRange(row, column).activate();
        syncActiveCell();
      },
      selectRange: (startRow, startColumn, endRow, endColumn) => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        if (!sheet) return;
        sheet.setActiveSelection(
          sheet.getRange(
            startRow,
            startColumn,
            Math.max(1, endRow - startRow + 1),
            Math.max(1, endColumn - startColumn + 1),
          ),
        );
        syncActiveCell();
      },
      selectionA1: () => activeRange()?.getA1Notation() ?? null,
      conditionalRuleCount: () => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        return sheet?.getConditionalFormattingRules().length ?? 0;
      },
      applyConditional: (kind, formula) => applyConditional(kind, formula),
      copyConditionalTo: (path, nextName) => {
        const book = apiRef.current?.getActiveWorkbook();
        if (!book) return;
        const groups = book.getSheets().map((sheet) => ({
          sheetName: sheet.getSheetName(),
          rules: sheet.getConditionalFormattingRules(),
        }));
        saveCfRules(cfStorageKey(path, nextName), groups);
      },
      validationCount: () => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        return sheet?.getDataValidations().length ?? 0;
      },
      validationForCell: (row, column) => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        const rule = sheet?.getRange(row, column).getDataValidation();
        return rule ? summarizeValidationRule(rule) : null;
      },
      validationStatus: async (row, column) => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        if (!sheet) return null;
        const matrix = await sheet.getRange(row, column).getValidatorStatus();
        return matrix[0]?.[0] ?? null;
      },
      openPivot,
      cellStyle: (row, column) => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        return (sheet?.getRange(row, column).getCellStyleData() as unknown as Record<string, unknown>) ?? null;
      },
      sortBy,
      sortByKeys,
      filterBy,
      filterByConditions,
      clearFilter,
      filterInfo: () => filterInfo,
      freeze: setFreeze,
      freezeState: () => readFreezeState(),
      sheetNames: () => apiRef.current?.getActiveWorkbook()?.getSheets().map((sheet) => sheet.getSheetName()) ?? [],
      activeSheetName: () => apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getSheetName() ?? "",
      renameSheet,
      setSheetColor,
      duplicateSheet,
      deleteSheet,
      csvText,
      hiddenRows,
      openPrint,
      addImage: (dataUrl: string, imageName: string) => placeImage(dataUrl, imageName),
      commentCount: () => comments.length,
      imageCount: () => images.length,
      printInfo: () => ({
        open: printOpen,
        settings: printSettings,
        preview: printPreview
          ? {
              areaA1: printPreview.areaA1,
              pageCount: printPreview.pageCount,
              scale: printPreview.scale,
              tableWidth: printPreview.tableWidth,
              contentWidth: printPreview.contentWidth,
              error: printPreview.error,
              pages: printPreview.pages.map((page) => ({
                number: page.number,
                total: page.total,
                rows: page.rows.length,
                width: page.width,
                firstCell: page.rows[0]?.cells[0] ?? "",
              })),
            }
          : null,
      }),
    }),
    [
      activeRange,
      charts,
      comments,
      images,
      clearFilter,
      clearFilterInternal,
      csvText,
      deleteSheet,
      duplicateSheet,
      filterBy,
      filterInfo,
      findIndex,
      findMatches,
      findOpen,
      findQuery,
      hiddenRows,
      openFind,
      openPivot,
      openPrint,
      placeImage,
      printOpen,
      printPreview,
      printSettings,
      readFreezeState,
      renameSheet,
      setFreeze,
      setSheetColor,
      sortBy,
      sortByKeys,
      filterByConditions,
      syncActiveCell,
      tabs,
    ],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let bookListener: { dispose: () => void } | null = null;
    let selectionListener: { dispose: () => void } | null = null;
    let listenTimer: number | undefined;
    let armed = false;
    const arm = () => {
      armed = true;
    };
    host.innerHTML = "";
    const container = document.createElement("div");
    container.className = "univer-container";
    container.style.width = "100%";
    container.style.height = "100%";
    host.appendChild(container);
    container.addEventListener("pointerdown", arm, true);
    container.addEventListener("keydown", arm, true);

    setLoading(true);
    setLoadingText(bytes ? "正在解析 xlsx…" : "正在准备表格…");
    callbacksRef.current.onState("loading");
    filterScopeRef.current = null;
    setFilterInfo(null);
    setFreezeInfo(null);
    setDataContext(EMPTY_DATA_CONTEXT);

    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN, UniverSheetsDataValidationZhCN, UniverSheetsDataValidationUIZhCN),
      },
      presets: [
        UniverSheetsCorePreset({
          container,
          header: false,
          toolbar: false,
          footer: false,
          formulaBar: true,
          contextMenu: true,
        }),
      ],
      plugins: [
        UniverSheetsConditionalFormattingPlugin,
        UniverSheetsConditionalFormattingUIPlugin,
        UniverSheetsDataValidationPlugin,
        UniverSheetsDataValidationUIPlugin,
      ],
    });
    apiRef.current = univerAPI;
    univerAPI.toggleDarkMode(dark);

    const boot = async () => {
      let snapshot: IWorkbookData | undefined;
      let validationRecords: SheetValidationRecords[] = [];
      if (bytes) {
        snapshot = await xlsxToSnapshot(bytes, name);
        try {
          validationRecords = await readValidationRecords(bytes);
        } catch {
          validationRecords = [];
        }
      }
      if (disposed) return;
      const book = univerAPI.createWorkbook(snapshot ?? {});
      bookRef.current = book;
      if (validationRecords.length > 0) {
        try {
          applyValidationRecords(univerAPI, book, validationRecords);
        } catch (err) {
          callbacksRef.current.onError(err instanceof Error ? err.message : String(err));
        }
      }
      // 旧文件 / 桥接导入可能把整张已用区域写成活动选区，Univer 会为首屏绘制整块选区。
      // 只收敛异常的大选区；普通文件的 A1 / 小选区保持原样，避免合并单元格被改选到下一行。
      for (const sheet of book.getSheets()) {
        try {
          const active = sheet.getSelection()?.getActiveRange();
          const cells = active ? active.getHeight() * active.getWidth() : 0;
          if (!active || cells > 5000 || active.getHeight() > 500 || active.getWidth() > 200) {
            sheet.setActiveSelection(sheet.getRange(0, 0, 1, 1));
          }
        } catch {
          /* 隐藏表或异常区域不影响打开 */
        }
      }
      if (!bytes && initialRows && initialRows.length > 0) {
        const sheet = book.getActiveSheet();
        if (sheet) {
          const columns = Math.max(1, ...initialRows.map((row) => row.length));
          const matrix = initialRows.map((row) =>
            Array.from({ length: columns }, (_, index) => row[index] ?? ""),
          );
          sheet.getRange(0, 0, matrix.length, columns).setValues(matrix);
          // CSV 没有列宽 / 行高信息，按内容给一个可读的初始宽度，避免中文和带逗号客户名溢出
          const widths = Array.from({ length: columns }, () => 8);
          matrix.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
              const text = cell === null || cell === undefined ? "" : String(cell);
              const visual = [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
              widths[columnIndex] = Math.max(widths[columnIndex], visual);
              const lines = text.split(/\r?\n/).length;
              if (lines > 1) {
                sheet.setRowHeight(rowIndex, Math.min(96, 24 * lines));
                sheet.getRange(rowIndex, columnIndex, 1, 1).setWrapStrategy(WrapStrategy.WRAP);
              }
            });
          });
          widths.forEach((length, columnIndex) => {
            sheet.setColumnWidth(columnIndex, Math.min(240, Math.max(76, length * 9 + 16)));
          });
          if (initialSheetName) {
            const clean = initialSheetName.replace(/[\\/?*\[\]:]/g, "").slice(0, 31) || "Sheet1";
            try {
              sheet.setName(clean);
            } catch {
              /* 名称冲突时保留默认 Sheet1 */
            }
          }
          sheet.setActiveSelection(sheet.getRange(0, 0, 1, 1));
        }
      }
      const sidecarGroups = loadCfRules(cfStorageKey(docPath, name));
      for (const group of sidecarGroups) {
        const sheet = book.getSheetByName(group.sheetName);
        if (!sheet || sheet.getConditionalFormattingRules().length > 0) continue;
        for (const rule of group.rules) sheet.addConditionalFormattingRule(rule);
      }
      selectionListener = book.onSelectionChange(() => {
        syncActiveCell();
        refreshTabs();
      });
      // 导入的公式只带字符串，需要主动算一遍
      try {
        univerAPI.getFormula().executeCalculation();
        window.setTimeout(() => syncActiveCell(), 260);
      } catch {
        /* 公式引擎在极端数据下可能拒绝执行，交给下一轮输入触发 */
      }
      // 建簿本身会触发一批内部命令；等首帧稳定后再开始监听用户修改
      const timer = window.setTimeout(() => {
        if (disposed) return;
        bookListener = book.onCommandExecuted((command) => {
          const id = String((command as { id?: string })?.id ?? "?");
          const viewOnly =
            id.startsWith("sheet.operation.") ||
            id.includes("selection") ||
            id.includes("scroll") ||
            id.includes("zoom") ||
            id.includes("set-activate-cell");
          if (armed && !viewOnly) {
            callbacksRef.current.onDirty();
          }
          if (!viewOnly) setChartTick((tick) => tick + 1);
          if (!editingRef.current) syncActiveCell();
        });
      }, 320);
      listenTimer = timer;
      setLoading(false);
      callbacksRef.current.onState("ready");
      refreshTabs();
      callbacksRef.current.onReady(book.getSheets().length);
    };

    boot().catch((err) => {
      if (disposed) return;
      const message = err instanceof Error ? err.message : String(err);
      setLoading(false);
      setLoadingText("表格打开失败");
      callbacksRef.current.onState("error", message);
      callbacksRef.current.onError(message);
    });

    const onResize = () => window.requestAnimationFrame(() => {
      if (!disposed) syncActiveCell();
    });
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      if (listenTimer) window.clearTimeout(listenTimer);
      container.removeEventListener("pointerdown", arm, true);
      container.removeEventListener("keydown", arm, true);
      selectionListener?.dispose();
      bookListener?.dispose();
      apiRef.current = null;
      bookRef.current = null;
      // 让 React 先完成卸载，再释放 Univer 的渲染循环，避免卸载阶段抢渲染
      const own = container;
      window.setTimeout(() => {
        try {
          univer.dispose();
        } catch {
          /* 卸载阶段忽略 */
        }
        own.remove();
      }, 0);
    };
  }, [docKey]);

  useEffect(() => {
    if (!libraryOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest(".fx-library") || target.closest(".fx-mark"))) {
        return;
      }
      setLibraryOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLibraryOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [libraryOpen]);

  useEffect(() => {
    if (!cellToolsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest(".cell-tools") || target.closest(".cell-tools-mark"))) {
        return;
      }
      setCellToolsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCellToolsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [cellToolsOpen]);

  useEffect(() => {
    if (!validationOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest(".dv-panel") || target.closest(".dv-mark"))) {
        return;
      }
      setValidationOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setValidationOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [validationOpen]);

  const activeSheetComments = comments.filter((item) => item.sheetName === activeSheetName);
  const activeComment = activeSheetComments.find(
    (item) => item.row === activeRow && item.column === activeColumn,
  );

  return (
    <div className="sheet-host">
      <FormatToolbar
        state={formatState}
        onFormat={applyFormat}
        onConditional={applyConditional}
        onOpenChart={openChart}
      />
      <DataToolbar
        context={dataContext}
        filter={filterInfo}
        freeze={freezeInfo}
        sheets={tabs}
        activeSheetId={activeTab}
        onSort={(keys) => sortByKeys(keys)}
        onFilter={filterByConditions}
        onClearFilter={clearFilter}
        onFreeze={setFreeze}
        onImportCsv={onCsvImport}
        onExportCsv={onCsvExport}
        onActivateSheet={activateTab}
        onRenameSheet={renameSheet}
        onSetSheetColor={setSheetColor}
        onDuplicateSheet={duplicateSheet}
        onDeleteSheet={deleteSheet}
        onAddSheet={addSheet}
        onPivot={openPivot}
      />
      <div className={`formula-bar${formulaEditing ? " editing" : ""}`}>
        <span className="name-box" title="当前单元格">
          {activeAddr}
        </span>
        <button
          type="button"
          className={`fx-mark${libraryOpen ? " active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setLibraryOpen((open) => !open);
            setLibraryQuery("");
            setLibraryCommon(false);
            setLibraryIndex(0);
            setSuggestPrefix(null);
          }}
          title="打开函数库"
        >
          fx
        </button>
        <button
          type="button"
          className={`find-mark${findOpen ? " active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openFind(false)}
          title="查找与替换（Ctrl+F）"
          aria-label="查找与替换"
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.3 10.3 14 14" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button
          type="button"
          className={`cell-tools-mark${cellToolsOpen ? " active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setCellToolsOpen((open) => !open);
            setLibraryOpen(false);
            setValidationOpen(false);
          }}
          title="单元格工具：合并、边框、换行、行列"
          aria-label="单元格工具"
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <rect x="2" y="2" width="12" height="12" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 2v12M10 2v12M2 6h12M2 10h12" stroke="currentColor" strokeWidth="0.8" opacity=".55" />
            <circle cx="13.5" cy="13.5" r="2.4" fill="#fff" stroke="currentColor" strokeWidth="1" />
            <path d="M13.5 12.2v2.6M12.2 13.5h2.6" stroke="currentColor" strokeWidth="0.9" />
          </svg>
        </button>
        <button
          type="button"
          className={`dv-mark${validationOpen ? " active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (validationOpen) setValidationOpen(false);
            else openValidation();
          }}
          title="数据验证：下拉列表、数值范围"
          aria-label="数据验证"
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M8 1.9 13 3.8v4.3c0 3-2 5.1-5 6.1-3-1-5-3.1-5-6.1V3.8L8 1.9Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="m5.9 8 1.5 1.5 2.9-3" stroke="currentColor" strokeWidth="1.3" fill="none" />
          </svg>
        </button>
        <button
          type="button"
          className={`comment-mark${commentOpen ? " active" : ""}${activeComment ? " has-note" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setCommentOpen((open) => !open)}
          title={activeComment ? `批注：${activeComment.text}` : "单元格批注"}
          aria-label="单元格批注"
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M2.5 3.2h11v7.4H8l-3.2 2.7v-2.7h-2.3Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5 6h6M5 8.2h4" stroke="currentColor" strokeWidth="1" opacity=".65" />
          </svg>
          {activeComment ? <i className="comment-dot" /> : null}
        </button>
        <button
          type="button"
          className="image-mark"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { void insertImage(); }}
          title="插入浮动图片"
          aria-label="插入浮动图片"
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <rect x="2.2" y="3" width="11.6" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="5.4" cy="6.2" r="1.1" fill="currentColor" opacity=".7" />
            <path d="m3.4 11.4 3-3 2.2 2.1 2-2.2 2.6 3.1" fill="none" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
        <input
          ref={inputRef}
          className="fx-input"
          value={cellText}
          spellCheck={false}
          autoComplete="off"
          placeholder="输入内容或公式，例如 =SUM(B3:B5)"
          onChange={(e) => {
            const next = e.target.value;
            const nextCaret = e.target.selectionStart ?? next.length;
            setCellText(next);
            setCaret(nextCaret);
            setSuggestPrefix(formulaToken(next, nextCaret));
            setSuggestIndex(0);
          }}
          onFocus={(e) => {
            const input = e.currentTarget;
            editingRef.current = true;
            setFormulaEditing(true);
            if (skipSelectRef.current) {
              skipSelectRef.current = false;
              window.requestAnimationFrame(() =>
                input.setSelectionRange(input.value.length, input.value.length),
              );
              return;
            }
            formulaOriginalRef.current = cellText;
            window.requestAnimationFrame(() => input.select());
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Element && next.closest(".fx-library")) return;
            commitFormula();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              if (libraryOpen) {
                e.preventDefault();
                setLibraryOpen(false);
                return;
              }
              if (suggestPrefix !== null) {
                e.preventDefault();
                setSuggestPrefix(null);
                return;
              }
              e.preventDefault();
              editingRef.current = false;
              setFormulaEditing(false);
              setCellText(formulaOriginalRef.current);
              (e.currentTarget as HTMLInputElement).blur();
              return;
            }
            if (suggestOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setSuggestIndex((index) => (index + step + suggestions.length) % suggestions.length);
              return;
            }
            if (suggestOpen && (e.key === "Tab" || e.key === "Enter")) {
              e.preventDefault();
              applyFormula(suggestions[Math.min(suggestIndex, suggestions.length - 1)], false);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              commitFormula();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
        />
        {libraryOpen ? (
          <FormulaHelper
            mode="library"
            items={libraryItems}
            total={FORMULA_COUNT}
            common={libraryCommon}
            query={libraryQuery}
            activeIndex={libraryIndex}
            onQuery={(value) => {
              setLibraryQuery(value);
              setLibraryIndex(0);
            }}
            onToggleCommon={() => {
              setLibraryCommon((value) => !value);
              setLibraryIndex(0);
            }}
            onActiveIndex={setLibraryIndex}
            onPick={(item) => applyFormula(item, true)}
            onClose={() => setLibraryOpen(false)}
          />
        ) : null}
        {suggestOpen ? (
          <FormulaHelper
            mode="suggest"
            items={suggestions}
            total={FORMULA_COUNT}
            common={false}
            query={suggestPrefix ?? ""}
            activeIndex={suggestIndex}
            onQuery={() => undefined}
            onToggleCommon={() => undefined}
            onActiveIndex={setSuggestIndex}
            onPick={(item) => applyFormula(item, false)}
            onClose={() => setSuggestPrefix(null)}
          />
        ) : null}
        {cellToolsOpen ? (
          <CellTools
            state={cellToolState}
            rangeA1={activeRange()?.getA1Notation() ?? activeAddr}
            onAction={applyCellTool}
            onClose={() => setCellToolsOpen(false)}
          />
        ) : null}
        {validationOpen ? (
          <ValidationPanel
            rangeA1={activeRange()?.getA1Notation() ?? activeAddr}
            summary={validationSummary}
            onApply={applyValidation}
            onClear={clearValidation}
            onClose={() => setValidationOpen(false)}
          />
        ) : null}
        <PivotPanel
          source={pivotOpen ? pivotSource : null}
          onClose={() => setPivotOpen(false)}
          onApply={applyPivot}
        />
      </div>
      <div className="sheet-grid" ref={gridRef}>
        <div className="univer-host sheet-container" ref={hostRef} />
        <div className="chart-layer">
          {visibleImages.map((image) => (
            <ImageCard
              key={image.id}
              image={image}
              onMove={moveImage}
              onResize={resizeImage}
              onPatch={patchImage}
              onRaise={raiseImage}
              onDelete={deleteImage}
            />
          ))}
          {visibleCharts.map(({ chart, data }) => (
            <ChartCard key={chart.id} chart={chart} data={data} onMove={moveChart} onDelete={deleteChart} />
          ))}
          {chartOpen ? (
            <ChartStudio
              type={chartType}
              title={chartTitle}
              range={chartRange}
              data={studioData}
              error={chartError}
              onType={(next) => {
                setChartType(next);
                if (!chartTitleTouched) {
                  setChartTitle(`${CHART_TYPE_LABEL[next]} · ${activeSheetName || "Sheet"}`);
                }
              }}
              onTitle={(value) => {
                setChartTitle(value);
                setChartTitleTouched(true);
              }}
              onRange={(value) => {
                setChartRange(value);
                setChartError("");
              }}
              onUseSelection={useSelectionForChart}
              onInsert={insertChart}
              onClose={() => {
                setChartOpen(false);
                setChartError("");
              }}
            />
          ) : null}
        </div>
        {commentOpen ? (
          <CommentPanel
            sheetName={activeSheetName}
            comments={comments}
            activeRow={activeRow}
            activeColumn={activeColumn}
            onCreate={addComment}
            onUpdate={patchComment}
            onDelete={deleteComment}
            onJump={jumpComment}
            onClose={() => setCommentOpen(false)}
          />
        ) : null}
        {loading && (
          <div className="sheet-loading">
            <div className="sheet-loading-inner">
              <span className="spinner" />
              {loadingText}
            </div>
          </div>
        )}
      </div>
      <div className="sheet-tabs">
        <div className="tab-strip">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`sheet-tab${tab.id === activeTab ? " active" : ""}`}
              onClick={() => activateTab(tab.id)}
              title={tab.name}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <button className="tab-add" onClick={addSheet} title="新建工作表">
          +
        </button>
      </div>
      {findOpen ? (
        <div className="find-panel" role="dialog" aria-label="查找与替换">
          <div className="find-head">
            <span>查找与替换</span>
            <button
              className="find-close"
              title="关闭"
              onClick={() => {
                setFindOpen(false);
                setFindNotice("");
              }}
            >
              ×
            </button>
          </div>
          <div className="find-row">
            <input
              ref={findInputRef}
              className="find-query"
              value={findQuery}
              placeholder="要查找的内容"
              onChange={(event) => {
                setFindQuery(event.target.value);
                setFindMatches([]);
                setFindIndex(0);
                setFindNotice("");
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  setFindOpen(false);
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.shiftKey) stepFind(-1);
                  else if (findMatches.length) stepFind(1);
                  else runFind(findQuery, findCase);
                }
              }}
            />
            <button className="find-step" title="上一个" onClick={() => stepFind(-1)}>↑</button>
            <button className="find-step" title="下一个" onClick={() => stepFind(1)}>↓</button>
          </div>
          {findReplace ? (
            <div className="find-row">
              <input
                className="find-replacement"
                value={findReplacement}
                placeholder="替换为（可留空）"
                onChange={(event) => setFindReplacement(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setFindOpen(false);
                  }
                }}
              />
            </div>
          ) : null}
          <div className="find-meta">
            <label>
              <input
                type="checkbox"
                checked={findCase}
                onChange={(event) => {
                  const next = event.target.checked;
                  setFindCase(next);
                  if (findQuery) runFind(findQuery, next);
                }}
              />
              区分大小写
            </label>
            <span>{findNotice || (findMatches.length ? `第 ${findIndex + 1} / ${findMatches.length} 处` : "")}</span>
          </div>
          <div className="find-actions">
            {findReplace ? (
              <>
                <button className="find-primary" onClick={replaceCurrent}>替换</button>
                <button onClick={replaceAll}>全部替换</button>
              </>
            ) : null}
            <button
              className="find-more"
              onClick={() => setFindReplace((value) => !value)}
              title={findReplace ? "收起替换栏" : "展开替换栏"}
            >
              {findReplace ? "收起替换" : "替换…"}
            </button>
          </div>
          <div className="find-tip">公式单元格只查找；替换不破坏原公式。Ctrl+F / Ctrl+H。</div>
        </div>
      ) : null}
      {printOpen ? (
        <PrintStudio
          settings={printSettings}
          preview={printPreview}
          printing={printing}
          onClose={closePrint}
          onChange={updatePrintSettings}
          onApplyArea={applyPrintArea}
          onUseSelection={printUseSelection}
          onUseAll={printUseAll}
          onPrint={() => void runPrint()}
        />
      ) : null}
    </div>
  );
});
