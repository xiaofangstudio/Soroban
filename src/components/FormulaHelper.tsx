import type { FormulaInfo } from "../lib/formulas";

type Props = {
  mode: "suggest" | "library";
  items: FormulaInfo[];
  total: number;
  common: boolean;
  query: string;
  activeIndex: number;
  onQuery: (value: string) => void;
  onToggleCommon: () => void;
  onActiveIndex: (index: number) => void;
  onPick: (item: FormulaInfo) => void;
  onClose: () => void;
};

function Row({
  item,
  active,
  index,
  onActiveIndex,
  onPick,
}: {
  item: FormulaInfo;
  active: boolean;
  index: number;
  onActiveIndex: (index: number) => void;
  onPick: (item: FormulaInfo) => void;
}) {
  return (
    <button
      type="button"
      className={`fx-row${active ? " active" : ""}`}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick(item);
      }}
      onMouseEnter={() => onActiveIndex(index)}
      title={`${item.signature}  ${item.description}`}
    >
      <span className="fx-row-name">{item.name}</span>
      <span className="fx-row-main">
        <span className="fx-row-desc">{item.description || item.title}</span>
        <span className="fx-row-sig">{item.signature}</span>
      </span>
      {item.common ? <span className="fx-tag">常用</span> : null}
    </button>
  );
}

export function FormulaHelper({
  mode,
  items,
  total,
  common,
  query,
  activeIndex,
  onQuery,
  onToggleCommon,
  onActiveIndex,
  onPick,
  onClose,
}: Props) {
  if (mode === "suggest") {
    return (
      <div className="fx-suggest" role="listbox" aria-label="公式提示">
        <div className="fx-suggest-head">
          <span>{query ? `匹配 ${query.toUpperCase()}` : "常用函数"}</span>
          <span className="fx-hint">↑↓ 选择 · Tab 填入</span>
        </div>
        {items.length === 0 ? (
          <div className="fx-empty">没有匹配的函数，按 Enter 直接计算</div>
        ) : (
          items.map((item, index) => (
            <Row
              key={item.name}
              item={item}
              index={index}
              active={index === activeIndex}
              onActiveIndex={onActiveIndex}
              onPick={onPick}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="fx-library" role="dialog" aria-label="函数库">
      <div className="fx-lib-head">
        <div>
          <b>函数库</b>
          <span className="fx-lib-count">{total} 个函数</span>
        </div>
        <button type="button" className="fx-lib-close" onClick={onClose} title="关闭函数库">
          ×
        </button>
      </div>
      <div className="fx-lib-tools">
        <input
          className="fx-lib-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="搜索函数名或说明，例如 SUM / 求和 / 日期"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          className={`fx-lib-filter${common ? " on" : ""}`}
          onClick={onToggleCommon}
        >
          {common ? "显示全部" : "只看常用"}
        </button>
      </div>
      <div className="fx-lib-list">
        {items.length === 0 ? (
          <div className="fx-empty">没有匹配的函数</div>
        ) : (
          items.map((item, index) => (
            <Row
              key={item.name}
              item={item}
              index={index}
              active={index === activeIndex}
              onActiveIndex={onActiveIndex}
              onPick={onPick}
            />
          ))
        )}
      </div>
      <div className="fx-lib-foot">
        <span>鼠标选中即插入公式，随后输入参数</span>
        <span className="fx-lib-sample">例：{items[0]?.example ?? "=SUM(B2:B9)"}</span>
      </div>
    </div>
  );
}
