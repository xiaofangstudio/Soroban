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
    let file_name = p
        .file_name()
        .ok_or_else(|| "保存路径没有文件名".to_string())?
        .to_string_lossy();
    // 用通用 .tmp / .bak，不把产品名塞进临时文件后缀。
    let temp = p.with_file_name(format!("{file_name}.tmp"));
    std::fs::write(&temp, &data).map_err(|e| format!("写入临时文件失败：{e}"))?;
    let backup = p.with_file_name(format!("{file_name}.bak"));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_document_uses_generic_tmp_and_bak() {
        let dir = std::env::temp_dir().join(format!("soroban-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let target = dir.join("表.xlsx");
        std::fs::write(&target, b"old").unwrap();

        let size = write_document(target.to_string_lossy().into_owned(), b"new".to_vec()).unwrap();
        assert_eq!(size, 3);
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
        assert!(!dir.join("表.xlsx.tmp").exists());
        assert!(!dir.join("表.xlsx.bak").exists());
        for entry in std::fs::read_dir(&dir).unwrap() {
            let name = entry.unwrap().file_name().to_string_lossy().into_owned();
            assert!(!name.contains("soroban"), "临时目录不应出现产品名后缀：{name}");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
