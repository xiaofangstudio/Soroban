import { IconArrow, IconFolder, IconGrid, IconPlus } from "./Icons";
import {
  formatBytes,
  formatWhen,
  type RecentFile,
} from "../lib/recents";

type Props = {
  recent: RecentFile[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (entry: RecentFile) => void;
  busy?: boolean;
};

export function Welcome({ recent, onNew, onOpen, onOpenRecent, busy }: Props) {
  return (
    <div className="welcome">
      <div className="welcome-top">
        <div className="brand">
          <img className="brand-mark" src="/soroban-mark.svg" alt="" />
          <div className="brand-text">
            <span className="brand-name">Soroban</span>
            <span className="brand-sub">SPREADSHEET</span>
          </div>
        </div>
        <div className="welcome-note">
          <span className="status-dot" />
          本地计算 · 不联网 · 不上传
        </div>
      </div>

      <div className="welcome-body">
        <section className="hero">
          <span className="hero-eyebrow">
            <IconGrid width={13} height={13} />
            表格计算工作台
          </span>
          <h1>
            表格应该
            <br />
            打开就能<em>算</em>。
          </h1>
          <p>
            网格、公式、格式与多工作表都在本机完成。
            打开一份 xlsx，改完直接存回原文件，不需要登录，也不把数据送出去。
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={onNew} disabled={busy}>
              <IconPlus width={15} height={15} />
              新建空白表格
            </button>
            <button className="btn-ghost" onClick={onOpen} disabled={busy}>
              <IconFolder width={15} height={15} />
              打开 xlsx
            </button>
          </div>
          <div className="hero-hint">
            <span>
              <i />
              公式即时计算
            </span>
            <span>
              <i />
              多工作表
            </span>
            <span>
              <i />
              原格式保存
            </span>
          </div>
        </section>

        <aside className="recent-panel">
          <div className="recent-head">
            <span className="recent-title">最近打开</span>
            <span className="recent-count">{String(recent.length).padStart(2, "0")}</span>
          </div>
          {recent.length === 0 ? (
            <div className="recent-empty">
              <span className="recent-empty-mark">
                <IconGrid width={24} height={24} />
              </span>
              <b>还没有表格</b>
              <small>新建一份空白表格，或打开本机已有的 xlsx 文件。</small>
            </div>
          ) : (
            <div className="recent-list">
              {recent.map((item) => (
                <button
                  key={item.path}
                  className="recent-item"
                  title={item.path}
                  onClick={() => onOpenRecent(item)}
                  disabled={busy}
                >
                  <span className="recent-icon">X</span>
                  <span className="recent-main">
                    <span className="recent-name">{item.name}</span>
                    <span className="recent-meta">
                      {item.sheets} 个工作表 · {formatBytes(item.size)} · {formatWhen(item.openedAt)}
                    </span>
                  </span>
                  <span className="recent-open">
                    <IconArrow width={13} height={13} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      <div className="welcome-foot">
        <span>Soroban · 小方工作室</span>
        <span>M0 · Univer 网格内核</span>
      </div>
    </div>
  );
}
