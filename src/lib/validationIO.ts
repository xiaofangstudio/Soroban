import JSZip from "jszip";
import type { FUniver } from "@univerjs/presets";
import type { FRange, FWorkbook } from "@univerjs/sheets/facade";
import type { FDataValidation } from "@univerjs/sheets-data-validation/facade";

export type ValidationRecord = {
  sqref: string;
  type: string;
  operator?: string;
  formula1?: string;
  formula2?: string;
  allowBlank?: boolean;
  error?: string;
};

export type SheetValidationRecords = {
  name: string;
  items: ValidationRecord[];
};

const CUSTOM_PART = "xl/soroban-validations.json";

function attrText(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

function unescapeXml(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listValues(formula: string | undefined): string[] | null {
  const raw = (formula ?? "").trim();
  if (!raw || raw.startsWith("=")) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  } catch {
    /* 非 JSON 列表继续按 CSV 处理 */
  }
  let text = raw;
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/""/g, '"');
  return text
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listFormulaForExcel(formula: string | undefined): string {
  const values = listValues(formula);
  if (values && values.length > 0) return `"${values.join(",").replaceAll('"', '""')}"`;
  return (formula ?? "").replace(/^=/, "");
}

function isRangeFormula(formula: string | undefined): boolean {
  const raw = (formula ?? "").trim().replace(/^=/, "");
  if (!raw) return false;
  if (raw.startsWith('"')) return false;
  return /[:!]|^[$A-Za-z]+\$?\d+/.test(raw) && !/^\[/.test(raw);
}

function rangeRefFromFormula(formula: string | undefined): string {
  return (formula ?? "").trim().replace(/^=/, "").replaceAll("$", "");
}

function workbookSheetPaths(workbookXml: string, relsXml: string): Map<string, string> {
  const paths = new Map<string, string>();
  const relMap = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship[^>]*\/>/g)) {
    const id = attrText(rel[0], "Id");
    const target = attrText(rel[0], "Target");
    if (id && target) relMap.set(id, target);
  }
  for (const sheet of workbookXml.matchAll(/<sheet[^>]*\/>/g)) {
    const name = attrText(sheet[0], "name");
    const rid = attrText(sheet[0], "r:id");
    const target = rid ? relMap.get(rid) : undefined;
    if (!name || !target) continue;
    let path = target.replace(/^\/xl\//, "").replace(/^xl\//, "").replace(/^\//, "");
    if (!path.startsWith("worksheets/")) path = `worksheets/${path.replace(/^\.\//, "")}`;
    paths.set(name, `xl/${path}`);
  }
  return paths;
}

async function readXmlRecords(bytes: Uint8Array): Promise<SheetValidationRecords[]> {
  const zip = await JSZip.loadAsync(bytes);
  const workbookFile = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relsFile) return [];
  const paths = workbookSheetPaths(await workbookFile.async("string"), await relsFile.async("string"));
  const result: SheetValidationRecords[] = [];
  for (const [name, file] of paths) {
    const entry = zip.file(file);
    if (!entry) continue;
    const xml = await entry.async("string");
    const items: ValidationRecord[] = [];
    for (const block of xml.matchAll(/<dataValidations[^>]*>([\s\S]*?)<\/dataValidations>/g)) {
      for (const tag of block[1].matchAll(/<dataValidation[^>]*>([\s\S]*?)<\/dataValidation>/g)) {
        const head = tag[0].slice(0, tag[0].indexOf(">") + 1);
        const sqref = attrText(head, "sqref");
        const type = attrText(head, "type");
        if (!sqref || !type) continue;
        const first = tag[1].match(/<formula1>([\s\S]*?)<\/formula1>/);
        const second = tag[1].match(/<formula2>([\s\S]*?)<\/formula2>/);
        items.push({
          sqref: sqref.replaceAll("$", ""),
          type,
          operator: attrText(head, "operator"),
          formula1: first ? unescapeXml(first[1]) : undefined,
          formula2: second ? unescapeXml(second[1]) : undefined,
          allowBlank: attrText(head, "allowBlank") !== "0" && attrText(head, "allowBlank") !== "false",
          error: attrText(head, "error") ? unescapeXml(attrText(head, "error") as string) : undefined,
        });
      }
    }
    if (items.length > 0) result.push({ name, items });
  }
  return result;
}

export async function readValidationRecords(bytes: Uint8Array): Promise<SheetValidationRecords[]> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const custom = zip.file(CUSTOM_PART);
    if (custom) {
      const parsed: unknown = JSON.parse(await custom.async("string"));
      if (Array.isArray(parsed)) return parsed as SheetValidationRecords[];
    }
  } catch {
    /* 自定义清单不存在或损坏时回退解析标准 dataValidations */
  }
  try {
    return await readXmlRecords(bytes);
  } catch {
    return [];
  }
}

function validationXml(records: SheetValidationRecords): string {
  const valid = records.items.filter((item) => !["checkbox", "any", "none"].includes(item.type));
  if (valid.length === 0) return "";
  const entries = valid.map((item) => {
    const tags: string[] = [`<dataValidation type="${escapeXml(item.type)}"`];
    tags.push(`sqref="${escapeXml(item.sqref)}"`);
    tags.push(`allowBlank="${item.allowBlank === false ? 0 : 1}"`);
    tags.push('showErrorMessage="1"');
    if (item.error) tags.push(`error="${escapeXml(item.error)}"`);
    if (item.operator) tags.push(`operator="${escapeXml(item.operator)}"`);
    tags.push(">");
    let body = "";
    if (item.type === "list" || item.type === "listMultiple") {
      body += `<formula1>${escapeXml(listFormulaForExcel(item.formula1))}</formula1>`;
    } else {
      if (item.formula1) body += `<formula1>${escapeXml(item.formula1.replace(/^=/, ""))}</formula1>`;
      if (item.formula2) body += `<formula2>${escapeXml(item.formula2.replace(/^=/, ""))}</formula2>`;
    }
    return `${tags.join(" ")}${body}</dataValidation>`;
  });
  return `<dataValidations count="${entries.length}">${entries.join("")}</dataValidations>`;
}

function insertValidationXml(xml: string, block: string): string {
  const clean = xml.replace(/<dataValidations[\s\S]*?<\/dataValidations>/, "");
  const anchor = clean.search(
    /<(hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/,
  );
  if (anchor >= 0) return `${clean.slice(0, anchor)}${block}${clean.slice(anchor)}`;
  return clean.replace(/<\/worksheet>/, `${block}</worksheet>`);
}

export async function writeValidationRecords(
  bytes: Uint8Array,
  records: SheetValidationRecords[],
): Promise<Uint8Array> {
  if (records.length === 0) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const workbookFile = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relsFile) return bytes;
  const paths = workbookSheetPaths(await workbookFile.async("string"), await relsFile.async("string"));
  for (const sheet of records) {
    const path = paths.get(sheet.name);
    if (!path) continue;
    const entry = zip.file(path);
    if (!entry) continue;
    const block = validationXml(sheet);
    if (!block) continue;
    zip.file(path, insertValidationXml(await entry.async("string"), block));
  }
  zip.file(CUSTOM_PART, JSON.stringify(records));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function buildRule(api: FUniver, sheet: ReturnType<FWorkbook["getSheetByName"]>, item: ValidationRecord): void {
  if (!sheet) return;
  let range: FRange;
  try {
    range = sheet.getRange(item.sqref);
  } catch {
    return;
  }
  const builder = api.newDataValidation();
  const values = item.type === "list" || item.type === "listMultiple" ? listValues(item.formula1) : null;
  if (item.type === "list" || item.type === "listMultiple") {
    if (values && values.length > 0) builder.requireValueInList(values, item.type === "listMultiple", true);
    else if (isRangeFormula(item.formula1)) {
      const source = sheet.getRange(rangeRefFromFormula(item.formula1));
      builder.requireValueInRange(source, item.type === "listMultiple", true);
    } else return;
  } else if (item.type === "whole" || item.type === "decimal") {
    const a = Number(item.formula1);
    const b = Number(item.formula2);
    if (!Number.isFinite(a)) return;
    const integer = item.type === "whole";
    switch (item.operator) {
      case "between":
        if (!Number.isFinite(b)) return;
        builder.requireNumberBetween(a, b, integer);
        break;
      case "notBetween":
        if (!Number.isFinite(b)) return;
        builder.requireNumberNotBetween(a, b, integer);
        break;
      case "equal":
        builder.requireNumberEqualTo(a, integer);
        break;
      case "notEqual":
        builder.requireNumberNotEqualTo(a, integer);
        break;
      case "greaterThan":
        builder.requireNumberGreaterThan(a, integer);
        break;
      case "greaterThanOrEqual":
        builder.requireNumberGreaterThanOrEqualTo(a, integer);
        break;
      case "lessThan":
        builder.requireNumberLessThan(a, integer);
        break;
      case "lessThanOrEqual":
        builder.requireNumberLessThanOrEqualTo(a, integer);
        break;
      default:
        return;
    }
  } else {
    return;
  }
  try {
    const rule = builder
      .setAllowBlank(item.allowBlank !== false)
      .setOptions({ showErrorMessage: true, error: item.error ?? "输入值不符合此单元格的验证规则" })
      .build();
    range.setDataValidation(rule);
  } catch {
    /* 单条损坏的规则不阻断整本工作簿打开 */
  }
}

export function applyValidationRecords(api: FUniver, book: FWorkbook, records: SheetValidationRecords[]): void {
  for (const sheetRecord of records) {
    const sheet = book.getSheetByName(sheetRecord.name);
    if (!sheet) continue;
    for (const item of sheetRecord.items) buildRule(api, sheet, item);
  }
}

export function collectValidationRecords(book: FWorkbook): SheetValidationRecords[] {
  const result: SheetValidationRecords[] = [];
  for (const sheet of book.getSheets()) {
    const rules: FDataValidation[] = sheet.getDataValidations();
    if (rules.length === 0) continue;
    const items = rules.map((rule) => {
      const raw = rule.rule;
      return {
        sqref: rule
          .getRanges()
          .map((range) => range.getA1Notation().replaceAll("$", ""))
          .join(" "),
        type: String(raw.type),
        operator: raw.operator,
        formula1: raw.formula1,
        formula2: raw.formula2,
        allowBlank: raw.allowBlank !== false,
        error: raw.error,
      } satisfies ValidationRecord;
    });
    result.push({ name: sheet.getSheetName(), items });
  }
  return result;
}
