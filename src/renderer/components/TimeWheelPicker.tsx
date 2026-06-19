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
/**
 * 默认回退时间：09:00。
 *
 * 选择理由：学习 / 工作场景的"上午开始认真做事"心智默认时间，
 * 提醒弹窗在这个时间出现是用户最容易接受的状态；如果 `value` 是
 * `null` 或解析失败，小时回退到 09、分钟回退到 00，保证 pick 出来
 * 永远是合法 `HH:mm`（00:00、09:30、23:59 都能正常选；不会出现
 * 24:00 / 99:99 / 带时区后缀的 `+08:30` 之类非法值）。
 */
const DEFAULT_HOUR = '09';
const DEFAULT_MINUTE = '00';
/** 浮层最小宽度，避免小时 + 分钟两列滚轮在窄 input 中挤变形。 */
const POPOVER_MIN_WIDTH = 240;
/** 浮层距视口边的最小内边距。 */
const VIEWPORT_MARGIN = 8;

function parseHour(value: string | null): string {
  if (!value) return DEFAULT_HOUR;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return DEFAULT_HOUR;
  const h = Number(match[1]);
  if (h < 0 || h > 23) return DEFAULT_HOUR;
  return String(h).padStart(2, '0');
}

function parseMinute(value: string | null): string {
  if (!value) return DEFAULT_MINUTE;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return DEFAULT_MINUTE;
  const m = Number(match[2]);
  if (m < 0 || m > 59) return DEFAULT_MINUTE;
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
  const triggerRef = useRef<HTMLDivElement>(null);
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

  // 打开时按 trigger 的位置计算浮层 fixed 坐标，并做基础视口边界修正：
  //   - 右侧不能超出 `window.innerWidth - VIEWPORT_MARGIN`；
  //   - 底部空间不足时优先向上展开（让 top = trigger.top - popoverHeight - 6），
  //     仍不足时回退到 viewport bottom - margin，至少让浮层主体可见；
  //   - 顶部边界：向上展开时不能小于 VIEWPORT_MARGIN。
  // 不引入定位库（无 popper / float-ui 等），仅做最小化修正。
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popoverWidth = Math.max(rect.width, POPOVER_MIN_WIDTH);

      // 横向：让 left 落在 [MARGIN, innerWidth - popoverWidth - MARGIN]
      const maxLeft = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - popoverWidth - VIEWPORT_MARGIN
      );
      const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), maxLeft);

      // 纵向：先尝试向下展开，浮层预估高度（与 wheel + footer 实际一致）
      const estimatedHeight = VIEWPORT_HEIGHT + 80; // 5 item + p-3 padding + footer
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      let top: number;
      if (spaceBelow >= estimatedHeight + VIEWPORT_MARGIN) {
        // 下方空间够：向下展开
        top = rect.bottom + 6;
      } else if (spaceAbove >= estimatedHeight + VIEWPORT_MARGIN) {
        // 下方不够但上方够：向上展开
        top = rect.top - estimatedHeight - 6;
      } else {
        // 上下都不够：选空间更大的一侧
        if (spaceAbove > spaceBelow) {
          top = VIEWPORT_MARGIN;
        } else {
          top = Math.max(VIEWPORT_MARGIN, window.innerHeight - estimatedHeight - VIEWPORT_MARGIN);
        }
      }

      setPos({ top, left, width: popoverWidth });
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

  /**
   * 触发器 = `<div role="button">` + 同级真正的 `<button>`（清除）。
   *
   * 旧实现把"清除 ×"塞在外层 `<button>` 里用 `role="button"` 表示，违反了
   * WAI-ARIA "不可交互元素嵌套"原则（一个 `<button>` 里再嵌一个 `role="button"`）。
   * 现在把外层改为 `div role="button" tabIndex={0}`，清除按钮作为真正独立
   * 的 `<button>` 与外层平级（绝对定位，不撑大触发器尺寸）。
   *
   * 键盘可访问性：
   *   - 外层 div 监听 `Enter` / `Space` → 切换 open；
   *   - 清除按钮独立聚焦、`aria-label="清除提醒时间"`、`type="button"` 防止
   *     触发表单提交。
   */
  return (
    <div className="relative">
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        className={`mt-1 flex h-8 w-full items-center gap-2 rounded-md border bg-white px-2 pr-7 text-left text-[13px] transition focus:outline-none focus:ring-0 ${
          value
            ? 'border-assistant-accent/50 text-assistant-ink hover:border-assistant-accent'
            : 'border-assistant-line text-assistant-muted hover:border-assistant-accent/50'
        }`}
      >
        <Clock size={14} className="flex-none text-assistant-muted" />
        <span className="flex-1 truncate">{value || placeholder}</span>
      </div>
      {value ? (
        <button
          type="button"
          aria-label="清除提醒时间"
          data-testid={testId ? `${testId}-clear` : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-assistant-muted transition hover:bg-assistant-wash hover:text-assistant-warning focus:outline-none focus:ring-0"
        >
          <X size={12} />
        </button>
      ) : null}
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
    </div>
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

  function wrapIndex(index: number): number {
    return (index + values.length) % values.length;
  }

  // 鼠标滚轮：preventDefault 后基于当前 selected 上下切换一项
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const currentIndex = values.indexOf(selected);
      if (currentIndex < 0) return;
      const step = event.deltaY > 0 ? 1 : -1;
      const nextIndex = wrapIndex(currentIndex + step);
      onSelect(values[nextIndex]);
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
      onSelect(values[wrapIndex(currentIndex + 1)]);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onSelect(values[wrapIndex(currentIndex - 1)]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelect(values[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelect(values[values.length - 1]);
    }
  }

  const selectedIndex = Math.max(0, values.indexOf(selected));
  const repeatedValues = [values, values, values].flatMap((copyValues, copyIndex) =>
    copyValues.map((value, valueIndex) => ({
      copyIndex,
      value,
      valueIndex,
      key: `${copyIndex}-${value}`
    }))
  );
  const centeredSelectedIndex = values.length + selectedIndex;
  // 列表前面已经有 PADDING_ITEMS 个 padding item；选中项只需要按真实列表索引上移。
  const offset = -centeredSelectedIndex * ITEM_HEIGHT;

  return (
    <div className="flex-1" role="group" aria-label={label}>
      <div
        ref={viewportRef}
        data-testid={`${testIdPrefix}-viewport`}
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
          data-testid={`${testIdPrefix}-list`}
          className="time-wheel-list transition-transform duration-200 ease-out"
          style={{ transform: `translateY(${offset}px)` }}
        >
          {Array.from({ length: PADDING_ITEMS }).map((_, index) => (
            <li key={`pad-top-${label}-${index}`} className="time-wheel-item" aria-hidden />
          ))}
          {repeatedValues.map(({ copyIndex, key, value, valueIndex }) => {
            const isSelected = copyIndex === 1 && value === selected;
            return (
              <li key={`${label}-${key}`} className="time-wheel-item">
                <button
                  type="button"
                  data-testid={copyIndex === 1 ? `${testIdPrefix}-${value}` : undefined}
                  aria-label={`${label} ${value}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(value)}
                  tabIndex={copyIndex === 1 ? 0 : -1}
                  className={`flex h-full w-full items-center justify-center text-[15px] transition ${
                    valueIndex === selectedIndex
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
