//! Soroban 自带 MCP（Model Context Protocol）stdio 服务。
//!
//! `Soroban.exe --mcp` 进入本模块，只通过 stdin / stdout 交换 JSON-RPC；
//! 工具只读本机 xlsx / csv，不创建窗口，也不依赖前端状态。

use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};

const PROTOCOL_FALLBACK: &str = "2024-11-05";
const FORMULA_CATALOG: &str = include_str!("formula_catalog.json");

pub fn run_stdio() -> i32 {
    eprintln!("[soroban-mcp] stdio server ready");
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[soroban-mcp] read error: {e}");
                return 1;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let req: Value = match serde_json::from_str(line.trim()) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[soroban-mcp] invalid json: {e}");
                let resp = error_response(Value::Null, -32700, "JSON 解析失败");
                let _ = writeln!(stdout, "{resp}");
                let _ = stdout.flush();
                continue;
            }
        };
        if req.get("method").and_then(Value::as_str) == Some("exit") {
            break;
        }
        let Some(id) = req.get("id").cloned() else {
            continue;
        };
        let method = req.get("method").and_then(Value::as_str).unwrap_or("");
        let params = req.get("params").cloned().unwrap_or(Value::Null);
        let resp = match method {
            "initialize" => initialize_result(id, &params),
            "ping" => json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
            "tools/list" => {
                json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tool_definitions() } })
            }
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
                tool_result(id, call_tool(name, &args))
            }
            _ => error_response(id, -32601, "不支持的方法"),
        };
        let _ = writeln!(stdout, "{resp}");
        let _ = stdout.flush();
    }
    eprintln!("[soroban-mcp] bye");
    0
}

fn initialize_result(id: Value, params: &Value) -> Value {
    let version = params
        .get("protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or(PROTOCOL_FALLBACK);
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "protocolVersion": version,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": {
                "name": "soroban",
                "title": "Soroban 表格工作台",
                "version": env!("CARGO_PKG_VERSION")
            },
            "instructions": "Soroban 的本地表格工具。路径必须是本机绝对路径；只读检查 xlsx / csv，不修改原文件。"
        }
    })
}

fn error_response(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
}

fn tool_result(id: Value, output: Result<Value, String>) -> Value {
    match output {
        Ok(v) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default() }],
                "isError": false
            }
        }),
        Err(e) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": [{ "type": "text", "text": e }],
                "isError": true
            }
        }),
    }
}

fn call_tool(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "soroban_workbook_info" => tool_workbook_info(args),
        "soroban_validate_xlsx" => tool_validate(args),
        "soroban_csv_preview" => tool_csv_preview(args),
        "soroban_formula_search" => tool_formula_search(args),
        other => Err(format!("不认识的工具：{other}")),
    }
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "soroban_workbook_info",
            "description": "读取本机 xlsx 的工作表名、工作表数量、文件大小与关键部件是否齐全。只读，不修改文件。",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string", "description": "xlsx 绝对路径" } },
                "required": ["path"]
            }
        },
        {
            "name": "soroban_validate_xlsx",
            "description": "检查 xlsx 是否为合法 OOXML 包：必需部件、workbook.xml 可解析、工作表引用完整。只读。",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string", "description": "xlsx 绝对路径" } },
                "required": ["path"]
            }
        },
        {
            "name": "soroban_csv_preview",
            "description": "预览本机 CSV 的前几行，返回列数、行数与前 30 行；用于打开前确认编码与分隔符。只读。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "CSV 绝对路径" },
                    "delimiter": { "type": "string", "description": "单字符分隔符，默认逗号" },
                    "rows": { "type": "integer", "description": "预览行数，默认 30，最大 100" }
                },
                "required": ["path"]
            }
        },
        {
            "name": "soroban_formula_search",
            "description": "在内置函数库中搜索函数：返回函数名、中文说明、参数与签名。用于写公式前查函数。只读。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "函数名或说明关键词，例如 SUM / 日期 / 求和，可为空" },
                    "limit": { "type": "integer", "description": "返回数量，默认 20，最大 100" },
                    "commonOnly": { "type": "boolean", "description": "仅返回常用函数，默认 false" }
                }
            }
        }
    ])
}

fn absolute_file(args: &Value) -> Result<PathBuf, String> {
    let raw = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| "缺少 path".to_string())?;
    let p = PathBuf::from(raw);
    if !p.is_absolute() {
        return Err("path 必须是绝对路径".into());
    }
    if !p.is_file() {
        return Err(format!("文件不存在：{}", p.display()));
    }
    Ok(p)
}

fn workbook_sheets(path: &Path) -> Result<(Vec<String>, Vec<String>), String> {
    let file = File::open(path).map_err(|e| format!("打开文件失败：{e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "不是有效的 xlsx（zip 容器解析失败）".to_string())?;
    let mut entry_names = Vec::new();
    for i in 0..zip.len() {
        if let Ok(name) = zip.by_index(i).map(|e| e.name().to_string()) {
            entry_names.push(name.replace('\\', "/"));
        }
    }
    let mut xml = String::new();
    {
        let mut entry = zip
            .by_name("xl/workbook.xml")
            .map_err(|_| "缺少 xl/workbook.xml".to_string())?;
        entry
            .read_to_string(&mut xml)
            .map_err(|e| format!("读取 workbook.xml 失败：{e}"))?;
    }
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut sheets = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name().as_ref() == b"sheet" => {
                for attr in e.attributes().flatten() {
                    if attr.key.as_ref() == b"name" {
                        let value = attr.unescape_value().unwrap_or_default();
                        sheets.push(value.to_string());
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("workbook.xml 解析失败：{e}")),
            _ => {}
        }
    }
    Ok((sheets, entry_names))
}

fn tool_workbook_info(args: &Value) -> Result<Value, String> {
    let path = absolute_file(args)?;
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let (sheets, entries) = workbook_sheets(&path)?;
    Ok(json!({
        "path": path.display().to_string(),
        "name": path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        "bytes": size,
        "sheetCount": sheets.len(),
        "sheets": sheets,
        "hasSharedStrings": entries.iter().any(|e| e == "xl/sharedStrings.xml"),
        "hasStyles": entries.iter().any(|e| e == "xl/styles.xml"),
        "entryCount": entries.len()
    }))
}

fn tool_validate(args: &Value) -> Result<Value, String> {
    let path = absolute_file(args)?;
    let mut issues = Vec::new();
    let (sheets, entries) = match workbook_sheets(&path) {
        Ok(v) => v,
        Err(e) => {
            return Ok(json!({ "ok": false, "issues": [e] }));
        }
    };
    for required in ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"] {
        if !entries.iter().any(|e| e == required) {
            issues.push(format!("缺少必需部件 {required}"));
        }
    }
    if sheets.is_empty() {
        issues.push("workbook.xml 中没有 worksheet".into());
    }
    Ok(json!({
        "ok": issues.is_empty(),
        "issues": issues,
        "sheetCount": sheets.len(),
        "sheets": sheets
    }))
}

fn tool_formula_search(args: &Value) -> Result<Value, String> {
    let query = args
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_uppercase();
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(20)
        .clamp(1, 100) as usize;
    let common_only = args
        .get("commonOnly")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let catalog: Vec<Value> =
        serde_json::from_str(FORMULA_CATALOG).map_err(|e| format!("函数库解析失败：{e}"))?;
    let mut matched: Vec<Value> = catalog
        .iter()
        .filter(|item| {
            let common = item.get("common").and_then(Value::as_bool).unwrap_or(false);
            if common_only && !common {
                return false;
            }
            if query.is_empty() {
                return true;
            }
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_uppercase();
            let description = item
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("");
            name.contains(&query) || description.to_uppercase().contains(&query)
        })
        .cloned()
        .collect();
    let matched_count = matched.len();
    if matched.len() > limit {
        matched.truncate(limit);
    }
    Ok(json!({
        "query": query,
        "total": catalog.len(),
        "matched": matched_count,
        "formulas": matched
    }))
}

fn tool_csv_preview(args: &Value) -> Result<Value, String> {
    let path = absolute_file(args)?;
    let delimiter = args
        .get("delimiter")
        .and_then(Value::as_str)
        .and_then(|s| s.as_bytes().first().copied())
        .unwrap_or(b',');
    let preview_rows = args
        .get("rows")
        .and_then(Value::as_u64)
        .unwrap_or(30)
        .clamp(1, 100) as usize;
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_path(&path)
        .map_err(|e| format!("读取 CSV 失败：{e}"))?;
    let headers = reader
        .headers()
        .map(|h| h.iter().map(|s| s.to_string()).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut rows = Vec::new();
    let mut total = 0usize;
    let mut truncated = false;
    for record in reader.records() {
        let record = record.map_err(|e| format!("CSV 解析失败：{e}"))?;
        total += 1;
        if rows.len() < preview_rows {
            rows.push(record.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        }
        if total >= 200_000 {
            truncated = true;
            break;
        }
    }
    Ok(json!({
        "path": path.display().to_string(),
        "delimiter": (delimiter as char).to_string(),
        "columns": headers.len(),
        "rows": total,
        "truncated": truncated,
        "headers": headers,
        "preview": rows
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("assets")
            .join(name)
    }

    #[test]
    fn workbook_info_reads_two_sheets() {
        let path = fixture("M0-样本.xlsx");
        let (sheets, entries) = workbook_sheets(&path).unwrap();
        assert_eq!(sheets, vec!["销售", "明细"]);
        assert!(entries.iter().any(|e| e == "xl/workbook.xml"));
        assert!(entries.iter().any(|e| e == "xl/styles.xml"));
    }

    #[test]
    fn validate_reports_ok_for_sample() {
        let path = fixture("M0-样本.xlsx");
        let result = tool_validate(&json!({ "path": path.display().to_string() })).unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["sheetCount"], 2);
    }

    #[test]
    fn csv_preview_reads_rows() {
        let path = fixture("M0-样本.csv");
        let result = tool_csv_preview(&json!({
            "path": path.display().to_string(),
            "rows": 5
        }))
        .unwrap();
        assert_eq!(result["columns"], 4);
        assert_eq!(result["rows"], 3);
        assert_eq!(result["headers"][0], "月份");
    }

    #[test]
    fn rejects_non_absolute_path() {
        let err = absolute_file(&json!({ "path": "M0-样本.xlsx" })).unwrap_err();
        assert!(err.contains("绝对路径"));
    }

    #[test]
    fn formula_catalog_has_full_function_set() {
        let catalog: Vec<Value> = serde_json::from_str(FORMULA_CATALOG).unwrap();
        assert!(catalog.len() >= 500);
        assert_eq!(catalog[0]["name"], "SUM");
        assert_eq!(catalog[0]["common"], true);
    }

    #[test]
    fn formula_search_finds_sum_and_dates() {
        let by_name = tool_formula_search(&json!({ "query": "sum" })).unwrap();
        assert_eq!(by_name["total"], 528);
        assert_eq!(by_name["formulas"][0]["name"], "SUM");
        let by_text = tool_formula_search(&json!({ "query": "日期", "limit": 10 })).unwrap();
        assert!(by_text["matched"].as_u64().unwrap() > 5);
        assert!(by_text["formulas"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["name"] == "TODAY"));
    }
}
