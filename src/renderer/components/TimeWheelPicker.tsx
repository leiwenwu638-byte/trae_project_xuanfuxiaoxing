import { Clock, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 轻量时间滚轮选择器（HH:mm）。
 *
 * 设计目标（只在本组件内实现，不引入第三方时间选择器库）：
 *   - 触发器是一个按钮样式的"输入区域"，左侧时钟图标 + 当前值/占位文本，
 *     点击后从 `document.body` 渲染一个 Portal 浮层，避免被 `overflow:hidden`
 *     的父容器裁切；
 *   - 浮层内左右两列滚轮（小时 00–23、分钟 00–59），用 `transform: translateY`
 *     + `transition` 居中显示当前选中项，**不**用真实 `scroll` 滚动条
 *     （Tauri WebView2 滚动条样式不统一，且会与浮层 z-index 冲突）；
 *   - 滚轮支持三种交互：鼠标滚轮（preventDefault 后切换）、点击某项直接选中、
 *     键盘上下方向键（无障碍），所有路径最终都把"已格式化的 `HH:mm`"回调给
 *     上层 `onChange`；
 *   - 选中的"中间一行"用 `pointer-events:none` 的浅色高亮带标出，未选中项用
 *     低饱和色，与现有 `assistant-wash` / `assistant-muted` token 一致；
 *   - 浮层顶部/底部各 2 个不可见 padding `<li>`，让首项/末项也能滚到中间高亮
 *     位置（不顶死边缘）。
 *
 * 数据契约：
 *   - `value` 为 `HH:mm` 字符串或 `null`；
 *   - `onChange` 接收已格式化的 `HH:mm` 字符串（"00"–"23" / "00"–"59"），绝不
 *     会传非法值；
 *   - `onClear` 由上层把 `reminderTime` 置为 `null`（保持后端 `Option<String>` 契约）。
 */
type TimeWheelPickerProps = {
  value: string | null;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const ITEM_HEIGHT = 36; // 每个时间项高度（px），与 css 保持一致
const PADDING_ITEMS = 2; // 顶部 / 底部各 2 个不可见 padding item
const VIEWPORT_HEIGHT = 5 * ITEM_HEIGHT; // 5 个 item 可见（中间 + 上下各 2）

function parseHour(value: string | null): string {
  if (!value) return '09';
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '09';
  const h = Number(match[1]);
  if (h < 0 || h > 23) return '09';
  return String(h).padStart(2, '0');
}

function parseMinute(value: string | null): string {
  if (!value) return '00';
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '00';
  const m = Number(match[2]);
  if (m < 0 || m > 59) return '00';
  return String(m).padStart(2, '0');
}

function formatHHmm(hour: string, minute: string): string {
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export function TimeWheelPicker({
  value,
  onChange,
  onClear,
  placeholder = '选择提醒时间',
  ariaLabel,
  testId
}: TimeWheelPickerProps) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState<string>(() => parseHour(value));
  const [minute, setMinute] = useState<string>(() => parseMinute(value));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0
  });

  // 同步外部 value（例如编辑回显 / 清除）到内部 hour/minute
  useEffect(() => {
    setHour(parseHour(value));
    setMinute(parseMinute(value));
  }, [value]);

  // 打开时按 trigger 的位置计算浮层 fixed 坐标
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 240) });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // 点击浮层 / trigger 之外的区域关闭
  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function handleConfirm() {
    onChange(formatHHmm(hour, minute));
    setOpen(false);
  }

  function handleClear() {
    onClear();
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => setOpen((prev) => !prev)}
        className={`mt-1 flex h-8 w-full items-center gap-2 rounded-md border bg-white px-2 text-left text-[13px] transition focus:outline-none focus:ring-0 ${
          value
            ? 'border-assistant-accent/50 text-assistant-ink hover:border-assistant-accent'
            : 'border-assistant-line text-assistant-muted hover:border-assistant-accent/50'
        }`}
      >
        <Clock size={14} className="flex-none text-assistant-muted" />
        <span className="flex-1 truncate">{value || placeholder}</span>
        {value ? (
          <span
            role="button"
            aria-label="清除提醒时间"
            className="flex h-5 w-5 flex-none items-center justify-center rounded text-assistant-muted transition hover:bg-assistant-wash hover:text-assistant-warning"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            <X size={12} />
          </span>
        ) : null}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="选择提醒时间"
              data-testid="time-wheel-popover"
              className="time-wheel-popover fixed z-50 rounded-lg border border-assistant-line bg-white p-3 text-assistant-ink shadow-utility"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
              <div className="flex items-stretch gap-2">
                <WheelColumn
                  label="小时"
                  testIdPrefix="time-wheel-hour"
                  values={HOURS}
                  selected={hour}
                  onSelect={setHour}
                />
                <span className="self-center text-[15px] text-assistant-muted">:</span>
                <WheelColumn
                  label="分钟"
                  testIdPrefix="time-wheel-minute"
                  values={MINUTES}
                  selected={minute}
                  onSelect={setMinute}
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  aria-label="清除当前选择"
                  className="h-7 rounded-md px-2 text-[12px] text-assistant-muted transition hover:bg-assistant-wash"
                  onClick={handleClear}
                >
                  清除
                </button>
                <button
                  type="button"
                  aria-label="取消"
                  className="h-7 rounded-md px-2 text-[12px] text-assistant-muted transition hover:bg-assistant-wash"
                  onClick={() => setOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  aria-label="确定"
                  className="h-7 rounded-md bg-assistant-accent px-3 text-[12px] text-white transition hover:brightness-95"
                  onClick={handleConfirm}
                >
                  确定
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

type WheelColumnProps = {
  label: string;
  testIdPrefix: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
};

function WheelColumn({ label, testIdPrefix, values, selected, onSelect }: WheelColumnProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // 鼠标滚轮：preventDefault 后基于当前 selected 上下切换一项
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const currentIndex = values.indexOf(selected);
      if (currentIndex < 0) return;
      const step = event.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(values.length - 1, currentIndex + step));
      if (nextIndex !== currentIndex) onSelect(values[nextIndex]);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [selected, values, onSelect]);

  // 键盘上下方向键支持（无障碍 / 桌面键盘用户）
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = values.indexOf(selected);
    if (currentIndex < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      onSelect(values[Math.min(values.length - 1, currentIndex + 1)]);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onSelect(values[Math.max(0, currentIndex - 1)]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelect(values[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelect(values[values.length - 1]);
    }
  }

  const selectedIndex = Math.max(0, values.indexOf(selected));
  // 视口顶部 = PADDING_ITEMS * ITEM_HEIGHT（72px），让 selected 出现在视口中间。
  const offset = -selectedIndex * ITEM_HEIGHT + PADDING_ITEMS * ITEM_HEIGHT;

  return (
    <div className="flex-1" role="group" aria-label={label}>
      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="time-wheel-viewport relative overflow-hidden focus:outline-none focus:ring-0"
        style={{ height: VIEWPORT_HEIGHT }}
      >
        {/* 中间高亮带（与 css .time-wheel-highlight 对齐） */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 rounded-md bg-assistant-wash/80"
          style={{ top: PADDING_ITEMS * ITEM_HEIGHT, height: ITEM_HEIGHT }}
        />
        <ul
          className="time-wheel-list transition-transform duration-200 ease-out"
          style={{ transform: `translateY(${offset}px)` }}
        >
          {Array.from({ length: PADDING_ITEMS }).map((_, index) => (
            <li key={`pad-top-${label}-${index}`} className="time-wheel-item" aria-hidden />
          ))}
          {values.map((value) => {
            const isSelected = value === selected;
            return (
              <li key={`${label}-${value}`} className="time-wheel-item">
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-${value}`}
                  aria-label={`${label} ${value}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(value)}
                  className={`flex h-full w-full items-center justify-center text-[15px] transition ${
                    isSelected
                      ? 'font-semibold text-assistant-ink'
                      : 'text-assistant-muted/55 hover:text-assistant-ink'
                  }`}
                >
                  {value}
                </button>
              </li>
            );
          })}
          {Array.from({ length: PADDING_ITEMS }).map((_, index) => (
            <li key={`pad-bot-${label}-${index}`} className="time-wheel-item" aria-hidden />
          ))}
        </ul>
      </div>
      <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-assistant-muted">{label}</p>
    </div>
  );
}
