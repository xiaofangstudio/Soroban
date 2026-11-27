import JSZip from "jszip";
import { cfStorageKey, chartStorageKey, saveCfRules, saveCharts } from "./charts";
import type { CfRuleGroup, ChartSpec } from "./charts";
import { normalizePrintSettings, printStorageKey, savePrintSettings } from "./print";
import type { PrintSettings } from "./print";

export type WorkbookMeta = {
  version: 1;
  charts: ChartSpec[];
  cf: CfRuleGroup[];
  print: PrintSettings;
};

const PROPERTY_NAME = "SorobanData";
const CUSTOM_PART = "docProps/custom.xml";
const CUSTOM_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.custom-properties+xml";
const CUSTOM_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeBase64(text: string): string {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function normalizeMeta(input: unknown): WorkbookMeta | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<WorkbookMeta>;
  const charts = Array.isArray(raw.charts) ? raw.charts.filter((item) => item && typeof item.range === "string") : [];
  const cf = Array.isArray(raw.cf)
    ? raw.cf.filter((group) => group && typeof group.sheetName === "string" && Array.isArray(group.rules))
    : [];
  const print = normalizePrintSettings(raw.print && typeof raw.print === "object" ? raw.print : {});
  return { version: 1, charts, cf, print };
}

export async function readWorkbookMeta(bytes: Uint8Array): Promise<WorkbookMeta | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const part = zip.file(CUSTOM_PART);
    if (!part) return null;
    const xml = await part.async("string");
    const property = xml.match(
      new RegExp(`<Property\\b(?=[^>]*\\bname="${PROPERTY_NAME}")[^>]*>([\\s\\S]*?)</Property>`),
    );
    if (!property) return null;
    const value = property[1].match(/<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/);
    if (!value) return null;
    const json = decodeBase64(unescapeXml(value[1]));
    return normalizeMeta(JSON.parse(json));
  } catch {
    return null;
  }
}

function mergePriorProperties(base: string, prior: string): string {
  let next = base;
  const names = [...next.matchAll(/<Property\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]);
  const pids = [...next.matchAll(/\bpid="(\d+)"/g)].map((match) => Number(match[1]));
  for (const match of prior.matchAll(/<Property\b[\s\S]*?<\/Property>/g)) {
    const block = match[0];
    const name = block.match(/\bname="([^"]+)"/)?.[1];
    if (!name || name === PROPERTY_NAME || names.includes(name)) continue;
    const pid = Math.max(1, ...pids) + 1;
    next = next.replace(/<\/Properties>\s*$/, `${block.replace(/\bpid="\d+"/, `pid="${pid}"`)}</Properties>`);
    names.push(name);
    pids.push(pid);
  }
  return next;
}

function upsertProperty(xml: string, encoded: string): string {
    let next = xml;
    if (!next.includes("xmlns:vt=")) {
      next = next.replace(/<Properties\b([^>]*)>/, '<Properties$1 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">');
    }
    const existing = new RegExp(
      `<Property\\b(?=[^>]*\\bname="${PROPERTY_NAME}")[^>]*>[\\s\\S]*?</Property>`,
    );
    const usedPids = [...next.matchAll(/\bpid="(\d+)"/g)].map((match) => Number(match[1]));
    const pid = Math.max(1, ...usedPids) + 1;
    const propertyXml = `<Property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${pid}" name="${PROPERTY_NAME}"><vt:lpwstr>${escapeXml(
      encoded,
    )}</vt:lpwstr></Property>`;
    if (existing.test(next)) return next.replace(existing, propertyXml);
    return next.replace(/<\/Properties>\s*$/, `${propertyXml}</Properties>`);
}

export async function embedWorkbookMeta(
  bytes: Uint8Array,
  meta: WorkbookMeta,
  previousBytes?: Uint8Array,
): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const json = JSON.stringify(meta);
    const encoded = encodeBase64(json);

    let previousXml = "";
    if (previousBytes) {
      const previousZip = await JSZip.loadAsync(previousBytes);
      const previousPart = previousZip.file(CUSTOM_PART);
      if (previousPart) previousXml = await previousPart.async("string");
    }

    const existing = zip.file(CUSTOM_PART);
    const baseXml = existing
      ? await existing.async("string")
      : previousXml ||
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
    const merged = previousXml ? mergePriorProperties(baseXml, previousXml) : baseXml;
    zip.file(CUSTOM_PART, upsertProperty(merged, encoded));

    const types = zip.file("[Content_Types].xml");
    if (types) {
      let xml = await types.async("string");
      if (!xml.includes(`PartName="/${CUSTOM_PART}"`)) {
        xml = xml.replace(
          /<\/Types>\s*$/,
          `<Override PartName="/${CUSTOM_PART}" ContentType="${CUSTOM_CONTENT_TYPE}"/></Types>`,
        );
        zip.file("[Content_Types].xml", xml);
      }
    }

    const rels = zip.file("_rels/.rels");
    if (rels) {
      let xml = await rels.async("string");
      if (!xml.includes(CUSTOM_REL_TYPE)) {
        xml = xml.replace(
          /<\/Relationships>\s*$/,
          `<Relationship Id="rIdSorobanCustomProps" Type="${CUSTOM_REL_TYPE}" Target="${CUSTOM_PART}"/></Relationships>`,
        );
        zip.file("_rels/.rels", xml);
      }
    }

    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (error) {
    throw new Error(`写入 xlsx 元数据失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function hydrateWorkbookMeta(path: string | null, name: string, meta: WorkbookMeta): void {
  saveCharts(chartStorageKey(path, name), meta.charts);
  saveCfRules(cfStorageKey(path, name), meta.cf);
  savePrintSettings(printStorageKey(path, name), meta.print);
}
