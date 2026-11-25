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
  onBack: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
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
  onBack,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onPrint,
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
        <button className="tb-btn wide" onClick={onPrint} disabled={busy} title="打印与分页预览">
          <IconPrint width={14} height={14} />
          打印
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
