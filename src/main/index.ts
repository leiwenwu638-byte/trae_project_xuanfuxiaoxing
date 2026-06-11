import { addTodo, deleteTodo, snoozeTodo, toggleTodo } from '../shared/todoService';
import {
  addHealthReminder,
  deleteHealthReminder,
  initializeHealthReminders,
  toggleHealthReminder,
  updateHealthReminder
} from '../shared/reminderService';
import { toLocalDateKey } from '../shared/date';
import type {
  AddHealthReminderInput,
  AddTodoInput,
  AppSettings,
  AppSnapshot,
  HealthReminder,
  TodoStore,
  UpdateHealthReminderInput
} from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { notifyHealth, notifyTodo } from './notifications';
import { AssistantScheduler } from './scheduler';
import { AppStore } from './store';
import { createTray } from './tray';
import { WindowManager } from './windows';
import { createLoginItemSettings } from './loginItemSettings';
import { log } from './logger';
import { app } from 'electron';

const debugWindow = process.argv.includes('--debug-window');
let store: AppStore;
let windows: WindowManager;
let scheduler: AssistantScheduler;
let tray: ReturnType<typeof createTray>;
let todos: TodoStore = {};
let reminders: HealthReminder[] = [];
let settings: AppSettings;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('singleInstanceLockDenied');
  app.quit();
}

app.on('second-instance', () => {
  log('secondInstance');
  if (windows && settings) {
    windows.openTodoWindow();
  }
});

app.whenReady().then(async () => {
  log('appReady', { debugWindow, userData: app.getPath('userData'), cwd: process.cwd() });
  store = new AppStore(app.getPath('userData'));
  const persisted = await store.load();
  todos = persisted.todos;
  reminders = initializeHealthReminders(persisted.reminders);
  settings = persisted.settings;

  if (app.isPackaged) {
    const loginItemSettings = createLoginItemSettings(
      settings.general.autoLaunch,
      process.argv,
      process.execPath,
      app.isPackaged,
      process.cwd()
    );
    log('setLoginItemSettings', loginItemSettings);
    try {
      app.setLoginItemSettings(loginItemSettings);
    } catch (error) {
      log('setLoginItemSettingsFailed', error instanceof Error ? error.message : error);
    }
  } else {
    log('skipLoginItemSettingsInDevelopment', {
      reason: 'Use scripts/repair-startup.ps1 to create an absolute-path startup launcher.'
    });
  }

  windows = new WindowManager({
    openHealthWindow: () => windows.openHealthWindow(),
    quitApp: () => app.quit()
  }, debugWindow);
  windows.openTodoWindow();
  windows.setTodoBadgeCount(unfinishedTodayCount());
  tray = createTray({
    toggleTodoWindow: () => windows.openTodoWindow(),
    openHealthWindow: () => windows.openHealthWindow(),
    quitApp: () => app.quit()
  });

  registerIpcHandlers({
    getSnapshot,
    addTodo: async (input) => {
      todos = addTodo(todos, today(), input);
      await store.saveTodos(todos);
      return publish();
    },
    toggleTodo: async (id) => {
      todos = toggleTodo(todos, today(), id);
      await store.saveTodos(todos);
      return publish();
    },
    deleteTodo: async (id) => {
      todos = deleteTodo(todos, today(), id);
      await store.saveTodos(todos);
      return publish();
    },
    snoozeTodo: async (id, minutes) => {
      todos = snoozeTodo(todos, today(), id, minutes);
      await store.saveTodos(todos);
      return publish();
    },
    toggleTodoPanel: () => windows.openTodoWindow(),
    openHealthWindow: () => windows.openHealthWindow(),
    addHealthReminder: async (input: AddHealthReminderInput) => {
      reminders = addHealthReminder(reminders, input);
      await store.saveReminders(reminders);
      return publish();
    },
    updateHealthReminder: async (id: string, input: UpdateHealthReminderInput) => {
      reminders = updateHealthReminder(reminders, id, input);
      await store.saveReminders(reminders);
      return publish();
    },
    deleteHealthReminder: async (id: string) => {
      reminders = deleteHealthReminder(reminders, id);
      await store.saveReminders(reminders);
      return publish();
    },
    toggleHealthReminder: async (id) => {
      reminders = toggleHealthReminder(reminders, id);
      await store.saveReminders(reminders);
      return publish();
    },
    quitApp: () => app.quit()
  });

  scheduler = new AssistantScheduler({
    getState: () => ({ today: today(), todos, reminders }),
    updateTodos: (next) => {
      todos = next;
      publish();
    },
    updateReminders: (next) => {
      reminders = next;
      publish();
    },
    saveTodos: (next) => store.saveTodos(next),
    saveReminders: (next) => store.saveReminders(next),
    notifyTodo,
    notifyHealth: (reminder) => {
      notifyHealth(reminder);
      windows.showHealthPopup(reminder);
    }
  });
  scheduler.start();
  windows.openTodoWindow();
  windows.setTodoBadgeCount(unfinishedTodayCount());
});

app.on('window-all-closed', () => {
  // Keep the assistant alive from the tray/floating entry instead of quitting with utility windows.
});

app.on('before-quit', () => {
  scheduler?.stop();
});

function getSnapshot(): AppSnapshot {
  const dateKey = today();
  return {
    today: dateKey,
    todos: todos[dateKey] ?? [],
    reminders,
    settings
  };
}

function publish(): AppSnapshot {
  const snapshot = getSnapshot();
  windows?.broadcast('state-changed', snapshot);
  windows?.setTodoBadgeCount(snapshot.todos.filter((todo) => !todo.completed).length);
  return snapshot;
}

function today(): string {
  return toLocalDateKey();
}

function unfinishedTodayCount(): number {
  return (todos[today()] ?? []).filter((todo) => !todo.completed).length;
}
