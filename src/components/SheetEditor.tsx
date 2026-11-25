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
import { CFValueType, UniverSheetsConditionalFormattingPlugin } from "@univerjs/sheets-conditional-formatting";
import { UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/sheets-conditional-formatting-ui";
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
import { ChartCard, ChartStudio } from "./ChartLayer";
import { DataToolbar } from "./DataToolbar";
import type { DataContext, FilterInfo, FilterOperator } from "./DataToolbar";
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

export type EditorHandle = {
  saveBuffer: () => Promise<Uint8Array>;
  getSnapshot: () => IWorkbookData | null;
  undo: () => void;
  redo: () => void;
  sheetCount: () => number;
  selectCell: (row: number, column: number) => void;
  selectRange: (startRow: number, startColumn: number, endRow: number, endColumn: number) => void;
  selectionA1: () => string | null;
  conditionalRuleCount: () => number;
  cellStyle: (row: number, column: number) => Record<string, unknown> | null;
  sortBy: (direction: "asc" | "desc", column?: number) => { ok: boolean; message: string };
  filterBy: (column: number, operator: FilterOperator, value: string) => { ok: boolean; message: string };
  clearFilter: () => void;
  filterInfo: () => FilterInfo | null;
  freeze: (kind: "first-row" | "first-col" | "at-cell" | "none") => { ok: boolean; message: string };
  freezeState: () => { rows: number; columns: number } | null;
  sheetNames: () => string[];
  activeSheetName: () => string;
  renameSheet: (name: string) => boolean;
  duplicateSheet: () => string | null;
  deleteSheet: () => boolean;
  csvText: () => string;
  hiddenRows: () => number;
  openPrint: () => void;
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

function snapshotToXlsx(snapshot: IWorkbookData): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    LuckyExcel.transformUniverToExcel({
      snapshot,
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

export const SheetEditor = forwardRef<EditorHandle, Props>(function SheetEditor(
  { docKey, docPath, name, bytes, initialRows, initialSheetName, onReady, onSheetCount, onDirty, onError, onInfo, onCsvImport, onCsvExport, onState },
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
  const [tabs, setTabs] = useState<{ id: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [formatState, setFormatState] = useState<FormatState>(DEFAULT_FORMAT);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("column");
  const [chartTitle, setChartTitle] = useState("");
  const [chartTitleTouched, setChartTitleTouched] = useState(false);
  const [chartRange, setChartRange] = useState("A1:B13");
  const [chartError, setChartError] = useState("");
  const [chartTick, setChartTick] = useState(0);
  const [charts, setCharts] = useState<ChartSpec[]>([]);
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
    setTabs(sheets.map((s) => ({ id: s.getSheetId(), name: s.getSheetName() })));
    setActiveTab(book.getActiveSheet()?.getSheetId() ?? "");
    setFreezeInfo(readFreezeState());
    callbacksRef.current.onSheetCount(sheets.length);
  }, [readFreezeState]);

  const activeSheetName = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.name ?? "", [activeTab, tabs]);

  const updateCharts = useCallback((next: ChartSpec[]) => {
    setCharts(next);
    saveCharts(chartKeyRef.current, next);
  }, []);

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
    const key = chartStorageKey(docPath, name);
    chartKeyRef.current = key;
    cfKeyRef.current = cfStorageKey(docPath, name);
    printKeyRef.current = printStorageKey(docPath, name);
    setCharts(loadCharts(key));
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
      setDataContext(EMPTY_DATA_CONTEXT);
      setFreezeInfo(null);
      if (!editingRef.current) setCellText("");
      return;
    }
    setActiveAddr(`${columnLetter(cell.startColumn)}${cell.startRow + 1}`);
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

  const applyConditional = useCallback(
    (kind: "scale" | "bar" | "clear") => {
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
          } else {
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

  const sortBy = useCallback((direction: "asc" | "desc", explicitColumn?: number) => {
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
    const current = sheet.getSelection()?.getCurrentCell();
    const sortColumn = Math.min(
      Math.max(explicitColumn ?? current?.startColumn ?? startColumn, startColumn),
      startColumn + columnCount - 1,
    );
    const columnOffset = sortColumn - startColumn;
    const hasHeader = detectHeaderRow(values);
    const dataStart = hasHeader ? 1 : 0;
    const dataCount = rowCount - dataStart;
    if (dataCount < 2) return { ok: false, message: "数据行不足，无法排序" };

    clearFilterInternal(true);
    const order: Record<number, number> = {};
    const indexes = Array.from({ length: dataCount }, (_, index) => index);
    indexes.sort((a, b) => {
      const left = values[dataStart + a]?.[columnOffset];
      const right = values[dataStart + b]?.[columnOffset];
      const leftNumber = numericLike(left);
      const rightNumber = numericLike(right);
      if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
        return direction === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
      }
      if (leftNumber !== null && rightNumber === null) return -1;
      if (leftNumber === null && rightNumber !== null) return 1;
      const leftText = toCellText(left);
      const rightText = toCellText(right);
      const compared = leftText.localeCompare(rightText, "zh-CN", { numeric: true });
      return direction === "asc" ? compared : -compared;
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
    const directionLabel = direction === "asc" ? "升序" : "降序";
    const message = `已按 ${columnLabel(sortColumn)} 列${directionLabel}排列 ${dataCount} 行`;
    callbacksRef.current.onInfo(message);
    return { ok: true, message };
  }, [clearFilterInternal, selectedDataRange, syncActiveCell]);

  const filterBy = useCallback((column: number, operator: FilterOperator, value: string) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getActiveSheet();
    const range = selectedDataRange();
    if (!book || !sheet || !range) return { ok: false, message: "没有可筛选的数据区域" };
    clearFilterInternal(true);
    const startRow = range.getRow();
    const startColumn = range.getColumn();
    const rowCount = range.getHeight();
    const columnCount = range.getWidth();
    const values = range.getValues() as unknown[][];
    const hasHeader = detectHeaderRow(values);
    const dataStart = hasHeader ? 1 : 0;
    const dataCount = rowCount - dataStart;
    if (dataCount < 1) return { ok: false, message: "数据行不足，无法筛选" };
    const filterColumn = Math.min(Math.max(column, startColumn), startColumn + columnCount - 1);
    const columnOffset = filterColumn - startColumn;
    const needle = value.trim();
    const matchedRows: number[] = [];

    let hideStart = -1;
    for (let index = 0; index < dataCount; index += 1) {
      const absoluteRow = startRow + dataStart + index;
      const matched = matchFilter(values[dataStart + index]?.[columnOffset], operator, needle);
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
    const headerLabel = hasHeader && toCellText(values[0]?.[columnOffset]).trim() !== ""
      ? toCellText(values[0][columnOffset]).trim()
      : "列";
    setFilterInfo({
      columnLabel: `${columnLabel(filterColumn)} ${headerLabel}`,
      operator: filterOperatorLabel(operator),
      value: needle,
      matched: matchedRows.length,
      total: dataCount,
    });
    callbacksRef.current.onInfo(`筛选命中 ${matchedRows.length}/${dataCount} 行`);
    return { ok: true, message: `筛选命中 ${matchedRows.length}/${dataCount} 行` };
  }, [clearFilterInternal, selectedDataRange, syncActiveCell]);

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
    refreshTabs();
    callbacksRef.current.onDirty();
    callbacksRef.current.onInfo(`工作表已改名为 ${clean}`);
    window.setTimeout(() => persistCf(), 180);
    return true;
  }, [charts, persistCf, refreshTabs, updateCharts]);

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
    refreshTabs();
    callbacksRef.current.onDirty();
    callbacksRef.current.onInfo(`已删除 ${deletedName}`);
    window.setTimeout(() => {
      persistCf();
      refreshDataContext();
    }, 180);
    return true;
  }, [charts, clearFilterInternal, persistCf, refreshDataContext, refreshTabs, updateCharts]);

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
        return snapshotToXlsx(snapshot);
      },
      getSnapshot: () => apiRef.current?.getActiveWorkbook()?.save() ?? null,
      undo: () => {
        apiRef.current?.getActiveWorkbook()?.undo();
      },
      redo: () => {
        apiRef.current?.getActiveWorkbook()?.redo();
      },
      sheetCount: () => apiRef.current?.getActiveWorkbook()?.getSheets().length ?? 0,
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
      cellStyle: (row, column) => {
        const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
        return (sheet?.getRange(row, column).getCellStyleData() as unknown as Record<string, unknown>) ?? null;
      },
      sortBy,
      filterBy,
      clearFilter,
      filterInfo: () => filterInfo,
      freeze: setFreeze,
      freezeState: () => readFreezeState(),
      sheetNames: () => apiRef.current?.getActiveWorkbook()?.getSheets().map((sheet) => sheet.getSheetName()) ?? [],
      activeSheetName: () => apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getSheetName() ?? "",
      renameSheet,
      duplicateSheet,
      deleteSheet,
      csvText,
      hiddenRows,
      openPrint,
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
      clearFilter,
      clearFilterInternal,
      csvText,
      deleteSheet,
      duplicateSheet,
      filterBy,
      filterInfo,
      hiddenRows,
      openPrint,
      printOpen,
      printPreview,
      printSettings,
      readFreezeState,
      renameSheet,
      setFreeze,
      sortBy,
      syncActiveCell,
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
        [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN),
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
      plugins: [UniverSheetsConditionalFormattingPlugin, UniverSheetsConditionalFormattingUIPlugin],
    });
    apiRef.current = univerAPI;

    const boot = async () => {
      let snapshot: IWorkbookData | undefined;
      if (bytes) {
        snapshot = await xlsxToSnapshot(bytes, name);
      }
      if (disposed) return;
      const book = univerAPI.createWorkbook(snapshot ?? {});
      bookRef.current = book;
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
          sheet.setActiveSelection(sheet.getRange(0, 0, Math.max(1, matrix.length), columns));
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
        onSort={(column, direction) => sortBy(direction, column)}
        onFilter={filterBy}
        onClearFilter={clearFilter}
        onFreeze={setFreeze}
        onImportCsv={onCsvImport}
        onExportCsv={onCsvExport}
        onActivateSheet={activateTab}
        onRenameSheet={renameSheet}
        onDuplicateSheet={duplicateSheet}
        onDeleteSheet={deleteSheet}
        onAddSheet={addSheet}
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
      </div>
      <div className="sheet-grid" ref={gridRef}>
        <div className="univer-host sheet-container" ref={hostRef} />
        <div className="chart-layer">
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
