//! Tauri 调度器
//!
//! 提醒调度能力。
//!
//! 设计目标：
//!   1. 调度循环跑在 Rust 主进程的独立后台线程，不依赖 React / `setInterval`。
//!   2. 处理以下提醒行为：
//!      - 待办到点提醒（reminderTime 已到、completed=false、remindedAt=null）
//!      - 待办提前提醒（reminderTime - advanceReminderMinutes 窗口内）
//!      - 健康提醒循环（enabled=true、nextTriggerAt 已过）
//!   3. 命中后调用已有的 `window_manager::show_popup` 复用同一份弹窗逻辑。
//!   4. 状态变更后持久化到 `todos.json` / `reminders.json`，并通过
//!      `state-changed` 事件推给前端，让 TodoPanel / HealthWindow 实时刷新。
//!   5. 防止一瞬间弹出大量弹窗：每 tick 至多显示 1 个新弹窗，多余的进入
//!      in-memory 队列，下一 tick 继续消费。
//!
//! 不在本模块范围（明确不实现）：
//!   - 真实系统通知（OS 级别 Notification）— 留待后续阶段
//!   - 悬浮球（**永久取消**；系统托盘作为应用唯一常驻入口）
//!   - AI 能力（下一阶段可能讨论）
//!   - 跨进程的窗口位置持久化（`windowBounds.ts`）
//!   - 把调度器放在 React 组件里用 setInterval 跑（题目要求）
//!
//! 测试策略：
//!   - `compute_tick` 是**纯函数**：输入 (todos, reminders, advance_min, now)，
//!     输出 (new_todos, new_reminders, events)。所有单测只覆盖这一层；
//!     后台线程的运行由后续阶段在 Tauri 集成测试中验证。
//!   - 后台线程 + IO + emit 部分通过 `run_tick(app, state)` 包装，
//!     在单元测试里用假的 AppHandle 桩（直接调用 `compute_tick`）规避。

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use chrono::{DateTime, Local, Timelike};
use tauri::{AppHandle, Emitter, Manager};

use crate::models::{add_minutes, to_iso, HealthReminder, ReminderPopupPayload, Todo};
use crate::state::AppState;
use crate::window_manager;

// ---------------------------------------------------------------------------
// 1. 常量
// ---------------------------------------------------------------------------

/// 调度器 tick 间隔：30 秒。
///
/// Tauri 端持久化 IO 在主线程外，没有强实时性需求，30 秒足够覆盖"分钟级"提醒（提前 10 分钟提醒、最短
/// 健康间隔 5 分钟），并把唤醒 / 锁竞争压到可忽略水平。
pub const TICK_INTERVAL: Duration = Duration::from_secs(30);

/// 单 tick 至多弹出的新弹窗数量。剩余进入 in-memory 队列等下一 tick 消费。
pub const MAX_POPUPS_PER_TICK: usize = 1;

/// 今日待办"提前提醒"固定提前量：10 分钟。
///
/// **本阶段产品决议**：今日待办只在任务 reminderTime 前 10 分钟提醒一次，
/// 到点后**不再**弹任何 popup。`settings.todo.advanceReminderMinutes` 字段
/// 在类型 / 落盘上**保留**（settings.json 兼容性 + 后续阶段可能复用），
/// 但调度器读不到它——硬编码 10 分钟保证产品行为可预测。
///
/// 提醒后立刻把 `advanceRemindedAt` 写回，跨 tick / 跨进程重启都不会重复。
pub const TODO_ADVANCE_MINUTES: i64 = 10;

// ---------------------------------------------------------------------------
// 2. 纯计算：compute_tick
// ---------------------------------------------------------------------------

/// 调度器 tick 决策输出。
#[derive(Debug, Default, Clone, PartialEq)]
pub struct TickOutcome {
    /// 命中后需要展示的弹窗 payload 队列。
    /// 顺序即弹出顺序：到点 / 提前 / 健康提醒。
    pub events: Vec<ReminderPopupPayload>,
    /// 是否命中任何 todo（影响 `todos_changed`）。
    pub todos_changed: bool,
    /// 是否命中任何 health reminder（影响 `reminders_changed`）。
    pub reminders_changed: bool,
}

/// 决策结果：调度器下一步要在内存里怎么改 todos / reminders。
///
/// 包含**完整**的 todos / reminders 列表（不是 diff），调用方整体替换内存态。
#[derive(Debug, Clone, PartialEq)]
pub struct TickPlan {
    pub todos: Vec<Todo>,
    pub reminders: Vec<HealthReminder>,
    pub outcome: TickOutcome,
}

/// **纯函数** tick 决策。
///
/// 输入当前 `today` 的 todos、全部 reminders、当前时间，输出修改后的 todos /
/// reminders 与需要展示的弹窗列表。
///
/// 命中规则（**本阶段产品决议**）：
///   1. **待办提前 10 分钟提醒**：todo.completed=false && todo.reminderTime
///      && !advanceRemindedAt && now ∈ [reminderTime - 10min, reminderTime)
///   2. **健康提醒循环**：reminder.enabled && reminder.nextTriggerAt
///      && now ≥ nextTriggerAt
///
/// **取消** 之前阶段的"到点提醒"逻辑：今日待办到点后**不再**弹任何 popup，
/// 只在 reminderTime 前 10 分钟提醒一次（`TODO_ADVANCE_MINUTES = 10`）。
///
/// 提前量写死为 10 分钟（`settings.todo.advanceReminderMinutes` 在类型 / 落盘
/// 上保留兼容，但本调度器不读取）。命中后立刻把 `advanceRemindedAt` 写回 todo，
/// 下次 tick / 进程重启都跳过此 todo，避免重复弹窗。
///
/// 已完成 / 未设置 reminderTime / 任务时间已过（`now ≥ reminderTime`）的 todo
/// **不补提醒**——窗口已经错过就放弃。
///
/// 跨天处理（**调用方**负责，不在本函数）：
///   - `today` 由调用方（`run_tick`）从 `local_date_key(now)` 取到，
///     并据此从 `todo_store` 取出当天 bucket 的 todos 传入本函数。
///   - 本函数**不**对 `todos` 做日期过滤 —— 传进来什么就处理什么。
///   - 昨天 bucket 里的 todo 不会被取出传入，跨天重弹问题在 `run_tick` 层解决。
pub fn compute_tick(
    _today: &str,
    todos: &[Todo],
    reminders: &[HealthReminder],
    now: DateTime<Local>,
) -> TickPlan {
    let mut next_todos: Vec<Todo> = todos.to_vec();
    let mut next_reminders: Vec<HealthReminder> = reminders.to_vec();
    let mut events: Vec<ReminderPopupPayload> = Vec::new();
    let mut todos_changed = false;
    let mut reminders_changed = false;

    // ----- 1. 待办提前 10 分钟提醒（提醒一次，命中后写回 advance_reminded_at）-----
    for todo in next_todos.iter_mut() {
        if todo.completed
            || todo.reminder_time.is_none()
            || todo.advance_reminded_at.is_some()
        {
            continue;
        }
        let reminder_time = match &todo.reminder_time {
            Some(t) => t.clone(),
            None => continue,
        };
        let due = match reminder_due_for(&reminder_time, now) {
            Some(d) => d,
            None => continue,
        };
        let advance_start = add_minutes(due, -TODO_ADVANCE_MINUTES);
        // 窗口：now ∈ [advance_start, due) 触发一次；now ≥ due（到点 / 错过）
        // 或 now < advance_start（远未到提前窗口）都不弹。
        if now < advance_start || now >= due {
            continue;
        }
        todo.advance_reminded_at = Some(to_iso(now));
        todos_changed = true;
        events.push(ReminderPopupPayload {
            title: format!("即将开始：{}", todo.title),
            body: format!(
                "距离计划时间还有 {} 分钟，请准备开始。",
                TODO_ADVANCE_MINUTES
            ),
            icon: Some("⏰".to_string()),
            sound_src: todo.sound_enabled.then(|| "default".to_string()),
            duration_ms: None,
            reminder_id: Some(todo.id.clone()),
        });
    }

    // ----- 2. 健康提醒循环（不受 todo 规则调整影响）-----
    for reminder in next_reminders.iter_mut() {
        if !reminder.enabled {
            continue;
        }
        let next_trigger = match &reminder.next_trigger_at {
            Some(t) => t.clone(),
            None => continue,
        };
        let next_trigger_dt = match chrono::DateTime::parse_from_rfc3339(&next_trigger) {
            Ok(dt) => dt.with_timezone(&Local),
            Err(_) => {
                // 数据损坏：跳过本条，不影响其他 reminder
                eprintln!(
                    "[scheduler] reminder `{}` has invalid nextTriggerAt: {}",
                    reminder.id, next_trigger
                );
                continue;
            }
        };
        if now < next_trigger_dt {
            continue;
        }
        reminder.last_triggered_at = Some(to_iso(now));
        reminder.next_trigger_at = Some(to_iso(add_minutes(now, reminder.interval_minutes as i64)));
        reminders_changed = true;
        events.push(ReminderPopupPayload {
            title: reminder.name.clone(),
            body: reminder.message.clone(),
            icon: Some(reminder.icon.clone()),
            sound_src: reminder.sound_enabled.then(|| {
                reminder
                    .sound_file_path
                    .clone()
                    .unwrap_or_else(|| "default".to_string())
            }),
            duration_ms: None,
            reminder_id: Some(reminder.id.clone()),
        });
    }

    TickPlan {
        todos: next_todos,
        reminders: next_reminders,
        outcome: TickOutcome {
            events,
            todos_changed,
            reminders_changed,
        },
    }
}

/// 把 `HH:MM` 解释成"今天"的本地 DateTime；解析失败返回 None。
fn reminder_due_for(time: &str, now: DateTime<Local>) -> Option<DateTime<Local>> {
    let (h, m) = time.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    let due = now
        .with_hour(h)?
        .with_minute(m)?
        .with_second(0)?
        .with_nanosecond(0)?;
    Some(due)
}

// ---------------------------------------------------------------------------
// 3. 后台线程 + IO 包装
// ---------------------------------------------------------------------------

/// 调度器线程的可观测状态。前端可通过 `get_scheduler_status` command 读取。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStatus {
    pub running: bool,
    /// tick 间隔（秒），方便前端展示。
    pub tick_interval_secs: u64,
    /// 当前 in-memory 待弹窗队列长度。
    pub pending_popup_count: u32,
}

/// 调度器状态机：拥有后台线程的 JoinHandle 和一个停止信号原子。
///
/// 设计为单实例：`Tauri::Builder::manage` 注册一份，
/// `setup` 阶段调用 [`start`]，`tauri` shutdown 时调用 [`stop`]。
pub struct Scheduler {
    inner: Arc<SchedulerInner>,
}

struct SchedulerInner {
    /// 停止信号。后台线程每 200ms 轮询一次（响应比 sleep(30s) 灵敏）。
    stop: AtomicBool,
    /// 线程句柄。None 表示未启动。
    handle: Mutex<Option<JoinHandle<()>>>,
    /// 待显示弹窗队列。tick 至多消费 `MAX_POPUPS_PER_TICK` 个。
    pending_popups: Mutex<VecDeque<ReminderPopupPayload>>,
}

impl Scheduler {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(SchedulerInner {
                stop: AtomicBool::new(false),
                handle: Mutex::new(None),
                pending_popups: Mutex::new(VecDeque::new()),
            }),
        }
    }

    /// 返回当前状态（用于 status command）。
    pub fn status(&self) -> SchedulerStatus {
        SchedulerStatus {
            running: self
                .inner
                .handle
                .lock()
                .map(|h| h.is_some())
                .unwrap_or(false),
            tick_interval_secs: TICK_INTERVAL.as_secs(),
            pending_popup_count: self
                .inner
                .pending_popups
                .lock()
                .map(|q| q.len() as u32)
                .unwrap_or(0),
        }
    }

    /// 启动后台线程。如果已经在跑，直接返回。
    pub fn start(&self, app: AppHandle) {
        let mut guard = match self.inner.handle.lock() {
            Ok(g) => g,
            Err(_) => {
                eprintln!("[scheduler] handle mutex poisoned, skip start");
                return;
            }
        };
        if guard.is_some() {
            return;
        }
        self.inner.stop.store(false, Ordering::SeqCst);

        let inner = Arc::clone(&self.inner);
        let handle = thread::Builder::new()
            .name("tauri-scheduler".to_string())
            .spawn(move || scheduler_loop(app, inner))
            .expect("failed to spawn scheduler thread");
        *guard = Some(handle);
    }

    /// 停止后台线程。等当前 tick 结束（最多 200ms）后退出。
    pub fn stop(&self) {
        self.inner.stop.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.inner.handle.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }

    /// 强制把 in-memory 队列里的剩余 payload 排空（由前端"立即清空"按钮等场景调用）。
    /// 当前未暴露给前端，保留为 API 占位。
    #[allow(dead_code)]
    pub fn drain_pending(&self) -> Vec<ReminderPopupPayload> {
        self.inner
            .pending_popups
            .lock()
            .map(|mut q| q.drain(..).collect())
            .unwrap_or_default()
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Scheduler {
    fn drop(&mut self) {
        // 后台线程持有 Arc<Self>，scheduler 进程结束 / dev 重载时会自动 join
        self.inner.stop.store(true, Ordering::SeqCst);
    }
}

/// 后台线程主循环。
fn scheduler_loop(app: AppHandle, inner: Arc<SchedulerInner>) {
    // 启动后立即跑一次 tick（避免冷启动 30 秒空白）
    run_tick(&app, &inner);

    // 把 30s 拆成 200ms 一段轮询停止信号，stop() 几乎无延迟生效
    let slice = Duration::from_millis(200);
    let total = TICK_INTERVAL.as_millis() as u64;
    let mut elapsed: u64 = 0;
    while !inner.stop.load(Ordering::SeqCst) {
        thread::sleep(slice);
        elapsed += slice.as_millis() as u64;
        if elapsed >= total {
            elapsed = 0;
            run_tick(&app, &inner);
        }
    }
}

/// 单次 tick：取数据 → compute_tick → 应用 → 持久化 → 弹窗 → emit。
fn run_tick(app: &AppHandle, inner: &Arc<SchedulerInner>) {
    let state = app.state::<AppState>();
    let now = Local::now();
    let today = crate::models::local_date_key(now);

    // ---- 1. 取数据快照 ----
    // `settings.todo.advanceReminderMinutes` 在 settings.json 上保留兼容，
    // 但本阶段调度器**不读取**——`TODO_ADVANCE_MINUTES` 写死 10 分钟。
    let (today_todos, reminders) = {
        let store = match state.todo_store.lock() {
            Ok(s) => s,
            Err(_) => return,
        };
        let reminders = match state.reminders.lock() {
            Ok(r) => r.clone(),
            Err(_) => return,
        };
        let today_todos = store.get(&today).cloned().unwrap_or_default();
        (today_todos, reminders)
    };

    // ---- 2. 决策 ----
    let plan = compute_tick(&today, &today_todos, &reminders, now);

    // ---- 3. 把新事件推入 in-memory 队列 ----
    if !plan.outcome.events.is_empty() {
        if let Ok(mut queue) = inner.pending_popups.lock() {
            for event in plan.outcome.events {
                queue.push_back(event);
            }
        }
    }

    // ---- 4. 应用状态变更 + 持久化 ----
    if plan.outcome.todos_changed {
        if let Ok(mut store) = state.todo_store.lock() {
            store.insert(today.clone(), plan.todos.clone());
            if let Err(error) = state.persist_todos(&store) {
                eprintln!("[scheduler] persist todos failed: {error}");
            }
        }
    }
    if plan.outcome.reminders_changed {
        if let Ok(mut reminders_lock) = state.reminders.lock() {
            *reminders_lock = plan.reminders.clone();
            if let Err(error) = state.persist_reminders(&reminders_lock) {
                eprintln!("[scheduler] persist reminders failed: {error}");
            }
        }
    }

    // ---- 5. 弹窗消费：本 tick 至多 MAX_POPUPS_PER_TICK 个 ----
    let mut popups_to_show: Vec<ReminderPopupPayload> = Vec::new();
    if let Ok(mut queue) = inner.pending_popups.lock() {
        for _ in 0..MAX_POPUPS_PER_TICK {
            if let Some(payload) = queue.pop_front() {
                popups_to_show.push(payload);
            } else {
                break;
            }
        }
    }
    for payload in &popups_to_show {
        if let Err(error) = window_manager::show_popup(app, payload) {
            eprintln!("[scheduler] show_popup failed: {error}");
        }
    }

    // ---- 6. emit state-changed ----
    if plan.outcome.todos_changed || plan.outcome.reminders_changed {
        let snapshot = build_snapshot_for_emit(&state, &today);
        if let Err(error) = app.emit("state-changed", &snapshot) {
            eprintln!("[scheduler] emit state-changed failed: {error}");
        }
    }
}

/// 复制 [`crate::commands::build_snapshot`] 逻辑：
/// 避免 commands 私有函数被 scheduler 依赖（模块解耦）。
/// 与 `commands::build_snapshot` 行为完全一致：today + 当天 todos + reminders + settings。
fn build_snapshot_for_emit(state: &AppState, today: &str) -> crate::models::AppSnapshot {
    let todos = state
        .todo_store
        .lock()
        .map(|s| s.get(today).cloned().unwrap_or_default())
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
        .unwrap_or_else(|_| crate::models::default_app_settings());

    crate::models::AppSnapshot {
        today: today.to_string(),
        todos,
        reminders,
        settings,
    }
}

// ---------------------------------------------------------------------------
// 4. 单元测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use crate::models::TodoPriority;

    fn sample_now() -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 6, 17, 10, 5, 0)
            .single()
            .expect("sample now")
    }

    fn todo_with(id: &str, title: &str, reminder_time: Option<&str>) -> Todo {
        let now = sample_now();
        Todo {
            id: id.to_string(),
            title: title.to_string(),
            reminder_time: reminder_time.map(|s| s.to_string()),
            sound_enabled: true,
            completed: false,
            priority: TodoPriority::Medium,
            advance_reminded_at: None,
            reminded_at: None,
            created_at: to_iso(now),
        }
    }

    fn health_reminder(id: &str, name: &str, interval: u32, next_trigger: &str) -> HealthReminder {
        HealthReminder {
            id: id.to_string(),
            name: name.to_string(),
            icon: "💧".to_string(),
            interval_minutes: interval,
            message: format!("已过 {} 分钟", interval),
            sound_enabled: false,
            sound_file_path: None,
            enabled: true,
            last_triggered_at: None,
            next_trigger_at: Some(next_trigger.to_string()),
        }
    }

    // =======================================================================
    // 待办提前 10 分钟提醒（**本阶段唯一** 的 todo 提醒规则）
    // =======================================================================
    //
    // 关键不变量：
    //   - 到点**不再**弹任何 popup（即使 now ≥ reminderTime）。
    //   - 提前窗口 [reminderTime - 10min, reminderTime) 命中一次后写
    //     advanceRemindedAt，下次 tick / 进程重启**不**再弹。
    //   - reminderTime 已过（now ≥ reminderTime）→ 放弃，不补提醒。

    /// reminderTime=09:30, now=09:20 → 提前窗口内，弹一次。
    #[test]
    fn advance_fires_inside_window_at_10_minutes_before() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        let todos = vec![todo_with("t1", "开会", Some("09:30"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert_eq!(plan.outcome.events.len(), 1);
        assert_eq!(plan.outcome.events[0].title, "即将开始：开会");
        assert!(plan.outcome.events[0].body.contains("10"));
        assert!(plan.outcome.events[0].body.contains("分钟"));
        assert!(plan.outcome.events[0].body.contains("请准备开始"));
        assert_eq!(plan.todos[0].advance_reminded_at, Some(to_iso(now)));
        assert!(plan.outcome.todos_changed);
    }

    /// reminderTime=09:30, now=09:30 → **到点不再弹窗**（本阶段产品决议）。
    #[test]
    fn due_time_does_not_fire() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 30, 0)
            .single()
            .unwrap();
        let todos = vec![todo_with("t1", "开会", Some("09:30"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert!(
            plan.outcome.events.is_empty(),
            "到点应该不再弹窗，实际: {:?}",
            plan.outcome.events
        );
        // 也没有写 remindedAt：到点提醒已彻底从产品里取消
        assert_eq!(plan.todos[0].reminded_at, None);
        assert!(!plan.outcome.todos_changed);
    }

    /// reminderTime=09:30, now=09:31 → 时间已过，**不补**提醒。
    #[test]
    fn time_passed_does_not_fire() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 31, 0)
            .single()
            .unwrap();
        let todos = vec![todo_with("t1", "开会", Some("09:30"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert!(
            plan.outcome.events.is_empty(),
            "任务时间已过不应补提醒"
        );
        assert!(!plan.outcome.todos_changed);
    }

    /// 已完成 todo 不提醒。
    #[test]
    fn completed_todo_never_fires() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        let mut t = todo_with("t1", "开会", Some("09:30"));
        t.completed = true;
        let plan = compute_tick("2026-06-17", &[t], &[], now);
        assert!(plan.outcome.events.is_empty());
        assert!(!plan.outcome.todos_changed);
    }

    /// 已提前提醒过的 todo 不重复触发（防止跨 tick 重复弹窗）。
    #[test]
    fn already_advance_reminded_todo_does_not_fire_again() {
        let now_first = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        let now_second = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 25, 0)
            .single()
            .unwrap();
        let todo = todo_with("t1", "开会", Some("09:30"));
        // 第一次 tick
        let plan1 = compute_tick("2026-06-17", &[todo.clone()], &[], now_first);
        assert_eq!(plan1.outcome.events.len(), 1);
        // 第二次 tick（仍在 10 分钟窗口内）— 已 mark advanceRemindedAt，不应再弹
        let plan2 = compute_tick("2026-06-17", &plan1.todos, &[], now_second);
        assert!(
            plan2.outcome.events.is_empty(),
            "已 advance_reminded 的 todo 跨 tick 不应重复弹窗"
        );
        assert!(!plan2.outcome.todos_changed);
    }

    /// 未设置 reminderTime 的 todo 不提醒。
    #[test]
    fn todo_without_reminder_time_never_fires() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        let todos = vec![todo_with("t1", "随便记一下", None)];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert!(plan.outcome.events.is_empty());
    }

    /// 远未到提前窗口的 todo 不弹窗（远在 due - 10min 之前）。
    #[test]
    fn todo_far_before_advance_window_does_not_fire() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 0, 0)
            .single()
            .unwrap();
        // reminderTime 11:00 → advance 窗口 10:50~11:00; 9:00 远在窗口之前
        let todos = vec![todo_with("t1", "晚点的事", Some("11:00"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert!(plan.outcome.events.is_empty());
    }

    /// 提前窗口**右边界**（now == due）— 不应触发（产品要求到点不补）。
    #[test]
    fn advance_window_right_edge_due_does_not_fire() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 10, 15, 0)
            .single()
            .unwrap();
        // reminderTime 10:15 → advance 窗口 [10:05, 10:15); 10:15 是右边界
        let todos = vec![todo_with("t1", "五点吃饭", Some("10:15"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert!(plan.outcome.events.is_empty());
    }

    // =======================================================================
    // 健康提醒（不受 todo 规则调整影响，循环提醒逻辑保持不变）
    // =======================================================================

    #[test]
    fn due_health_reminder_fires_and_reschedules() {
        let now = sample_now(); // 10:05
        let r = health_reminder("water", "定时喝水", 30, "2026-06-17T10:00:00.000+08:00");
        let plan = compute_tick("2026-06-17", &[], &[r.clone()], now);
        assert_eq!(plan.outcome.events.len(), 1);
        assert_eq!(plan.outcome.events[0].title, "定时喝水");
        assert!(plan.outcome.events[0].body.contains("30"));
        assert_eq!(plan.outcome.events[0].icon.as_deref(), Some("💧"));
        assert_eq!(plan.reminders[0].last_triggered_at, Some(to_iso(now)));
        let next = plan.reminders[0].next_trigger_at.as_ref().unwrap();
        let parsed = chrono::DateTime::parse_from_rfc3339(next).unwrap();
        assert_eq!(parsed.timestamp(), now.timestamp() + 30 * 60);
        assert!(plan.outcome.reminders_changed);
    }

    #[test]
    fn paused_health_reminder_does_not_fire() {
        let now = sample_now();
        let mut r = health_reminder("water", "定时喝水", 30, "2026-06-17T09:00:00.000+08:00");
        r.enabled = false;
        let plan = compute_tick("2026-06-17", &[], &[r], now);
        assert!(plan.outcome.events.is_empty());
        assert!(!plan.outcome.reminders_changed);
    }

    #[test]
    fn health_reminder_not_yet_due_does_not_fire() {
        let now = sample_now();
        let r = health_reminder("water", "定时喝水", 30, "2026-06-17T10:30:00.000+08:00");
        let plan = compute_tick("2026-06-17", &[], &[r], now);
        assert!(plan.outcome.events.is_empty());
    }

    #[test]
    fn health_reminder_corrupt_next_trigger_is_skipped() {
        let now = sample_now();
        let mut r = health_reminder("water", "定时喝水", 30, "2026-06-17T10:00:00.000+08:00");
        r.next_trigger_at = Some("not-a-date".to_string());
        let plan = compute_tick("2026-06-17", &[], &[r], now);
        assert!(plan.outcome.events.is_empty());
        // 不掩盖损坏
        assert_eq!(
            plan.reminders[0].next_trigger_at.as_deref(),
            Some("not-a-date")
        );
    }

    // =======================================================================
    // todo + health 共存 / 跨天
    // =======================================================================

    /// 同 tick 同时命中一条 todo 提前提醒 + 一条健康提醒，
    /// events 顺序：todo 在前，health 在后。
    /// 配合 `MAX_POPUPS_PER_TICK = 1`，todo 立即弹，health 进队列等下一 tick。
    #[test]
    fn event_priority_todo_advance_first_then_health() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        let todo = todo_with("t1", "提前任务", Some("09:30"));
        let health = health_reminder("water", "定时喝水", 30, "2026-06-17T09:00:00.000+08:00");

        let plan = compute_tick("2026-06-17", &[todo], &[health], now);

        assert_eq!(plan.outcome.events.len(), 2);
        assert!(plan.outcome.events[0].title.contains("提前任务"));
        assert!(plan.outcome.events[0].title.contains("即将开始"));
        assert_eq!(plan.outcome.events[1].title, "定时喝水");
        assert!(plan.outcome.todos_changed);
        assert!(plan.outcome.reminders_changed);
    }

    /// `compute_tick` **不**做日期过滤（跨天隔离由 `run_tick` 负责）。
    #[test]
    fn compute_tick_processes_whatever_caller_passes_in() {
        // 已过时间的 todo 不会再弹窗（产品决议）—— 这是新行为。
        let now = sample_now(); // 10:05
        let todos = vec![todo_with("t1", "十点任务", Some("10:00"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert!(
            plan.outcome.events.is_empty(),
            "到点之后不再弹窗（无论传入哪个 bucket）"
        );
    }

    /// 多条 todo 在同一窗口命中，events 顺序按输入顺序。
    #[test]
    fn multiple_advance_events_preserve_input_order() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        let todos = vec![
            todo_with("a", "A", Some("09:25")),
            todo_with("b", "B", Some("09:26")),
            todo_with("c", "C", Some("09:27")),
        ];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert_eq!(plan.outcome.events.len(), 3);
        assert!(plan.outcome.events[0].title.contains("A"));
        assert!(plan.outcome.events[1].title.contains("B"));
        assert!(plan.outcome.events[2].title.contains("C"));
    }

    /// 同一 todo 已 advance → 后续 tick 不再重弹 → 全部 todo 不弹窗。
    /// 老测试里 `due_fires_after_upcoming_for_same_todo` 期望"到点再弹"——
    /// 已被产品决议取消，新行为下 advance 之后没有任何 popup。
    #[test]
    fn advanced_todo_never_fires_again_including_due_time() {
        // reminderTime=10:15 → advance 窗口 [10:05, 10:15)
        let now_first = Local
            .with_ymd_and_hms(2026, 6, 17, 10, 10, 0)
            .single()
            .unwrap();
        let now_mid = Local
            .with_ymd_and_hms(2026, 6, 17, 10, 13, 0)
            .single()
            .unwrap();
        let now_due = Local
            .with_ymd_and_hms(2026, 6, 17, 10, 16, 0)
            .single()
            .unwrap();
        let todo = todo_with("t1", "吃饭", Some("10:15"));
        let plan1 = compute_tick("2026-06-17", &[todo], &[], now_first);
        assert_eq!(plan1.outcome.events.len(), 1);
        // 窗口内再 tick
        let plan2 = compute_tick("2026-06-17", &plan1.todos, &[], now_mid);
        assert!(plan2.outcome.events.is_empty());
        // 到点 tick
        let plan3 = compute_tick("2026-06-17", &plan1.todos, &[], now_due);
        assert!(
            plan3.outcome.events.is_empty(),
            "到点不应再补 due 弹窗（产品决议）"
        );
    }

    /// settings 字段保留兼容：即使 advanceReminderMinutes=0 / 5 / 30，
    /// todo 调度器**不读取**，写死为 10 分钟。
    #[test]
    fn compute_tick_ignores_advance_reminder_minutes_setting() {
        // 注：当前签名已不接受 advanceReminderMinutes 参数，本测试通过
        // 验证"reminderTime=09:30, now=09:20 始终弹窗"反向证明
        // 我们写死 10 分钟不读 settings。
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 9, 20, 0)
            .single()
            .unwrap();
        // reminderTime=09:30 → 提前 10min 窗口起点 09:20，now 正好在起点上
        let todos = vec![todo_with("t1", "任务", Some("09:30"))];
        let plan = compute_tick("2026-06-17", &todos, &[], now);
        assert_eq!(plan.outcome.events.len(), 1);
        assert!(plan.outcome.events[0].body.contains("10 分钟"));
    }

    // =======================================================================
    // MAX_POPUPS_PER_TICK 行为
    // =======================================================================

    #[test]
    fn max_popups_constant_is_one() {
        // 行为契约：单 tick 至多 1 个。改了之后消费方（前端）需要同步更新。
        assert_eq!(MAX_POPUPS_PER_TICK, 1);
    }

    #[test]
    fn todo_advance_minutes_constant_is_ten() {
        // 行为契约：产品决议写死 10 分钟。
        assert_eq!(TODO_ADVANCE_MINUTES, 10);
    }

    // =======================================================================
    // Scheduler 实例生命周期（不真正启动线程）
    // =======================================================================

    #[test]
    fn scheduler_status_initially_stopped_and_empty() {
        let scheduler = Scheduler::new();
        let status = scheduler.status();
        assert!(!status.running);
        assert_eq!(status.pending_popup_count, 0);
        assert_eq!(status.tick_interval_secs, TICK_INTERVAL.as_secs());
    }

    #[test]
    fn scheduler_drain_pending_returns_current_queue() {
        let scheduler = Scheduler::new();
        // 直接写 pending 队列
        {
            let mut q = scheduler.inner.pending_popups.lock().unwrap();
            q.push_back(ReminderPopupPayload {
                title: "x".into(),
                body: "y".into(),
                icon: None,
                sound_src: None,
                duration_ms: None,
                reminder_id: None,
            });
        }
        let drained = scheduler.drain_pending();
        assert_eq!(drained.len(), 1);
        assert!(scheduler.drain_pending().is_empty());
    }
}
