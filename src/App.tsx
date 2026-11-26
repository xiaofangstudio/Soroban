import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { SheetEditor, type EditorHandle } from "./components/SheetEditor";
import type { SortKey } from "./components/DataToolbar";
import { CsvImportDialog } from "./components/CsvImportDialog";
import { Splash } from "./components/Splash";
import { TopBar } from "./components/TopBar";
import { Welcome } from "./components/Welcome";
import {
  baseName,
  forgetRecent,
  formatBytes,
  loadRecent,
  rememberRecent,
  type RecentFile,
} from "./lib/recents";
import { fileExists, fileSize, readFileBytes, writeFileBytes } from "./lib/tauri";
import { csvRowsToCellValues, decodeCsvBytes, guessCsvEncoding } from "./lib/data";
import type { CsvCell, CsvDelimiter, CsvEncoding } from "./lib/data";

type Screen = "splash" | "welcome" | "editor";

type DocRef = {
  key: string;
  path: string | null;
  name: string;
  bytes: Uint8Array | null;
  size: number;
  csvRows?: CsvCell[][] | null;
  csvSheetName?: string;
};

type Toast = { text: string; kind: "ok" | "error"; id: number };
type CsvPending = {
  name: string;
  size: number;
  bytes: Uint8Array;
  guessedEncoding: CsvEncoding;
};

const XLSX_FILTER = [{ name: "Excel 工作簿", extensions: ["xlsx"] }];
const CSV_FILTER = [{ name: "CSV 文件", extensions: ["csv"] }];

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [doc, setDoc] = useState<DocRef | null>(null);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("正在准备");
  const [statusKind, setStatusKind] = useState<"ok" | "busy" | "error">("busy");
  const [dirty, setDirty] = useState(false);
  const [sheets, setSheets] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [csvPending, setCsvPending] = useState<CsvPending | null>(null);
  const editorRef = useRef<EditorHandle>(null);
  const toastTimer = useRef<number>();
  const dirtyRef = useRef(false);
  const screenRef = useRef<Screen>("splash");
  const busyRef = useRef(false);
  const docRef = useRef<DocRef | null>(null);

  dirtyRef.current = dirty;
  screenRef.current = screen;
  busyRef.current = busy;
  docRef.current = doc;

  const notify = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    const next = { text, kind, id: Date.now() };
    setToast(next);
    toastTimer.current = window.setTimeout(() => {
      setToast((cur) => (cur?.id === next.id ? null : cur));
    }, kind === "error" ? 5200 : 2600);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setScreen("welcome");
      setStatusText("本地计算已就绪");
      setStatusKind("ok");
    }, 620);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = loadRecent();
      setRecent(list);
      const checked: RecentFile[] = [];
      for (const item of list) {
        if (!alive) return;
        if (await fileExists(item.path)) checked.push(item);
        else forgetRecent(item.path);
      }
      if (alive) setRecent(checked);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true;
    return window.confirm("当前表格有未保存的更改，确定放弃吗？");
  }, []);

  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      setDirty(true);
      setCanUndo(true);
    }
    setStatusText("有未保存的更改");
    setStatusKind("ok");
  }, []);

  const newDoc = useCallback(() => {
    if (!confirmDiscard()) return false;
    setDoc({
      key: `new-${Date.now()}`,
      path: null,
      name: "未命名表格.xlsx",
      bytes: null,
      size: 0,
      csvRows: null,
    });
    setDirty(false);
    setCanUndo(false);
    setCanRedo(false);
    setSheets(1);
    setStatusText("新建表格");
    setStatusKind("ok");
    setScreen("editor");
    return true;
  }, [confirmDiscard]);

  const openPath = useCallback(
    async (path: string, options?: { skipConfirm?: boolean }) => {
      if (busyRef.current) return false;
      if (!options?.skipConfirm && !confirmDiscard()) return false;
      setBusy(true);
      setStatusText("正在打开…");
      setStatusKind("busy");
      try {
        const size = await fileSize(path);
        if (size === 0) throw new Error("文件为空或无法读取");
        if (size > 80 * 1024 * 1024) throw new Error("文件超过 80MB，M0 暂不打开");
        const bytes = await readFileBytes(path);
        const name = baseName(path);
        setDoc({ key: `open-${Date.now()}`, path, name, bytes, size, csvRows: null });
        setDirty(false);
        setCanUndo(false);
        setCanRedo(false);
        setScreen("editor");
        setStatusText("已打开");
        setStatusKind("ok");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatusText("打开失败");
        setStatusKind("error");
        notify(`打开失败：${message}`, "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [confirmDiscard, notify],
  );

  const importCsvPath = useCallback(
    async (path: string, options?: { skipConfirm?: boolean }) => {
      if (busyRef.current) return false;
      if (!options?.skipConfirm && !confirmDiscard()) return false;
      setBusy(true);
      setStatusText("正在导入 CSV…");
      setStatusKind("busy");
      try {
        const size = await fileSize(path);
        if (size === 0) throw new Error("CSV 为空或无法读取");
        if (size > 80 * 1024 * 1024) throw new Error("CSV 超过 80MB，暂不导入");
        const bytes = await readFileBytes(path);
        const { rows: textRows, encoding } = decodeCsvBytes(bytes);
        if (textRows.length === 0) throw new Error("CSV 没有可导入的内容");
        const sourceName = baseName(path);
        const base = sourceName.replace(/\.csv$/i, "") || "CSV 导入";
        const rows = csvRowsToCellValues(textRows);
        setDoc({
          key: `csv-${Date.now()}`,
          path: null,
          name: `${base}.xlsx`,
          bytes: null,
          size,
          csvRows: rows,
          csvSheetName: base,
        });
        setDirty(true);
        setCanUndo(false);
        setCanRedo(false);
        setSheets(1);
        setStatusText("已导入 CSV");
        setStatusKind("ok");
        setScreen("editor");
        notify(`已导入 ${sourceName} · ${encoding} · ${textRows.length} 行`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatusText("导入失败");
        setStatusKind("error");
        notify(`CSV 导入失败：${message}`, "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [confirmDiscard, notify],
  );

  const previewCsvPath = useCallback(
    async (path: string) => {
      if (busyRef.current) return false;
      setBusy(true);
      setStatusText("正在读取 CSV…");
      setStatusKind("busy");
      try {
        const size = await fileSize(path);
        if (size === 0) throw new Error("CSV 为空或无法读取");
        if (size > 80 * 1024 * 1024) throw new Error("CSV 超过 80MB，暂不导入");
        const bytes = await readFileBytes(path);
        const guessed = guessCsvEncoding(bytes);
        setCsvPending({ name: baseName(path), size, bytes, guessedEncoding: guessed });
        setStatusText("请确认 CSV 编码与分隔符");
        setStatusKind("ok");
        return true;
      } catch (err) {
        notify(`CSV 读取失败：${err instanceof Error ? err.message : String(err)}`, "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const pickAndImportCsv = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: CSV_FILTER,
      });
      if (typeof picked === "string") await previewCsvPath(picked);
    } catch (err) {
      notify(`无法打开文件选择器：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [notify, previewCsvPath]);

  const confirmCsvImport = useCallback(
    (payload: { rows: string[][]; encoding: CsvEncoding; delimiter: CsvDelimiter; header: boolean }) => {
      const pending = csvPending;
      if (!pending || !confirmDiscard()) return;
      const values = csvRowsToCellValues(payload.rows);
      const base = pending.name.replace(/\.csv$/i, "") || "CSV 导入";
      setDoc({
        key: `csv-${Date.now()}`,
        path: null,
        name: `${base}.xlsx`,
        bytes: null,
        size: pending.size,
        csvRows: values,
        csvSheetName: base,
      });
      setCsvPending(null);
      setDirty(true);
      setCanUndo(false);
      setCanRedo(false);
      setSheets(1);
      setStatusText("已导入 CSV");
      setStatusKind("ok");
      setScreen("editor");
      const delimiterLabel = payload.delimiter === "\t" ? "Tab" : payload.delimiter === ";" ? "分号" : "逗号";
      notify(`已导入 ${pending.name} · ${payload.encoding} · ${delimiterLabel} · ${payload.rows.length} 行`);
    },
    [confirmDiscard, csvPending, notify],
  );

  const pickAndOpen = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: XLSX_FILTER,
      });
      if (typeof picked === "string") await openPath(picked);
    } catch (err) {
      notify(`无法打开文件选择器：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [notify, openPath]);

  const saveTo = useCallback(
    async (target: string) => {
      if (!editorRef.current || busyRef.current) return null;
      setBusy(true);
      setStatusText("正在生成 xlsx…");
      setStatusKind("busy");
      try {
        const bytes = await editorRef.current.saveBuffer();
        const size = await writeFileBytes(target, bytes);
        const name = baseName(target);
        const sheetCount = editorRef.current.sheetCount() || 1;
        setDoc((cur) => (cur ? { ...cur, path: target, name, size, csvRows: null, csvSheetName: undefined } : cur));
        setDirty(false);
        setRecent(rememberRecent({ path: target, name, sheets: sheetCount, size }));
        setStatusText("已保存到本机");
        setStatusKind("ok");
        notify(`已保存 ${name} · ${formatBytes(size)}`);
        return { size, bytes: bytes.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatusText("保存失败");
        setStatusKind("error");
        notify(`保存失败：${message}`, "error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const saveDoc = useCallback(async () => {
    if (!editorRef.current) return;
    const current = docRef.current;
    if (current?.path) {
      await saveTo(current.path);
      return;
    }
    try {
      const picked = await saveDialog({
        defaultPath: current?.name || "未命名表格.xlsx",
        filters: XLSX_FILTER,
      });
      if (typeof picked === "string") await saveTo(picked);
    } catch (err) {
      notify(`无法打开保存对话框：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [notify, saveTo]);

  const autoSaveNow = useCallback(async () => {
    const current = docRef.current;
    if (screenRef.current !== "editor" || !current?.path || !dirtyRef.current || busyRef.current || !editorRef.current) {
      return { saved: false, reason: "empty" };
    }
    if (editorRef.current.isEditing()) return { saved: false, reason: "editing" };
    if (editorRef.current.filterInfo()) return { saved: false, reason: "filtered" };
    setBusy(true);
    setStatusText("正在自动保存…");
    setStatusKind("busy");
    try {
      const bytes = await editorRef.current.saveBuffer();
      const size = await writeFileBytes(current.path, bytes);
      const sheetCount = editorRef.current.sheetCount() || 1;
      setDirty(false);
      setRecent(rememberRecent({ path: current.path, name: current.name, sheets: sheetCount, size }));
      const stamp = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      setStatusText(`已自动保存 ${stamp}`);
      setStatusKind("ok");
      return { saved: true, size };
    } catch (err) {
      setStatusText("自动保存失败");
      setStatusKind("error");
      return { saved: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void autoSaveNow();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [autoSaveNow]);

  const saveCsvTo = useCallback(
    async (target: string) => {
      if (!editorRef.current || busyRef.current) return null;
      setBusy(true);
      setStatusText("正在导出 CSV…");
      setStatusKind("busy");
      try {
        const text = editorRef.current.csvText();
        const encoded = new TextEncoder().encode(text);
        const bytes = new Uint8Array(encoded.length + 3);
        bytes.set([0xef, 0xbb, 0xbf], 0);
        bytes.set(encoded, 3);
        const size = await writeFileBytes(target, bytes);
        setStatusText("已导出 CSV");
        setStatusKind("ok");
        notify(`已导出 ${baseName(target)} · ${formatBytes(size)}`);
        return { size };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatusText("导出 CSV 失败");
        setStatusKind("error");
        notify(`导出 CSV 失败：${message}`, "error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const exportCsv = useCallback(async () => {
    if (!editorRef.current || busyRef.current) return;
    const current = docRef.current;
    const base = (current?.name || "表格").replace(/\.(xlsx|csv)$/i, "");
    try {
      const picked = await saveDialog({
        defaultPath: `${base}.csv`,
        filters: CSV_FILTER,
      });
      if (typeof picked === "string") await saveCsvTo(picked);
    } catch (err) {
      notify(`无法打开保存对话框：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [notify, saveCsvTo]);

  const backToWelcome = useCallback(() => {
    if (busyRef.current) return;
    if (!confirmDiscard()) return;
    setScreen("welcome");
    setDoc(null);
    setDirty(false);
    setStatusText("本地计算已就绪");
    setStatusKind("ok");
    setRecent(loadRecent());
  }, [confirmDiscard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screenRef.current !== "editor") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveDoc();
      } else if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pickAndOpen();
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        editorRef.current?.openPrint();
      } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        editorRef.current?.undo();
        setCanUndo(true);
        setCanRedo(true);
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        editorRef.current?.redo();
        setCanUndo(true);
        setCanRedo(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickAndOpen, saveDoc]);

  // 自动化验收专用钩子：只在本地 WebView 生效，不参与界面逻辑
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__soroban = {
      openPath: (path: string) => openPath(path, { skipConfirm: true }),
      savePath: (path: string) => saveTo(path),
      newDoc,
      back: () => setScreen("welcome"),
      getState: () => ({
        screen: screenRef.current,
        name: docRef.current?.name ?? null,
        path: docRef.current?.path ?? null,
        dirty: dirtyRef.current,
        sheets: editorRef.current?.sheetCount() ?? 0,
        canUndo,
        busy: busyRef.current,
      }),
      getSnapshot: () => editorRef.current?.getSnapshot() ?? null,
      selectCell: (row: number, column: number) => editorRef.current?.selectCell(row, column),
      selectRange: (startRow: number, startColumn: number, endRow: number, endColumn: number) =>
        editorRef.current?.selectRange(startRow, startColumn, endRow, endColumn),
      selectionA1: () => editorRef.current?.selectionA1() ?? null,
      conditionalRuleCount: () => editorRef.current?.conditionalRuleCount() ?? 0,
      validationCount: () => editorRef.current?.validationCount() ?? 0,
      validationForCell: (row: number, column: number) =>
        editorRef.current?.validationForCell(row, column) ?? null,
      validationStatus: (row: number, column: number) =>
        editorRef.current?.validationStatus(row, column) ?? Promise.resolve(null),
      cellStyle: (row: number, column: number) => editorRef.current?.cellStyle(row, column) ?? null,
      sortBy: (direction: "asc" | "desc", column?: number) =>
        editorRef.current?.sortBy(direction, column) ?? { ok: false, message: "尚未就绪" },
      sortByKeys: (keys: SortKey[]) =>
        editorRef.current?.sortByKeys(keys) ?? { ok: false, message: "尚未就绪" },
      filterBy: (column: number, operator: "contains" | "gt" | "lt" | "eq" | "ne", value: string) =>
        editorRef.current?.filterBy(column, operator, value) ?? { ok: false, message: "尚未就绪" },
      filterByConditions: (
        conditions: { column: number; operator: "contains" | "gt" | "lt" | "eq" | "ne"; value: string }[],
        mode: "and" | "or" = "and",
      ) => editorRef.current?.filterByConditions(conditions, mode) ?? { ok: false, message: "尚未就绪" },
      clearFilter: () => editorRef.current?.clearFilter(),
      filterInfo: () => editorRef.current?.filterInfo() ?? null,
      freeze: (kind: "first-row" | "first-col" | "at-cell" | "none") =>
        editorRef.current?.freeze(kind) ?? { ok: false, message: "尚未就绪" },
      freezeState: () => editorRef.current?.freezeState() ?? null,
      sheetNames: () => editorRef.current?.sheetNames() ?? [],
      sheetTabs: () => editorRef.current?.sheetTabs() ?? [],
      activeSheetName: () => editorRef.current?.activeSheetName() ?? "",
      renameSheet: (name: string) => editorRef.current?.renameSheet(name) ?? false,
      setSheetColor: (sheetId: string, color: string) => editorRef.current?.setSheetColor(sheetId, color) ?? false,
      duplicateSheet: () => editorRef.current?.duplicateSheet() ?? null,
      deleteSheet: () => editorRef.current?.deleteSheet() ?? false,
      csvText: () => editorRef.current?.csvText() ?? "",
      hiddenRows: () => editorRef.current?.hiddenRows() ?? 0,
      importCsv: (path: string) => importCsvPath(path, { skipConfirm: true }),
      previewCsv: (path: string) => previewCsvPath(path),
      exportCsv: (path: string) => saveCsvTo(path),
      autoSaveNow: () => autoSaveNow(),
      openFind: (replace = false) => editorRef.current?.openFind(replace),
      findState: () => editorRef.current?.findState() ?? null,
      replaceAll: () => {
        editorRef.current?.openFind(true);
      },
      openPrint: () => editorRef.current?.openPrint(),
      printInfo: () => editorRef.current?.printInfo() ?? null,
    };
  });

  const statusForUi =
    busy || statusKind === "busy"
      ? { text: statusText, kind: "busy" as const }
      : { text: statusText, kind: statusKind };

  return (
    <div className="app">
      {screen === "splash" && <Splash />}
      {screen === "welcome" && (
        <Welcome
          recent={recent}
          busy={busy}
          onNew={newDoc}
          onOpen={pickAndOpen}
          onOpenRecent={(item) => void openPath(item.path)}
        />
      )}
      {screen === "editor" && doc && (
        <div className="editor">
          <TopBar
            name={doc.name}
            dirty={dirty}
            busy={busy}
            sheets={sheets}
            statusText={statusForUi.text}
            statusKind={statusForUi.kind}
            canUndo={canUndo}
            canRedo={canRedo}
            onBack={backToWelcome}
            onOpen={pickAndOpen}
            onSave={saveDoc}
            onUndo={() => {
              editorRef.current?.undo();
              setCanUndo(true);
              setCanRedo(true);
            }}
            onRedo={() => {
              editorRef.current?.redo();
              setCanUndo(true);
              setCanRedo(true);
            }}
            onPrint={() => editorRef.current?.openPrint()}
          />
          <SheetEditor
            ref={editorRef}
            docKey={doc.key}
            docPath={doc.path}
            name={doc.name}
            bytes={doc.bytes}
            initialRows={doc.csvRows}
            initialSheetName={doc.csvSheetName}
            onReady={(count) => {
              const imported = Boolean(doc.csvRows?.length);
              setSheets(count || 1);
              setDirty(imported);
              setStatusText(imported ? "已导入 CSV" : doc.path ? "已保存到本机" : "未保存");
              setStatusKind("ok");
              if (doc.path) {
                setRecent(
                  rememberRecent({
                    path: doc.path,
                    name: doc.name,
                    sheets: count || 1,
                    size: doc.size,
                  }),
                );
              }
            }}
            onSheetCount={(count) => setSheets(count || 1)}
            onDirty={markDirty}
            onInfo={(message) => notify(message)}
            onCsvImport={() => void pickAndImportCsv()}
            onCsvExport={() => void exportCsv()}
            onError={(message) => notify(`表格错误：${message}`, "error")}
            onState={(state, message) => {
              if (state === "loading") {
                setBusy(true);
                setStatusText("正在准备表格…");
                setStatusKind("busy");
              } else if (state === "ready") {
                setBusy(false);
              } else if (state === "error") {
                setBusy(false);
                setStatusText("表格打开失败");
                setStatusKind("error");
                if (message) notify(message, "error");
              }
            }}
          />
        </div>
      )}
      {csvPending ? (
        <CsvImportDialog
          name={csvPending.name}
          size={csvPending.size}
          bytes={csvPending.bytes}
          guessedEncoding={csvPending.guessedEncoding}
          onCancel={() => {
            setCsvPending(null);
            setStatusText(screen === "editor" ? "已取消导入" : "本地计算已就绪");
            setStatusKind("ok");
          }}
          onConfirm={confirmCsvImport}
        />
      ) : null}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
