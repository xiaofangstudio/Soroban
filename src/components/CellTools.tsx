export type BorderTarget =
  | "outside"
  | "all"
  | "horizontal"
  | "vertical"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "none";

export type RowColAction =
  | "row-above"
  | "row-below"
  | "row-delete"
  | "row-hide"
  | "row-show"
  | "col-left"
  | "col-right"
  | "col-delete"
  | "col-hide"
  | "col-show";

export type CellToolAction =
  | { type: "merge"; mode: "center" | "plain" | "unmerge" }
  | { type: "border"; value: BorderTarget }
  | { type: "wrap"; value: boolean }
  | { type: "vertical"; value: "top" | "middle" | "bottom" }
  | { type: "rowcol"; value: RowColAction };

export type CellToolState = {
  merged: boolean;
  wrap: boolean;
  vertical: "top" | "middle" | "bottom";
};

type Props = {
  state: CellToolState;
  rangeA1: string;
  onAction: (action: CellToolAction) => void;
  onClose: () => void;
};

const BORDERS: { value: BorderTarget; label: string }[] = [
  { value: "outside", label: "外框" },
  { value: "all", label: "全部" },
  { value: "horizontal", label: "内横" },
  { value: "vertical", label: "内竖" },
  { value: "top", label: "上" },
  { value: "bottom", label: "下" },
  { value: "left", label: "左" },
  { value: "right", label: "右" },
  { value: "none", label: "清除" },
];

const ROW_ACTIONS: { value: RowColAction; label: string }[] = [
  { value: "row-above", label: "上方插入" },
  { value: "row-below", label: "下方插入" },
  { value: "row-delete", label: "删除行" },
  { value: "row-hide", label: "隐藏行" },
  { value: "row-show", label: "显示行" },
];

const COL_ACTIONS: { value: RowColAction; label: string }[] = [
  { value: "col-left", label: "左侧插入" },
  { value: "col-right", label: "右侧插入" },
  { value: "col-delete", label: "删除列" },
  { value: "col-hide", label: "隐藏列" },
  { value: "col-show", label: "显示列" },
];

export function CellTools({ state, rangeA1, onAction, onClose }: Props) {
  return (
    <div className="cell-tools" role="dialog" aria-label="单元格工具">
      <div className="ct-head">
        <strong>单元格工具</strong>
        <span className="ct-range">{rangeA1}</span>
        <button className="ct-close" onClick={onClose} title="关闭单元格工具">
          ×
        </button>
      </div>

      <section className="ct-section">
        <div className="ct-label">合并</div>
        <div className="ct-row">
          <button className="ct-action primary" onClick={() => onAction({ type: "merge", mode: "center" })}>
            合并并居中
          </button>
          <button className="ct-action" onClick={() => onAction({ type: "merge", mode: "plain" })}>
            直接合并
          </button>
          <button
            className="ct-action"
            onClick={() => onAction({ type: "merge", mode: "unmerge" })}
            disabled={!state.merged}
          >
            取消合并
          </button>
        </div>
        {state.merged ? <div className="ct-hint">当前选区包含合并单元格</div> : null}
      </section>

      <section className="ct-section">
        <div className="ct-label">换行与垂直对齐</div>
        <div className="ct-row">
          <button
            className={`ct-action${state.wrap ? " active" : ""}`}
            onClick={() => onAction({ type: "wrap", value: !state.wrap })}
          >
            自动换行
          </button>
          {(["top", "middle", "bottom"] as const).map((value) => (
            <button
              key={value}
              className={`ct-action${state.vertical === value ? " active" : ""}`}
              onClick={() => onAction({ type: "vertical", value })}
            >
              {value === "top" ? "顶端" : value === "middle" ? "居中" : "底端"}
            </button>
          ))}
        </div>
      </section>

      <section className="ct-section">
        <div className="ct-label">边框</div>
        <div className="ct-grid">
          {BORDERS.map((item) => (
            <button
              key={item.value}
              className={`ct-border ${item.value}`}
              onClick={() => onAction({ type: "border", value: item.value })}
              title={`边框：${item.label}`}
            >
              <span className="ct-border-glyph" />
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ct-section">
        <div className="ct-label">行</div>
        <div className="ct-action-grid">
          {ROW_ACTIONS.map((item) => (
            <button
              key={item.value}
              className="ct-mini"
              onClick={() => onAction({ type: "rowcol", value: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ct-section">
        <div className="ct-label">列</div>
        <div className="ct-action-grid">
          {COL_ACTIONS.map((item) => (
            <button
              key={item.value}
              className="ct-mini"
              onClick={() => onAction({ type: "rowcol", value: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
