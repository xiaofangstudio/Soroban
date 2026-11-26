export type PivotAggregate = "sum" | "count" | "avg";

export type PivotSpec = {
  rowField: number;
  columnField: number | null;
  valueField: number;
  aggregate: PivotAggregate;
  hasHeader: boolean;
};

export type PivotRow = {
  key: string;
  cells: (number | null)[];
  total: number | null;
};

export type PivotResult = {
  rowLabel: string;
  measureLabel: string;
  columnKeys: string[];
  rows: PivotRow[];
  columnTotals: (number | null)[];
  grandTotal: number | null;
  sourceRows: number;
  matrix: (string | number | null)[][];
};

export const PIVOT_AGGREGATE_LABEL: Record<PivotAggregate, string> = {
  sum: "求和",
  count: "计数",
  avg: "平均值",
};

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const record = value as Record<string, unknown>;
  if (typeof record.v === "string" || typeof record.v === "number") return String(record.v);
  if (record.v !== undefined) return cellText(record.v);
  if (record.t === 1) return "";
  if (record.t === 2) return "";
  return "";
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/[,\s¥￥$]/g, "").replace(/%$/, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function groupKey(value: unknown) {
  const text = cellText(value).trim();
  return text === "" ? "(空)" : text;
}

function compareKeys(left: string, right: string) {
  if (left === "(空)") return right === "(空)" ? 0 : -1;
  if (right === "(空)") return 1;
  const leftNumber = Number(left.replace(/[,\s¥￥$]/g, ""));
  const rightNumber = Number(right.replace(/[,\s¥￥$]/g, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, "zh-CN", { numeric: true });
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function measure(value: number | null, count: number, aggregate: PivotAggregate): number | null {
  if (aggregate === "count") return count;
  if (value === null || count === 0) return null;
  return aggregate === "avg" ? round(value / count) : round(value);
}

export function fieldLabels(values: unknown[][], hasHeader: boolean) {
  const width = values.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, index) => {
    const header = hasHeader ? cellText(values[0]?.[index]).trim() : "";
    if (header) return header;
    const letter = String.fromCharCode(65 + (index % 26));
    return `${letter}${index >= 26 ? Math.floor(index / 26) : ""} 列`;
  });
}

export function buildPivot(values: unknown[][], spec: PivotSpec): PivotResult {
  const labels = fieldLabels(values, spec.hasHeader);
  const body = spec.hasHeader ? values.slice(1) : values;
  const rowsMap = new Map<string, Map<string, { sum: number; count: number }>>();
  const columnSet = new Set<string>();
  let sourceRows = 0;

  for (const row of body) {
    if (!row || row.every((cell) => cellText(cell).trim() === "" && toNumber(cell) === null)) continue;
    sourceRows += 1;
    const rowKey = groupKey(row[spec.rowField]);
    const columnKey = spec.columnField === null ? "" : groupKey(row[spec.columnField]);
    if (spec.columnField !== null) columnSet.add(columnKey);
    const value = toNumber(row[spec.valueField]);
    const filled = cellText(row[spec.valueField]).trim() !== "";
    if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, new Map());
    const cells = rowsMap.get(rowKey)!;
    const current = cells.get(columnKey) ?? { sum: 0, count: 0 };
    if (spec.aggregate === "count") {
      if (filled) current.count += 1;
    } else if (value !== null) {
      current.sum += value;
      current.count += 1;
    }
    cells.set(columnKey, current);
  }

  const columnKeys = spec.columnField === null ? [] : Array.from(columnSet).sort(compareKeys);
  const rowKeys = Array.from(rowsMap.keys()).sort(compareKeys);
  const rows: PivotRow[] = rowKeys.map((key) => {
    const cells = rowsMap.get(key)!;
    let sum = 0;
    let count = 0;
    const valuesForRow = columnKeys.map((columnKey) => {
      const item = cells.get(columnKey);
      if (!item) return measure(null, 0, spec.aggregate);
      sum += item.sum;
      count += item.count;
      return measure(item.sum, item.count, spec.aggregate);
    });
    return { key, cells: valuesForRow, total: measure(sum, count, spec.aggregate) };
  });
  const columnTotals = columnKeys.map((columnKey) => {
    let sum = 0;
    let count = 0;
    for (const key of rowKeys) {
      const item = rowsMap.get(key)?.get(columnKey);
      if (!item) continue;
      sum += item.sum;
      count += item.count;
    }
    return measure(sum, count, spec.aggregate);
  });
  const grandTotal = (() => {
    let sum = 0;
    let count = 0;
    for (const cells of rowsMap.values()) {
      for (const item of cells.values()) {
        sum += item.sum;
        count += item.count;
      }
    }
    return measure(sum, count, spec.aggregate);
  })();

  const rowLabel = labels[spec.rowField] ?? "行";
  const measureLabel =
    spec.columnField === null
      ? `${PIVOT_AGGREGATE_LABEL[spec.aggregate]} ${labels[spec.valueField] ?? "值"}`
      : PIVOT_AGGREGATE_LABEL[spec.aggregate];
  const width = spec.columnField === null ? 2 : columnKeys.length + 2;
  const blankHead = (first: string) => [first, ...Array.from({ length: width - 1 }, () => null)];
  const matrix: (string | number | null)[][] = [
    blankHead(`数据透视 · ${PIVOT_AGGREGATE_LABEL[spec.aggregate]} ${labels[spec.valueField] ?? "值"}`),
    blankHead(`源数据 ${sourceRows} 行 · 生成结果不随源数据自动刷新`),
    spec.columnField === null ? [rowLabel, measureLabel] : [rowLabel, ...columnKeys, "总计"],
  ];
  for (const row of rows) {
    matrix.push(
      spec.columnField === null
        ? [row.key, row.total]
        : [row.key, ...row.cells, row.total],
    );
  }
  matrix.push(
    spec.columnField === null
      ? ["总计", grandTotal]
      : ["总计", ...columnTotals, grandTotal],
  );

  return {
    rowLabel,
    measureLabel,
    columnKeys,
    rows,
    columnTotals,
    grandTotal,
    sourceRows,
    matrix,
  };
}
