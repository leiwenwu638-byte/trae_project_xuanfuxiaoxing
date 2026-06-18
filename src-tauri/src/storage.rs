//! 本地 JSON 存储
//!
//! 设计目标：
//!   1. 数据保存在 Tauri `app_data_dir()` 下，不污染项目源码。
//!   2. 文件名固定为 `todos.json` / `reminders.json` / `settings.json`。
//!   3. 写入采用「临时文件 + rename」的原子写模式，避免半写状态。
//!   4. 读取时 JSON 损坏 → 备份为 `<name>.corrupt-<ms>` → 写默认值 → 返回默认值。
//!   5. 文件不存在 → 写默认值 → 返回默认值。
//!
//! 业务层通过调用方传入的 `default` 闭包决定缺失/损坏时的初值；
//! storage.rs 不耦合具体业务默认值（避免越权改 shared/defaults.ts 的语义）。

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{de::DeserializeOwned, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type StorageResult<T> = Result<T, StorageError>;

/// 单个应用数据目录下的 JSON 存储。
/// 本身不持锁；并发安全由上层的 `AppState`（`Mutex<...>`）保证。
#[derive(Debug, Clone)]
pub struct Storage {
    data_dir: PathBuf,
}

impl Storage {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// 确保数据目录存在（递归创建）。
    pub fn ensure_dir(&self) -> StorageResult<()> {
        if !self.data_dir.exists() {
            fs::create_dir_all(&self.data_dir)?;
        }
        Ok(())
    }

    /// 读取 JSON 文件。
    ///   - 文件不存在 → 写默认 → 返回默认。
    ///   - JSON 解析失败 → 备份为 corrupt → 写默认 → 返回默认。
    ///   - 成功 → 返回解析结果。
    pub fn read_json<T, F>(&self, file_name: &str, make_default: F) -> StorageResult<T>
    where
        T: Serialize + DeserializeOwned,
        F: FnOnce() -> T,
    {
        self.ensure_dir()?;
        let path = self.data_dir.join(file_name);

        match fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<T>(&content) {
                Ok(value) => Ok(value),
                Err(_) => {
                    // 损坏：备份 + 写默认 + 返回默认
                    self.backup_corrupt(&path)?;
                    let default = make_default();
                    self.write_json(file_name, &default)?;
                    Ok(default)
                }
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let default = make_default();
                self.write_json(file_name, &default)?;
                Ok(default)
            }
            Err(error) => Err(StorageError::Io(error)),
        }
    }

    /// 原子写入：先写 `<file>.tmp`，再 `rename` 到 `<file>`。
    /// 同一目录下 rename 是原子的（POSIX 语义；Windows NTFS 也支持）。
    pub fn write_json<T: Serialize>(&self, file_name: &str, value: &T) -> StorageResult<()> {
        self.ensure_dir()?;
        let path = self.data_dir.join(file_name);
        let tmp_path = tmp_path_for(&path);

        let body = serde_json::to_string_pretty(value)?;
        // 末尾加换行，方便 `cat` / Git diff。
        fs::write(&tmp_path, format!("{body}\n"))?;
        // rename 在 Windows 上若目标已存在会覆盖；fs::rename 在 Windows 上行为等同 MoveFileEx + MOVEFILE_REPLACE_EXISTING。
        fs::rename(&tmp_path, &path)?;
        Ok(())
    }

    /// 把损坏的文件重命名为 `<name>.corrupt-<unix_ms>`。
    /// 若文件已不存在（极端竞态），视为成功。
    fn backup_corrupt(&self, path: &Path) -> StorageResult<()> {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let backup = corrupt_backup_path(path, stamp);
        match fs::rename(path, &backup) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(StorageError::Io(error)),
        }
    }
}

/// 构造 `<name>.tmp` 路径。`<name>.json` → `<name>.json.tmp`。
fn tmp_path_for(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".to_string());
    path.with_file_name(format!("{file_name}.tmp"))
}

/// 构造 `<name>.corrupt-<ms>` 路径。
/// 例如 `settings.json` → `settings.json.corrupt-1718600000000`。
fn corrupt_backup_path(path: &Path, stamp_ms: u128) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".to_string());
    path.with_file_name(format!("{file_name}.corrupt-{stamp_ms}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{create_default_health_reminders, HealthReminder};
    use chrono::Local;
    use std::collections::BTreeMap;
    use std::env;

    fn temp_dir(suffix: &str) -> PathBuf {
        let mut dir = env::temp_dir();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        dir.push(format!("tauri-storage-test-{suffix}-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_and_read_roundtrip() {
        let dir = temp_dir("roundtrip");
        let storage = Storage::new(dir.clone());
        let mut data: BTreeMap<String, Vec<String>> = BTreeMap::new();
        data.insert("k".to_string(), vec!["a".to_string(), "b".to_string()]);

        storage.write_json("sample.json", &data).unwrap();
        let loaded: BTreeMap<String, Vec<String>> =
            storage.read_json("sample.json", BTreeMap::new).unwrap();
        assert_eq!(loaded, data);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn missing_file_writes_default() {
        let dir = temp_dir("missing");
        let storage = Storage::new(dir.clone());
        let loaded: BTreeMap<String, Vec<String>> =
            storage.read_json("never.json", BTreeMap::new).unwrap();
        assert!(loaded.is_empty());
        assert!(dir.join("never.json").exists());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn corrupt_file_backs_up_and_writes_default() {
        let dir = temp_dir("corrupt");
        fs::write(dir.join("broken.json"), "{not valid").unwrap();
        let storage = Storage::new(dir.clone());

        let loaded: BTreeMap<String, Vec<String>> =
            storage.read_json("broken.json", BTreeMap::new).unwrap();
        assert!(loaded.is_empty());

        let names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.iter().any(|n| n.starts_with("broken.json.corrupt-")));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn missing_reminders_file_seeds_three_defaults() {
        // 关键测试：reminders.json 缺失时必须写入并返回默认 3 条，
        // 与前端 createDefaultHealthReminders 行为一致。
        let dir = temp_dir("reminders-default");
        let storage = Storage::new(dir.clone());
        assert!(!dir.join("reminders.json").exists());

        let loaded: Vec<HealthReminder> = storage
            .read_json("reminders.json", || {
                create_default_health_reminders(Local::now())
            })
            .unwrap();
        assert_eq!(loaded.len(), 3, "首次启动时 reminders 必须有 3 条默认");
        let names: Vec<&str> = loaded.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"久坐站起"));
        assert!(names.contains(&"定时喝水"));
        assert!(names.contains(&"护眼休息"));

        // 文件已经写盘
        assert!(dir.join("reminders.json").exists());

        // 重新读取应得到相同的 3 条
        let reloaded: Vec<HealthReminder> = storage.read_json("reminders.json", Vec::new).unwrap();
        assert_eq!(reloaded.len(), 3);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn missing_reminders_file_persists_across_storage_instances() {
        // 模拟重启：第一次 storage 缺失场景写入；第二次 new 一个新 storage 再读 → 仍能看到 3 条。
        let dir = temp_dir("reminders-restart");
        {
            let storage = Storage::new(dir.clone());
            let _: Vec<HealthReminder> = storage
                .read_json("reminders.json", || {
                    create_default_health_reminders(Local::now())
                })
                .unwrap();
        }
        {
            let storage = Storage::new(dir.clone());
            let reloaded: Vec<HealthReminder> =
                storage.read_json("reminders.json", Vec::new).unwrap();
            assert_eq!(reloaded.len(), 3);
        }
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn tmp_path_keeps_extension_and_appends_tmp() {
        let p = Path::new("/x/y/todos.json");
        assert_eq!(tmp_path_for(p), Path::new("/x/y/todos.json.tmp"));
    }

    #[test]
    fn corrupt_backup_path_includes_timestamp() {
        let p = Path::new("/x/y/settings.json");
        let out = corrupt_backup_path(p, 12345);
        assert_eq!(out, Path::new("/x/y/settings.json.corrupt-12345"));
    }
}
