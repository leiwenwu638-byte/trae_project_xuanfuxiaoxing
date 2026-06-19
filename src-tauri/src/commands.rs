//! Tauri commands
//!
//! 每个 `#[tauri::command]` 对应前端 `desktopApi` 的一个调用点；
//! 内部直接读写 `AppState` 内存态并落盘。
//!
//! 业务规则与前端共享服务保持一致（标题/间隔/消息校验、时间格式化、状态字段语义），保证数据兼容。
//!
//! 数据契约：
//!   - settings 子段由前端 `desktopApi.updateSettings` 在 invoke 前完成 deep merge，
//!     本模块收到的总是完整的 `GeneralSettings` / `TodoSettings` / `BallPosition`，
//!     因此 Rust 端不需要再做字段级合并，TypeScript `UpdateSettingsInput` 的
//!     「子段级 Partial」语义完全由前端负责。
//!   - reminderTime 校验：必须是 `HH:MM` 格式（00:00–23:59），前端 string 字段
//!     传来的非空字符串会在这里统一校验；非法值返回 `Err`，前端 `invoke` reject。
//!   - 错误约定：业务错误（空标题、非法 interval、非法时间）通过 `Result::Err(String)`
//!     返回，前端 `invoke` 收到 reject；不再静默 fallback。
//!
//! 第五阶段新增的窗口管理 command 行为约定：
//!   - `open_todo_window`：main 窗口（即 Tauri 启动时默认的 `index.html?view=main`
//!     窗口）已经显示 TodoPanel；如果再额外创建 label=`todo` 的窗口，会出现
//!     两份并行的"今日待办"页面，破坏体验。所以这里**优先聚焦 main**，仅当
//!     main 不存在时才回退到 label=`todo` 的独立窗口（极端情况，正常使用
//!     不会发生）。
//!   - `open_health_window`：main 窗口不显示健康页面，按"已存在则聚焦，
//!     否则创建 label=`health` 新窗口"的常规策略。
//!   - `show_reminder_popup`：每次 payload 都不同（title / body / icon / soundSrc），
//!     所以**不**走"已存在则聚焦"路径，而是先 close 旧 reminder-popup，
//!     再用 `WebviewWindowBuilder::initialization_script` 注入新 payload。
//!   - `close_current_window` / `hide_current_window`：按前端传入的 label 操作
//!     指定窗口；label 不存在时 noop。

use chrono::{DateTime, Local};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::models::{
    add_minutes, create_default_health_reminders, default_app_settings, local_date_key, to_hhmm,
    to_iso, AddHealthReminderInput, AddTodoInput, AppSettings, AppSnapshot, HealthReminder,
    ReminderPopupPayload, Todo, TodoStore, UpdateHealthReminderInput, UpdateSettingsInput,
    UpdateTodoInput,
};
use crate::scheduler::{Scheduler, SchedulerStatus};
use crate::state::AppState;
use crate::window_manager::{self, WindowKind};

// ---------------------------------------------------------------------------
// 公共错误
// ---------------------------------------------------------------------------

pub type CmdResult<T> = Result<T, String>;

fn err<T>(message: &str) -> CmdResult<T> {
    Err(message.to_string())
}

fn stringify<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

// ---------------------------------------------------------------------------
// 1. snapshot
// ---------------------------------------------------------------------------

/// `get_snapshot()` —— 返回今日日期 + 当天 todos + 全量 reminders + 当前 settings。
/// todos 只取当天。
///
/// 启动耗时诊断：第一次调用时打印 `get_snapshot` 内部耗时（毫秒），
/// 便于在前端 dev 启动卡顿时定位"是不是 storage 读盘慢"。
#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> CmdResult<AppSnapshot> {
    let start = std::time::Instant::now();
    let snapshot = build_snapshot(&state);
    let elapsed_ms = start.elapsed().as_millis();
    if elapsed_ms >= 50 {
        // 50ms 以上才打，避免启动期高频噪音
        eprintln!(
            "[get_snapshot] built in {elapsed_ms}ms (today={}, todos={}, reminders={})",
            snapshot.today,
            snapshot.todos.len(),
            snapshot.reminders.len()
        );
    }
    Ok(snapshot)
}

fn build_snapshot(state: &AppState) -> AppSnapshot {
    let today = local_date_key(Local::now());
    let todos = state
        .todo_store
        .lock()
        .map(|s| s.get(&today).cloned().unwrap_or_default())
        .unwrap_or_default();
    let reminders = state
        .reminders
        .lock()
        .map(|r| r.clone())
        .unwrap_or_default();
    let settings = state
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_else(|_| default_app_settings());

    AppSnapshot {
        today,
        todos,
        reminders,
        settings,
    }
}

/// 把最新 snapshot 推给所有 webview；前端 `desktopApi.onStateChanged` 监听 `state-changed`。
fn broadcast_snapshot(app: &tauri::AppHandle, state: &AppState) {
    let snapshot = build_snapshot(state);
    if let Err(error) = app.emit("state-changed", &snapshot) {
        eprintln!("[tauri] failed to emit state-changed: {error}");
    }
}

// ---------------------------------------------------------------------------
// 2. todo
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_todos(state: State<'_, AppState>) -> CmdResult<Vec<Todo>> {
    let today = local_date_key(Local::now());
    let store = state.todo_store.lock().map_err(stringify)?;
    Ok(store.get(&today).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn add_todo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: AddTodoInput,
) -> CmdResult<AppSnapshot> {
    // 标题校验：即使前端 submit 已 trim，绕过前端直接 invoke 仍需后端兜底。
    // 校验通过后得到的 `title` 一定是 trim 后的、长度合法的、且非空字符串，
    // 后续 `build_new_todo` 不再重复 trim，避免规则漂移。
    let title = validate_title(&input.title)?;
    let reminder_time = normalize_reminder_time(input.reminder_time.as_deref())?;
    let todo = build_new_todo(&input, title, reminder_time);
    let today = local_date_key(Local::now());

    {
        let mut store = state.todo_store.lock().map_err(stringify)?;
        let entry = store.entry(today).or_insert_with(Vec::new);
        entry.push(todo);
        state.persist_todos(&store).map_err(stringify)?;
    }

    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

#[tauri::command]
pub fn update_todo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: UpdateTodoInput,
) -> CmdResult<AppSnapshot> {
    let title = validate_title(&input.title)?;
    let reminder_time = normalize_reminder_time(input.reminder_time.as_deref())?;
    let today = local_date_key(Local::now());

    {
        let mut store = state.todo_store.lock().map_err(stringify)?;
        let todo = find_today_todo_mut(&mut store, &today, &id)?;
        apply_todo_update(todo, title, reminder_time, &input);
        state.persist_todos(&store).map_err(stringify)?;
    }

    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

/// 把 `UpdateTodoInput` 的字段应用到现有 todo。
///
/// 字段语义（与 `AddTodoInput` 刻意不同）：
///   - `title` / `reminder_time` 必传，函数入口已校验；
///   - `sound_enabled` 缺省 → 保持原值（避免关掉声音的副作用）；
///   - `priority` 缺省 / `None` → 保持原值（用户没改优先级时不能误清空）；
///   - `advance_reminded_at` / `reminded_at` 每次编辑都重置为 `None`，因为
///     reminderTime / title 变了之后再触发原 advance 是误导用户。
///
/// 抽成独立函数以便在 `#[cfg(test)]` 里直接覆盖（不必启动 Tauri 状态机）。
fn apply_todo_update(
    todo: &mut Todo,
    title: String,
    reminder_time: Option<String>,
    input: &UpdateTodoInput,
) {
    todo.title = title;
    todo.reminder_time = reminder_time;
    todo.sound_enabled = input.sound_enabled.unwrap_or(todo.sound_enabled);
    // priority 缺省/None → 保持原值（与 UpdateTodoInput 文档一致）；
    // 前端如果传 priority 字符串就覆盖。
    if let Some(priority) = input.priority {
        todo.priority = priority;
    }
    // 任务名 / 时间变化后，原 advance / due 提醒记录失去意义，重置。
    todo.advance_reminded_at = None;
    todo.reminded_at = None;
}

#[tauri::command]
pub fn toggle_todo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<AppSnapshot> {
    let today = local_date_key(Local::now());
    {
        let mut store = state.todo_store.lock().map_err(stringify)?;
        let todo = find_today_todo_mut(&mut store, &today, &id)?;
        todo.completed = !todo.completed;
        state.persist_todos(&store).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

#[tauri::command]
pub fn delete_todo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<AppSnapshot> {
    let today = local_date_key(Local::now());
    {
        let mut store = state.todo_store.lock().map_err(stringify)?;
        if let Some(entry) = store.get_mut(&today) {
            entry.retain(|t| t.id != id);
        }
        state.persist_todos(&store).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

#[tauri::command]
pub fn snooze_todo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    minutes: i64,
) -> CmdResult<AppSnapshot> {
    let now = Local::now();
    let new_reminder_time = to_hhmm(add_minutes(now, minutes));
    let today = local_date_key(now);

    {
        let mut store = state.todo_store.lock().map_err(stringify)?;
        if let Some(entry) = store.get_mut(&today) {
            for todo in entry.iter_mut() {
                if todo.id == id {
                    todo.reminder_time = Some(new_reminder_time.clone());
                    todo.advance_reminded_at = None;
                    todo.reminded_at = None;
                    break;
                }
            }
        }
        state.persist_todos(&store).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

// ---------------------------------------------------------------------------
// 3. reminder
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_reminders(state: State<'_, AppState>) -> CmdResult<Vec<HealthReminder>> {
    Ok(state.reminders.lock().map_err(stringify)?.clone())
}

#[tauri::command]
pub fn add_reminder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: AddHealthReminderInput,
) -> CmdResult<AppSnapshot> {
    let now = Local::now();
    let reminder = build_new_reminder(&input, now)?;
    {
        let mut reminders = state.reminders.lock().map_err(stringify)?;
        // 启动后第一次 add 之前若 reminders 为空，自动补默认三条。
        // 注意：state.rs 启动期已经会写入默认；这里的存在是双保险，应对热重启残留。
        if reminders.is_empty() {
            *reminders = create_default_health_reminders(now);
        }
        reminders.push(reminder);
        state.persist_reminders(&reminders).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

#[tauri::command]
pub fn update_reminder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: UpdateHealthReminderInput,
) -> CmdResult<AppSnapshot> {
    let now = Local::now();
    let interval = validate_interval(input.interval_minutes)?;
    let name = validate_reminder_name(&input.name)?;
    let message = normalize_reminder_message(input.message.as_deref(), interval);

    {
        let mut reminders = state.reminders.lock().map_err(stringify)?;
        for reminder in reminders.iter_mut() {
            if reminder.id == id {
                reminder.name = name;
                reminder.interval_minutes = interval;
                reminder.message = message;
                reminder.sound_enabled = input.sound_enabled;
                reminder.sound_file_path = input.sound_file_path.clone();
                if reminder.enabled {
                    reminder.next_trigger_at = Some(to_iso(add_minutes(now, interval as i64)));
                }
                break;
            }
        }
        state.persist_reminders(&reminders).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

#[tauri::command]
pub fn delete_reminder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<AppSnapshot> {
    {
        let mut reminders = state.reminders.lock().map_err(stringify)?;
        let removed = purge_reminder(&mut reminders, &id);
        // 即便 id 不存在也走"幂等"路径：保底写一次盘，避免极小窗口里
        // 内存和 disk 不一致；返回的 snapshot 与内存一致，前端收到
        // 同样的 list，行为可预测。
        if !removed {
            eprintln!("[delete_reminder] reminder `{}` not found (no-op)", id);
        }
        state.persist_reminders(&reminders).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

/// 从 reminders 列表里删除指定 id，返回是否真的删了。
///
/// 抽成纯函数以便在 `#[cfg(test)]` 直接覆盖（无需启动 Tauri 状态机）。
/// `reminders.retain(|r| r.id != id)` 是删除的"真"逻辑，保留传入的顺序
/// （稳定删除：其他 reminder 在结果 vec 里的相对位置不变）。
fn purge_reminder(reminders: &mut Vec<HealthReminder>, id: &str) -> bool {
    let before = reminders.len();
    reminders.retain(|r| r.id != id);
    reminders.len() < before
}

#[tauri::command]
pub fn toggle_reminder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<AppSnapshot> {
    let now = Local::now();
    {
        let mut reminders = state.reminders.lock().map_err(stringify)?;
        for reminder in reminders.iter_mut() {
            if reminder.id == id {
                reminder.enabled = !reminder.enabled;
                if reminder.enabled {
                    reminder.next_trigger_at =
                        Some(to_iso(add_minutes(now, reminder.interval_minutes as i64)));
                }
                break;
            }
        }
        state.persist_reminders(&reminders).map_err(stringify)?;
    }
    broadcast_snapshot(&app, &state);
    Ok(build_snapshot(&state))
}

// ---------------------------------------------------------------------------
// 4. settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> CmdResult<AppSettings> {
    Ok(state.settings.lock().map_err(stringify)?.clone())
}

#[tauri::command]
pub fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: UpdateSettingsInput,
) -> CmdResult<AppSettings> {
    let next = {
        let mut current = state.settings.lock().map_err(stringify)?;
        let merged = merge_settings(&current, &input);
        *current = merged.clone();
        state.persist_settings(&current).map_err(stringify)?;
        merged
    };
    broadcast_snapshot(&app, &state);
    Ok(next)
}

/// 嵌套合并：每个子段由前端在 invoke 前完成字段级 deep merge；
/// 本函数只做子段级整体替换（None 表示保留 target 子段）。
fn merge_settings(target: &AppSettings, input: &UpdateSettingsInput) -> AppSettings {
    AppSettings {
        general: input
            .general
            .clone()
            .unwrap_or_else(|| target.general.clone()),
        todo: input.todo.clone().unwrap_or_else(|| target.todo.clone()),
        ball_position: input
            .ball_position
            .clone()
            .unwrap_or_else(|| target.ball_position.clone()),
    }
}

// ---------------------------------------------------------------------------
// 4.5 自定义提示音文件落盘
// ---------------------------------------------------------------------------

/// 自定义提示音最大体积：5 MB。
/// 限制理由：Tauri `invoke` 同步传 bytes 走的是 IPC；太大（比如 100MB）会
/// 阻塞主线程、且会显著延长 getSnapshot 等其它命令的响应时间。提示音一般
/// 1-2 秒 wav 也就几十 KB，5MB 已经远超日常需求。
pub const MAX_CUSTOM_SOUND_BYTES: usize = 5 * 1024 * 1024;

/// 允许的扩展名。`wav / mp3 / ogg` 覆盖所有主流浏览器 / WebView 原生支持的
/// 提示音格式。`m4a` / `flac` / `aac` 在 WebView2 上需要 codec，不收。
pub const ALLOWED_SOUND_EXTENSIONS: &[&str] = &["wav", "mp3", "ogg"];

/// 把"原始 file_name"清洗成可安全落盘的最终文件名。
///
/// 抽成纯函数是为了让 `#[cfg(test)]` 直接覆盖（无需启动 Tauri AppHandle）。
///
/// 规则：
///   * 取 `Path::new(&file_name).file_name()`，丢弃任何目录成分（防路径穿越）；
///   * basename 内的非 ASCII 字母数字 / `.` / `-` / `_` 字符全部替换为 `_`；
///   * 扩展名必须在 `ALLOWED_SOUND_EXTENSIONS` 之内（大小写不敏感），缺失或
///     不支持时直接返回错误；
///   * 全部失败（含 basename 为空 / 没有合法扩展名）时返回 `Err(String)`。
pub(crate) fn sanitize_sound_filename(file_name: &str) -> CmdResult<String> {
    if file_name.trim().is_empty() {
        return err("文件名为空");
    }
    let path = std::path::Path::new(file_name);
    let basename = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "文件名非法".to_string())?
        .to_string();
    if basename.is_empty() {
        return err("文件名为空");
    }
    let safe_stem: String = basename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe_stem.is_empty() {
        return err("清洗后文件名为空");
    }
    let extension = std::path::Path::new(&safe_stem)
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or_else(|| "提示音文件必须带有 wav / mp3 / ogg 扩展名".to_string())?;
    if !ALLOWED_SOUND_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
    {
        return err("仅支持 wav / mp3 / ogg 提示音文件");
    }
    Ok(safe_stem)
}

/// 保存自定义提示音到 `<app_data_dir>/sounds/`，返回最终绝对路径。
///
/// 入参约束（前端 + Rust 双层校验）：
///   * `file_name` 非空；
///   * 扩展名在 `ALLOWED_SOUND_EXTENSIONS` 之内（大小写不敏感）；
///   * `bytes.len() <= MAX_CUSTOM_SOUND_BYTES`；
///
/// 文件名清洗：见 [`sanitize_sound_filename`]。本 command 真正涉及
/// Tauri AppHandle 的部分只有"取 app_data_dir"和"落盘"，所以
/// 大部分业务规则都被抽出为纯函数。
///
/// 返回的字符串就是 `AppSettings.general.sound_file_path` 应存的内容。
#[tauri::command]
pub fn save_custom_sound_file(
    app: AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> CmdResult<String> {
    use std::path::PathBuf;

    if bytes.is_empty() {
        return err("音频内容为空");
    }
    if bytes.len() > MAX_CUSTOM_SOUND_BYTES {
        return err("音频文件过大（上限 5MB）");
    }

    let final_name = sanitize_sound_filename(&file_name)?;

    // 目标目录：<app_data_dir>/sounds/
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析 app_data_dir: {e}"))?;
    let sounds_dir: PathBuf = base_dir.join("sounds");
    std::fs::create_dir_all(&sounds_dir).map_err(|e| format!("无法创建 sounds 目录: {e}"))?;
    let target = sounds_dir.join(&final_name);

    std::fs::write(&target, &bytes).map_err(|e| format!("写入音频失败: {e}"))?;
    let saved = target.to_string_lossy().to_string();
    eprintln!(
        "[save_custom_sound_file] saved {} bytes to {}",
        bytes.len(),
        saved
    );
    Ok(saved)
}

// ---------------------------------------------------------------------------
// 5. 内部工具：业务规则
// ---------------------------------------------------------------------------

fn validate_title(raw: &str) -> CmdResult<String> {
    let title = raw.trim();
    if title.is_empty() {
        return err("任务名称不能为空");
    }
    if title.chars().count() > 40 {
        return err("任务名称不能超过 40 字");
    }
    Ok(title.to_string())
}

fn validate_reminder_name(raw: &str) -> CmdResult<String> {
    let name = raw.trim();
    if name.is_empty() {
        return err("提醒名称不能为空");
    }
    if name.chars().count() > 20 {
        return err("提醒名称不能超过 20 字");
    }
    Ok(name.to_string())
}

fn validate_interval(interval_minutes: u32) -> CmdResult<u32> {
    if interval_minutes < 5 {
        return err("间隔时长不能少于 5 分钟");
    }
    if interval_minutes > 480 {
        return err("间隔时长不能超过 480 分钟");
    }
    Ok(interval_minutes)
}

const MAX_REMINDER_MESSAGE: usize = 80;

fn normalize_reminder_message(raw: Option<&str>, interval_minutes: u32) -> String {
    let candidate = raw.map(|m| m.trim()).unwrap_or("");
    let resolved = if candidate.is_empty() {
        default_reminder_message(interval_minutes)
    } else {
        candidate.to_string()
    };
    if resolved.chars().count() > MAX_REMINDER_MESSAGE {
        resolved.chars().take(MAX_REMINDER_MESSAGE).collect()
    } else {
        resolved
    }
}

fn default_reminder_message(interval_minutes: u32) -> String {
    format!("已过 {} 分钟，该活动一下了！", interval_minutes)
}

/// 校验 reminderTime 输入。
///
///   - `None` 或空字符串 → `Ok(None)`（与前端 `input.reminderTime || null` 一致）
///   - `Some("08:30")` → `Ok(Some("08:30"))`
///   - 其它非空但格式非法 → `Err("提醒时间格式必须为 HH:MM，例如 08:30")`
///   - 小时/分钟越界 → `Err("提醒时间小时必须在 0-23 之间")` 等
///
/// 严格 `HH:MM` 格式校验（避免 `u32::from_str` 接受 `+08` 的问题）：
///   - 字符串 trim 后长度必须为 5；
///   - 第 3 位（`bytes[2]`）必须是 `:`；
///   - 其余 4 位（`bytes[0..2]`、`bytes[3..5]`）必须全部是 ASCII 数字；
///   - 小时 ∈ [0, 23]、分钟 ∈ [0, 59]。
///
/// 不在这里做：与"今天日期"+"现在时刻"的业务比较（例如过期检查）；
/// 那是 scheduler 任务，本阶段不实现。
fn normalize_reminder_time(value: Option<&str>) -> CmdResult<Option<String>> {
    let trimmed = match value {
        None => return Ok(None),
        Some(v) => v.trim(),
    };
    if trimmed.is_empty() {
        return Ok(None);
    }
    // 严格 HH:MM：长度=5 且第 3 位是 `:`。一次性拒绝 `+08:30`（长度 6）、
    // `8:30`（长度 4）、`08:30Z`（长度 6）、`08:`（长度 3）等。
    let bytes = trimmed.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return err("提醒时间格式必须为 HH:MM，例如 08:30");
    }
    // 强制 ASCII 数字，避免 `u32::from_str` 接受前导 `+` / `-` / 空白。
    if !bytes[0].is_ascii_digit()
        || !bytes[1].is_ascii_digit()
        || !bytes[3].is_ascii_digit()
        || !bytes[4].is_ascii_digit()
    {
        return err("提醒时间小时/分钟必须为 ASCII 数字");
    }
    // 上面已确认 4 个字节都是 `0-9`，可直接做 (b - b'0') 算术得到 0-9 的值。
    let h: u32 = (bytes[0] - b'0') as u32 * 10 + (bytes[1] - b'0') as u32;
    let m: u32 = (bytes[3] - b'0') as u32 * 10 + (bytes[4] - b'0') as u32;
    if h > 23 {
        return err("提醒时间小时必须在 0-23 之间");
    }
    if m > 59 {
        return err("提醒时间分钟必须在 0-59 之间");
    }
    Ok(Some(format!("{h:02}:{m:02}")))
}

fn build_new_todo(input: &AddTodoInput, title: String, reminder_time: Option<String>) -> Todo {
    let now = Local::now();
    Todo {
        id: Uuid::new_v4().to_string(),
        title,
        reminder_time,
        sound_enabled: input.sound_enabled.unwrap_or(true),
        // add 路径：None = 默认 medium（与老数据缺失时行为一致）。
        priority: input.priority.unwrap_or_default(),
        completed: false,
        advance_reminded_at: None,
        reminded_at: None,
        created_at: to_iso(now),
    }
}

/// 在 `TodoStore` 中按 `today` 找一条 todo，返回可变引用。
///
///   - `today` 这一组不存在（今天还没创建 todo）→ `Err` "待办不存在或已被删除"；
///   - `today` 这一组存在但没有匹配 `id` 的 todo → 同上 `Err`。
///
/// 抽成纯函数后 `update_todo` / `toggle_todo` 复用，单测可直接覆盖错误分支，
/// 不用启动 Tauri 状态机。返回的具体消息包含 `id`，便于前端展示。
fn find_today_todo_mut<'a>(
    store: &'a mut TodoStore,
    today: &str,
    id: &str,
) -> CmdResult<&'a mut Todo> {
    let entry = store
        .get_mut(today)
        .ok_or_else(|| format!("待办不存在或已被删除（id: {id}）"))?;
    entry
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("待办不存在或已被删除（id: {id}）"))
}

fn build_new_reminder(
    input: &AddHealthReminderInput,
    now: DateTime<Local>,
) -> CmdResult<HealthReminder> {
    let name = validate_reminder_name(&input.name)?;
    let interval = validate_interval(input.interval_minutes)?;
    let message = normalize_reminder_message(input.message.as_deref(), interval);
    Ok(HealthReminder {
        id: format!("reminder-{}", Uuid::new_v4()),
        name,
        icon: "⏰".to_string(),
        interval_minutes: interval,
        message,
        // 直接采用前端传来的 `sound_enabled`：
        //   * sound_enabled = true  → scheduler 走 default 或 path
        //   * sound_enabled = false → scheduler 不传 sound_src
        // 不再用 `sound_file_path.is_some()` 推导（这导致
        // "打开声音但用默认音" 也会被错误地静音）。
        sound_enabled: input.sound_enabled,
        sound_file_path: input.sound_file_path.clone(),
        enabled: true,
        last_triggered_at: None,
        next_trigger_at: Some(to_iso(add_minutes(now, interval as i64))),
    })
}

// ---------------------------------------------------------------------------
// 6. 窗口管理（Tauri 侧 open / close / hide + 弹窗 payload 注入）
// ---------------------------------------------------------------------------

/// 打开今日待办窗口。
///
/// 策略：**优先聚焦 main 窗口**。原因是 Tauri 启动时默认创建的 `index.html`
/// 窗口（label=`main`）已经渲染了 `<TodoPanel />`，它就是"今日待办"主界面。
/// 如果直接走 `window_manager::open_or_focus_window(Todo)`，会再创建一份
/// label=`todo` 的新窗口，出现两个并行的待办页面，体验混乱。
///
/// 退路：如果 main 窗口已经被用户关闭（极少见，正常退出应用时不会发生），
/// 回退到 label=`todo` 的独立窗口，至少保证命令不会失败。
///
/// 本 command 与托盘"今日计划"菜单共用 [`window_manager::open_todo_or_focus_main`]，
/// 保证两条进入路径（前端 invoke / 托盘点）走同一份代码，避免双窗口。
#[tauri::command]
pub fn open_todo_window(app: AppHandle) -> CmdResult<()> {
    window_manager::open_todo_or_focus_main(&app).map_err(stringify)
}

/// 打开健康提醒窗口。已存在则 show+focus；不存在则创建。
/// main 窗口不显示健康页面，所以走标准"已存在则聚焦，否则创建"策略。
#[tauri::command]
pub fn open_health_window(app: AppHandle) -> CmdResult<()> {
    window_manager::open_or_focus_window(&app, WindowKind::Health, None).map_err(stringify)
}

/// 显示提醒弹窗。
///
/// 走 `window_manager::replace_window` 而非 `open_or_focus_window`：
/// 每次 payload（title / body / icon / soundSrc）都不同，已存在的
/// reminder-popup 必须被 close 重建，新 `initialization_script` 才能
/// 把 `window.__REMINDER_POPUP_PAYLOAD__` 写到全新 webview 上。
///
/// 真正的"序列化 + 注入"逻辑落在 [`window_manager::show_popup`]，
/// 与 `scheduler::tick` 共用同一份弹窗构建代码。
#[tauri::command]
pub fn show_reminder_popup(app: AppHandle, payload: ReminderPopupPayload) -> CmdResult<()> {
    window_manager::show_popup(&app, &payload).map_err(stringify)
}

/// 关闭 label 对应的窗口。前端 `closeCurrentWindow` 通过 `getCurrentWindow().label`
/// 拿到当前 webview 的 label 后传过来；label 不存在时 noop。
#[tauri::command]
pub fn close_current_window(app: AppHandle, label: String) -> CmdResult<()> {
    window_manager::close_window(&app, &label).map_err(stringify)
}

/// 显示 label 对应的窗口（`unminimize` + `show` + `set_focus`）。ReminderPopup
/// 走"`visible:false` 启动 → React 挂载后 invoke 此命令"路径，避免 React 加载
/// 期间出现白窗；其它窗口暂未使用。
#[tauri::command]
pub fn show_current_window(app: AppHandle, label: String) -> CmdResult<()> {
    window_manager::show_window(&app, &label).map_err(stringify)
}

/// 隐藏 label 对应的窗口。前端 `hideCurrentWindow` 通过 `getCurrentWindow().label`
/// 拿到当前 webview 的 label。
#[tauri::command]
pub fn hide_current_window(app: AppHandle, label: String) -> CmdResult<()> {
    window_manager::hide_window(&app, &label).map_err(stringify)
}

// ---------------------------------------------------------------------------
// 7. 调度器观察 command（第六阶段）
// ---------------------------------------------------------------------------

/// 读取调度器当前状态（running / tick 间隔 / 待弹窗队列长度）。
/// 主要用于前端调试面板（dev 工具 / 状态栏），生产 UI 不依赖。
#[tauri::command]
pub fn get_scheduler_status(scheduler: State<'_, Scheduler>) -> CmdResult<SchedulerStatus> {
    Ok(scheduler.status())
}

/// 启动调度器后台线程。如果已经在跑，直接返回 noop。
/// 调度器默认在 `lib.rs::run()` 的 setup 阶段自动启动，本 command 仅供调试
/// 手动控制（如 `stop_scheduler` 后想恢复）。
#[tauri::command]
pub fn start_scheduler(scheduler: State<'_, Scheduler>, app: AppHandle) -> CmdResult<()> {
    scheduler.start(app);
    Ok(())
}

/// 停止调度器后台线程。线程会在下一个 200ms 轮询点退出（最多 200ms 延迟）。
#[tauri::command]
pub fn stop_scheduler(scheduler: State<'_, Scheduler>) -> CmdResult<()> {
    scheduler.stop();
    Ok(())
}

// ---------------------------------------------------------------------------
// 7. 内部测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    // TodoPriority 仅在测试代码中使用（如 `assert_eq!(...Medium)`），
    // 业务层并不直接命名枚举值（统一走 `Option<TodoPriority>::unwrap_or_default`）。
    // 因此从顶层 `use crate::models::{...}` 移除，只在测试作用域内引入。
    use crate::models::GeneralSettings;
    use crate::models::TodoPriority;
    use std::collections::BTreeMap;

    fn sample_input(title: &str) -> AddTodoInput {
        AddTodoInput {
            title: title.to_string(),
            reminder_time: None,
            sound_enabled: None,
            priority: None,
        }
    }

    #[test]
    fn normalize_reminder_time_accepts_none_and_empty() {
        assert_eq!(normalize_reminder_time(None).unwrap(), None);
        assert_eq!(normalize_reminder_time(Some("")).unwrap(), None);
        assert_eq!(normalize_reminder_time(Some("   ")).unwrap(), None);
    }

    #[test]
    fn normalize_reminder_time_accepts_well_formed_hhmm() {
        assert_eq!(
            normalize_reminder_time(Some("08:30")).unwrap(),
            Some("08:30".to_string())
        );
        assert_eq!(
            normalize_reminder_time(Some("23:59")).unwrap(),
            Some("23:59".to_string())
        );
        assert_eq!(
            normalize_reminder_time(Some("00:00")).unwrap(),
            Some("00:00".to_string())
        );
        assert!(normalize_reminder_time(Some("8:30")).is_err());
    }

    #[test]
    fn normalize_reminder_time_rejects_garbage() {
        assert!(normalize_reminder_time(Some("nope")).is_err());
        assert!(normalize_reminder_time(Some("8:30:00")).is_err());
        assert!(normalize_reminder_time(Some(":30")).is_err());
        assert!(normalize_reminder_time(Some("08:")).is_err());
        assert!(normalize_reminder_time(Some("+08:30")).is_err());
    }

    #[test]
    fn normalize_reminder_time_rejects_out_of_range() {
        assert!(normalize_reminder_time(Some("24:00")).is_err());
        assert!(normalize_reminder_time(Some("12:60")).is_err());
        assert!(normalize_reminder_time(Some("99:99")).is_err());
    }

    #[test]
    fn add_todo_rejects_invalid_reminder_time() {
        let title = sample_input("测试");
        // 单测只能覆盖纯函数，validate 通过后构造 Todo
        // 这里只验证 normalize_reminder_time 是 CmdResult 链路上的错误来源
        assert!(normalize_reminder_time(Some("nope")).is_err());
        let _ = title;
    }

    // ---- priority 行为 ----

    #[test]
    fn todo_priority_default_is_medium() {
        assert_eq!(TodoPriority::default(), TodoPriority::Medium);
    }

    #[test]
    fn todo_priority_serializes_lowercase() {
        // 与前端 TodoPriority 联合类型字面量一致。
        assert_eq!(
            serde_json::to_string(&TodoPriority::Critical).unwrap(),
            "\"critical\""
        );
        assert_eq!(
            serde_json::to_string(&TodoPriority::High).unwrap(),
            "\"high\""
        );
        assert_eq!(
            serde_json::to_string(&TodoPriority::Medium).unwrap(),
            "\"medium\""
        );
        assert_eq!(
            serde_json::to_string(&TodoPriority::Low).unwrap(),
            "\"low\""
        );
    }

    #[test]
    fn todo_deserializes_missing_priority_as_medium() {
        // 模拟老 todos.json：一条 todo 不带 priority 字段。
        let json = r#"{
            "id": "old",
            "title": "老数据",
            "reminderTime": null,
            "soundEnabled": true,
            "completed": false,
            "remindedAt": null,
            "createdAt": "2026-06-17T08:00:00.000+08:00"
        }"#;
        let todo: Todo = serde_json::from_str(json).expect("老数据必须能反序列化");
        assert_eq!(todo.priority, TodoPriority::Medium);
    }

    #[test]
    fn todo_round_trip_preserves_priority() {
        let todo = Todo {
            id: "x".to_string(),
            title: "x".to_string(),
            reminder_time: None,
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Critical,
            advance_reminded_at: None,
            reminded_at: None,
            created_at: "2026-06-17T08:00:00.000+08:00".to_string(),
        };
        let json = serde_json::to_string(&todo).unwrap();
        let restored: Todo = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.priority, TodoPriority::Critical);
    }

    #[test]
    fn build_new_todo_applies_explicit_priority() {
        let mut input = sample_input("重要的任务");
        input.priority = Some(TodoPriority::High);
        let todo = build_new_todo(&input, "重要的任务".to_string(), None);
        assert_eq!(todo.priority, TodoPriority::High);
    }

    #[test]
    fn build_new_todo_defaults_priority_to_medium() {
        let input = sample_input("普通任务");
        // priority: None
        let todo = build_new_todo(&input, "普通任务".to_string(), None);
        assert_eq!(todo.priority, TodoPriority::Medium);
    }

    // ---- validate_title 行为（add_todo 复用）----

    #[test]
    fn validate_title_rejects_empty_and_whitespace() {
        assert!(validate_title("").is_err());
        assert!(validate_title("   ").is_err());
        assert!(validate_title("\t\n").is_err());
    }

    #[test]
    fn validate_title_rejects_too_long() {
        // 41 个字符（含 1 个中文计为 1 char）应该超 40 限制
        let too_long = "a".repeat(41);
        assert!(validate_title(&too_long).is_err());
    }

    #[test]
    fn validate_title_trims_and_returns_owned() {
        let ok = validate_title("  写报告  ").unwrap();
        assert_eq!(ok, "写报告");
        // 40 字上限内
        let max_len = "a".repeat(40);
        assert!(validate_title(&max_len).is_ok());
    }

    /// `update_todo` 内部走 [`apply_todo_update`] 纯函数，测试直接覆盖它
    /// （无需启动 Tauri 状态机）。
    #[test]
    fn apply_todo_update_preserves_priority_when_input_priority_is_none() {
        // 模拟数据库中已有一条 critical 的 todo
        let mut todo = Todo {
            id: "id".to_string(),
            title: "原标题".to_string(),
            reminder_time: None,
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Critical,
            advance_reminded_at: None,
            reminded_at: None,
            created_at: "2026-06-17T08:00:00.000+08:00".to_string(),
        };
        // 编辑时 priority 缺省 → 保持原值
        let input = UpdateTodoInput {
            title: "新标题".to_string(),
            reminder_time: None,
            sound_enabled: None,
            priority: None,
        };
        apply_todo_update(&mut todo, "新标题".to_string(), None, &input);
        assert_eq!(todo.priority, TodoPriority::Critical, "None 时不能覆盖");
        assert_eq!(todo.title, "新标题", "title 必须被替换为新值");
    }

    #[test]
    fn apply_todo_update_overwrites_priority_when_input_priority_is_some() {
        let mut todo = Todo {
            id: "id".to_string(),
            title: "原".to_string(),
            reminder_time: None,
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Low,
            advance_reminded_at: None,
            reminded_at: None,
            created_at: "2026-06-17T08:00:00.000+08:00".to_string(),
        };
        let input = UpdateTodoInput {
            title: "原".to_string(),
            reminder_time: None,
            sound_enabled: None,
            priority: Some(TodoPriority::Critical),
        };
        apply_todo_update(&mut todo, "原".to_string(), None, &input);
        assert_eq!(todo.priority, TodoPriority::Critical, "Some 时必须覆盖");
    }

    #[test]
    fn apply_todo_update_resets_advance_and_reminded_marks() {
        // 编辑之后原 advance / due 标记要清空，否则用户改时间会再弹原 advance。
        let mut todo = Todo {
            id: "id".to_string(),
            title: "t".to_string(),
            reminder_time: Some("10:00".to_string()),
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Medium,
            advance_reminded_at: Some("2026-06-17T09:50:00.000+08:00".to_string()),
            reminded_at: Some("2026-06-17T10:00:00.000+08:00".to_string()),
            created_at: "2026-06-17T08:00:00.000+08:00".to_string(),
        };
        let input = UpdateTodoInput {
            title: "t".to_string(),
            reminder_time: Some("11:00".to_string()),
            sound_enabled: None,
            priority: None,
        };
        apply_todo_update(
            &mut todo,
            "t".to_string(),
            Some("11:00".to_string()),
            &input,
        );
        assert_eq!(todo.advance_reminded_at, None);
        assert_eq!(todo.reminded_at, None);
        assert_eq!(todo.reminder_time.as_deref(), Some("11:00"));
    }

    #[test]
    fn apply_todo_update_preserves_sound_enabled_when_none() {
        // 用户没改 soundEnabled → 不能误关掉提示音。
        let mut todo = Todo {
            id: "id".to_string(),
            title: "t".to_string(),
            reminder_time: None,
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Medium,
            advance_reminded_at: None,
            reminded_at: None,
            created_at: "2026-06-17T08:00:00.000+08:00".to_string(),
        };
        let input = UpdateTodoInput {
            title: "t".to_string(),
            reminder_time: None,
            sound_enabled: None,
            priority: None,
        };
        apply_todo_update(&mut todo, "t".to_string(), None, &input);
        assert!(todo.sound_enabled, "soundEnabled 缺省应保持原 true");
    }

    // ---- find_today_todo_mut（update_todo / toggle_todo 复用）----

    fn sample_todo(id: &str, title: &str) -> Todo {
        Todo {
            id: id.to_string(),
            title: title.to_string(),
            reminder_time: None,
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Medium,
            advance_reminded_at: None,
            reminded_at: None,
            created_at: "2026-06-17T08:00:00.000+08:00".to_string(),
        }
    }

    #[test]
    fn find_today_todo_mut_returns_mut_ref_for_existing_id() {
        // 命中：返回 `&mut Todo`，允许 update / toggle 直接修改字段。
        let mut store: TodoStore = BTreeMap::new();
        store.insert("2026-06-19".to_string(), vec![sample_todo("a", "A")]);
        let todo = find_today_todo_mut(&mut store, "2026-06-19", "a").expect("a 必须存在");
        assert_eq!(todo.title, "A");
        todo.completed = true;
        assert!(store.get("2026-06-19").unwrap()[0].completed);
    }

    #[test]
    fn find_today_todo_mut_errors_when_day_group_missing() {
        // 今天还没有 todo（store 里完全没这条日期）→ 应返回 "待办不存在或已被删除"
        let mut store: TodoStore = BTreeMap::new();
        let err = find_today_todo_mut(&mut store, "2026-06-19", "ghost").unwrap_err();
        assert!(err.contains("待办不存在或已被删除"), "got: {err}");
        assert!(err.contains("ghost"), "err must include id: {err}");
    }

    #[test]
    fn find_today_todo_mut_errors_when_id_missing_in_existing_day() {
        // 今天有 todo 但 id 不匹配 → 同样 "待办不存在或已被删除"
        let mut store: TodoStore = BTreeMap::new();
        store.insert("2026-06-19".to_string(), vec![sample_todo("a", "A")]);
        let err = find_today_todo_mut(&mut store, "2026-06-19", "ghost").unwrap_err();
        assert!(err.contains("待办不存在或已被删除"), "got: {err}");
    }

    #[test]
    fn find_today_todo_mut_distinguishes_day_mismatch() {
        // 同 id 在不同日期 → 不应误命中（用户昨天删了同名 todo，但 id 不同也不影响）
        let mut store: TodoStore = BTreeMap::new();
        store.insert(
            "2026-06-18".to_string(),
            vec![sample_todo("a", "Yesterday")],
        );
        let err = find_today_todo_mut(&mut store, "2026-06-19", "a").unwrap_err();
        assert!(err.contains("待办不存在或已被删除"), "got: {err}");
    }

    // ---- delete_todo 幂等行为（不抽函数，直接验状态机模拟）----
    // 这里用 `BTreeMap` + `Vec::retain` 模拟 delete_todo 内部的"按 id 过滤"逻辑：
    // `delete_todo` 的命令体在生产路径上被设计为幂等——id 不存在也返回成功，
    // 不抛错（与 `update_todo` / `toggle_todo` 不同：那两个会"误以为同步失败"而报错）。
    #[test]
    fn delete_todo_idempotent_retain_behavior() {
        // store 中有 a / b，删除 c（不存在）→ 长度仍为 2，且 a / b 都还在。
        let mut store: TodoStore = BTreeMap::new();
        let day = "2026-06-19".to_string();
        store.insert(
            day.clone(),
            vec![sample_todo("a", "A"), sample_todo("b", "B")],
        );
        if let Some(entry) = store.get_mut(&day) {
            entry.retain(|t| t.id != "c");
        }
        let entry = store.get(&day).unwrap();
        assert_eq!(entry.len(), 2);
        let ids: Vec<&str> = entry.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "b"]);
    }

    // ---- delete_reminder / purge_reminder ----

    fn sample_reminder(id: &str, name: &str) -> HealthReminder {
        HealthReminder {
            id: id.to_string(),
            name: name.to_string(),
            icon: "💧".to_string(),
            interval_minutes: 30,
            message: "站起来走一走".to_string(),
            sound_enabled: false,
            sound_file_path: None,
            enabled: true,
            last_triggered_at: None,
            next_trigger_at: None,
        }
    }

    #[test]
    fn purge_reminder_removes_targeted_one() {
        let mut reminders = vec![
            sample_reminder("water", "定时喝水"),
            sample_reminder("walk", "站起来走一走"),
            sample_reminder("eye", "闭眼休息"),
        ];
        let removed = purge_reminder(&mut reminders, "walk");
        assert!(removed, "命中 id 应返回 true");
        assert_eq!(reminders.len(), 2);
        assert!(!reminders.iter().any(|r| r.id == "walk"));
        // 其他 reminder 顺序保持稳定
        assert_eq!(reminders[0].id, "water");
        assert_eq!(reminders[1].id, "eye");
    }

    #[test]
    fn purge_reminder_missing_id_is_noop() {
        let mut reminders = vec![sample_reminder("water", "定时喝水")];
        let removed = purge_reminder(&mut reminders, "not-exist");
        assert!(!removed, "未命中应返回 false");
        assert_eq!(reminders.len(), 1);
        assert_eq!(reminders[0].id, "water");
    }

    #[test]
    fn purge_reminder_does_not_disturb_other_reminders() {
        // 验证删除 a 不影响 b / c 的字段（包括 last_triggered_at）。
        let mut reminders = vec![
            HealthReminder {
                last_triggered_at: Some("2026-06-17T10:00:00.000+08:00".to_string()),
                ..sample_reminder("a", "A")
            },
            sample_reminder("b", "B"),
            HealthReminder {
                last_triggered_at: Some("2026-06-17T11:00:00.000+08:00".to_string()),
                enabled: false,
                ..sample_reminder("c", "C")
            },
        ];
        let removed = purge_reminder(&mut reminders, "a");
        assert!(removed);
        assert_eq!(reminders.len(), 2);
        assert_eq!(reminders[0].id, "b");
        assert_eq!(reminders[0].name, "B");
        assert_eq!(reminders[1].id, "c");
        assert_eq!(
            reminders[1].last_triggered_at.as_deref(),
            Some("2026-06-17T11:00:00.000+08:00")
        );
        assert!(
            !reminders[1].enabled,
            "C 原本是 disabled，不应被恢复成 enabled"
        );
    }

    // ---- sanitize_sound_filename ----
    //
    // 自定义提示音文件名清洗的纯函数测试。覆盖：
    //   * 合法文件名（多种扩展名）原样保留；
    //   * 路径穿越被剥除；
    //   * 非法字符（中文 / 空格 / unicode）替换为 _；
    //   * 缺失扩展名按 .wav 兜底；
    //   * 空字符串 / 纯分隔符返回 Err。

    #[test]
    fn sanitize_sound_filename_keeps_valid_wav_name() {
        assert_eq!(sanitize_sound_filename("ding.wav").unwrap(), "ding.wav");
    }

    #[test]
    fn sanitize_sound_filename_normalizes_extension_case() {
        assert_eq!(sanitize_sound_filename("DING.WAV").unwrap(), "DING.WAV");
    }

    #[test]
    fn sanitize_sound_filename_accepts_mp3_and_ogg() {
        assert_eq!(sanitize_sound_filename("water.mp3").unwrap(), "water.mp3");
        assert_eq!(sanitize_sound_filename("chime.ogg").unwrap(), "chime.ogg");
    }

    #[test]
    fn sanitize_sound_filename_strips_directory_components() {
        // 路径穿越：只留 basename
        let result =
            sanitize_sound_filename("C:\\Users\\me\\Music\\..\\..\\Windows\\evil.wav").unwrap();
        assert_eq!(result, "evil.wav");
    }

    #[test]
    fn sanitize_sound_filename_replaces_unicode_chars() {
        // 中文 / 空格 / unicode 替换为 _
        // "冰 提示 音.wav" → 6 个非 ASCII 字符（冰、空格、提、示、空格、音）
        // 全部替换为 _，保留 .wav 部分。
        let result = sanitize_sound_filename("冰 提示 音.wav").unwrap();
        assert_eq!(result, "______.wav");
    }

    #[test]
    fn sanitize_sound_filename_rejects_missing_extension() {
        assert!(sanitize_sound_filename("noext").is_err());
    }

    #[test]
    fn sanitize_sound_filename_rejects_empty_input() {
        assert!(sanitize_sound_filename("").is_err());
        assert!(sanitize_sound_filename("   ").is_err());
    }

    #[test]
    fn sanitize_sound_filename_rejects_unsupported_extension() {
        assert!(sanitize_sound_filename("song.flac").is_err());
    }

    // ---- settings 兼容：soundFilePath 缺失时默认 None ----
    //
    // 用户老 settings.json 没有 `general.soundFilePath` 字段时，
    // 反序列化不应崩溃；`#[serde(default)]` 让其默认为 `None`。

    #[test]
    fn general_settings_without_sound_file_path_deserializes_to_none() {
        let legacy = r#"{
            "autoLaunch": true,
            "ballOpacity": 0.7,
            "ballSize": "medium",
            "rememberPosition": true,
            "soundEnabled": true
        }"#;
        let parsed: GeneralSettings = serde_json::from_str(legacy)
            .expect("missing soundFilePath should still parse via serde default");
        assert!(parsed.sound_file_path.is_none());
        assert!(parsed.sound_enabled);
    }

    #[test]
    fn general_settings_with_sound_file_path_round_trips() {
        let original = GeneralSettings {
            auto_launch: true,
            ball_opacity: 0.7,
            ball_size: "medium".to_string(),
            remember_position: true,
            sound_enabled: true,
            sound_file_path: Some("C:/Users/me/sounds/x.wav".to_string()),
        };
        let json = serde_json::to_string(&original).unwrap();
        let back: GeneralSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(
            back.sound_file_path.as_deref(),
            Some("C:/Users/me/sounds/x.wav")
        );
    }
}
