import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { SheetEditor, type EditorHandle } from "./components/SheetEditor";
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

type Screen = "splash" | "welcome" | "editor";

type DocRef = {
  key: string;
  path: string | null;
  name: string;
  bytes: Uint8Array | null;
  size: number;
};

type Toast = { text: string; kind: "ok" | "error"; id: number };

const XLSX_FILTER = [{ name: "Excel 工作簿", extensions: ["xlsx"] }];

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
        setDoc({ key: `open-${Date.now()}`, path, name, bytes, size });
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
        setDoc((cur) => (cur ? { ...cur, path: target, name, size } : cur));
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
      cellStyle: (row: number, column: number) => editorRef.current?.cellStyle(row, column) ?? null,
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
          />
          <SheetEditor
            ref={editorRef}
            docKey={doc.key}
            docPath={doc.path}
            name={doc.name}
            bytes={doc.bytes}
            onReady={(count) => {
              setSheets(count || 1);
              setDirty(false);
              setStatusText(doc.path ? "已保存到本机" : "未保存");
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
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
