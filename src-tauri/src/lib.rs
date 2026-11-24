use std::path::PathBuf;
use tauri::ipc::Response;

/// 把整份工作簿以二进制返回前端，避免 xlsx 走 JSON 数组。
#[tauri::command]
fn read_document(path: String) -> Result<Response, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("文件不存在或不是文件".into());
    }
    std::fs::read(&p)
        .map(Response::new)
        .map_err(|e| format!("读取失败：{e}"))
}

/// 保存前端生成好的 xlsx 字节；返回写入后的文件大小。
#[tauri::command]
fn write_document(path: String, data: Vec<u8>) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    if data.is_empty() {
        return Err("没有可写入的内容".into());
    }
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err("目标文件夹不存在".into());
        }
    }
    let temp = p.with_extension("soroban-tmp");
    std::fs::write(&temp, &data).map_err(|e| format!("写入临时文件失败：{e}"))?;
    let backup = p.with_extension("soroban-bak");
    let had_original = p.exists();
    if had_original {
        std::fs::rename(&p, &backup).map_err(|e| {
            let _ = std::fs::remove_file(&temp);
            format!("备份原文件失败：{e}")
        })?;
    }
    if let Err(e) = std::fs::rename(&temp, &p) {
        if had_original {
            let _ = std::fs::rename(&backup, &p);
        }
        let _ = std::fs::remove_file(&temp);
        return Err(format!("保存失败：{e}"));
    }
    if had_original {
        let _ = std::fs::remove_file(&backup);
    }
    Ok(data.len() as u64)
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(path).is_file()
}

#[tauri::command]
fn file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("无法读取文件信息：{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_document,
            file_exists,
            file_size
        ])
        .run(tauri::generate_context!())
        .expect("运行 Soroban 时出错");
}

pub mod mcp;
