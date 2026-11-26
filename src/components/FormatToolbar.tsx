import { useEffect, useRef, useState } from "react";

export type FormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  fill: string;
  horizontal: "left" | "center" | "right";
  numberFormat: string;
};

export type FormatCommand =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "fontFamily"; value: string }
  | { type: "fontSize"; value: number }
  | { type: "fontColor"; value: string | null }
  | { type: "fill"; value: string | null }
  | { type: "align"; value: "left" | "center" | "right" }
  | { type: "border"; value: "all" | "none" }
  | { type: "numberFormat"; value: string };

type Props = {
  state: FormatState;
  onFormat: (command: FormatCommand) => void;
  onConditional: (kind: "scale" | "bar" | "icons" | "formula" | "clear", formula?: string) => void;
  onOpenChart: () => void;
};

const FONT_COLORS = [
  "#16241d",
  "#4f6b5e",
  "#0e9f6e",
  "#0b7f59",
  "#c2413a",
  "#b46a12",
  "#205fa8",
  "#6b4ea8",
];

const FILL_COLORS = [
  "#ffffff",
  "#eafaf3",
  "#d3f4e6",
  "#a9e9cf",
  "#75d9b1",
  "#5ee0a8",
  "#fff2cc",
  "#fce4d6",
  "#ffd7d5",
  "#e8ecea",
];

const NUMBER_FORMATS = [
  { value: "General", label: "常规" },
  { value: "0", label: "整数" },
  { value: "0.00", label: "小数" },
  { value: "#,##0", label: "千分位" },
  { value: "#,##0.00", label: "千分位·小数" },
  { value: "0.00%", label: "百分比" },
  { value: "¥#,##0.00", label: "人民币" },
  { value: "yyyy-mm-dd", label: "日期" },
];

function AlignIcon({ kind }: { kind: "left" | "center" | "right" }) {
  if (kind === "left") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden>
        <path d="M2 4h14M2 8h9M2 12h14M2 16h8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "center") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden>
        <path d="M2 4h14M4.5 8h9M2 12h14M5 16h8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 18" aria-hidden>
      <path d="M2 4h14M7 8h9M2 12h14M8 16h8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function BorderIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 2.5v13M2.5 9h13" stroke="currentColor" strokeWidth="1.1" opacity=".7" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden>
      <path d="M3 15V8M8 15V4M13 15v-5M17 15V6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 15.5h15" stroke="currentColor" strokeWidth="1" opacity=".5" />
    </svg>
  );
}

function CfIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="2.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 12.5L8 7l3 3 4-5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function FormatToolbar({ state, onFormat, onConditional, onOpenChart }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<"font" | "fill" | "cf" | "border" | null>(null);
  const [cfFormula, setCfFormula] = useState("=A1>0");

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".fmt-toolbar")) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menu]);

  const numberValue = NUMBER_FORMATS.some((item) => item.value === state.numberFormat)
    ? state.numberFormat
    : "custom";

  return (
    <div className="fmt-toolbar" ref={rootRef} aria-label="格式工具栏">
      <div className="fmt-group">
        <select
          className="fmt-select num"
          value={numberValue}
          title="数字格式"
          onChange={(event) => onFormat({ type: "numberFormat", value: event.target.value })}
        >
          {numberValue === "custom" ? <option value="custom">自定义</option> : null}
          {NUMBER_FORMATS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          className="fmt-select font"
          value={state.fontFamily || ""}
          title="字体"
          onChange={(event) => onFormat({ type: "fontFamily", value: event.target.value })}
        >
          <option value="">默认字体</option>
          <option value="Arial">Arial</option>
          <option value="Segoe UI">Segoe UI</option>
          <option value="微软雅黑">微软雅黑</option>
          <option value="宋体">宋体</option>
          <option value="Consolas">Consolas</option>
        </select>
        <select
          className="fmt-select size"
          value={String(state.fontSize)}
          title="字号"
          onChange={(event) => onFormat({ type: "fontSize", value: Number(event.target.value) })}
        >
          {[9, 10, 11, 12, 14, 16, 18, 20, 24].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="fmt-divider" />
      <div className="fmt-group">
        <button
          className={`fmt-btn letter${state.bold ? " active" : ""}`}
          onClick={() => onFormat({ type: "bold" })}
          title="加粗"
        >
          B
        </button>
        <button
          className={`fmt-btn letter italic${state.italic ? " active" : ""}`}
          onClick={() => onFormat({ type: "italic" })}
          title="斜体"
        >
          I
        </button>
        <button
          className={`fmt-btn letter underline${state.underline ? " active" : ""}`}
          onClick={() => onFormat({ type: "underline" })}
          title="下划线"
        >
          U
        </button>
        <div className="fmt-swatcher">
          <button
            className={`fmt-btn color${menu === "font" ? " active" : ""}`}
            onClick={() => setMenu(menu === "font" ? null : "font")}
            title="字体颜色"
          >
            <span className="color-letter">A</span>
            <span className="color-bar" style={{ background: state.fontColor || "#16241d" }} />
          </button>
          {menu === "font" ? (
            <div className="fmt-pop color-pop">
              <div className="fmt-pop-head">字体颜色</div>
              <div className="color-grid">
                {FONT_COLORS.map((color) => (
                  <button
                    key={color}
                    className="color-cell"
                    style={{ background: color }}
                    onClick={() => {
                      onFormat({ type: "fontColor", value: color });
                      setMenu(null);
                    }}
                    title={color}
                  />
                ))}
              </div>
              <button
                className="fmt-pop-reset"
                onClick={() => {
                  onFormat({ type: "fontColor", value: null });
                  setMenu(null);
                }}
              >
                恢复自动颜色
              </button>
            </div>
          ) : null}
        </div>
        <div className="fmt-swatcher">
          <button
            className={`fmt-btn fill${menu === "fill" ? " active" : ""}`}
            onClick={() => setMenu(menu === "fill" ? null : "fill")}
            title="填充颜色"
          >
            <span className="fill-glyph" style={{ background: state.fill || "#ffffff" }} />
          </button>
          {menu === "fill" ? (
            <div className="fmt-pop color-pop">
              <div className="fmt-pop-head">填充颜色</div>
              <div className="color-grid">
                {FILL_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`color-cell${color === "#ffffff" ? " white" : ""}`}
                    style={{ background: color }}
                    onClick={() => {
                      onFormat({ type: "fill", value: color });
                      setMenu(null);
                    }}
                    title={color}
                  />
                ))}
              </div>
              <button
                className="fmt-pop-reset"
                onClick={() => {
                  onFormat({ type: "fill", value: null });
                  setMenu(null);
                }}
              >
                无填充
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="fmt-divider" />
      <div className="fmt-group">
        {(["left", "center", "right"] as const).map((kind) => (
          <button
            key={kind}
            className={`fmt-btn align${state.horizontal === kind ? " active" : ""}`}
            onClick={() => onFormat({ type: "align", value: kind })}
            title={kind === "left" ? "左对齐" : kind === "center" ? "居中" : "右对齐"}
          >
            <AlignIcon kind={kind} />
          </button>
        ))}
        <div className="fmt-swatcher">
          <button
            className={`fmt-btn${menu === "border" ? " active" : ""}`}
            onClick={() => setMenu(menu === "border" ? null : "border")}
            title="边框"
          >
            <BorderIcon />
          </button>
          {menu === "border" ? (
            <div className="fmt-pop border-pop">
              <button
                onClick={() => {
                  onFormat({ type: "border", value: "all" });
                  setMenu(null);
                }}
              >
                全部细边框
              </button>
              <button
                onClick={() => {
                  onFormat({ type: "border", value: "none" });
                  setMenu(null);
                }}
              >
                清除边框
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="fmt-divider" />
      <div className="fmt-group grow" />
      <div className="fmt-swatcher">
        <button
          className={`fmt-btn text${menu === "cf" ? " active" : ""}`}
          onClick={() => setMenu(menu === "cf" ? null : "cf")}
          title="条件格式"
        >
          <CfIcon />
          条件格式
        </button>
        {menu === "cf" ? (
          <div className="fmt-pop cf-pop">
            <div className="fmt-pop-head">条件格式 · 当前选区</div>
            <button className="cf-item" onClick={() => { onConditional("scale"); setMenu(null); }}>
              <span className="cf-scale-preview" />
              <span>
                <strong>三色色阶</strong>
                <small>低值淡绿，高值深绿</small>
              </span>
            </button>
            <button className="cf-item" onClick={() => { onConditional("bar"); setMenu(null); }}>
              <span className="cf-bar-preview">
                <i /><i /><i />
              </span>
              <span>
                <strong>数据条</strong>
                <small>按数值长度铺满单元格</small>
              </span>
            </button>
            <button className="cf-item" onClick={() => { onConditional("icons"); setMenu(null); }}>
              <span className="cf-icons-preview">
                <i /><i /><i />
              </span>
              <span>
                <strong>三色图标集</strong>
                <small>绿 / 黄 / 红三档按百分比分级</small>
              </span>
            </button>
            <div className="cf-formula">
              <label htmlFor="cf-formula-input">公式规则</label>
              <div className="cf-formula-row">
                <input
                  id="cf-formula-input"
                  value={cfFormula}
                  onChange={(event) => setCfFormula(event.target.value)}
                  placeholder="=A1>0"
                  spellCheck={false}
                />
                <button
                  onClick={() => {
                    onConditional("formula", cfFormula);
                    setMenu(null);
                  }}
                >
                  应用
                </button>
              </div>
              <small>公式返回 TRUE 时，选区套淡黄底并加粗；公式相对选区左上角。</small>
            </div>
            <button
              className="cf-clear"
              onClick={() => {
                onConditional("clear");
                setMenu(null);
              }}
            >
              清除该区域条件格式
            </button>
          </div>
        ) : null}
      </div>
      <button className="fmt-btn chart" onClick={onOpenChart} title="插入图表">
        <ChartIcon />
        图表
      </button>
    </div>
  );
}
