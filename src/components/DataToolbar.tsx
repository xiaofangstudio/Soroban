import { useEffect, useRef, useState } from "react";

export type DataColumn = { index: number; label: string };

export type DataContext = {
  rangeA1: string;
  currentColumn: number;
  currentLabel: string;
  columns: DataColumn[];
  rowCount: number;
};

export type FilterOperator = "contains" | "gt" | "lt" | "eq" | "ne";

export type FilterInfo = {
  columnLabel: string;
  operator: string;
  value: string;
  matched: number;
  total: number;
};

export type SheetTab = { id: string; name: string };

type Props = {
  context: DataContext;
  filter: FilterInfo | null;
  freeze: { rows: number; columns: number } | null;
  sheets: SheetTab[];
  activeSheetId: string;
  onSort: (column: number, direction: "asc" | "desc") => void;
  onFilter: (column: number, operator: FilterOperator, value: string) => void;
  onClearFilter: () => void;
  onFreeze: (kind: "first-row" | "first-col" | "at-cell" | "none") => void;
  onImportCsv: () => void;
  onExportCsv: () => void;
  onActivateSheet: (id: string) => void;
  onRenameSheet: (name: string) => void;
  onDuplicateSheet: () => void;
  onDeleteSheet: () => void;
  onAddSheet: () => void;
};

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "contains", label: "包含" },
  { value: "eq", label: "等于" },
  { value: "ne", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "lt", label: "小于" },
];

function SortIcon({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      {direction === "asc" ? (
        <path d="M8 13V3.5M4.5 7L8 3.5l3.5 3.5M4 13h8" stroke="currentColor" strokeWidth="1.4" />
      ) : (
        <path d="M8 3v9.5M4.5 9L8 12.5l3.5-3.5M4 3h8" stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M2 3h12l-4.5 5.2V13l-3-1.6V8.2z" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function FreezeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 6.5h11M6.5 6.5v7M2.5 2.5h4v4h-4z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="2.5" width="9" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 5.5h6.5a2 2 0 0 1 2 2v6h-8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function DataToolbar({
  context,
  filter,
  freeze,
  sheets,
  activeSheetId,
  onSort,
  onFilter,
  onClearFilter,
  onFreeze,
  onImportCsv,
  onExportCsv,
  onActivateSheet,
  onRenameSheet,
  onDuplicateSheet,
  onDeleteSheet,
  onAddSheet,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<"sort" | "filter" | "freeze" | "sheets" | null>(null);
  const [sortColumn, setSortColumn] = useState(context.currentColumn);
  const [filterColumn, setFilterColumn] = useState(context.currentColumn);
  const [operator, setOperator] = useState<FilterOperator>("contains");
  const [value, setValue] = useState("");
  const [sheetDraft, setSheetDraft] = useState("");
  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".data-toolbar")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  useEffect(() => {
    if (menu === "sort") setSortColumn(context.currentColumn);
    if (menu === "filter") {
      setFilterColumn(context.currentColumn);
      setOperator("contains");
      setValue("");
    }
  }, [menu, context.currentColumn]);

  useEffect(() => {
    setSheetDraft(activeSheet?.name ?? "");
  }, [activeSheet?.id, activeSheet?.name]);

  const filterButton = filter ? `筛选 ${filter.matched}/${filter.total}` : "筛选";
  const freezeLabel = freeze && (freeze.rows > 0 || freeze.columns > 0)
    ? `冻结 ${freeze.rows}行${freeze.columns ? ` ${freeze.columns}列` : ""}`
    : "冻结";

  return (
    <div className="data-toolbar" ref={rootRef} aria-label="数据工具栏">
      <span className="data-label">数据</span>
      <div className="data-anchor">
        <button
          className={`data-btn${menu === "sort" ? " active" : ""}`}
          onClick={() => setMenu(menu === "sort" ? null : "sort")}
          title="按选定列排序当前数据区域"
        >
          <SortIcon direction="asc" />
          排序
        </button>
        {menu === "sort" ? (
          <div className="data-pop sort-pop">
            <div className="data-pop-head">排序 · {context.rangeA1}</div>
            <label className="data-field">
              <span>排序列</span>
              <select value={String(sortColumn)} onChange={(event) => setSortColumn(Number(event.target.value))}>
                {context.columns.map((column) => (
                  <option key={column.index} value={column.index}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="data-pop-actions">
              <button
                className="data-primary"
                onClick={() => {
                  onSort(sortColumn, "asc");
                  setMenu(null);
                }}
              >
                升序 ↑
              </button>
              <button
                className="data-primary"
                onClick={() => {
                  onSort(sortColumn, "desc");
                  setMenu(null);
                }}
              >
                降序 ↓
              </button>
            </div>
            <div className="data-pop-tip">首行自动识别为表头；含公式的列会按新行位置重写相对引用。</div>
          </div>
        ) : null}
      </div>
      <div className="data-divider" />

      <div className="data-anchor">
        <button
          className={`data-btn${menu === "filter" || filter ? " active" : ""}`}
          onClick={() => setMenu(menu === "filter" ? null : "filter")}
          title="按列筛选当前数据区域"
        >
          <FilterIcon />
          {filterButton}
        </button>
        {menu === "filter" ? (
          <div className="data-pop filter-pop">
            <div className="data-pop-head">
              筛选 · {context.rangeA1}
              {filter ? <span className="data-pop-badge">已命中 {filter.matched}/{filter.total}</span> : null}
            </div>
            <label className="data-field">
              <span>列</span>
              <select
                value={String(filterColumn)}
                onChange={(event) => setFilterColumn(Number(event.target.value))}
              >
                {context.columns.map((column) => (
                  <option key={column.index} value={column.index}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="data-row">
              <label className="data-field small">
                <span>条件</span>
                <select value={operator} onChange={(event) => setOperator(event.target.value as FilterOperator)}>
                  {OPERATORS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="data-field grow">
                <span>值</span>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onFilter(filterColumn, operator, value);
                      setMenu(null);
                    }
                  }}
                  placeholder="输入筛选值"
                  autoFocus
                />
              </label>
            </div>
            <div className="data-pop-actions">
              <button
                className="data-primary"
                onClick={() => {
                  onFilter(filterColumn, operator, value);
                  setMenu(null);
                }}
              >
                应用筛选
              </button>
              <button
                onClick={() => {
                  onClearFilter();
                  setMenu(null);
                }}
              >
                清除筛选
              </button>
              {filter ? (
                <button
                  className="data-icon-btn"
                  title="清除筛选"
                  onClick={() => {
                    onClearFilter();
                    setMenu(null);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="data-pop-tip">筛选只隐藏不满足的行，不改单元格内容。</div>
          </div>
        ) : null}
      </div>

      <div className="data-anchor">
        <button
          className={`data-btn${menu === "freeze" || freeze ? " active" : ""}`}
          onClick={() => setMenu(menu === "freeze" ? null : "freeze")}
          title="冻结行或列"
        >
          <FreezeIcon />
          {freezeLabel}
        </button>
        {menu === "freeze" ? (
          <div className="data-pop freeze-pop">
            <div className="data-pop-head">
              冻结窗格
              {freeze ? <span className="data-pop-badge">{freeze.rows} 行 / {freeze.columns} 列</span> : null}
            </div>
            <button className="freeze-item" onClick={() => { onFreeze("first-row"); setMenu(null); }}>
              <span><strong>冻结首行</strong><small>表头始终可见</small></span>
              {freeze?.rows === 1 && freeze.columns === 0 ? <em>当前</em> : null}
            </button>
            <button className="freeze-item" onClick={() => { onFreeze("first-col"); setMenu(null); }}>
              <span><strong>冻结首列</strong><small>类别列始终可见</small></span>
              {freeze?.columns === 1 && freeze.rows === 0 ? <em>当前</em> : null}
            </button>
            <button className="freeze-item" onClick={() => { onFreeze("at-cell"); setMenu(null); }}>
              <span><strong>冻结到当前单元格</strong><small>上方行 + 左侧列一起冻结</small></span>
            </button>
            <button className="freeze-item danger-soft" onClick={() => { onFreeze("none"); setMenu(null); }}>
              <span><strong>取消冻结</strong><small>恢复整张表滚动</small></span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="data-status" title={context.rangeA1}>
        {freeze ? `${freeze.rows} 行 ${freeze.columns} 列冻结` : context.rangeA1}
        {!freeze && context.currentLabel ? ` · ${context.currentLabel}` : ""}
      </div>
      <div className="data-grow" />

      <button className="data-btn quiet" onClick={onImportCsv} title="从 CSV 新建表格">
        导入 CSV
      </button>
      <button className="data-btn quiet" onClick={onExportCsv} title="把当前工作表导出为 CSV">
        导出 CSV
      </button>

      <div className="data-anchor">
        <button
          className={`data-btn icon-only${menu === "sheets" ? " active" : ""}`}
          onClick={() => setMenu(menu === "sheets" ? null : "sheets")}
          title="管理工作表"
        >
          <SheetIcon />
          工作表
        </button>
        {menu === "sheets" ? (
          <div className="data-pop sheet-pop">
            <div className="data-pop-head">
              工作表
              <span className="data-pop-badge">{sheets.length} 个</span>
            </div>
            <div className="sheet-list">
              {sheets.map((sheet) => (
                <button
                  key={sheet.id}
                  className={`sheet-row${sheet.id === activeSheetId ? " active" : ""}`}
                  onClick={() => onActivateSheet(sheet.id)}
                >
                  <span className="sheet-dot" />
                  <span className="sheet-row-name">{sheet.name}</span>
                  {sheet.id === activeSheetId ? <em>当前</em> : null}
                </button>
              ))}
            </div>
            <label className="data-field sheet-name-field">
              <span>名称</span>
              <input
                value={sheetDraft}
                onChange={(event) => setSheetDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onRenameSheet(sheetDraft);
                  }
                }}
                placeholder="1–31 个字符"
              />
            </label>
            <div className="data-pop-actions">
              <button className="data-primary" onClick={() => onRenameSheet(sheetDraft)}>改名</button>
              <button onClick={onDuplicateSheet}>复制</button>
              <button onClick={onDeleteSheet} disabled={sheets.length <= 1}>删除</button>
              <button onClick={onAddSheet}>新建</button>
            </div>
            <div className="data-pop-tip">删除会同时移除该表的条件格式与图表。</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
