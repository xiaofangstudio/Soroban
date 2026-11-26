import { useState } from "react";

export type ValidationKind = "list" | "between" | "greater" | "less" | "equal";

export type ValidationDraft = {
  kind: ValidationKind;
  source: "custom" | "range";
  values: string;
  range: string;
  min: string;
  max: string;
  num: string;
  integer: boolean;
  allowBlank: boolean;
  message: string;
};

export type ValidationSummary = {
  count: number;
  current: {
    type: string;
    detail: string;
    range: string;
    kind?: ValidationKind;
    values?: string;
    min?: string;
    max?: string;
    num?: string;
    integer?: boolean;
    allowBlank?: boolean;
    message?: string;
  } | null;
};

type Props = {
  rangeA1: string;
  summary: ValidationSummary;
  onApply: (draft: ValidationDraft) => { ok: boolean; message: string };
  onClear: () => { ok: boolean; message: string };
  onClose: () => void;
};

const EMPTY_DRAFT: ValidationDraft = {
  kind: "list",
  source: "custom",
  values: "高, 中, 低",
  range: "",
  min: "0",
  max: "100",
  num: "0",
  integer: true,
  allowBlank: true,
  message: "",
};

const KINDS: { value: ValidationKind; label: string }[] = [
  { value: "list", label: "下拉列表" },
  { value: "between", label: "数值区间" },
  { value: "greater", label: "大于" },
  { value: "less", label: "小于" },
  { value: "equal", label: "等于" },
];

function draftFromSummary(summary: ValidationSummary): ValidationDraft {
  const current = summary.current;
  if (!current) return EMPTY_DRAFT;
  const values = current.values ?? "";
  const isRange = Boolean(values) && /[:!]|^[$A-Za-z]+\$?\d+/.test(values) && !values.includes(",");
  return {
    ...EMPTY_DRAFT,
    kind: current.kind ?? "list",
    source: isRange ? "range" : "custom",
    values: isRange ? EMPTY_DRAFT.values : values || EMPTY_DRAFT.values,
    range: isRange ? values : "",
    min: current.min ?? EMPTY_DRAFT.min,
    max: current.max ?? EMPTY_DRAFT.max,
    num: current.num ?? EMPTY_DRAFT.num,
    integer: current.integer ?? EMPTY_DRAFT.integer,
    allowBlank: current.allowBlank ?? EMPTY_DRAFT.allowBlank,
    message: current.message ?? "",
  };
}

export function ValidationPanel({ rangeA1, summary, onApply, onClear, onClose }: Props) {
  const [draft, setDraft] = useState<ValidationDraft>(() => draftFromSummary(summary));
  const [notice, setNotice] = useState("");

  const patch = (part: Partial<ValidationDraft>) => setDraft((prev) => ({ ...prev, ...part }));

  const apply = () => {
    const result = onApply(draft);
    setNotice(result.message);
    if (result.ok) onClose();
  };

  const clear = () => {
    const result = onClear();
    setNotice(result.message);
  };

  const current = summary.current;

  return (
    <div className="dv-panel" role="dialog" aria-label="数据验证">
      <div className="ct-head">
        <strong>数据验证</strong>
        <span className="ct-range">{rangeA1}</span>
        <button className="ct-close" onClick={onClose} title="关闭数据验证">
          ×
        </button>
      </div>

      <div className={`dv-current${current ? " on" : ""}`}>
        {current ? (
          <>
            <span className="dv-pill">已设置</span>
            <span className="dv-current-text">
              {current.range} · {current.type}
              {current.detail ? `（${current.detail}）` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="dv-pill idle">未设置</span>
            <span className="dv-current-text">当前区域没有验证规则</span>
          </>
        )}
      </div>

      <section className="ct-section">
        <div className="ct-label">条件</div>
        <div className="dv-kinds">
          {KINDS.map((item) => (
            <button
              key={item.value}
              className={`dv-kind${draft.kind === item.value ? " active" : ""}`}
              onClick={() => patch({ kind: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {draft.kind === "list" ? (
        <section className="ct-section">
          <div className="dv-source">
            <button
              className={`dv-source-btn${draft.source === "custom" ? " active" : ""}`}
              onClick={() => patch({ source: "custom" })}
            >
              直接输入
            </button>
            <button
              className={`dv-source-btn${draft.source === "range" ? " active" : ""}`}
              onClick={() => patch({ source: "range" })}
            >
              引用单元格
            </button>
          </div>
          {draft.source === "custom" ? (
            <>
              <textarea
                className="dv-textarea"
                value={draft.values}
                spellCheck={false}
                aria-label="下拉选项"
                placeholder="用逗号或换行分隔，例如：高, 中, 低"
                onChange={(event) => patch({ values: event.target.value })}
              />
              <div className="dv-hint">每项一行或用逗号分隔；最多 100 项。</div>
            </>
          ) : (
            <>
              <input
                className="dv-input mono"
                value={draft.range}
                spellCheck={false}
                aria-label="引用区域"
                placeholder="例如：$K$2:$K$9 或 K2:K9"
                onChange={(event) => patch({ range: event.target.value })}
              />
              <div className="dv-hint">引用同一工作表中的单列或单行区域。</div>
            </>
          )}
        </section>
      ) : null}

      {draft.kind === "between" ? (
        <section className="ct-section">
          <div className="dv-pair">
            <label>
              <span>最小值</span>
              <input
                className="dv-input"
                inputMode="decimal"
                value={draft.min}
                onChange={(event) => patch({ min: event.target.value })}
              />
            </label>
            <label>
              <span>最大值</span>
              <input
                className="dv-input"
                inputMode="decimal"
                value={draft.max}
                onChange={(event) => patch({ max: event.target.value })}
              />
            </label>
          </div>
          <label className="dv-check">
            <input
              type="checkbox"
              checked={draft.integer}
              onChange={(event) => patch({ integer: event.target.checked })}
            />
            只允许整数
          </label>
        </section>
      ) : null}

      {draft.kind !== "list" && draft.kind !== "between" ? (
        <section className="ct-section">
          <div className="dv-pair single">
            <label>
              <span>{draft.kind === "greater" ? "大于" : draft.kind === "less" ? "小于" : "等于"}</span>
              <input
                className="dv-input"
                inputMode="decimal"
                value={draft.num}
                onChange={(event) => patch({ num: event.target.value })}
              />
            </label>
          </div>
          <label className="dv-check">
            <input
              type="checkbox"
              checked={draft.integer}
              onChange={(event) => patch({ integer: event.target.checked })}
            />
            只允许整数
          </label>
        </section>
      ) : null}

      <section className="ct-section">
        <div className="ct-label">提示</div>
        <label className="dv-check">
          <input
            type="checkbox"
            checked={draft.allowBlank}
            onChange={(event) => patch({ allowBlank: event.target.checked })}
          />
          允许空值
        </label>
        <input
          className="dv-input"
          value={draft.message}
          spellCheck={false}
          aria-label="错误提示"
          placeholder="输入不符合条件时的提示，例如：请从列表中选择"
          onChange={(event) => patch({ message: event.target.value })}
        />
        {notice ? <div className={`dv-notice${notice.startsWith("已") ? " ok" : ""}`}>{notice}</div> : null}
      </section>

      <div className="dv-actions">
        <button className="dv-clear" onClick={clear} disabled={!current}>
          清除当前区域
        </button>
        <button className="dv-apply" onClick={apply}>
          应用
        </button>
      </div>
    </div>
  );
}
