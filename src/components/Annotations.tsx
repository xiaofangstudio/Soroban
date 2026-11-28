import { useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { addressOf, type CellComment, type SheetImage } from "../lib/annotations";

type PanelProps = {
  sheetName: string;
  comments: CellComment[];
  activeRow: number;
  activeColumn: number;
  onCreate: (text: string) => void;
  onUpdate: (id: string, patch: Partial<CellComment>) => void;
  onDelete: (id: string) => void;
  onJump: (comment: CellComment) => void;
  onClose: () => void;
};

export function CommentPanel({
  sheetName,
  comments,
  activeRow,
  activeColumn,
  onCreate,
  onUpdate,
  onDelete,
  onJump,
  onClose,
}: PanelProps) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const visible = useMemo(() => {
    const list = comments.filter((item) => item.sheetName === sheetName);
    return (filter === "open" ? list.filter((item) => !item.resolved) : list).sort(
      (a, b) => a.row - b.row || a.column - b.column,
    );
  }, [comments, sheetName, filter]);

  const current = comments.find(
    (item) => item.sheetName === sheetName && item.row === activeRow && item.column === activeColumn,
  );

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onCreate(text);
    setDraft("");
  };

  return (
    <aside className="comment-panel" aria-label="单元格批注">
      <header className="comment-head">
        <div>
          <strong>批注</strong>
          <span>{addressOf(activeRow, activeColumn)} · {visible.length} 条</span>
        </div>
        <button onClick={onClose} title="关闭批注面板">×</button>
      </header>

      <div className="comment-compose">
        <label>
          <span>{current ? "编辑当前批注" : "给当前单元格加批注"}</span>
          <textarea
            value={current ? editText || current.text : draft}
            onChange={(event) => {
              if (current) {
                setEditing(current.id);
                setEditText(event.target.value);
              } else {
                setDraft(event.target.value);
              }
            }}
            rows={3}
            placeholder="例如：这个月的成本口径要再核对"
            maxLength={600}
          />
        </label>
        <div className="comment-compose-foot">
          <span>{sheetName} · {addressOf(activeRow, activeColumn)}</span>
          {current ? (
            <button
              className="comment-save"
              onClick={() => {
                const text = (editText || current.text).trim();
                if (!text) return;
                onUpdate(current.id, { text });
                setEditing(null);
                setEditText("");
              }}
            >
              保存修改
            </button>
          ) : (
            <button className="comment-save" onClick={submit} disabled={!draft.trim()}>
              添加批注
            </button>
          )}
        </div>
      </div>

      <div className="comment-filter">
        <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>未解决</button>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>
      </div>

      <div className="comment-list">
        {visible.length === 0 ? (
          <div className="comment-empty">当前工作表没有批注。选中单元格后在上方输入即可。</div>
        ) : (
          visible.map((item) => (
            <article key={item.id} className={`comment-item${item.resolved ? " resolved" : ""}`}>
              <button className="comment-addr" onClick={() => onJump(item)} title="跳到批注所在单元格">
                {addressOf(item.row, item.column)}
              </button>
              <div className="comment-body">
                {editing === item.id ? (
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={3}
                    autoFocus
                  />
                ) : (
                  <p>{item.text}</p>
                )}
                <div className="comment-meta">
                  <span>{item.author}</span>
                  <span>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                </div>
                <div className="comment-actions">
                  {editing === item.id ? (
                    <>
                      <button
                        onClick={() => {
                          const text = editText.trim();
                          if (text) onUpdate(item.id, { text });
                          setEditing(null);
                        }}
                      >
                        保存
                      </button>
                      <button onClick={() => setEditing(null)}>取消</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditing(item.id);
                          setEditText(item.text);
                        }}
                      >
                        编辑
                      </button>
                      <button onClick={() => onUpdate(item.id, { resolved: !item.resolved })}>
                        {item.resolved ? "重新打开" : "标记解决"}
                      </button>
                      <button className="danger" onClick={() => onDelete(item.id)}>删除</button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

type CardProps = {
  image: SheetImage;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
};

export function ImageCard({ image, onMove, onResize, onDelete }: CardProps) {
  const startDrag = (event: ReactPointerEvent, mode: "move" | "resize") => {
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: image.x, y: image.y, width: image.width, height: image.height };
    const move = (moveEvent: PointerEvent) => {
      if (mode === "move") {
        onMove(image.id, Math.max(0, origin.x + moveEvent.clientX - startX), Math.max(0, origin.y + moveEvent.clientY - startY));
      } else {
        onResize(
          image.id,
          Math.max(64, origin.width + moveEvent.clientX - startX),
          Math.max(48, origin.height + moveEvent.clientY - startY),
        );
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  return (
    <div
      className="sheet-image-card"
      style={{ left: image.x, top: image.y, width: image.width, height: image.height }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="sheet-image-head" onPointerDown={(event) => startDrag(event, "move")} title="拖动图片">
        <span>{image.name}</span>
        <button
          className="sheet-image-close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onDelete(image.id)}
          title="删除图片"
        >
          ×
        </button>
      </div>
      <img src={image.dataUrl} alt={image.name} draggable={false} />
      <span className="sheet-image-resize" onPointerDown={(event) => startDrag(event, "resize")} title="调整大小" />
    </div>
  );
}
