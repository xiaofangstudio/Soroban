import { useEffect, useMemo, useState } from "react";
import { PIVOT_AGGREGATE_LABEL, fieldLabels } from "../lib/pivot";
import type { PivotAggregate, PivotSpec } from "../lib/pivot";

export type PivotSource = {
  rangeA1: string;
  values: unknown[][];
  hasHeader: boolean;
};

type Props = {
  source: PivotSource | null;
  onClose: () => void;
  onApply: (spec: PivotSpec) => string | null;
};

function initialField(values: unknown[][], hasHeader: boolean) {
  const body = hasHeader ? values.slice(1) : values;
  const width = values.reduce((max, row) => Math.max(max, row.length), 0);
  for (let index = 0; index < width; index += 1) {
    if (body.some((row) => typeof row[index] === "number")) return index;
  }
  return width > 1 ? width - 1 : 0;
}

export function PivotPanel({ source, onClose, onApply }: Props) {
  const [hasHeader, setHasHeader] = useState(source?.hasHeader ?? true);
  const labels = useMemo(
    () => (source ? fieldLabels(source.values, hasHeader) : []),
    [hasHeader, source],
  );
  const [rowField, setRowField] = useState(0);
  const [columnField, setColumnField] = useState<number | null>(null);
  const [valueField, setValueField] = useState(0);
  const [aggregate, setAggregate] = useState<PivotAggregate>("sum");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!source) return;
    const initial = initialField(source.values, source.hasHeader);
    setRowField(0);
    setColumnField(null);
    setValueField(initial);
    setAggregate("sum");
    setHasHeader(source.hasHeader);
    setError("");
  }, [source]);

  if (!source) return null;
  const width = labels.length;
  const bodyRows = Math.max(0, source.values.length - (hasHeader ? 1 : 0));
  const canApply = width > 0 && rowField >= 0 && valueField >= 0 && valueField < width && bodyRows > 0;

  const apply = () => {
    if (!canApply) {
      setError("当前区域没有可汇总的数据行。");
      return;
    }
    if (valueField === rowField || (columnField !== null && valueField === columnField)) {
      setError("值字段不能与行 / 列字段重复。");
      return;
    }
    const message = onApply({ rowField, columnField, valueField, aggregate, hasHeader });
    if (message) setError(message);
  };

  return (
    <aside className="pivot-panel" aria-label="数据透视面板">
      <div className="pivot-head">
        <div>
          <strong>数据透视</strong>
          <span className="pivot-badge">0.9.0</span>
        </div>
        <button className="pivot-close" onClick={onClose} title="关闭数据透视">
          ×
        </button>
      </div>
      <div className="pivot-source" title={source.rangeA1}>
        <span>源区域</span>
        <strong>{source.rangeA1}</strong>
        <em>{bodyRows} 行数据</em>
      </div>

      <label className="pivot-check">
        <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} />
        <span>首行为标题</span>
      </label>

      <div className="pivot-grid">
        <label className="pivot-field">
          <span>行字段</span>
          <select value={rowField} onChange={(event) => setRowField(Number(event.target.value))}>
            {labels.map((label, index) => (
              <option key={`row-${index}`} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="pivot-field">
          <span>列字段</span>
          <select
            value={columnField === null ? "" : String(columnField)}
            onChange={(event) => setColumnField(event.target.value === "" ? null : Number(event.target.value))}
          >
            <option value="">无（只按行汇总）</option>
            {labels.map((label, index) => (
              <option key={`col-${index}`} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="pivot-field">
          <span>值字段</span>
          <select value={valueField} onChange={(event) => setValueField(Number(event.target.value))}>
            {labels.map((label, index) => (
              <option key={`value-${index}`} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="pivot-field">
          <span>汇总方式</span>
          <select value={aggregate} onChange={(event) => setAggregate(event.target.value as PivotAggregate)}>
            <option value="sum">{PIVOT_AGGREGATE_LABEL.sum}</option>
            <option value="count">{PIVOT_AGGREGATE_LABEL.count}</option>
            <option value="avg">{PIVOT_AGGREGATE_LABEL.avg}</option>
          </select>
        </label>
      </div>

      <div className="pivot-note">
        生成到新工作表，含行小计、列小计与总计。结果是一次性汇总，源数据改动后需重新生成。
      </div>
      {error ? <div className="pivot-error">{error}</div> : null}

      <div className="pivot-actions">
        <button className="pivot-primary" onClick={apply} disabled={!canApply}>
          生成汇总表
        </button>
        <button onClick={onClose}>取消</button>
      </div>
    </aside>
  );
}
