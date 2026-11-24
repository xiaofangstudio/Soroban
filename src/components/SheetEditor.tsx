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
import type { FRange, FWorkbook } from "@univerjs/sheets/facade";
import type { IWorkbookData } from "@univerjs/core";
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
import { FormulaHelper } from "./FormulaHelper";
import { FormatToolbar } from "./FormatToolbar";
import type { FormatCommand, FormatState } from "./FormatToolbar";

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
};

type Props = {
  docKey: string;
  docPath: string | null;
  name: string;
  bytes: Uint8Array | null;
  onReady: (sheets: number) => void;
  onSheetCount: (sheets: number) => void;
  onDirty: () => void;
  onError: (message: string) => void;
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
  { docKey, docPath, name, bytes, onReady, onSheetCount, onDirty, onError, onState },
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
  const chartKeyRef = useRef(chartStorageKey(docPath, name));
  const cfKeyRef = useRef(cfStorageKey(docPath, name));
  const inputRef = useRef<HTMLInputElement>(null);
  const skipSelectRef = useRef(false);
  const editingRef = useRef(false);
  const formulaOriginalRef = useRef("");
  const callbacksRef = useRef({ onReady, onSheetCount, onDirty, onError, onState });
  callbacksRef.current = { onReady, onSheetCount, onDirty, onError, onState };
  const suggestions = useMemo(
    () => (suggestPrefix === null ? [] : suggestFormulas(suggestPrefix)),
    [suggestPrefix],
  );
  const libraryItems = useMemo(
    () => searchFormulas(libraryQuery, libraryCommon, 240),
    [libraryQuery, libraryCommon],
  );
  const suggestOpen = formulaEditing && !libraryOpen && suggestPrefix !== null && suggestions.length > 0;

  const refreshTabs = useCallback(() => {
    const book = apiRef.current?.getActiveWorkbook();
    if (!book) return;
    const sheets = book.getSheets();
    setTabs(sheets.map((s) => ({ id: s.getSheetId(), name: s.getSheetName() })));
    setActiveTab(book.getActiveSheet()?.getSheetId() ?? "");
    callbacksRef.current.onSheetCount(sheets.length);
  }, []);

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

  useEffect(() => {
    const key = chartStorageKey(docPath, name);
    chartKeyRef.current = key;
    cfKeyRef.current = cfStorageKey(docPath, name);
    setCharts(loadCharts(key));
  }, [docKey, docPath, name]);

  const syncActiveCell = useCallback(() => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const cell = sheet?.getSelection()?.getCurrentCell();
    if (!sheet || !cell) {
      setActiveAddr("A1");
      setFormatState(DEFAULT_FORMAT);
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
  }, []);

  const activateTab = (id: string) => {
    const book = apiRef.current?.getActiveWorkbook();
    const sheet = book?.getSheetBySheetId(id);
    if (!sheet) return;
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

  useImperativeHandle(
    ref,
    () => ({
      saveBuffer: async () => {
        const book = apiRef.current?.getActiveWorkbook();
        if (!book) throw new Error("表格尚未就绪");
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
    }),
    [],
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
    </div>
  );
});
