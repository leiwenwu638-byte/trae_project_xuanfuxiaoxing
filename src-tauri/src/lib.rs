//! Tauri 2 入口
//!
//! 第四阶段：接通本地 JSON 存储。
//!   - 在 `setup` 阶段拿到 `app_data_dir()`，构造 `Storage` 并加载三份 JSON。
//!   - 通过 `tauri::Builder::manage` 注册 `AppState`，所有 `#[tauri::command]`
//!     通过 `tauri::State` 注入。
//!   - `invoke_handler!` 注册所有 storage / todo / reminder / settings command。
//!
//! 第五阶段：接入窗口管理 command。
//!   - `open_todo_window` / `open_health_window` / `show_reminder_popup`
//!     三个 command 用 `window_manager::open_or_focus_window` 创建 / 聚焦窗口；
//!     `show_reminder_popup` 会先把旧 reminder-popup 关闭再重建，
//!     保证每次 payload 都能被新窗口的 `initialization_script` 拿到。
//!   - `close_current_window` / `hide_current_window` 通过前端传入的 label
//!     操作指定窗口（前端通过 `getCurrentWindow().label` 拿当前 webview label）。
//!   - 窗口配置（label / title / url / size / 装饰 / 透明 / 置顶 / 跳过任务栏）
//!     全部集中在 `window_manager.rs::WindowKind`，避免散落在 commands 里的字面量。
//!   - capabilities/default.json 的 `windows` 字段已扩展为
//!     `["main", "todo", "health", "reminder-popup"]`，允许这些 webview
//!     调用 `core:event` 等核心能力。
//!
//! 第六阶段：调度器。
//!   - 启动 `tauri-scheduler` 后台线程，30s 一次 tick。
//!   - tick 决策全部落在 `scheduler::compute_tick` 纯函数（输入 today/todos/
//!     reminders/settings/now，输出更新后的 todos/reminders + 弹窗队列）。
//!   - 命中后调用 `window_manager::show_popup` 复用第五阶段的弹窗能力，
//!     状态变更后 `emit("state-changed", ...)` 推给前端。
//!   - 单 tick 至多展示 1 个新弹窗，多余的进 in-memory 队列下一 tick 继续消费。
//!
//! 第七阶段：系统托盘。
//!   - `tray::build_tray` 在 setup 阶段构建 TrayIcon + Menu。
//!   - 菜单项：今日计划 / 健康节律 / 显示提醒测试 / 退出。
//!   - 复用第五阶段 `window_manager` 处理窗口相关动作。
//!     "今日计划"通过 `open_todo_or_focus_main` 优先聚焦 main 窗口，
//!     避免与前端 invoke `open_todo_window` 产生双窗口。
//!   - 退出菜单点击：先 `Scheduler::stop()`，再 `app.exit(0)`。
//!   - main 窗口 `CloseRequested`：拦截 + `hide()`，让应用继续在托盘常驻；
//!     从托盘点"今日计划"可重新打开。
//!
//! 第八阶段（路线收尾）：取消悬浮球路线。
//!   - 悬浮球（FloatingBall）已**永久取消**。系统托盘作为应用唯一常驻入口。
//!   - `WindowKind` 不再有 `Ball` 变体；`App.tsx` 也不再路由 `view=ball`。
//!   - `settings.ball*` 字段保留是出于向后兼容老 settings.json
//!     （详见 `models.rs::GeneralSettings` 注释），后续清理需走数据迁移版本。
//!
//! 不包含（明确不在本项目范围）：
//!   - 通知（OS 级 Notification）— 仍用 ReminderPopup 代替
//!   - 悬浮球（**永久取消**；系统托盘作为唯一常驻入口）
//!   - AI 能力（下一阶段可能讨论）
//!
//! 数据契约：所有 command 返回的 JSON 字段名与前端 `src/shared/types.ts` 一致
//! （依赖 `models.rs` 的 `#[serde(rename_all = "camelCase")]`）。

mod commands;
mod models;
mod scheduler;
mod state;
mod storage;
mod tray;
mod window_manager;

use std::path::PathBuf;

use tauri::{Manager, WindowEvent};

use crate::scheduler::Scheduler;
use crate::state::AppState;
use crate::storage::Storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Tauri 2 app_data_dir：Windows 上是 `%APPDATA%\<bundleIdentifier>`。
            // 我们的 identifier 是 `com.xuanfuxiaoxing.desktop`，
            // 所以最终路径形如 `C:\Users\<u>\AppData\Roaming\com.xuanfuxiaoxing.desktop\`。
            let data_dir: PathBuf = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app_data_dir: {error}"))?;

            let storage = Storage::new(data_dir);
            // setup 是同步闭包，但底层需要做文件 IO。直接调用同步 std::fs，
            // 因为启动期仅执行一次，文件非常小，不会卡住主线程。
            let state = AppState::load(storage);

            app.manage(state);
            // 第六阶段：把 Scheduler 也 manage 起来，并在 setup 末尾启动后台线程。
            // 注意：Scheduler 实例必须先 manage 再 start，否则后台线程第一次 tick
            // 拿不到 AppState 引用，会直接 return（fail-soft）。
            let scheduler = Scheduler::new();
            scheduler.start(app.handle().clone());
            app.manage(scheduler);

            // 第七阶段：构建系统托盘。
            // 顺序：必须在 Scheduler 之后（tray 的"退出"菜单要能 stop Scheduler）。
            // tray 构建是同步的（tray API 不需要 main thread pump），直接调。
            // 失败不能 panic，让 build 继续；托盘缺失不至于让应用起不来。
            if let Err(error) = tray::build_tray(app.handle()) {
                eprintln!("[tray] failed to build tray: {error}");
            }
            Ok(())
        })
        // 第七阶段：拦截 main 窗口的 CloseRequested 事件。
        // 行为：prevent_close + hide，让应用继续在托盘常驻；
        // 其它窗口（todo / health / reminder-popup）的关闭走默认路径。
        // 必须在 setup 之后注册，依赖 Tauri 内部 `app.on_window_event`。
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // 阻止默认关闭，避免触发"all-closed 退应用"路径。
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        eprintln!("[tray] failed to hide main window on close: {error}");
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::list_todos,
            commands::add_todo,
            commands::update_todo,
            commands::toggle_todo,
            commands::delete_todo,
            commands::snooze_todo,
            commands::list_reminders,
            commands::add_reminder,
            commands::update_reminder,
            commands::delete_reminder,
            commands::toggle_reminder,
            commands::get_settings,
            commands::update_settings,
            // 第十二阶段：自定义提示音文件落盘。
            // 前端 `desktopApi.saveCustomSound(name, bytes)` → 把音频写到
            // `<app_data_dir>/sounds/<safe_name>`，返回真实绝对路径。
            // 路径随后被写入 `AppSettings.general.soundFilePath`。
            commands::save_custom_sound_file,
            // 第五阶段：窗口管理 command。
            // 之前在第四阶段没有注册，导致前端 invoke 这五个 command 时
            // 会被 Tauri 拒绝（"Command not found"）。现在显式列出：
            //   - open_todo_window / open_health_window：打开或聚焦业务窗口
            //   - show_reminder_popup：先关闭旧 reminder-popup，再以新 payload 重建
            //   - close_current_window / hide_current_window：按 label 操作当前窗口
            commands::open_todo_window,
            commands::open_health_window,
            commands::show_reminder_popup,
            commands::close_current_window,
            commands::show_current_window,
            commands::hide_current_window,
            // 第六阶段：调度器观察 command。
            // 调度器自身在 setup 阶段自动启动，start/stop 仅作为可选的
            // 调试 / 暂停入口暴露给前端。React 组件**禁止**直接 invoke，
            // 必须经过 `desktopApi.scheduler` 包装。
            commands::get_scheduler_status,
            commands::start_scheduler,
            commands::stop_scheduler,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
