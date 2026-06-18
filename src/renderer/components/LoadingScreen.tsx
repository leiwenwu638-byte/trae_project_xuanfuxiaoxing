/**
 * 通用 loading / error 占位屏。主窗口、健康窗口、ReminderPopup 共用同一套
 * "等待 / 失败重试" 视觉，让所有窗口的等待态都有一致的体验，避免"白屏 → 内容"
 * 的跳变。
 *
 * 设计要点：
 *   - 居中、灰底、保留足够的内边距——避免在 400×600 窄窗口里贴边；
 *   - loading 用半透明 spinner + 文字，让用户清楚"正在加载"而不是"卡了"；
 *   - error 把原始错误信息显示出来，附"重试"按钮——invoke 失败不能静默用 fallback。
 */
import { useEffect, useState } from 'react';

export function LoadingScreen({ label = '正在加载...' }: { label?: string }) {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-assistant-bg text-assistant-ink"
    >
      <Spinner />
      <p className="text-[13px] text-assistant-muted">{label}</p>
    </main>
  );
}

export function SnapshotErrorScreen({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main
      role="alert"
      className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-assistant-bg px-6 text-assistant-ink"
    >
      <div className="text-[20px]" aria-hidden>
        ⚠️
      </div>
      <h1 className="text-[14px] font-semibold">无法加载今日计划</h1>
      <p className="max-w-[280px] text-center text-[12px] text-assistant-muted">
        {message || '请稍后重试，或重启应用。'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-assistant-line bg-white px-4 py-1.5 text-[12px] font-medium text-assistant-ink shadow-utility transition hover:bg-assistant-bg"
      >
        重试
      </button>
    </main>
  );
}

/** 简单的 CSS-only spinner，~12×12 圆点旋转。无外部依赖。 */
function Spinner() {
  return (
    <div
      aria-hidden
      className="h-5 w-5 animate-spin rounded-full border-2 border-assistant-line border-t-assistant-accent"
    />
  );
}

/**
 * ReminderPopup 专用的"已挂载就绪"占位。
 *
 * 弹窗以 `visible:false` 启动（避免白窗），React mount 后会立即调用
 * `showCurrentWindow` 把窗口显示出来。**在 React 第一次 render 完成之前**，
 * Tauri 不会显示窗口——但万一在某些极端情况下 React 首次 render 失败，
 * 给一个 fallback 文案至少让用户知道"这扇窗是干什么的"。
 */
export function PopupBootFallback({ title, body }: { title: string; body: string }) {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white px-4 text-center text-assistant-ink"
    >
      <div className="text-[18px]" aria-hidden>
        ⏰
      </div>
      <h1 className="text-[13px] font-semibold">{title}</h1>
      <p className="text-[12px] text-assistant-muted">{body}</p>
    </main>
  );
}

/** 简易"距显示 X 秒" hook，用在弹窗 duration 倒计时等场景。 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
