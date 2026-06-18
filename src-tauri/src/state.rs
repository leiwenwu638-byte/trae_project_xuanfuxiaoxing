//! 应用运行时状态
//!
//! 在 `tauri::Builder::setup` 阶段同步加载三个 JSON 文件到内存，
//! 之后所有 command 直接读写内存并落盘，避免每次 invoke 都做文件 IO。
//! 并发安全用 `std::sync::Mutex`；写入持锁时间很短（一次 clone + 一次文件 IO）。
//!
//! 字段直接对应 `models.rs` 中的可序列化结构，
//! `AppSnapshot` 是只读视图，由 `commands.rs` 现场拼装，不缓存。
//!
//! 启动期默认值（与前端 `createDefaultHealthReminders` 对齐）：
//!   - `todos.json` 缺失 → 空 `BTreeMap`（无 todo）。
//!   - `reminders.json` 缺失 → 默认 3 条（久坐/喝水/护眼）。
//!   - `settings.json` 缺失 → `default_app_settings()`。

use std::sync::Mutex;

use chrono::Local;

use crate::models::{
    create_default_health_reminders, default_app_settings, AppSettings, HealthReminder, TodoStore,
};
use crate::storage::Storage;

pub struct AppState {
    pub storage: Storage,
    pub todo_store: Mutex<TodoStore>,
    pub reminders: Mutex<Vec<HealthReminder>>,
    pub settings: Mutex<AppSettings>,
}

impl AppState {
    /// 从 `data_dir` 加载三份 JSON。文件缺失时由 `Storage::read_json` 写默认。
    /// 启动期调用一次；失败直接 panic，让 main 进程挂掉，避免在不可用状态下服务。
    pub fn load(storage: Storage) -> Self {
        let todo_store = storage
            .read_json("todos.json", || TodoStore::new())
            .expect("failed to load todos.json");
        let reminders = storage
            .read_json("reminders.json", || {
                create_default_health_reminders(Local::now())
            })
            .expect("failed to load reminders.json");
        let settings = storage
            .read_json("settings.json", default_app_settings)
            .expect("failed to load settings.json");

        Self {
            storage,
            todo_store: Mutex::new(todo_store),
            reminders: Mutex::new(reminders),
            settings: Mutex::new(settings),
        }
    }

    /// 便捷锁 + clone + 落盘，command 末尾统一调用，避免每个 command 重复样板。
    pub fn persist_todos(&self, todos: &TodoStore) -> Result<(), crate::storage::StorageError> {
        self.storage.write_json("todos.json", todos)
    }

    pub fn persist_reminders(
        &self,
        reminders: &Vec<HealthReminder>,
    ) -> Result<(), crate::storage::StorageError> {
        self.storage.write_json("reminders.json", reminders)
    }

    pub fn persist_settings(
        &self,
        settings: &AppSettings,
    ) -> Result<(), crate::storage::StorageError> {
        self.storage.write_json("settings.json", settings)
    }
}
