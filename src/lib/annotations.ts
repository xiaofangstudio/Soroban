export type CellComment = {
  id: string;
  sheetName: string;
  row: number;
  column: number;
  text: string;
  author: string;
  createdAt: number;
  resolved: boolean;
};

export type SheetImage = {
  id: string;
  sheetName: string;
  name: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 顺时针旋转角度，只存 0/90/180/270。 */
  rotation?: number;
  /** 锁定后不能拖动和缩放，但可以旋转、置顶、解锁、删除。 */
  locked?: boolean;
  /** 层叠顺序，越大越靠前。 */
  z?: number;
};

function keyOf(kind: "comments" | "images", docPath: string | null, docName: string): string {
  return `soroban:${kind}:${docPath ? `path:${docPath}` : `name:${docName}`}`;
}

export function commentStorageKey(docPath: string | null, docName: string): string {
  return keyOf("comments", docPath, docName);
}

export function imageStorageKey(docPath: string | null, docName: string): string {
  return keyOf("images", docPath, docName);
}

export function normalizeComments(value: unknown): CellComment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CellComment =>
      !!item &&
      typeof item === "object" &&
      typeof (item as CellComment).id === "string" &&
      typeof (item as CellComment).sheetName === "string" &&
      Number.isInteger((item as CellComment).row) &&
      Number.isInteger((item as CellComment).column) &&
      typeof (item as CellComment).text === "string",
  ).map((item) => ({
    ...item,
    author: item.author || "本机用户",
    createdAt: item.createdAt || Date.now(),
    resolved: !!item.resolved,
  }));
}

export function normalizeImages(value: unknown): SheetImage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SheetImage =>
      !!item &&
      typeof item === "object" &&
      typeof (item as SheetImage).id === "string" &&
      typeof (item as SheetImage).sheetName === "string" &&
      typeof (item as SheetImage).dataUrl === "string" &&
      (item as SheetImage).dataUrl.startsWith("data:image/"),
  ).map((item) => ({
    ...item,
    name: item.name || "图片",
    x: Number.isFinite(item.x) ? item.x : 24,
    y: Number.isFinite(item.y) ? item.y : 24,
    width: Math.max(40, Number.isFinite(item.width) ? item.width : 220),
    height: Math.max(40, Number.isFinite(item.height) ? item.height : 140),
    rotation: typeof item.rotation === "number" && Number.isFinite(item.rotation) ? ((Math.round(item.rotation / 90) * 90) % 360 + 360) % 360 : 0,
    locked: !!item.locked,
    z: typeof item.z === "number" && Number.isFinite(item.z) ? item.z : 0,
  }));
}

export function loadComments(key: string): CellComment[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalizeComments(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveComments(key: string, comments: CellComment[]): void {
  try {
    if (comments.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(comments));
  } catch {
    /* 写满时不影响表格 */
  }
}

export function loadImages(key: string): SheetImage[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalizeImages(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveImages(key: string, images: SheetImage[]): void {
  try {
    if (images.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(images));
  } catch {
    /* 大图写满时不影响表格 */
  }
}

export function makeCommentId(): string {
  return `note-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export function makeImageId(): string {
  return `img-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export function addressOf(row: number, column: number): string {
  let n = column + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row + 1}`;
}
