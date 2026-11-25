import { useMemo, useState } from "react";
import { decodeCsvText, detectCsvDelimiter, parseCsvText } from "../lib/data";
import type { CsvDelimiter, CsvEncoding } from "../lib/data";

type Props = {
  name: string;
  size: number;
  bytes: Uint8Array;
  guessedEncoding: CsvEncoding;
  onCancel: () => void;
  onConfirm: (values: {
    rows: string[][];
    encoding: CsvEncoding;
    delimiter: CsvDelimiter;
    header: boolean;
  }) => void;
};

const DELIMITERS: { value: CsvDelimiter; label: string }[] = [
  { value: ",", label: "逗号 ," },
  { value: "\t", label: "制表符 Tab" },
  { value: ";", label: "分号 ;" },
];

export function CsvImportDialog({ name, size, bytes, guessedEncoding, onCancel, onConfirm }: Props) {
  const [encoding, setEncoding] = useState<CsvEncoding>(guessedEncoding);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(() => {
    const { text } = decodeCsvText(bytes, guessedEncoding);
    return detectCsvDelimiter(text);
  });
  const [header, setHeader] = useState(true);

  const decoded = useMemo(() => {
    const { text } = decodeCsvText(bytes, encoding);
    return { text, rows: parseCsvText(text, delimiter) };
  }, [bytes, encoding, delimiter]);

  const rows = decoded.rows;
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const preview = rows.slice(0, 6);
  const canImport = rows.length > 0;

  const confirm = () => {
    if (!canImport) return;
    let nextRows = rows;
    if (!header) {
      const head = Array.from({ length: columns }, (_, index) => `列${index + 1}`);
      nextRows = [head, ...rows];
    }
    onConfirm({ rows: nextRows, encoding, delimiter, header });
  };

  return (
    <div className="csv-mask" role="dialog" aria-modal="true" aria-label="CSV 导入预览">
      <div className="csv-dialog">
        <div className="csv-head">
          <div>
            <strong>导入 CSV</strong>
            <span>{name} · {Math.max(1, Math.round(size / 1024))} KB</span>
          </div>
          <button className="csv-close" onClick={onCancel} title="取消导入">×</button>
        </div>
        <div className="csv-controls">
          <label>
            <span>编码</span>
            <select value={encoding} onChange={(event) => setEncoding(event.target.value as CsvEncoding)}>
              <option value="UTF-8">UTF-8</option>
              <option value="GB18030">GB18030 / GBK</option>
            </select>
          </label>
          <label>
            <span>分隔符</span>
            <select value={delimiter} onChange={(event) => setDelimiter(event.target.value as CsvDelimiter)}>
              {DELIMITERS.map((item) => (
                <option key={item.label} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="csv-check">
            <input type="checkbox" checked={header} onChange={(event) => setHeader(event.target.checked)} />
            首行为标题
          </label>
        </div>
        <div className="csv-summary">
          {canImport ? `${rows.length} 行 · ${columns} 列` : "没有可导入的内容"}
          {encoding === "GB18030" ? " · 按中文 GB18030 解码" : ""}
        </div>
        <div className="csv-preview">
          {canImport ? (
            <table>
              <thead>
                {header ? (
                  <tr>
                    {(preview[0] ?? []).slice(0, 7).map((cell, index) => (
                      <th key={index}>{cell || `列${index + 1}`}</th>
                    ))}
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {(header ? preview.slice(1) : preview).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {Array.from({ length: Math.min(7, columns) }, (_, index) => (
                      <td key={index} title={row[index] ?? ""}>{row[index] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <span>请确认编码与分隔符</span>
          )}
        </div>
        <div className="csv-actions">
          <button onClick={onCancel}>取消</button>
          <button className="csv-primary" onClick={confirm} disabled={!canImport}>导入并新建表格</button>
        </div>
      </div>
    </div>
  );
}
