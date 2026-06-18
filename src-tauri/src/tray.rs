//! Tauri 系统托盘
//!
//! 系统托盘能力。
//!
//! 菜单项：
//!   - 今日计划  → 调 `open_todo_or_focus_main`，复用 main 窗口（避免双窗口）
//!   - 健康节律  → 调 `open_or_focus_window(Health)`，复用第五阶段窗口管理
//!   - 显示提醒测试 → 调 `window_manager::show_popup` 触发一个固定 payload 的弹窗
//!   - ──
//!   - 退出      → 先 `Scheduler::stop()`，再 `app.exit(0)`
//!
//! 点击托盘图标（左键单击）：等同于"今日计划"。
//!
//! 退出要求：
//!   - 退出菜单点击：先停调度器（避免后台线程持续跑），再 `app.exit(0)` 强退。
//!   - 普通窗口关闭：通过 `app.on_window_event` 拦截 main 窗口的 `CloseRequested`，
//!     `prevent_close` + `hide()`，让应用继续在托盘常驻。
//!
//! 不在本模块范围（明确不实现）：
//!   - 真实悬浮球（独立 always-on-top 小窗口）— **已永久取消**，
//!     系统托盘作为唯一常驻入口
//!   - 通知 / AI
//!   - 任务栏角标变化（unfinished todo count）— Tauri 端对应 `set_overlay_icon`，
//!     本阶段先不做（菜单项有"今日计划"已足够
//!     唤起用户；后续阶段补角标）。
//!
//! 测试策略：
//!   - `match_menu_id` 是**纯函数**：输入菜单事件 ID，输出 `MenuAction` enum。
//!   - 实际托盘构建、菜单注册、退出路径不进入单测（Tauri runtime 不可桩）；
//!     由 dev 工具 / 手动验证。

use tauri::{AppHandle, Manager};

use crate::models::ReminderPopupPayload;
use crate::window_manager::{self, WindowKind};

// ---------------------------------------------------------------------------
// 1. 菜单项 ID 常量（字符串字面量集中维护，避免散落）
// ---------------------------------------------------------------------------

/// 菜单项 ID。所有 on_menu_event 分发都走这四个字符串。
pub mod menu_id {
    pub const TODO: &str = "tray.open_todo";
    pub const HEALTH: &str = "tray.open_health";
    pub const TEST_POPUP: &str = "tray.test_popup";
    pub const QUIT: &str = "tray.quit";
}

/// 菜单显示文案。集中在这里方便 i18n 后续扩展。
pub mod menu_label {
    pub const TODO: &str = "今日计划";
    pub const HEALTH: &str = "健康节律";
    pub const TEST_POPUP: &str = "显示提醒测试";
    pub const QUIT: &str = "退出";
    pub const TRAY_TOOLTIP: &str = "悬浮小醒";
}

// ---------------------------------------------------------------------------
// 2. 菜单 ID → 行为的纯函数映射（可单测）
// ---------------------------------------------------------------------------

/// 菜单事件触发的逻辑动作。
///
/// 不直接调 Tauri API，让 on_menu_event 回调根据 enum 分派到
/// window_manager / scheduler。这样 menu_id → action 映射是纯函数，
/// 可以无 runtime 单元测试。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    /// 打开 / 聚焦今日计划窗口
    OpenTodo,
    /// 打开 / 聚焦健康节律窗口
    OpenHealth,
    /// 触发一个测试弹窗（payload 在 [build_test_popup_payload] 里定义）
    ShowTestPopup,
    /// 退出应用（调度器由回调在调 [`crate::scheduler::Scheduler::stop`] 后再 exit）
    Quit,
}

/// 把菜单事件 ID 翻译成 [`MenuAction`]。未知 ID 返回 `None`。
///
/// 纯函数：只做字符串到 enum 的映射，不读外部状态、不调 Tauri API。
/// 单测里可以直接覆盖所有四个 ID。
pub fn match_menu_id(id: &str) -> Option<MenuAction> {
    match id {
        menu_id::TODO => Some(MenuAction::OpenTodo),
        menu_id::HEALTH => Some(MenuAction::OpenHealth),
        menu_id::TEST_POPUP => Some(MenuAction::ShowTestPopup),
        menu_id::QUIT => Some(MenuAction::Quit),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// 3. 测试弹窗 payload
// ---------------------------------------------------------------------------

/// "显示提醒测试" 菜单项触发的固定 payload。
///
/// 与真实提醒弹窗共用 [`window_manager::show_popup`] 入口，
/// 不走调度器、不持久化状态——纯调试用。
pub fn build_test_popup_payload() -> ReminderPopupPayload {
    ReminderPopupPayload {
        title: "测试提醒".to_string(),
        body: "这是一条来自托盘菜单的测试弹窗，用来验证 reminder-popup 链路。".to_string(),
        icon: Some("🛎️".to_string()),
        sound_src: None,
        duration_ms: None,
        reminder_id: None,
    }
}

// ---------------------------------------------------------------------------
// 5. 实际行为分派（被 on_menu_event 回调调用）
// ---------------------------------------------------------------------------

/// 把 [`MenuAction`] 翻译成对 [`window_manager`] / [`crate::scheduler::Scheduler`] 的真实调用。
///
/// 单独抽出来而不是写在 on_menu_event 闭包里有两个好处：
///   1. 单测可以桩 `app` 然后断言 `dispatch_action` 是否调了正确的窗口方法；
///   2. 闭包里的逻辑保持最小，菜单 ID → action → 副作用三层分明。
///
/// **退出动作不在这里执行**——`Quit` 是个特殊动作，需要在
/// `lib.rs::run()` 的 `on_menu_event` 回调里同时做：
///   1. 停调度器（拿 `app.state::<Scheduler>()`）
///   2. 调 `app.exit(0)`
///
/// 这里只返回 `MenuAction::Quit`，由调用方在 `lib.rs` 决定怎么处理退出路径。
pub fn dispatch_action(app: &AppHandle, action: MenuAction) -> tauri::Result<()> {
    match action {
        MenuAction::OpenTodo => {
            // 复用 [`window_manager::open_todo_or_focus_main`]：优先聚焦 main 窗口
            // （Tauri 启动时默认的 index.html 窗口，已经渲染了 <TodoPanel />），
            // 避免出现"前端开一份、托盘开一份"的双窗口。
            // 与 commands::open_todo_window 走完全相同的代码路径，行为合同一致。
            window_manager::open_todo_or_focus_main(app)
        }
        MenuAction::OpenHealth => {
            // 复用第五阶段：health 窗口不存在则创建；已存在则 show+focus。
            window_manager::open_or_focus_window(app, WindowKind::Health, None)
        }
        MenuAction::ShowTestPopup => {
            // 复用第五阶段 + 第六阶段的 show_popup：走 replace_window 注入 payload。
            let payload = build_test_popup_payload();
            window_manager::show_popup(app, &payload)
        }
        MenuAction::Quit => {
            // 见 fn 文档说明：实际退出路径由 lib.rs 编排。
            // 这里返回 Ok(()) 占位——调用方应当忽略这个返回、自己 exit(0)。
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// 6. 实际托盘构建（被 lib.rs setup 阶段调用）
// ---------------------------------------------------------------------------

/// 构建系统托盘：图标 + 菜单 + 事件回调。
///
/// 失败返回 `tauri::Error`（如 icon 解析失败），由 `lib.rs` 决定是否让 build 继续。
/// 通常在沙箱 / 远程桌面 / 缺少 system tray 服务的环境会失败。
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;

    // ---- 1. 构造 4 个菜单项 + 1 个分隔符 ----
    // 第二个参数 `enabled=true` 表示菜单项可点击；`accelerator=None` 不绑快捷键。
    let todo_item = MenuItem::with_id(app, menu_id::TODO, menu_label::TODO, true, None::<&str>)?;
    let health_item =
        MenuItem::with_id(app, menu_id::HEALTH, menu_label::HEALTH, true, None::<&str>)?;
    let test_popup_item = MenuItem::with_id(
        app,
        menu_id::TEST_POPUP,
        menu_label::TEST_POPUP,
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, menu_id::QUIT, menu_label::QUIT, true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &todo_item,
            &health_item,
            &test_popup_item,
            &separator,
            &quit_item,
        ],
    )?;

    // ---- 2. 准备托盘图标 ----
    // 优先用 `default_window_icon`（tauri.conf.json bundle.icon 里的第一个），
    // 该路径在 dev / 打包后都能解析；缺失时返回明确错误。
    let icon = resolve_tray_icon(app)?;

    // ---- 3. 注册托盘 ----
    let _tray = TrayIconBuilder::with_id("xuanfu-xiaoxing-tray")
        .icon(icon)
        .tooltip(menu_label::TRAY_TOOLTIP)
        .menu(&menu)
        // 左键单击托盘图标：等同于"今日计划"
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = dispatch_action(app, MenuAction::OpenTodo);
            }
        })
        // 菜单事件：分发到 dispatch_action
        // Quit 是特殊路径：先停调度器，再 app.exit(0)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match match_menu_id(id) {
                Some(MenuAction::Quit) => {
                    // 1. 停调度器，避免后台线程继续 tick
                    if let Some(scheduler) = app.try_state::<crate::scheduler::Scheduler>() {
                        scheduler.stop();
                    }
                    // 2. 强制退出（0 表示正常退出码）
                    app.exit(0);
                }
                Some(action) => {
                    if let Err(error) = dispatch_action(app, action) {
                        eprintln!("[tray] dispatch_action failed for `{id}`: {error}");
                    }
                }
                None => {
                    eprintln!("[tray] unknown menu event id: {id}");
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// 解析托盘图标：使用 Tauri 配置解析出的默认窗口图标。
fn resolve_tray_icon(app: &AppHandle) -> tauri::Result<tauri::image::Image<'_>> {
    app.default_window_icon().cloned().ok_or_else(|| {
        tauri::Error::AssetNotFound(
            "failed to resolve tray icon: default_window_icon is None".to_string(),
        )
    })
}

// ---------------------------------------------------------------------------
// 5. 单元测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- match_menu_id 映射 ----

    #[test]
    fn todo_menu_id_maps_to_open_todo() {
        assert_eq!(match_menu_id(menu_id::TODO), Some(MenuAction::OpenTodo));
    }

    #[test]
    fn health_menu_id_maps_to_open_health() {
        assert_eq!(match_menu_id(menu_id::HEALTH), Some(MenuAction::OpenHealth));
    }

    #[test]
    fn test_popup_menu_id_maps_to_show_test_popup() {
        assert_eq!(
            match_menu_id(menu_id::TEST_POPUP),
            Some(MenuAction::ShowTestPopup)
        );
    }

    #[test]
    fn quit_menu_id_maps_to_quit() {
        assert_eq!(match_menu_id(menu_id::QUIT), Some(MenuAction::Quit));
    }

    #[test]
    fn unknown_menu_id_returns_none() {
        assert_eq!(match_menu_id("tray.unknown"), None);
        assert_eq!(match_menu_id(""), None);
        assert_eq!(match_menu_id("something_else"), None);
    }

    #[test]
    fn menu_id_constants_are_stable() {
        // 防止重命名常量后忘了同步 ID — 测试钉住稳定接口
        assert_eq!(menu_id::TODO, "tray.open_todo");
        assert_eq!(menu_id::HEALTH, "tray.open_health");
        assert_eq!(menu_id::TEST_POPUP, "tray.test_popup");
        assert_eq!(menu_id::QUIT, "tray.quit");
    }

    // ---- 测试弹窗 payload ----

    #[test]
    fn test_popup_payload_has_fixed_title_and_body() {
        let payload = build_test_popup_payload();
        assert_eq!(payload.title, "测试提醒");
        assert!(!payload.body.is_empty());
        // 写一个可断言的最小子串，避免以后改文案破坏契约
        assert!(payload.body.contains("托盘"));
    }

    #[test]
    fn test_popup_payload_uses_alarm_icon() {
        let payload = build_test_popup_payload();
        // 用 emoji 提示音图标，与真实提醒弹窗的 🔔 区分
        assert_eq!(payload.icon.as_deref(), Some("🛎️"));
    }

    #[test]
    fn test_popup_payload_is_detached_from_scheduler() {
        // 测试弹窗不应带 reminderId（与真实调度器触发的弹窗区分开）
        let payload = build_test_popup_payload();
        assert!(payload.reminder_id.is_none());
        assert!(payload.sound_src.is_none());
    }

    // ---- 菜单显示文案 ----

    #[test]
    fn menu_labels_are_non_empty() {
        // 文案必须非空，否则托盘菜单会渲染成空行
        for label in [
            menu_label::TODO,
            menu_label::HEALTH,
            menu_label::TEST_POPUP,
            menu_label::QUIT,
        ] {
            assert!(!label.trim().is_empty(), "菜单文案不能为空: {label}");
        }
        assert!(!menu_label::TRAY_TOOLTIP.trim().is_empty());
    }
}
