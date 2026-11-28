import { IconBack, IconFolder, IconPrint, IconRedo, IconSave, IconUndo } from "./Icons";

type Props = {
  name: string;
  dirty: boolean;
  busy: boolean;
  sheets: number;
  statusText: string;
  statusKind: "ok" | "busy" | "error";
  canUndo: boolean;
  canRedo: boolean;
  dark: boolean;
  onBack: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onTheme: () => void;
};

export function TopBar({
  name,
  dirty,
  busy,
  sheets,
  statusText,
  statusKind,
  canUndo,
  canRedo,
  dark,
  onBack,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onPrint,
  onTheme,
}: Props) {
  return (
    <header className="topbar">
      <div className="tb-brand">
        <img src="/soroban-mark.svg" alt="" />
        <span>Soroban</span>
      </div>
      <div className="tb-group">
        <button className="tb-btn" onClick={onBack} disabled={busy} title="返回欢迎页">
          <IconBack width={15} height={15} />
        </button>
      </div>
      <div className="tb-group">
        <button className="tb-btn wide" onClick={onOpen} disabled={busy} title="打开 xlsx">
          <IconFolder width={14} height={14} />
          打开
        </button>
        <button className="tb-btn wide primary" onClick={onSave} disabled={busy} title="保存为 xlsx">
          <IconSave width={14} height={14} />
          保存
        </button>
      </div>
      <div className="tb-group">
        <button className="tb-btn" onClick={onUndo} disabled={busy || !canUndo} title="撤销 Ctrl+Z">
          <IconUndo width={15} height={15} />
        </button>
        <button className="tb-btn" onClick={onRedo} disabled={busy || !canRedo} title="重做 Ctrl+Y">
          <IconRedo width={15} height={15} />
        </button>
      </div>
      <div className="tb-group">
        <button className="tb-btn wide" onClick={onPrint} disabled={busy} title="打印与分页预览（Ctrl+P）">
          <IconPrint width={14} height={14} />
          打印
        </button>
      </div>
      <div className="tb-group">
        <button
          className={`tb-btn wide theme-btn${dark ? " active" : ""}`}
          onClick={onTheme}
          title={dark ? "切到浅色" : "切到深色"}
          aria-label="切换深浅色"
        >
          {dark ? (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1.2v1.7M8 13.1v1.7M1.2 8h1.7M13.1 8h1.7M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M12.8 3.2l-1.2 1.2M4.4 11.6l-1.2 1.2" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6 5.9 5.9 0 1 0 13.4 9.6Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          )}
          {dark ? "浅色" : "深色"}
        </button>
      </div>
      <div className="tb-file">
        <span className="tb-name" title={name}>
          {name}
        </span>
        <span className="tb-dirty">{dirty ? "未保存" : "已保存"}</span>
      </div>
      <span className="tb-sheets">{sheets} 表</span>
      <span className={`tb-status ${statusKind}`}>
        <span className="dot" />
        {statusText}
      </span>
    </header>
  );
}
