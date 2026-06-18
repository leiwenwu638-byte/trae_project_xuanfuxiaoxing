import type { TodoPriority } from '../../shared/types';
import { TODO_PRIORITY_DEFAULT, TODO_PRIORITY_LABEL } from '../../shared/types';

/**
 * 任务优先级 UI 组件（表单用选择器 + 列表用徽章）。
 *
 * 设计原则：
 *   - **轻量分段按钮**：表单里 4 个按钮横排，整体被一个浅边框 + 圆角容器包住，
 *     选中的按钮用 priority 颜色实色填充 + 白字；未选中的保持白底 + 浅紫灰边框
 *     + 一个 6px 圆点提示颜色。**不**引入下拉/弹层，窄窗口（380px）里也能完整
 *     看到 4 个选项；
 *   - **徽章**：列表里用 11px 圆角胶囊，颜色与表单选中色一致；已完成任务降低
 *     饱和度但仍可识别（`text-*-500/70` + `bg-*-50/50`）；
 *   - **颜色 token**：使用 Tailwind 内置色阶（rose / amber / violet / emerald），
 *     200 = 浅边框、500 = 实色（与现有 `assistant-accent` 紫保持视觉一致）；
 *   - **风格与现有 token 一致**：`text-assistant-ink` / `border-assistant-line`
 *     / `rounded-md`，不引入新的圆角或调色板；
 *   - **不破坏焦点样式**：选择器容器 `focus-within` 给一个非常浅的内圈提示
 *     （避免点击 segment 时没有任何视觉反馈），同时单个按钮自身用 `focus:outline-none`
 *     + `focus-visible:ring-2 focus-visible:ring-assistant-accent/30`，键盘
 *     导航（Tab）能看到清晰焦点，但鼠标点击不会出现蓝色 outline。
 *
 * 与 Rust 端契约：
 *   - 只接受 `TodoPriority` 联合类型；不在前端做"未知值降级"，但 `value` 为
 *     `undefined` / `null` 时落到 `TODO_PRIORITY_DEFAULT = 'medium'`。
 */

// ---- 1. 颜色 / 样式常量 ----

type PriorityPalette = {
  /** 未选中描边 / 选中实色 / 选中白字 */
  border: string;
  borderSelected: string;
  bgSelected: string;
  textSelected: string;
  /** 未选中文字 / 颜色点 / 列表徽章 */
  dot: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  /** 已完成时的低饱和度 */
  badgeBgDone: string;
  badgeTextDone: string;
};

const PALETTE: Record<TodoPriority, PriorityPalette> = {
  critical: {
    border: 'border-rose-200',
    borderSelected: 'border-rose-500',
    bgSelected: 'bg-rose-500',
    textSelected: 'text-white',
    dot: 'bg-rose-500',
    text: 'text-rose-600',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBgDone: 'bg-rose-50/50',
    badgeTextDone: 'text-rose-500/70'
  },
  high: {
    border: 'border-amber-200',
    borderSelected: 'border-amber-500',
    bgSelected: 'bg-amber-500',
    textSelected: 'text-white',
    dot: 'bg-amber-500',
    text: 'text-amber-600',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBgDone: 'bg-amber-50/50',
    badgeTextDone: 'text-amber-500/70'
  },
  medium: {
    border: 'border-violet-200',
    borderSelected: 'border-violet-500',
    bgSelected: 'bg-violet-500',
    textSelected: 'text-white',
    dot: 'bg-violet-500',
    text: 'text-violet-600',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    badgeBgDone: 'bg-violet-50/50',
    badgeTextDone: 'text-violet-500/70'
  },
  low: {
    border: 'border-emerald-200',
    borderSelected: 'border-emerald-500',
    bgSelected: 'bg-emerald-500',
    textSelected: 'text-white',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBgDone: 'bg-emerald-50/50',
    badgeTextDone: 'text-emerald-500/70'
  }
};

const ORDER: ReadonlyArray<TodoPriority> = ['critical', 'high', 'medium', 'low'];

// ---- 2. PrioritySelector ----

type PrioritySelectorProps = {
  value: TodoPriority | null | undefined;
  onChange: (next: TodoPriority) => void;
  /** 可选：覆盖 `TODO_PRIORITY_LABEL`，用于不同上下文（例如"修改任务优先级"）。 */
  ariaLabel?: string;
  /** 测试 / 调试：暴露在外层容器的 data-testid。 */
  testId?: string;
};

/**
 * 4 段优先级选择器（分段按钮）。
 *
 * 选中状态用 `aria-pressed`，单选语义由 4 个 `aria-pressed` 按钮共同表达；
 * 这样屏幕阅读器既能读出"按钮 / 已按下"，也能逐项读出 label。
 */
export function PrioritySelector({ value, onChange, ariaLabel, testId }: PrioritySelectorProps) {
  const current: TodoPriority = value ?? TODO_PRIORITY_DEFAULT;
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? '任务优先级'}
      data-testid={testId}
      className="mt-1 inline-flex h-8 w-full overflow-hidden rounded-md border border-assistant-line bg-white focus-within:ring-2 focus-within:ring-assistant-accent/20"
    >
      {ORDER.map((p, index) => {
        const selected = p === current;
        const palette = PALETTE[p];
        const isLast = index === ORDER.length - 1;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={selected}
            aria-label={`${TODO_PRIORITY_LABEL[p]}${selected ? '（已选中）' : ''}`}
            data-testid={`${testId ?? 'todo-priority-selector'}-option-${p}`}
            onClick={() => onChange(p)}
            className={[
              'flex h-full flex-1 items-center justify-center gap-1 px-1 text-[12px] transition',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-assistant-accent/40 focus-visible:ring-inset',
              isLast ? '' : 'border-r border-assistant-line',
              selected
                ? `${palette.bgSelected} ${palette.textSelected} font-medium`
                : `bg-white ${palette.text} hover:bg-assistant-wash/60`
            ].join(' ')}
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${selected ? 'bg-white/80' : palette.dot}`}
            />
            <span className="truncate">{TODO_PRIORITY_LABEL[p]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- 3. PriorityBadge（列表展示用） ----

type PriorityBadgeProps = {
  priority?: TodoPriority | null;
  /** 已完成任务降饱和度。 */
  completed?: boolean;
  className?: string;
};

/**
 * 列表项里展示任务优先级的徽章。
 *
 * - 默认（未完成）使用 priority 实色背景的浅版（`-50`） + 深色文字；
 * - 已完成时降低饱和度（`bg-*-50/50` + `text-*-500/70`），仍可识别是同一个 priority。
 *
 * 缺失 priority 时按 `TODO_PRIORITY_DEFAULT` 渲染，与 `App.migrateTodoPriority` 兜底一致。
 */
export function PriorityBadge({ priority, completed, className }: PriorityBadgeProps) {
  const p: TodoPriority = priority ?? TODO_PRIORITY_DEFAULT;
  const palette = PALETTE[p];
  return (
    <span
      data-testid={`todo-priority-badge-${p}`}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-tight',
        completed ? `${palette.badgeBgDone} ${palette.badgeTextDone}` : `${palette.badgeBg} ${palette.badgeText}`,
        className ?? ''
      ].join(' ')}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${completed ? palette.dot + '/60' : palette.dot}`}
      />
      {TODO_PRIORITY_LABEL[p]}
    </span>
  );
}
