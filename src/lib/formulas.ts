import formulaLocale from "@univerjs/engine-formula/locale/zh-CN";

type RawParam = { name?: string; detail?: string };
type RawFunction = { description?: string; abstract?: string; functionParameter?: Record<string, RawParam> };
type RawLocale = { "engine-formula"?: { functionList?: Record<string, RawFunction> } };

export type FormulaInfo = {
  name: string;
  title: string;
  description: string;
  signature: string;
  example: string;
  common: boolean;
  rank: number;
};

/** 常用函数：按使用频率排序，提示卡与函数库首屏优先展示 */
const COMMON_NAMES = [
  "SUM", "AVERAGE", "COUNT", "COUNTA", "MAX", "MIN",
  "IF", "IFS", "AND", "OR", "NOT", "IFERROR",
  "SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS", "AVERAGEIF", "AVERAGEIFS", "SUMPRODUCT",
  "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "INT", "MOD", "POWER", "SQRT",
  "VLOOKUP", "XLOOKUP", "HLOOKUP", "INDEX", "MATCH", "XMATCH", "OFFSET", "INDIRECT",
  "TEXT", "TEXTJOIN", "CONCAT", "CONCATENATE", "LEFT", "RIGHT", "MID", "LEN",
  "TRIM", "UPPER", "LOWER", "FIND", "SEARCH", "SUBSTITUTE", "REPLACE",
  "TODAY", "NOW", "DATE", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND",
  "DATEDIF", "EOMONTH", "WEEKDAY", "NETWORKDAYS",
  "LARGE", "SMALL", "RANK", "MEDIAN", "STDEV",
  "UNIQUE", "FILTER", "SORT", "SORTBY", "SEQUENCE", "LET", "LAMBDA",
];

const RAW = (formulaLocale as unknown as RawLocale)["engine-formula"]?.functionList ?? {};
const rankOf = new Map(COMMON_NAMES.map((name, index) => [name, index]));

function compact(text: string | undefined, max = 88): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function buildSignature(name: string, params?: Record<string, RawParam>): string {
  const names = Object.values(params ?? {})
    .map((param) => param?.name?.trim())
    .filter((value): value is string => Boolean(value));
  if (!names.length) return `${name}()`;
  const head = names.slice(0, 4).join(", ");
  return `${name}(${head}${names.length > 4 ? ", …" : ""})`;
}

function buildExample(name: string): string {
  const examples: Record<string, string> = {
    SUM: "=SUM(B2:B9)",
    AVERAGE: "=AVERAGE(B2:B9)",
    COUNT: "=COUNT(B2:B9)",
    COUNTA: "=COUNTA(A2:A9)",
    MAX: "=MAX(B2:B9)",
    MIN: "=MIN(B2:B9)",
    IF: '=IF(B2>=60,"及格","不及格")',
    IFS: '=IFS(B2>=90,"优",B2>=60,"及格",TRUE,"不及格")',
    SUMIF: '=SUMIF(A2:A9,"10 月",B2:B9)',
    SUMIFS: '=SUMIFS(B2:B9,A2:A9,"10 月")',
    COUNTIF: '=COUNTIF(A2:A9,"10 月")',
    VLOOKUP: "=VLOOKUP(A2,$A$2:$D$9,4,FALSE)",
    XLOOKUP: "=XLOOKUP(A2,$A$2:$A$9,$D$2:$D$9)",
    INDEX: "=INDEX(B2:B9,3)",
    MATCH: "=MATCH(A2,A2:A9,0)",
    TEXT: '=TEXT(B2,"#,##0.00")',
    TEXTJOIN: '=TEXTJOIN("-",TRUE,A2:A9)',
    CONCAT: "=CONCAT(A2:A9)",
    LEFT: "=LEFT(A2,2)",
    RIGHT: "=RIGHT(A2,2)",
    MID: "=MID(A2,2,3)",
    TODAY: "=TODAY()",
    DATEDIF: '=DATEDIF(A2,TODAY(),"d")',
    UNIQUE: "=UNIQUE(A2:A9)",
    FILTER: '=FILTER(B2:B9,A2:A9="10 月")',
    SORT: "=SORT(B2:B9,1,-1)",
    SEQUENCE: "=SEQUENCE(5,1,1,1)",
  };
  return examples[name] ?? `${name}(…)`;
}

export const FORMULA_LIBRARY: FormulaInfo[] = Object.entries(RAW)
  .map(([name, info]) => {
    const rank = rankOf.get(name);
    return {
      name,
      title: info?.abstract || name,
      description: compact(info?.description),
      signature: buildSignature(name, info?.functionParameter),
      example: buildExample(name),
      common: rank !== undefined,
      rank: rank ?? Number.MAX_SAFE_INTEGER,
    };
  })
  .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

export const FORMULA_COUNT = FORMULA_LIBRARY.length;
export const COMMON_FORMULAS = FORMULA_LIBRARY.filter((item) => item.common);

const byName = new Map(FORMULA_LIBRARY.map((item) => [item.name, item]));

export function getFormula(name: string): FormulaInfo | undefined {
  return byName.get(name.toUpperCase());
}

/** 公式栏提示：按输入前缀返回候选项，常用优先 */
export function suggestFormulas(prefix: string, limit = 6): FormulaInfo[] {
  const token = prefix.trim().toUpperCase();
  if (!token) return COMMON_FORMULAS.slice(0, limit);
  return FORMULA_LIBRARY.filter((item) => item.name.startsWith(token)).slice(0, limit);
}

export function searchFormulas(query: string, onlyCommon = false, limit = 240): FormulaInfo[] {
  const token = query.trim().toUpperCase();
  const pool = onlyCommon ? COMMON_FORMULAS : FORMULA_LIBRARY;
  if (!token) return pool.slice(0, limit);
  return pool
    .filter((item) => item.name.includes(token) || item.description.toUpperCase().includes(token))
    .slice(0, limit);
}
