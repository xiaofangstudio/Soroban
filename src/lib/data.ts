export type CsvCell = string | number | boolean | null;

export type CsvDecoded = {
  rows: string[][];
  encoding: "UTF-8" | "GB18030";
};

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(text: string): string {
  const candidates = [",", "\t", ";"];
  const scores = candidates.map((delimiter) => {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < text.length && i < 2000; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) {
        count += 1;
      }
    }
    return { delimiter, count };
  });
  scores.sort((a, b) => b.count - a.count);
  return scores[0].count > 0 ? scores[0].delimiter : ",";
}

export function parseCsvText(input: string): string[][] {
  const text = stripBom(input);
  if (!text) return [];
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === "")) rows.pop();
  return rows;
}

export function decodeCsvBytes(bytes: Uint8Array): CsvDecoded {
  let text: string;
  let encoding: "UTF-8" | "GB18030" = "UTF-8";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("gb18030").decode(bytes);
    encoding = "GB18030";
  }
  return { rows: parseCsvText(text), encoding };
}

export function csvCellValue(raw: string): CsvCell {
  const text = raw.trim();
  if (text === "") return null;
  if (NUMBER_RE.test(text)) {
    // 保留 001、000123 这类编号，不要变成数字
    if (/^-?0\d/.test(text)) return raw;
    return Number(text);
  }
  return raw;
}

export function csvRowsToCellValues(rows: string[][]): CsvCell[][] {
  return rows.map((row) => row.map(csvCellValue));
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value) || /^\s|\s$/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "v" in (value as Record<string, unknown>)) {
    return cellToString((value as Record<string, unknown>).v);
  }
  return String(value);
}

export function valuesToCsv(values: unknown[][]): string {
  return values
    .map((row) => row.map((cell) => csvEscape(cellToString(cell))).join(","))
    .join("\r\n");
}

/**
 * 行排序后把公式中的同表相对行引用平移到新行；绝对行引用 / 跨表引用 / 字符串字面量保持不动。
 */
export function shiftFormulaRows(formula: string, delta: number): string {
  if (!delta || !formula) return formula;
  const strings: string[] = [];
  const masked = formula.replace(/"(?:[^"]|"")*"/g, (literal) => {
    strings.push(literal);
    return `\u0000${strings.length - 1}\u0000`;
  });
  const rowRef = /(?<![A-Za-z0-9!$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g;
  const shifted = masked.replace(rowRef, (match, colAbs: string, column: string, rowAbs: string, row: string) => {
    if (rowAbs) return match;
    const next = Number(row) + delta;
    if (next < 1) return match;
    return `${colAbs}${column}${next}`;
  });
  return shifted.replace(/\u0000(\d+)\u0000/g, (_, index: string) => strings[Number(index)] ?? "");
}

export function columnLabel(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
