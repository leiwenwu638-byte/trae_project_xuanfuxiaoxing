export type BallSize = 'small' | 'medium' | 'large';
/** @deprecated 悬浮球路线已于第八阶段永久取消；该类型仅作 disk 占位。 */
export type BallSize_DEPRECATED = BallSize;

/**
 * 待办优先级。稳定英文枚举，与 Rust `models::TodoPriority` 一一对应：
 *   - `critical` 特别重要（红色）
 *   - `high`     重要（橙色）
 *   - `medium`   中等（紫色 / 默认）
 *   - `low`      一般（绿色）
 *
 * 中文标签仅在 UI 层映射；存储 / IPC 走英文小写字面量，与 serde `rename_all` 一致。
 */
export type TodoPriority = 'critical' | 'high' | 'medium' | 'low';

export const TODO_PRIORITY_LABEL: Record<TodoPriority, string> = {
  critical: '特别重要',
  high: '重要',
  medium: '中等',
  low: '一般'
};

export const TODO_PRIORITY_DEFAULT: TodoPriority = 'medium';

export type AiProviderType = 'deepseek' | 'openai' | 'custom_openai_compatible';

export type AiPublicConfig = {
  enabled: boolean;
  provider: AiProviderType;
  baseUrl: string;
  model: string;
  apiKeySaved: boolean;
};

export type SaveAiConfigInput = {
  provider: AiProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type AiConnectionTestResult = {
  ok: boolean;
  message: string;
};

export type AiExistingTodo = {
  title: string;
  reminderTime: string | null;
  priority: TodoPriority;
  completed: boolean;
};

export type AiPlanRequest = {
  userInput: string;
  date: string;
  currentTime: string;
  existingTodos: AiExistingTodo[];
};

export type AiGeneratedTodo = {
  title: string;
  reminderTime: string | null;
  priority: TodoPriority;
  soundEnabled: boolean;
  reason?: string;
};

export type AiPlanDraft = {
  summary: string;
  todos: AiGeneratedTodo[];
  warnings: string[];
};

export type ApplyAiPlanInput = {
  todos: AiGeneratedTodo[];
};

export type Todo = {
  id: string;
  title: string;
  reminderTime: string | null;
  soundEnabled: boolean;
  completed: boolean;
  /**
   * 任务优先级。读取老 todos.json（无该字段）时由 `App.tsx` 的
   * `migrateTodoPriority` 兜底为 `TODO_PRIORITY_DEFAULT`，与 Rust 端
   * `TodoPriority::default() = Medium` 行为一致。
   */
  priority: TodoPriority;
  advanceRemindedAt?: string | null;
  remindedAt: string | null;
  createdAt: string;
};

export type TodoStore = Record<string, Todo[]>;

export type HealthReminder = {
  id: string;
  name: string;
  icon: string;
  intervalMinutes: number;
  message: string;
  soundEnabled: boolean;
  soundFilePath: string | null;
  enabled: boolean;
  lastTriggeredAt: string | null;
  nextTriggerAt: string | null;
};

export type AddHealthReminderInput = {
  name: string;
  intervalMinutes: number;
  message: string;
  /**
   * 用户是否启用"提示音"。本字段在上一阶段被 `soundFilePath` 隐含：
   *   * `soundFilePath != null` ⇒ 视为打开声音
   *   * `soundFilePath == null` ⇒ 视为静音
   * 这导致"声音开关打开但用默认音"也会被错误地静音。
   * 拆开后：
   *   * `soundEnabled = false` → scheduler 不传 sound_src（静音）
   *   * `soundEnabled = true && soundFilePath = null` → scheduler 走 `default`
   *   * `soundEnabled = true && soundFilePath = "C:/..."` → 自定义音频
   */
  soundEnabled: boolean;
  soundFilePath: string | null;
};

export type UpdateHealthReminderInput = AddHealthReminderInput;

export type AppSettings = {
  general: {
    autoLaunch: boolean;
    /**
     * 悬浮球遗留字段（deprecated）。
     *
     * 来自早期悬浮球设计。悬浮球路线已于第八阶段**永久取消**，
     * 系统托盘成为应用唯一常驻入口。当前 Tauri 路径不再读写本字段，
     * 仅保留以兼容老 settings.json 落盘数据。
     *
     * 清理路径：必须走 settings 数据迁移版本，不能直接改 type。
     */
    ballOpacity: number;
    /** @deprecated 悬浮球遗留字段，详见 GeneralSettings.ballOpacity。 */
    ballSize: BallSize;
    /** @deprecated 悬浮球遗留字段，详见 GeneralSettings.ballOpacity。 */
    rememberPosition: boolean;
    soundEnabled: boolean;
    /**
     * 自定义提示音文件路径（绝对路径，已复制到 `app_data_dir/sounds/`）。
     *
     * 语义：
     *   * `null` → 走内置默认提示音 `public/sound-default.wav`；
     *   * 非空 → 走该本地音频文件。
     *
     * 今日计划 / 健康节律**共用**本设置（与单条 reminder 的
     * `soundFilePath` 不同——本字段是全局默认）。前端读取老 settings.json
     * 缺失本字段时由 `createDefaultAppSettings()` 兜底为 `null`，
     * 不破坏向后兼容。
     */
    soundFilePath: string | null;
  };
  todo: {
    advanceReminderMinutes: number;
  };
  /**
   * 悬浮球位置（deprecated）。Tauri 路径不再读写，仅作磁盘占位。
   * 清理路径：必须走 settings 数据迁移版本。
   */
  ballPosition: {
    x: number;
    y: number;
  };
};

export type AppSnapshot = {
  today: string;
  todos: Todo[];
  reminders: HealthReminder[];
  settings: AppSettings;
};

export type AddTodoInput = {
  title: string;
  reminderTime: string | null;
  soundEnabled?: boolean;
  /**
   * 新增待办优先级。可选——不传或传 `null` 时由 Rust 端走
   * `TodoPriority::default()` = `medium`，与"未选默认中等"语义一致。
   */
  priority?: TodoPriority | null;
};

export type UpdateTodoInput = {
  title: string;
  reminderTime: string | null;
  soundEnabled?: boolean;
  /**
   * 更新优先级。可选——不传或传 `null` 时 Rust 端走 `if let Some(priority)`
   * 守卫，**保持原值**；传 priority 字符串则覆盖。语义与 `AddTodoInput::priority`
   * 刻意不同：add 时 `None = 默认 medium`，update 时 `None = 保持原值`。
   */
  priority?: TodoPriority | null;
};
