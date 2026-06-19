import { createDefaultHealthReminders, createDefaultSettings } from '../../shared/defaults';
import type {
  AddHealthReminderInput,
  AddTodoInput,
  AppSettings,
  AppSnapshot,
  HealthReminder,
  Todo,
  UpdateHealthReminderInput,
  UpdateTodoInput
} from '../../shared/types';

export type ReminderPopupPayload = {
  title: string;
  body: string;
  icon?: string;
  soundSrc?: string | null;
  durationMs?: number;
};

export type NotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
};

export type UpdateSettingsInput = {
  general?: Partial<AppSettings['general']>;
  todo?: Partial<AppSettings['todo']>;
  ballPosition?: Partial<AppSettings['ballPosition']>;
};

export type StateChangeListener = (snapshot: AppSnapshot) => void;

export interface DesktopTodoApi {
  listTodos(): Promise<Todo[]>;
  addTodo(input: AddTodoInput): Promise<AppSnapshot>;
  updateTodo(id: string, input: UpdateTodoInput): Promise<AppSnapshot>;
  toggleTodo(id: string): Promise<AppSnapshot>;
  deleteTodo(id: string): Promise<AppSnapshot>;
  snoozeTodo(id: string, minutes: number): Promise<AppSnapshot>;
}

export interface DesktopReminderApi {
  listReminders(): Promise<HealthReminder[]>;
  addReminder(input: AddHealthReminderInput): Promise<AppSnapshot>;
  updateReminder(id: string, input: UpdateHealthReminderInput): Promise<AppSnapshot>;
  toggleReminder(id: string): Promise<AppSnapshot>;
  deleteReminder(id: string): Promise<AppSnapshot>;
}

export interface DesktopSettingsApi {
  getSettings(): Promise<AppSettings>;
  updateSettings(input: UpdateSettingsInput): Promise<AppSettings>;
  /**
   * 把用户选择的音频文件 bytes 写到 `<app_data_dir>/sounds/`，返回真实绝对路径。
   *
   * 为什么不直接 `input.files[0].name` 拿本地路径：
   *   * Tauri WebView / 浏览器里 `file.path` 不可用；
   *   * `input.value` 只能拿到 `C:\fakepath\xxx.wav`，无法被 `<audio src>` 播放。
   * 所以前端只能把 `File.arrayBuffer()` 读成 `Uint8Array`，再 invoke Rust 让
   * 后端写盘并返回绝对路径。`settings.updateSettings({ general: { soundFilePath } })`
   * 随后把该路径持久化到 settings.json。
   */
  saveCustomSound(fileName: string, bytes: Uint8Array): Promise<string>;
}

export interface DesktopWindowApi {
  openTodoWindow(): Promise<void>;
  openHealthWindow(): Promise<void>;
  showReminderPopup(payload: ReminderPopupPayload): Promise<void>;
  closeCurrentWindow(): Promise<void>;
  /**
   * 显示当前 webview 所在的窗口。当前主要用于 ReminderPopup：
   * 弹窗以 `visible:false` 启动，React 挂载并拿到 payload 后调用本方法显示，
   * 避免 React 加载期间出现白窗。
   */
  showCurrentWindow(): Promise<void>;
  hideCurrentWindow(): Promise<void>;
}

export interface DesktopNotificationApi {
  showNotification(payload: NotificationPayload): Promise<void>;
}

export type SchedulerStatus = {
  running: boolean;
  tickIntervalSecs: number;
  pendingPopupCount: number;
};

export interface DesktopSchedulerApi {
  getStatus(): Promise<SchedulerStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface DesktopApi {
  readonly platform: 'tauri' | 'mock';
  todo: DesktopTodoApi;
  reminder: DesktopReminderApi;
  settings: DesktopSettingsApi;
  window: DesktopWindowApi;
  notification: DesktopNotificationApi;
  scheduler: DesktopSchedulerApi;
  getSnapshot(): Promise<AppSnapshot>;
  onStateChanged(listener: StateChangeListener): () => void;
}

type Platform = DesktopApi['platform'];

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'mock';
  return '__TAURI_INTERNALS__' in window ? 'tauri' : 'mock';
}

function mergeSettings(target: AppSettings, input: UpdateSettingsInput): AppSettings {
  return {
    general: { ...target.general, ...(input.general ?? {}) },
    todo: { ...target.todo, ...(input.todo ?? {}) },
    ballPosition: { ...target.ballPosition, ...(input.ballPosition ?? {}) }
  };
}

function createDefaultSnapshot(): AppSnapshot {
  return {
    today: new Date().toISOString().slice(0, 10),
    todos: [],
    reminders: createDefaultHealthReminders(),
    settings: createDefaultSettings()
  };
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return args === undefined ? invoke<T>(cmd) : invoke<T>(cmd, args);
}

async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

/**
 * 应用**必需**的 Tauri command 集合（"必需" = 业务依赖、不能静默失败的命令）。
 *
 * 名字从历史的 `CORE_TAURI_COMMANDS` → `REQUIRED_TAURI_COMMANDS` →
 * `REQUIRED_TAURI_COMMANDS_FOR_TEST`：
 *   - "core" 太泛，混了数据 / 窗口 / 调度 3 类，无法表达"业务必需"语义；
 *   - "required" 直接对应"如果这个命令失败，应用不能继续运行"。
 *
 * 与之相对的"非必需"集合（`safeInvoke` 路径）：
 *   - `notify`（系统通知）失败时不阻碍主流程
 *   - `drain_reminder_popups`（前端拉取 popup 队列）失败可重试
 *
 * 注：保持**单集合**（不拆 DATA/WINDOW/SCHEDULER），因为调用方关心的
 * 只是"要不要 console.error / 抛错"这一种行为，再分会让 `coreInvoke`
 * 和 `safeInvoke` 之间的判断变得分散。本阶段保持现状，下一阶段如
 * 出现"某类命令静默 / 某类命令报错"的差异化需求，再切到多集合。
 */
export const REQUIRED_TAURI_COMMANDS_FOR_TEST = new Set<string>([
  'get_snapshot',
  'list_todos',
  'add_todo',
  'update_todo',
  'toggle_todo',
  'delete_todo',
  'snooze_todo',
  'list_reminders',
  'add_reminder',
  'update_reminder',
  'toggle_reminder',
  'delete_reminder',
  'get_settings',
  'update_settings',
  'save_custom_sound_file',
  'open_todo_window',
  'open_health_window',
  'show_reminder_popup',
  'close_current_window',
  'show_current_window',
  'hide_current_window',
  'get_scheduler_status',
  'start_scheduler',
  'stop_scheduler'
]);

function createTauriAdapter(): DesktopApi {
  const coreInvoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
    tauriInvoke<T>(cmd, args);

  const safeInvoke = async (
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<boolean> => {
    try {
      await tauriInvoke(cmd, args);
      return true;
    } catch (error) {
      console.warn(`[tauri] optional command ${cmd} not available:`, error);
      return false;
    }
  };

  return {
    platform: 'tauri',
    todo: {
      listTodos: async () => {
        const snapshot = await coreInvoke<AppSnapshot>('get_snapshot');
        return snapshot.todos;
      },
      addTodo: (input) => coreInvoke<AppSnapshot>('add_todo', { input }),
      updateTodo: (id, input) => coreInvoke<AppSnapshot>('update_todo', { id, input }),
      toggleTodo: (id) => coreInvoke<AppSnapshot>('toggle_todo', { id }),
      deleteTodo: (id) => coreInvoke<AppSnapshot>('delete_todo', { id }),
      snoozeTodo: (id, minutes) => coreInvoke<AppSnapshot>('snooze_todo', { id, minutes })
    },
    reminder: {
      listReminders: async () => {
        const snapshot = await coreInvoke<AppSnapshot>('get_snapshot');
        return snapshot.reminders;
      },
      addReminder: (input) => coreInvoke<AppSnapshot>('add_reminder', { input }),
      updateReminder: (id, input) =>
        coreInvoke<AppSnapshot>('update_reminder', { id, input }),
      toggleReminder: (id) => coreInvoke<AppSnapshot>('toggle_reminder', { id }),
      deleteReminder: (id) => coreInvoke<AppSnapshot>('delete_reminder', { id })
    },
    settings: {
      getSettings: () => coreInvoke<AppSettings>('get_settings'),
      updateSettings: async (input) => {
        const current = await coreInvoke<AppSettings>('get_settings');
        const merged = mergeSettings(current, input);
        return coreInvoke<AppSettings>('update_settings', { input: merged });
      },
      saveCustomSound: async (fileName, bytes) => {
        // Tauri 的 invoke 在 IPC 上需要把 Uint8Array 转为普通数组才能
        // 走 JSON 序列化；这里用 Array.from 让 bytes 进入数组形态。
        // Rust 端签名是 `bytes: Vec<u8>`，JSON 数组会被 serde 解码为 Vec<u8>。
        return coreInvoke<string>('save_custom_sound_file', {
          fileName,
          bytes: Array.from(bytes)
        });
      }
    },
    window: {
      openTodoWindow: () => coreInvoke<void>('open_todo_window'),
      openHealthWindow: () => coreInvoke<void>('open_health_window'),
      showReminderPopup: (payload) =>
        coreInvoke<void>('show_reminder_popup', { payload }),
      closeCurrentWindow: async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const label = getCurrentWindow().label;
        await coreInvoke<void>('close_current_window', { label });
      },
      showCurrentWindow: async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const label = getCurrentWindow().label;
        await coreInvoke<void>('show_current_window', { label });
      },
      hideCurrentWindow: async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const label = getCurrentWindow().label;
        await coreInvoke<void>('hide_current_window', { label });
      }
    },
    notification: {
      showNotification: (payload) =>
        safeInvoke('show_notification', { payload }).then(() => undefined)
    },
    scheduler: {
      getStatus: () => coreInvoke<SchedulerStatus>('get_scheduler_status'),
      start: () => coreInvoke<void>('start_scheduler'),
      stop: () => coreInvoke<void>('stop_scheduler')
    },
    getSnapshot: () => coreInvoke<AppSnapshot>('get_snapshot'),
    onStateChanged: (listener) => {
      let unlisten: (() => void) | null = null;
      let disposed = false;
      void tauriListen<AppSnapshot>('state-changed', listener)
        .then((fn) => {
          if (disposed) {
            fn();
          } else {
            unlisten = fn;
          }
        })
        .catch((error) => {
          console.warn('[desktopApi] onStateChanged listen failed:', error);
        });
      return () => {
        disposed = true;
        if (unlisten) {
          unlisten();
          unlisten = null;
        }
      };
    }
  };
}

function createMockAdapter(): DesktopApi {
  const fallback = createDefaultSnapshot();
  const listeners = new Set<StateChangeListener>();

  const noop = async (): Promise<void> => undefined;

  const echoSnapshot = async (): Promise<AppSnapshot> => {
    listeners.forEach((listener) => listener(fallback));
    return fallback;
  };

  return {
    platform: 'mock',
    todo: {
      listTodos: async () => fallback.todos,
      addTodo: echoSnapshot,
      updateTodo: echoSnapshot,
      toggleTodo: echoSnapshot,
      deleteTodo: echoSnapshot,
      snoozeTodo: echoSnapshot
    },
    reminder: {
      listReminders: async () => fallback.reminders,
      addReminder: echoSnapshot,
      updateReminder: echoSnapshot,
      toggleReminder: echoSnapshot,
      deleteReminder: echoSnapshot
    },
    settings: {
      getSettings: async () => fallback.settings,
      updateSettings: async (input) => mergeSettings(fallback.settings, input),
      // mock 平台不写盘；返回文件 basename 当作"伪路径"，仅满足
      // vitest / Storybook 不真触发 IPC。生产代码永远不会走这个分支。
      saveCustomSound: async (fileName) => `/mock/sounds/${fileName}`
    },
    window: {
      openTodoWindow: noop,
      openHealthWindow: noop,
      showReminderPopup: noop,
      closeCurrentWindow: noop,
      showCurrentWindow: noop,
      hideCurrentWindow: noop
    },
    notification: {
      showNotification: noop
    },
    scheduler: {
      getStatus: async () => ({ running: false, tickIntervalSecs: 0, pendingPopupCount: 0 }),
      start: noop,
      stop: noop
    },
    getSnapshot: async () => fallback,
    onStateChanged: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

const adapter = detectPlatform() === 'tauri' ? createTauriAdapter() : createMockAdapter();

export const desktopApi: DesktopApi = adapter;

export const __testing__ = {
  /**
   * 测试可见的命令清单。详见 `desktopApi.test.ts` 中对 `REQUIRED_TAURI_COMMANDS_FOR_TEST`
   * 集合成员的断言。
   */
  REQUIRED_TAURI_COMMANDS_FOR_TEST
};
