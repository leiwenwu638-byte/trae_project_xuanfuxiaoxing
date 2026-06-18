//! Tauri 窗口管理
//!
//! 集中维护三类窗口（Todo / Health / ReminderPopup）的配置和行为，
//! 避免散落在 `commands.rs` 里的字符串字面量。
//!
//! 主要职责：
//!   1. `open_or_focus_window` — 拿 label 检查 `webview_windows()`，存在则
//!      `show + unminimize + set_focus`，不存在则用 `WebviewWindowBuilder`
//!      重新创建。实现"已存在则聚焦，不重复创建"的验收点。
//!   2. `replace_window` — 先关闭已存在的同 label 窗口，再用新参数重建。
//!      用于 reminder-popup：每次 payload 都可能不同，单纯聚焦会让旧窗口
//!      继续显示上一条提醒内容。
//!   3. `close_window` / `hide_window` — 按 label 操作指定窗口。
//!   4. 集中维护窗口配置（label/title/size/装饰/透明/置顶/跳过任务栏）。
//!
//! 窗口配置：
//!
//!   | Window          | Size    | Decorations | Transparent | AlwaysOnTop | SkipTaskbar |
//!   |-----------------|---------|-------------|-------------|-------------|-------------|
//!   | Todo            | 800x600 | false       | true        | false       | true        |
//!   | Health          | 380x600 | true        | false       | false       | true        |
//!   | ReminderPopup   | 320x180 | false       | true        | true        | true        |
//!
//! URL 路由与 `src/renderer/App.tsx` 的 `?view=` 共享：
//!   - `?view=todo`    → 今日待办
//!   - `?view=health`  → 健康窗口
//!   - `?view=popup`   → 提醒弹窗
//!
//! 弹窗 payload 通过 `WebviewWindowBuilder::initialization_script` 注入到
//! `window.__REMINDER_POPUP_PAYLOAD__`，App.tsx 读出来喂给 `<ReminderPopup />`。
//!
//! 不在本阶段范围：
//!   - 通知 / AI
//!   - 跨进程的窗口位置持久化；当前只在内存里
//!
//! 路线说明（第八阶段收尾）：
//!   - 悬浮球（FloatingBall）已**永久取消**。系统托盘作为应用唯一常驻入口。
//!   - `WindowKind` 不再有 `Ball` 变体；任何"打开今日计划"动作走
//!     [`open_todo_or_focus_main`] 复用 main 窗口，不会创建独立悬浮球。
//!   - `settings.ball*` 字段保留是出于向后兼容老 settings.json（详见
//!     `models.rs::GeneralSettings` 的 `ball_*` 注释），后续清理需走数据迁移版本。

use tauri::Result as TauriResult;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::models::ReminderPopupPayload;

// ---------------------------------------------------------------------------
// 窗口类型与配置
// ---------------------------------------------------------------------------

/// 业务上识别三类窗口。
/// 不同的 WindowKind 对应不同的 label / title / url / size / 装饰 / 透明 / 置顶。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    /// 今日待办窗口。题目要求："悬浮小醒 - 今日计划"，800x600，无边框 + 透明，跳过任务栏。
    Todo,
    /// 健康提醒窗口。题目要求："悬浮小醒 - 健康节律"，380x600。
    Health,
    /// 提醒弹窗。题目要求：轻量、置顶、无边框、跳过任务栏。
    ReminderPopup,
}

impl WindowKind {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Health => "health",
            Self::ReminderPopup => "reminder-popup",
        }
    }

    pub fn title(&self) -> &'static str {
        match self {
            Self::Todo => "悬浮小醒 - 今日计划",
            Self::Health => "悬浮小醒 - 健康节律",
            Self::ReminderPopup => "悬浮小醒 - 提醒",
        }
    }

    /// 加载的 URL（相对 vite dev / 打包后资源根）。
    pub fn url(&self) -> &'static str {
        match self {
            Self::Todo => "index.html?view=todo",
            Self::Health => "index.html?view=health",
            Self::ReminderPopup => "index.html?view=popup",
        }
    }

    pub fn size(&self) -> (f64, f64) {
        match self {
            // 主窗口实际尺寸由 tauri.conf.json 提供（400x600），WindowKind::Todo
            // 当前只用于兜底（main 不存在时建独立 todo 窗口）。800x600 与
            // 弹窗/历史视觉一致，保留。
            Self::Todo => (800.0, 600.0),
            Self::Health => (380.0, 600.0),
            Self::ReminderPopup => (320.0, 180.0),
        }
    }

    pub fn decorations(&self) -> bool {
        match self {
            // Todo 窗口保持无边框，贴近轻量工具窗体验。
            Self::Todo => false,
            Self::Health => true,
            Self::ReminderPopup => false,
        }
    }

    pub fn transparent(&self) -> bool {
        match self {
            Self::Todo => true,
            Self::Health => false,
            Self::ReminderPopup => true,
        }
    }

    pub fn always_on_top(&self) -> bool {
        match self {
            Self::Todo => false,
            Self::Health => false,
            Self::ReminderPopup => true,
        }
    }

    /// 工具窗口跳过任务栏，Tauri 端对应 `skip_taskbar`。
    /// Linux 上 skip_taskbar 不一定生效；题目要求是 Windows 参赛版，可忽略。
    pub fn skip_taskbar(&self) -> bool {
        true
    }

    pub fn resizable(&self) -> bool {
        match self {
            Self::Todo => false,
            Self::Health => true,
            Self::ReminderPopup => false,
        }
    }
}

// ---------------------------------------------------------------------------
// 行为 API
// ---------------------------------------------------------------------------

/// 打开或聚焦一个业务窗口。
///
/// 1. `app.get_webview_window(label)` 查找已存在的窗口；
/// 2. 存在则 `show + unminimize + set_focus`，让旧窗口回到前台（验收点：已存在则聚焦，不重复创建）；
/// 3. 不存在则用 `WebviewWindowBuilder` 创建新窗口；
/// 4. `initialization_script` 用于弹窗 payload 注入；其他窗口传 None 即可。
///
/// 注意：本函数对**所有**窗口都做"已存在则聚焦"。但 reminder-popup 不应
/// 走这条路径（payload 每次都不同），请用 [`replace_window`] 替代。
pub fn open_or_focus_window(
    app: &AppHandle,
    kind: WindowKind,
    initialization_script: Option<&str>,
) -> TauriResult<()> {
    let label = kind.label();

    if let Some(window) = app.get_webview_window(label) {
        // 旧窗口：先确保可见 / 还原最小化，再聚焦。
        // 这些操作都可能因为窗口状态异常失败（如已 destroyed），
        // 用 let _ = 吞错；不阻挡后续的 set_focus。
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    build_window(app, kind, initialization_script)
}

/// "打开今日计划"专享入口：优先聚焦 main 窗口，回退到 label=`todo` 独立窗口。
///
/// 与 [`open_or_focus_window`] 的区别：
///   - 后者只看 `WindowKind::Todo` 对应的 label=`todo` 窗口；
///   - 本函数**先**查找 label=`main` 窗口（也就是 Tauri 启动时默认的 `index.html`
///     窗口，已经渲染了 `<TodoPanel />`），存在则 `show+unminimize+set_focus` 复用；
///   - main 不存在时才回退到 `open_or_focus_window(Todo)` 创建 label=`todo` 的
///     独立窗口，作为兜底。
///
/// 调用方：
///   - `commands::open_todo_window`（前端 `openTodoWindow` 通过 invoke 触发）
///   - `tray::dispatch_action(MenuAction::OpenTodo)`（托盘"今日计划"菜单）
///
/// 必须保持两条路径走同一份代码——这样不会出现"前端开一份、托盘开一份"的
/// 双窗口问题；任何"今天待办"进入都只会落到 main（或 fallback 到 todo）。
pub fn open_todo_or_focus_main(app: &AppHandle) -> TauriResult<()> {
    if let Some(main) = app.get_webview_window("main") {
        // 与 open_or_focus_window 内部一致：show + unminimize + set_focus
        // 各自吞错，阻挡其中一项失败不应影响其他动作。
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
        return Ok(());
    }
    // 兜底：main 不存在时（用户主动关掉且 main 被销毁——极少见），
    // 走标准 open_or_focus_window 创建独立 todo 窗口，命令不失败。
    open_or_focus_window(app, WindowKind::Todo, None)
}

/// 关闭 label 对应的窗口。不存在时 noop（不报错）。
pub fn close_window(app: &AppHandle, label: &str) -> TauriResult<()> {
    if let Some(window) = app.get_webview_window(label) {
        window.close()?;
    }
    Ok(())
}

/// 隐藏 label 对应的窗口。不存在时 noop。
pub fn hide_window(app: &AppHandle, label: &str) -> TauriResult<()> {
    if let Some(window) = app.get_webview_window(label) {
        window.hide()?;
    }
    Ok(())
}

/// 强制替换指定 label 的窗口：先关闭旧窗口，再用新参数重建。
///
/// 与 `open_or_focus_window` 的区别：
///   - 后者在窗口已存在时只 show+focus，**保留旧 webview 实例**；
///   - 本函数会 close 旧窗口后重新 `WebviewWindowBuilder::build()`，让
///     `initialization_script` 在全新的 webview 上再次执行。
///
/// 当前唯一调用方是 `commands::show_reminder_popup`：
///   弹窗 payload（title / body / icon / soundSrc）每次都不同，
///   如果只聚焦旧窗口，新 payload 永远不会被 `__REMINDER_POPUP_PAYLOAD__`
///   覆盖，旧提醒会一直挂在屏幕上。
///
/// 行为细节：
///   - 旧窗口 close 后立即重建，不留间隔，避免用户感知到闪烁（实际仍会有
///     webview 初始化的几百毫秒，但比"先关再开"更顺）；
///   - 旧窗口不存在时等价于 `open_or_focus_window`，不会报错；
///   - `initialization_script` 会在新 webview 加载 HTML 之前同步执行，
///     不会与 React 渲染产生竞态。
///   - `custom_url` 若为 `Some`，用其覆盖 `WindowKind::url()` 默认值；这是
///     弹窗"URL query 传 payload"功能的承载点。
pub fn replace_window_with_url(
    app: &AppHandle,
    kind: WindowKind,
    initialization_script: Option<&str>,
    custom_url: Option<String>,
) -> TauriResult<()> {
    let label = kind.label();
    // 1. 关闭旧窗口（若存在）。close 异步触发，但 AppHandle 一旦返回
    //    label 不再可解析为已构建的窗口，所以下一步 build 用同一个 label
    //    不会冲突。
    if let Some(window) = app.get_webview_window(label) {
        // 关闭失败也不阻挡后续 build（极端情况下旧窗口可能处于 invalid 态），
        // 吞错后继续；典型路径是直接 close() 成功。
        let _ = window.close();
    }
    // 2. 走标准创建路径。build_window 已经处理 `ReminderPopup` 的
    //    `visible:false` + 顶部居中；custom_url 透传给 builder。
    build_window_with_url(app, kind, initialization_script, custom_url)
}

/// build_window 的 url 透传版本。`open_or_focus_window` 不需要 custom_url，
/// 走原 `build_window` 即可；`replace_window_with_url` 给弹窗场景用。
fn build_window_with_url(
    app: &AppHandle,
    kind: WindowKind,
    initialization_script: Option<&str>,
    custom_url: Option<String>,
) -> TauriResult<()> {
    let label = kind.label();
    let (w, h) = kind.size();
    let url_string = custom_url.unwrap_or_else(|| kind.url().to_string());
    // 先按窗口类型分支决定是否调 `.center()`。
    //   - main / health：默认居中显示；
    //   - ReminderPopup：不调 `.center()`，**完全**交给后面的 `.position(x, y)`，
    //     避免 Tauri 2 builder 的 "center flag 覆盖具体坐标" 行为把弹窗
    //     拽回屏幕正中。
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url_string.into()))
        .title(kind.title())
        .inner_size(w, h)
        .decorations(kind.decorations())
        .transparent(kind.transparent())
        .always_on_top(kind.always_on_top())
        .skip_taskbar(kind.skip_taskbar())
        .resizable(kind.resizable());

    if !matches!(kind, WindowKind::ReminderPopup) {
        builder = builder.center();
    }

    if let Some(script) = initialization_script {
        builder = builder.initialization_script(script);
    }

    // ReminderPopup 特殊处理：
    //   1. 初始 `visible(false)`，避免 React 挂载期间白窗闪现；
    //   2. 主显示器顶部居中（y=100，x 居中），不依赖 `.center()`。
    //   3. 拿不到主显示器时（极少见），硬编码 (200, 100) 兜底——绝不让 popup
    //      回到屏幕正中。
    if matches!(kind, WindowKind::ReminderPopup) {
        builder = builder.visible(false);
        let position = popup_top_center_position(app, w, h).unwrap_or((200.0, 100.0));
        builder = builder.position(position.0, position.1);
    }

    builder.build()?;
    Ok(())
}

/// 旧入口，保留兼容：todo / health 场景用。ReminderPopup 不走这里。
fn build_window(
    app: &AppHandle,
    kind: WindowKind,
    initialization_script: Option<&str>,
) -> TauriResult<()> {
    build_window_with_url(app, kind, initialization_script, None)
}

/// 把 `ReminderPopupPayload` 序列化为 URL query string，让 React 在首屏渲染
/// 时即可通过 `new URLSearchParams(location.search)` 拿到 payload 字段。
///
/// 同时仍然注入 `__REMINDER_POPUP_PAYLOAD__`（在 `show_popup` 里）——两路并行：
///   - URL：React 首屏可读，无白窗；
///   - 注入变量：兜底，老的初始化逻辑不丢。
///
/// `duration_ms` 走 `&dur=`（更短，避免 query string 冗长）；
/// `reminder_id` 走 `&rid=`。中文 / 特殊字符由内联 percent-encoder 编码，
/// 不引入新依赖（标准 `url` crate 较重，而 percent-encoding 就一个工具函数）。
fn build_popup_url(payload: &ReminderPopupPayload) -> Option<String> {
    let base = WindowKind::ReminderPopup.url();
    let mut url = base.to_string();
    if base.contains('?') {
        url.push('&');
    } else {
        url.push('?');
    }
    url.push_str("title=");
    url.push_str(&percent_encode(&payload.title));
    url.push_str("&body=");
    url.push_str(&percent_encode(&payload.body));
    if let Some(icon) = payload.icon.as_deref() {
        url.push_str("&icon=");
        url.push_str(&percent_encode(icon));
    }
    if let Some(sound) = payload.sound_src.as_deref() {
        url.push_str("&sound=");
        url.push_str(&percent_encode(sound));
    }
    if let Some(dur) = payload.duration_ms {
        url.push_str("&dur=");
        url.push_str(&dur.to_string());
    }
    if let Some(rid) = payload.reminder_id.as_deref() {
        url.push_str("&rid=");
        url.push_str(&percent_encode(rid));
    }
    Some(url)
}

/// RFC 3986 风格的 URL percent encoder，保留 unreserved 字符
///（`A-Z / a-z / 0-9 / - / _ / . / ~`），其它字符编码为 `%XX`。
///
/// 中文走 UTF-8，每个字节独立 `%XX`，最终是合法的 URL 编码。
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        let unreserved = matches!(
            b,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~'
        );
        if unreserved {
            out.push(b as char);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", b));
        }
    }
    out
}

/// 计算 ReminderPopup 的"主显示器顶部居中"位置。
///
///   - x = (screen_width - popup_width) / 2
///   - y = 100（落在 80–120 区间正中）
///
/// 多显示器场景：本阶段先固定走主显示器。多显示器适配涉及判断鼠标所在
/// monitor，需要调用 `app.cursor_position()` 然后比 monitor 列表的物理
/// 范围；复杂度偏高，留到下一阶段。当前主显示器顶部居中已满足常规需求。
///
/// 返回 `(x, y)` 用逻辑像素（logical px），与 Tauri `.position(x, y)` 接口一致。
/// 物理像素换算：物理 / scale_factor = 逻辑。
fn popup_top_center_position(app: &AppHandle, popup_w: f64, popup_h: f64) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let size = *monitor.size();
    let pos = *monitor.position();
    // Tauri 的 .position() 接受逻辑像素坐标；这里把物理像素除以 scale 拿到逻辑值。
    let screen_w_logical = size.width as f64 / scale;
    // y 用主显示器自身坐标（不是全桌面坐标），避免多屏向下偏移；pos.y 在多屏
    // 场景下可能为负，x = (screen_w - popup_w) / 2 是相对主显示器的居中。
    let x_logical = pos.x as f64 / scale + (screen_w_logical - popup_w) / 2.0;
    // 固定 100 像素（逻辑）。多屏高度不同无所谓——固定偏移即可。
    let y_logical = pos.y as f64 / scale + 100.0;
    let _ = popup_h; // 暂不使用（高度由 always_on_top 决定垂直逻辑）
    Some((x_logical.max(0.0), y_logical.max(0.0)))
}

/// 把 `payload` 序列化为 JSON，并通过 `replace_window_with_url` 注入新弹窗 webview。
///
/// 共享入口，被 `commands::show_reminder_popup` 与 `scheduler::tick` 同时调用：
///   - command 路径：前端 `desktopApi.window.showReminderPopup` invoke 过来；
///   - 调度路径：tick 命中 to-do / 健康提醒时，由 scheduler 主动调用本函数。
///
/// `replace_window_with_url` 保证每次调用都是新 payload——即使上一次弹窗还在
/// 屏幕上，也会被关闭重建，旧 payload 不会卡住。
///
/// payload 同时通过两种方式传给 webview，避免任何一种方式不可用时丢内容：
///   1. `initialization_script` 注入 `window.__REMINDER_POPUP_PAYLOAD__`，
///      React 在 mount 后读取（兼容旧版 webview / 启动期早于 React 加载的场景）；
///   2. URL query 参数（`&title=&body=&icon=&sound=`）让 React 在首次渲染时
///      就能拿到 payload（不依赖 `window.__REMINDER_POPUP_PAYLOAD__` 是否就绪）。
pub fn show_popup(app: &AppHandle, payload: &ReminderPopupPayload) -> TauriResult<()> {
    // ReminderPopupPayload 仅含 String/Option<String>/Option<u32>，
    // 序列化不可能失败；用 expect 保护类型系统不会泄露 serde 错误类型。
    let json = serde_json::to_string(payload)
        .expect("ReminderPopupPayload must always be JSON-serializable");
    let script = format!(
        "window.__REMINDER_POPUP_PAYLOAD__ = {json};\nwindow.__REMINDER_POPUP_READY__ = true;\n"
    );
    // URL query 参数：React 首屏可读，作为 initialization_script 的冗余通道。
    // 中文 / 特殊字符走 percent-encoding 不会被 Tauri 拒绝。
    let popup_url = build_popup_url(payload);
    replace_window_with_url(app, WindowKind::ReminderPopup, Some(&script), popup_url)
}

/// 显示 label 对应的窗口（`unminimize` + `show` + `set_focus`）。
/// ReminderPopup 走"visible:false 启动 → React 挂载后调用 show_window"路径，
/// 其它窗口暂未使用。
pub fn show_window(app: &AppHandle, label: &str) -> TauriResult<()> {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 单元测试（仅配置表，不涉及 Tauri runtime）
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_are_unique_per_kind() {
        let kinds = [
            WindowKind::Todo,
            WindowKind::Health,
            WindowKind::ReminderPopup,
        ];
        let mut labels: Vec<&str> = kinds.iter().map(|k| k.label()).collect();
        labels.sort();
        labels.dedup();
        assert_eq!(labels.len(), kinds.len());
    }

    #[test]
    fn todo_window_is_undecorated_and_transparent() {
        assert!(!WindowKind::Todo.decorations());
        assert!(WindowKind::Todo.transparent());
        assert!(!WindowKind::Todo.always_on_top());
        assert!(WindowKind::Todo.skip_taskbar());
        assert_eq!(WindowKind::Todo.size(), (800.0, 600.0));
    }

    #[test]
    fn health_window_is_decorated() {
        assert!(WindowKind::Health.decorations());
        assert!(!WindowKind::Health.transparent());
        assert!(!WindowKind::Health.always_on_top());
        assert!(WindowKind::Health.skip_taskbar());
        assert_eq!(WindowKind::Health.size(), (380.0, 600.0));
    }

    #[test]
    fn popup_is_undecorated_transparent_always_on_top_skip_taskbar() {
        assert!(!WindowKind::ReminderPopup.decorations());
        assert!(WindowKind::ReminderPopup.transparent());
        assert!(WindowKind::ReminderPopup.always_on_top());
        assert!(WindowKind::ReminderPopup.skip_taskbar());
        assert_eq!(WindowKind::ReminderPopup.size(), (320.0, 180.0));
    }

    #[test]
    fn urls_contain_view_param() {
        for kind in [
            WindowKind::Todo,
            WindowKind::Health,
            WindowKind::ReminderPopup,
        ] {
            assert!(
                kind.url().contains("view="),
                "url for {:?} should contain view= param",
                kind
            );
        }
    }
}
