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

const CORE_TAURI_COMMANDS = new Set<string>([
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
      updateSettings: async (input) => mergeSettings(fallback.settings, input)
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
  CORE_TAURI_COMMANDS
};
