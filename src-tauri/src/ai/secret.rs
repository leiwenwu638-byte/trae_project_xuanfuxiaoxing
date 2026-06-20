use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// TODO: 后续迁移到系统凭据管理（Windows Credential Manager / macOS Keychain /
// Linux Secret Service）。当前阶段先隔离在独立模块，避免真实 Key 进入 AppSnapshot
// 或普通 settings.json。
pub const AI_SECRET_FILE: &str = "ai_secret.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiSecretFile {
    api_key: String,
}

pub fn secret_path(data_dir: &Path) -> PathBuf {
    data_dir.join(AI_SECRET_FILE)
}

pub fn save_api_key_to_path(path: &Path, api_key: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建 AI Key 目录失败: {error}"))?;
    }

    let secret = AiSecretFile {
        api_key: api_key.to_string(),
    };
    let body = serde_json::to_string_pretty(&secret)
        .map_err(|error| format!("序列化 AI Key 失败: {error}"))?;
    fs::write(path, format!("{body}\n")).map_err(|error| format!("保存 AI Key 失败: {error}"))
}

pub fn read_api_key_from_path(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(content) => {
            let secret: AiSecretFile = serde_json::from_str(&content)
                .map_err(|error| format!("读取 AI Key 失败: {error}"))?;
            if secret.api_key.trim().is_empty() {
                Ok(None)
            } else {
                Ok(Some(secret.api_key))
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取 AI Key 失败: {error}")),
    }
}

pub fn clear_api_key_at_path(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("清除 AI Key 失败: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_secret_path() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("ai-secret-test-{stamp}"))
            .join(AI_SECRET_FILE)
    }

    #[test]
    fn save_read_and_clear_api_key() {
        let path = temp_secret_path();

        save_api_key_to_path(&path, "test-api-key").unwrap();
        assert_eq!(
            read_api_key_from_path(&path).unwrap(),
            Some("test-api-key".to_string())
        );

        clear_api_key_at_path(&path).unwrap();
        assert_eq!(read_api_key_from_path(&path).unwrap(), None);

        if let Some(parent) = path.parent() {
            fs::remove_dir_all(parent).ok();
        }
    }
}
