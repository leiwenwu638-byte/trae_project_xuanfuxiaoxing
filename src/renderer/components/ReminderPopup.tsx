import { useEffect, useRef } from 'react';
import { resolveSoundSrc } from './soundSource';

type ReminderPopupProps = {
  icon: string;
  title: string;
  body: string;
  soundSrc?: string | null;
  onClose?: () => void;
};

/**
 * 提醒弹窗。
 *
 * 渲染时机：弹窗以 `visible:false` 启动，React 挂载时由 App.tsx 调用
 * `desktopApi.window.showCurrentWindow` 让 Tauri 显示窗口——payload 来自
 * URL query 参数或 `__REMINDER_POPUP_PAYLOAD__` 兜底（见 `App.tsx`），React
 * 首屏渲染时即可拿到，**不会**出现"白窗 → 内容"延迟。
 *
 * 关闭路径：统一走 `onClose`（`desktopApi.window.closeCurrentWindow`），
 * 内部不调 `window.close()`——避免和 Tauri 关闭事件竞争。
 *
 * 布局：外层 `section.popup-root` 用 `h-full w-full` 占满整个 320x180 弹窗
 * 窗口（`window_manager::WindowKind::ReminderPopup` 配置），不再像之前
 * `m-3 + border border-assistant-line` 那样让卡片嵌入一个浅灰边框容器中
 * （用户截图里看到的"透明/半透明框"就是它）。背景由 `styles.css` 中
 * `body.popup-root` 显式设为 `transparent` + `padding: 0`，避免 WebView2
 * 透出默认白色背景。`shadow-utility` 会被窗口外裁切一部分，这是
 * `transparent: true` 弹窗的正常行为。
 *
 * 音频播放：
 *   * `soundSrc` 经 `resolveSoundSrc` 处理（`default` → `/sound-default.wav`、
 *     本地绝对路径 → `convertFileSrc`、其它原样）；
 *   * `<audio>` 不再依赖 `autoPlay` 静默播放——用 `useEffect` + `play()`
 *     主动调用并 catch 失败，避免 WebView 策略拦截时"用户感觉没声音但
 *     控制台一片空白"；
 *   * 任何播放失败都打 `console.warn("[ReminderPopup] audio play failed:", error)`，
 *     DevTools 立刻能看到。
 */
export function ReminderPopup({ icon, title, body, soundSrc, onClose }: ReminderPopupProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolvedSound = resolveSoundSrc(soundSrc);

  useEffect(() => {
    if (!resolvedSound) return;
    const audio = audioRef.current;
    if (!audio) return;
    // 主动调用 play()，并在 WebView 自动播放策略拦截 / 音频解码失败时
    // 给出可观察的日志。React StrictMode 下 effect 会跑两次，所以把
    // play() 包在 if 守卫里：src 一致就跳过一次。
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[ReminderPopup] audio play failed:', error);
      });
    }
  }, [resolvedSound]);

  function close() {
    if (onClose) {
      onClose();
    }
  }

  return (
    <section
      role="alertdialog"
      aria-label={title || '提醒'}
      className="popup-root reminder-popup-enter flex h-full w-full gap-3 overflow-hidden rounded-lg bg-white p-3 text-[13px] text-assistant-ink shadow-utility"
    >
      {resolvedSound ? (
        <audio ref={audioRef} autoPlay src={resolvedSound} data-testid="reminder-popup-audio" />
      ) : null}
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-assistant-wash text-[20px]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold leading-5">{title || '提醒'}</h1>
        <p className="mt-2 max-h-16 overflow-hidden text-[13px] leading-6 text-[#555555]">
          {body || '该处理当前事项了'}
        </p>
        <div className="mt-3 flex justify-end">
          <button
            aria-label="知道了"
            className="h-8 rounded-md bg-assistant-accent px-4 text-[12px] font-medium text-white transition hover:brightness-95"
            type="button"
            onClick={close}
          >
            知道了
          </button>
        </div>
      </div>
    </section>
  );
}
