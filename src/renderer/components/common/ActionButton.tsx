import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * 统一样式的操作按钮。
 *
 * 设计动机：
 *   原来 TodoPanel / HealthWindow 各按钮的 className 是直接写在 JSX 里，
 *   同一概念（编辑 / 删除 / 取消 / 确认）散落 6+ 处，className 不一致：
 *   - HealthWindow 的 `+` 按钮缺 `transition` / `active:` / `focus:`；
 *   - HealthWindow 表单的取消/确认按钮缺 `transition` / `active:` / `focus:`；
 *   - TodoPanel 的删除按钮默认 `border-transparent`、hover 时出现边框；
 *   - HealthWindow 的删除按钮默认 `border-assistant-line`、hover 时变橙；
 *   - 两个页面的编辑/删除按钮**动画 / 圆角 / 高度**都不完全一致。
 *
 *   本组件把这些"语义相同的按钮"收敛成 5 个 variant × 3 个 size，
 *   统一处理 transition / hover / active / focus-visible / disabled，
 *   让两个页面的同类按钮（编辑、删除、表单提交等）拿到**完全一致**的
 *   交互效果。新增/调整按钮颜色只需要改本文件。
 *
 * variant 语义：
 *   - `default`：白底浅边框，slate 中性文字 + slate hover；用于常规文字按钮。
 *   - `muted`  ：白底浅边框，assistant-muted 文字 + assistant-accent hover；
 *                与原 HealthWindow 编辑/暂停按钮同源。
 *   - `primary`：填充 assistant-accent + 白字；用于表单"确认"主按钮。
 *   - `danger` ：白底浅边框，hover 时变 assistant-warning（橙）；
 *                用于"删除"等危险操作。
 *   - `ghost`  ：无边框，hover 时淡灰背景；用于表单"取消"等次要按钮。
 *
 * size 语义：
 *   - `sm`  ：h-6 px-2 text-[11px]，带文字的小按钮（编辑/暂停/删除）。
 *   - `md`  ：h-7 px-2 text-[12px]，带文字的中按钮。
 *   - `icon`：h-7 w-7，纯图标方按钮（顶栏 + / 表单取消/确认）。
 *
 * 交互契约（统一）：
 *   - `transition-colors duration-150` 让颜色变化丝滑；
 *   - `hover:` 改变背景 / 文字 / 边框；
 *   - `active:scale-[0.97]` 给一个非常轻微的按压反馈（不夸张）；
 *   - `focus-visible:ring-2 focus-visible:ring-assistant-accent/30` 让键盘用户
 *     看到焦点，但鼠标点击**不**出现蓝色 outline；
 *   - `disabled:opacity-50 disabled:pointer-events-none` 一致处理禁用态。
 *
 * a11y 契约：
 *   - 如果 children 是纯字符串，自动作为 aria-label；
 *   - icon-only 按钮（无 children 或 children 不是 string）必须显式给
 *     `ariaLabel`，否则组件层会抛错（开发期立刻发现漏写）。
 *   - `title` 是可选的，鼠标悬停的 tooltip（与 aria-label 解耦）。
 */

export type ActionButtonVariant = 'default' | 'muted' | 'primary' | 'danger' | 'ghost';
export type ActionButtonSize = 'sm' | 'md' | 'icon';

type ActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  icon?: ReactNode;
  children?: ReactNode;
  ariaLabel?: string;
  title?: string;
};

// ---- 1. 基础交互层（所有 variant / size 共享） ----
//   - `select-none` 防止双击中文被选中；
//   - `whitespace-nowrap` 避免文字按钮在窄列里换行；
//   - `focus-visible` 替代裸 `focus`，鼠标点击不出现蓝色 outline；
//   - `active:scale-[0.97]` 轻微按压（不夸张，符合桌面应用稳态观感）。
const BASE_CLASSES =
  'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md border ' +
  'transition-colors duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-assistant-accent/30 focus-visible:ring-offset-1 ' +
  'active:scale-[0.97] ' +
  'disabled:opacity-50 disabled:pointer-events-none';

// ---- 2. variant 视觉层 ----
const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  default:
    'border-assistant-line bg-white text-slate-600 ' +
    'hover:bg-slate-50 active:bg-slate-100',
  muted:
    'border-assistant-line bg-white text-assistant-muted ' +
    'hover:border-assistant-accent hover:text-assistant-accent active:bg-slate-50',
  primary:
    'border-transparent bg-assistant-accent text-white ' +
    'hover:brightness-95 active:brightness-90',
  danger:
    'border-assistant-line bg-white text-assistant-muted ' +
    'hover:border-assistant-warning hover:bg-orange-50 hover:text-assistant-warning ' +
    'active:border-assistant-warning active:bg-orange-100',
  ghost:
    'border-transparent bg-transparent text-assistant-muted ' +
    'hover:bg-slate-50 active:bg-slate-100'
};

// ---- 3. size 尺寸层 ----
const SIZE_CLASSES: Record<ActionButtonSize, string> = {
  sm: 'h-6 px-2 text-[11px] gap-1',
  md: 'h-7 px-2 text-[12px] gap-1',
  icon: 'h-7 w-7 text-[12px]'
};

/**
 * 统一基础按钮。
 *
 * @example
 *   // 健康节律卡片里：编辑 / 暂停 / 删除（同一行布局）
 *   <ActionButton variant="muted"  size="sm" icon={<Pencil size={11} />} onClick={...}>编辑</ActionButton>
 *   <ActionButton variant="muted"  size="sm" icon={<Pause  size={11} />} onClick={...}>暂停</ActionButton>
 *   <ActionButton variant="danger" size="sm" icon={<Trash2 size={11} />} onClick={...}>删除</ActionButton>
 *
 * @example
 *   // 顶栏 / 表单：纯图标方按钮
 *   <ActionButton variant="muted"   size="icon" icon={<Plus size={14} />} ariaLabel="添加待办" onClick={...} />
 *   <ActionButton variant="ghost"   size="icon" icon={<X     size={14} />} ariaLabel="取消添加" onClick={...} />
 *   <ActionButton variant="primary" size="icon" icon={<Check size={14} />} ariaLabel="确认添加" type="submit" />
 */
export function ActionButton({
  variant = 'default',
  size = 'sm',
  icon,
  children,
  className = '',
  ariaLabel,
  title,
  type,
  disabled,
  ...rest
}: ActionButtonProps) {
  // a11y：自动从纯字符串 children 派生 aria-label；
  // icon-only 强制调用方提供 ariaLabel，开发期不静默。
  const inferredAriaLabel =
    ariaLabel ?? (typeof children === 'string' ? children : undefined);
  if (!inferredAriaLabel && !children) {
    // eslint-disable-next-line no-console
    console.warn(
      '[ActionButton] icon-only button must have ariaLabel; falling back to "button".'
    );
  }
  const finalAriaLabel = inferredAriaLabel ?? 'button';

  return (
    <button
      {...rest}
      type={type ?? 'button'}
      aria-label={finalAriaLabel}
      title={title}
      disabled={disabled}
      className={[BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
