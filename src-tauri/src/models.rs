//! 数据模型
//!
//! 字段命名约定：所有结构体使用 `#[serde(rename_all = "camelCase")]`，
//! 序列化后的 JSON 字段名与前端 `src/shared/types.ts` 完全一致，
//! 这样 Tauri command 收到和返回的对象都能直接喂给 TypeScript 类型。
//!
//! 时间字段格式：RFC-3339 / ISO-8601 字符串，序列化时**携带本地时区偏移**
//! （例如 `"2026-06-17T08:30:00.000+08:00"`），由 `to_iso()` 集中生成。
//! 这与前端 `Date.toISOString()`（**永远以 UTC 的 `"Z"` 结尾**）并不完全相同，
//! 但仍在 JS `new Date(...)` 的可解析范围内；前端读出后可再
//! `.toLocaleString()` 还原成本地显示。本模块底部的 `time` 工具函数
//! 是 Rust 端唯一的时间格式化入口，避免散落各处的 `to_rfc3339_opts` 调用漂移。

use std::collections::BTreeMap;

use chrono::{DateTime, Datelike, Local, TimeZone, Timelike};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// 0. 枚举
// ---------------------------------------------------------------------------

/// 待办优先级。稳定英文枚举 + serde lowercase 序列化，
/// 与前端 `TodoPriority` 联合类型 `"critical" | "high" | "medium" | "low"` 一一对应。
///
/// `#[default]` 让 `TodoPriority::default()` 返回 `Medium`，这有两个作用：
///   1. 派生 `Todo: Default` 时 `priority` 字段得到 `Medium`；
///   2. 读取老 `todos.json` 时，**老数据缺失 `priority` 字段 → serde 反序列化为
///      `Medium`**，与"用户未选时默认中等"的产品语义一致。
///
/// 不允许出现的值（前端只可能是上述 4 个之一），但若 `todos.json` 被手工改坏
/// （比如 `"urgent"`），serde 解析会失败——`storage::read_json` 走
/// "备份 corrupt + 写默认"路径，不会让单条坏数据让整个 json 解析失败。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TodoPriority {
    Critical,
    High,
    #[default]
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderType {
    Deepseek,
    Openai,
    CustomOpenaiCompatible,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPublicConfig {
    pub enabled: bool,
    pub provider: AiProviderType,
    pub base_url: String,
    pub model: String,
    pub api_key_saved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiConfigInput {
    pub provider: AiProviderType,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionTestResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExistingTodo {
    pub title: String,
    pub reminder_time: Option<String>,
    pub priority: TodoPriority,
    pub completed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPlanRequest {
    pub user_input: String,
    pub date: String,
    pub current_time: String,
    #[serde(default)]
    pub existing_todos: Vec<AiExistingTodo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGeneratedTodo {
    pub title: String,
    pub reminder_time: Option<String>,
    pub priority: TodoPriority,
    #[serde(default = "default_true")]
    pub sound_enabled: bool,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPlanDraft {
    pub summary: String,
    pub todos: Vec<AiGeneratedTodo>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyAiPlanInput {
    pub todos: Vec<AiGeneratedTodo>,
}

// ---------------------------------------------------------------------------
// 1. Todo
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub reminder_time: Option<String>,
    pub sound_enabled: bool,
    pub completed: bool,
    /// 任务优先级。缺失时 serde 走 `TodoPriority::default()` = `Medium`，
    /// 与"用户未选默认中等"的产品语义一致；老 `todos.json` 数据不会因此报错。
    #[serde(default)]
    pub priority: TodoPriority,
    /// 提前提醒触发时间戳；可空。serde 允许字段在缺失时保持 None。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub advance_reminded_at: Option<String>,
    pub reminded_at: Option<String>,
    pub created_at: String,
}

/// `todos.json` 的存储结构：按本地日期键分组的 todo 列表。
/// 使用 `BTreeMap` 保证序列化时 key 稳定且不会因为 `HashMap` 随机迭代影响 JSON diff。
pub type TodoStore = BTreeMap<String, Vec<Todo>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTodoInput {
    pub title: String,
    pub reminder_time: Option<String>,
    #[serde(default)]
    pub sound_enabled: Option<bool>,
    /// 前端未传 / 传 `null` → 后端走 `TodoPriority::default()` = `Medium`。
    /// 前端传 `'critical' | 'high' | 'medium' | 'low'` → 后端用该值。
    #[serde(default)]
    pub priority: Option<TodoPriority>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoInput {
    pub title: String,
    pub reminder_time: Option<String>,
    #[serde(default)]
    pub sound_enabled: Option<bool>,
    /// 前端未传 / 传 `null` → **保持原值**（`update_todo` 内的 `if let Some` 守卫）；
    /// 前端传 priority 字符串 → 覆盖原值。
    /// 与 `AddTodoInput::priority` 的 `None = 默认 medium` 语义不同，刻意拆开
    /// 两个 struct 以避免歧义。
    #[serde(default)]
    pub priority: Option<TodoPriority>,
}

// ---------------------------------------------------------------------------
// 2. Health Reminder
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReminder {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub interval_minutes: u32,
    pub message: String,
    pub sound_enabled: bool,
    pub sound_file_path: Option<String>,
    pub enabled: bool,
    pub last_triggered_at: Option<String>,
    pub next_trigger_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddHealthReminderInput {
    pub name: String,
    pub interval_minutes: u32,
    /// message 可选；缺失时由后端按 intervalMinutes 生成默认文案。
    #[serde(default)]
    pub message: Option<String>,
    /// 用户在前端勾选"是否启用声音"。与 `sound_file_path` 解耦：
    ///   * `sound_enabled = false` → 不播放；
    ///   * `sound_enabled = true && sound_file_path = None` → 走 `default`；
    ///   * `sound_enabled = true && sound_file_path = Some(path)` → 自定义音频。
    ///
    /// 旧版本由 `sound_file_path.is_some()` 推导，导致声音开关与附件耦合；
    /// 本阶段拆开后，UI 可以独立打开"声音"但仍使用默认音。
    #[serde(default = "default_true")]
    pub sound_enabled: bool,
    pub sound_file_path: Option<String>,
}

pub type UpdateHealthReminderInput = AddHealthReminderInput;

fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------
// 3. AppSettings（嵌套结构）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub auto_launch: bool,
    // ----- 悬浮球遗留字段（deprecated）-----
    //
    // `ballOpacity` / `ballSize` / `rememberPosition` 来自早期悬浮球设计。
    // 悬浮球路线已于第八阶段
    // 永久取消，系统托盘成为应用唯一常驻入口。
    //
    // **本阶段不删除这些字段**，原因：
    //   1. settings.json 是用户落盘数据，删字段会破坏老用户的本地配置；
    //   2. 前端 `shared/types.ts` 同步保留这些字段，避免 TS strict 模式报错；
    //   3. 序列化层使用 `serde(rename_all = "camelCase")`，删字段必须前后端同步改。
    //
    // **清理路径**：后续如需真正删字段，必须走 settings 数据迁移版本
    // （读取旧 settings.json → 写新 settings.json，丢掉 ball*），且要做
    // 一次性的备份。**不能直接改 model / type**。
    //
    // 当前 Tauri 端所有命令都对这些字段**只读不写**：
    //   - `update_settings` 收到 `general` 子段时保留传入的 ball* 值；
    //   - 默认值由 `default_app_settings` 给定（保留向前兼容默认）。
    pub ball_opacity: f64,
    /// `"small" | "medium" | "large"`。前端 `BallSize` 联合类型。
    /// 悬浮球路线取消后，本字段前端不展示，**仅作磁盘占位**。
    pub ball_size: String,
    pub remember_position: bool,
    pub sound_enabled: bool,
    /// 自定义提示音文件路径（绝对路径，已复制到 `app_data_dir/sounds/`）。
    ///
    /// 语义：
    ///   * `None` → 使用内置默认提示音 `public/sound-default.wav`；
    ///   * `Some(path)` → 使用该本地音频文件。
    ///
    /// 今日计划 / 健康节律**共用**本设置。`#serde(default)` 保证老
    /// `settings.json` 没有此字段时不会反序列化失败。
    #[serde(default)]
    pub sound_file_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoSettings {
    pub advance_reminder_minutes: u32,
}

/// `BallPosition` —— 悬浮球位置（deprecated，仅磁盘占位）。
///
/// 字段含义来自早期悬浮球时代（`settings.ballPosition` 用来在重启后还原悬浮球位置）。
/// 悬浮球路线已于第八阶段**永久取消**，系统托盘
/// 成为应用唯一常驻入口，本字段**不再被读写**。
///
/// 保留原因与 `GeneralSettings::ball_*` 相同：settings.json 落盘数据，
/// 删字段会破坏老用户配置，清理必须走数据迁移版本。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BallPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub todo: TodoSettings,
    /// 悬浮球位置，**deprecated**。详见 [`BallPosition`]。
    pub ball_position: BallPosition,
}

/// settings 增量更新：与前端 `UpdateSettingsInput` 语义一致，
/// 三个子段各自 `Partial`，未提供的子段保持原值。
/// `serde(default)` 让前端不发该字段时 Rust 端收到 `None`。
///
/// `ball_position` 字段**保留但 deprecated**：前端 `updateSettings` 不应再
/// 发送此字段；Tauri 端 `commands::update_settings` 收到 ball_position 写入
/// 仍是兼容行为（不让老用户丢数据），但**不**做任何业务用途。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
    #[serde(default)]
    pub general: Option<GeneralSettings>,
    #[serde(default)]
    pub todo: Option<TodoSettings>,
    #[serde(default)]
    pub ball_position: Option<BallPosition>,
}

// ---------------------------------------------------------------------------
// 4. AppSnapshot：get_snapshot 返回的全量快照
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub today: String,
    /// 仅当天的 todos；非全量 todoStore，避免前端拿到历史。
    pub todos: Vec<Todo>,
    pub reminders: Vec<HealthReminder>,
    pub settings: AppSettings,
}

// ---------------------------------------------------------------------------
// 4.5 提醒弹窗载荷（共享：commands / scheduler 都会构造）
// ---------------------------------------------------------------------------

/// 提醒弹窗载荷。
///
///   - 前端 `desktopApi.window.showReminderPopup` 通过 invoke 传给 Rust；
///   - Rust 调度器在 tick 命中时也会构造（toast 触发时）。
///
/// 字段名与前端 `desktopApi.ts` 的 `ReminderPopupPayload` 完全对应（camelCase），
/// Rust 端再以 `WebviewWindowBuilder::initialization_script` 注入到新创建的
/// 弹窗 webview 的 `window.__REMINDER_POPUP_PAYLOAD__`。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderPopupPayload {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub sound_src: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<u32>,
    /// 关联的 reminder / todo id；可选，预留给后续
    /// "知道了之后写回 lastTriggeredAt" 的需求。
    #[serde(default)]
    pub reminder_id: Option<String>,
}

// ---------------------------------------------------------------------------
// 5. 默认值工厂
// ---------------------------------------------------------------------------

pub fn default_general_settings() -> GeneralSettings {
    GeneralSettings {
        auto_launch: true,
        ball_opacity: 0.7,
        ball_size: "medium".to_string(),
        remember_position: true,
        sound_enabled: true,
        sound_file_path: None,
    }
}

pub fn default_todo_settings() -> TodoSettings {
    TodoSettings {
        advance_reminder_minutes: 10,
    }
}

pub fn default_ball_position() -> BallPosition {
    BallPosition { x: 120, y: 160 }
}

pub fn default_app_settings() -> AppSettings {
    AppSettings {
        general: default_general_settings(),
        todo: default_todo_settings(),
        ball_position: default_ball_position(),
    }
}

/// 首次启动 / `reminders.json` 缺失时使用的默认健康提醒列表。
/// 与前端 `createDefaultHealthReminders()` 一致：
///   1. 久坐站起 / 45 分钟 / 🧍
///   2. 定时喝水 / 30 分钟 / 💧
///   3. 护眼休息 / 60 分钟 / 👁️
///
/// 之所以抽到 `models.rs` 而不是单独 `defaults.rs`：
///   1. 创建需要当前时间（`Local::now()`），不能用 `Default::default()` 派生。
///   2. `state.rs` 在 `reminders.json` 缺失时需要直接调用。
///   3. 与 `default_app_settings` 等「纯数据默认值」放在一起，外部调用方只需
///      引用 `crate::models::create_default_health_reminders` 一个模块。
pub fn create_default_health_reminders(now: DateTime<Local>) -> Vec<HealthReminder> {
    vec![
        make_default_reminder("stand", "久坐站起", "🧍", 45, now),
        make_default_reminder("water", "定时喝水", "💧", 30, now),
        make_default_reminder("eyes", "护眼休息", "👁️", 60, now),
    ]
}

fn make_default_reminder(
    id: &str,
    name: &str,
    icon: &str,
    interval_minutes: u32,
    now: DateTime<Local>,
) -> HealthReminder {
    HealthReminder {
        id: id.to_string(),
        name: name.to_string(),
        icon: icon.to_string(),
        interval_minutes,
        message: default_reminder_message(interval_minutes),
        sound_enabled: true,
        sound_file_path: None,
        enabled: true,
        last_triggered_at: None,
        next_trigger_at: Some(to_iso(add_minutes(now, interval_minutes as i64))),
    }
}

fn default_reminder_message(interval_minutes: u32) -> String {
    format!("已过 {} 分钟，该活动一下了！", interval_minutes)
}

// ---------------------------------------------------------------------------
// 6. 时间工具（公开，被 defaults / commands / state 复用）
// ---------------------------------------------------------------------------

/// 本地时区的 `YYYY-MM-DD`，例如 `"2026-06-17"`。
/// 与前端 `addMinutes(now).toISOString().slice(0, 10)` 在同一时区下结果一致。
pub fn local_date_key(now: DateTime<Local>) -> String {
    format!(
        "{:04}-{:02}-{:02}",
        now.year(),
        now.month() as u32,
        now.day()
    )
}

/// 本地时区的 `HH:MM`（24h 制，零填充），例如 `"08:30"`。
pub fn to_hhmm(date: DateTime<Local>) -> String {
    format!("{:02}:{:02}", date.hour(), date.minute())
}

/// RFC-3339 / ISO-8601 字符串，**携带本地时区偏移**。
/// 例如 `"2026-06-17T08:30:00.000+08:00"`；不是 UTC 的 `"Z"` 结尾。
/// 前端 `new Date(...)` 仍能正确解析。
pub fn to_iso(date: DateTime<Local>) -> String {
    date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// 在 `date` 上加 `minutes` 分钟，跨夏令时边界时回退到 UTC 计算以避免 None。
pub fn add_minutes(date: DateTime<Local>, minutes: i64) -> DateTime<Local> {
    let tz = date.timezone();
    let naive = date.naive_local() + chrono::Duration::minutes(minutes);
    if let Some(dt) = Local.from_local_datetime(&naive).single() {
        return dt.with_timezone(&tz);
    }
    let utc = date.naive_utc() + chrono::Duration::minutes(minutes);
    tz.from_utc_datetime(&utc).with_timezone(&tz)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample() -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 6, 17, 8, 30, 0)
            .single()
            .expect("sample datetime must be valid")
    }

    #[test]
    fn local_date_key_zero_pads() {
        let key = local_date_key(sample());
        assert_eq!(key, "2026-06-17");
    }

    #[test]
    fn to_hhmm_zero_pads() {
        let key = to_hhmm(sample());
        assert_eq!(key, "08:30");
    }

    #[test]
    fn to_iso_carries_local_offset() {
        let iso = to_iso(sample());
        // 必须能解析
        let parsed =
            chrono::DateTime::parse_from_rfc3339(&iso).expect("to_iso must emit valid RFC-3339");
        // 本地日期与原值一致（任意时区下）
        assert_eq!(parsed.timestamp(), sample().timestamp());
        // 携带的是 +HH:MM 偏移，不是 Z 结尾（因为 sample 是 Local）
        assert!(
            !iso.ends_with('Z'),
            "Local RFC-3339 must carry offset, not Z: {iso}"
        );
    }

    #[test]
    fn add_minutes_handles_positive() {
        let later = add_minutes(sample(), 45);
        assert_eq!(to_hhmm(later), "09:15");
    }

    // ---- create_default_health_reminders ----

    #[test]
    fn creates_three_default_reminders() {
        let reminders = create_default_health_reminders(sample());
        assert_eq!(reminders.len(), 3);
    }

    #[test]
    fn default_reminders_have_unique_ids() {
        let reminders = create_default_health_reminders(sample());
        let mut ids: Vec<&str> = reminders.iter().map(|r| r.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 3, "default reminder ids must be unique");
    }

    #[test]
    fn default_reminders_have_expected_names_and_intervals() {
        let reminders = create_default_health_reminders(sample());
        let names: Vec<&str> = reminders.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"久坐站起"));
        assert!(names.contains(&"定时喝水"));
        assert!(names.contains(&"护眼休息"));
        for r in &reminders {
            assert!(
                r.interval_minutes >= 5 && r.interval_minutes <= 480,
                "interval out of range: {}",
                r.interval_minutes
            );
            assert!(r.enabled, "default reminders must be enabled");
            assert!(r.next_trigger_at.is_some(), "next_trigger_at must be set");
        }
    }

    #[test]
    fn next_trigger_at_is_rfc3339_and_in_future() {
        let now = sample();
        let reminders = create_default_health_reminders(now);
        for r in &reminders {
            let nta = r.next_trigger_at.as_ref().expect("next_trigger_at");
            let parsed =
                chrono::DateTime::parse_from_rfc3339(nta).expect("next_trigger_at must be RFC3339");
            assert!(
                parsed > now,
                "next_trigger_at must be strictly later than now: {nta}"
            );
        }
    }

    #[test]
    fn stand_default_interval_is_45() {
        let reminders = create_default_health_reminders(sample());
        let stand = reminders.iter().find(|r| r.id == "stand").expect("stand");
        assert_eq!(stand.interval_minutes, 45);
    }
}
