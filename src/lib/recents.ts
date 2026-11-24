export type RecentFile = {
  path: string;
  name: string;
  sheets: number;
  size: number;
  openedAt: number;
};

const KEY = "soroban.recent.v1";
const MAX = 8;

export function loadRecent(): RecentFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((it): it is RecentFile => !!it && typeof it.path === "string" && typeof it.name === "string")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberRecent(entry: Omit<RecentFile, "openedAt">): RecentFile[] {
  const list = loadRecent().filter((it) => it.path !== entry.path);
  list.unshift({ ...entry, openedAt: Date.now() });
  const next = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* localStorage 被禁用时静默降级 */
  }
  return next;
}

export function forgetRecent(path: string): RecentFile[] {
  const next = loadRecent().filter((it) => it.path !== path);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function formatBytes(size: number): string {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hh}:${mm}`;
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
