import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, AppSnapshot } from '../../shared/types';

const sampleSettings: AppSettings = {
  general: {
    autoLaunch: false,
    ballOpacity: 1,
    ballSize: 'medium',
    rememberPosition: true,
    soundEnabled: true,
    soundFilePath: null
  },
  todo: { advanceReminderMinutes: 10 },
  ballPosition: { x: 100, y: 200 }
};

const sampleSnapshot: AppSnapshot = {
  today: '2026-06-17',
  todos: [],
  reminders: [],
  settings: sampleSettings
};

function clearPlatformMarkers(): void {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

describe('desktopApi', () => {
  const originalTauriInternals = (window as unknown as {
    __TAURI_INTERNALS__?: unknown;
  }).__TAURI_INTERNALS__;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@tauri-apps/api/core');
    vi.doUnmock('@tauri-apps/api/event');
    vi.doUnmock('@tauri-apps/api/window');
    clearPlatformMarkers();
    if (originalTauriInternals !== undefined) {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
        originalTauriInternals;
    }
  });

  async function loadDesktopApi() {
    const mod = await import('./desktopApi');
    return mod.desktopApi;
  }

  describe('detectPlatform', () => {
    it('uses mock when no Tauri marker exists', async () => {
      clearPlatformMarkers();
      const desktopApi = await loadDesktopApi();
      expect(desktopApi.platform).toBe('mock');
    });

    it('uses Tauri when window.__TAURI_INTERNALS__ exists', async () => {
      clearPlatformMarkers();
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      const desktopApi = await loadDesktopApi();
      expect(desktopApi.platform).toBe('tauri');
    });
  });

  describe('mock adapter', () => {
    it('unsubscribes state listeners', async () => {
      clearPlatformMarkers();
      const desktopApi = await loadDesktopApi();

      const listener = vi.fn();
      const unsubscribe = desktopApi.onStateChanged(listener);

      await desktopApi.todo.addTodo({ title: 'a', reminderTime: null });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      await desktopApi.todo.addTodo({ title: 'b', reminderTime: null });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('deep merges provided settings sections only', async () => {
      clearPlatformMarkers();
      const desktopApi = await loadDesktopApi();

      const updated = await desktopApi.settings.updateSettings({
        todo: { advanceReminderMinutes: 5 },
        ballPosition: { x: 50, y: 60 }
      });

      expect(updated.todo.advanceReminderMinutes).toBe(5);
      expect(updated.ballPosition).toEqual({ x: 50, y: 60 });
      expect(updated.general).toEqual({
        autoLaunch: true,
        ballOpacity: 0.7,
        ballSize: 'medium',
        rememberPosition: true,
        soundEnabled: true,
        soundFilePath: null
      });
    });

    it('scheduler returns no-op status', async () => {
      clearPlatformMarkers();
      const desktopApi = await loadDesktopApi();

      await expect(desktopApi.scheduler.getStatus()).resolves.toEqual({
        running: false,
        tickIntervalSecs: 0,
        pendingPopupCount: 0
      });
      await expect(desktopApi.scheduler.start()).resolves.toBeUndefined();
      await expect(desktopApi.scheduler.stop()).resolves.toBeUndefined();
    });
  });

  describe('Tauri adapter invoke delegation', () => {
    beforeEach(() => {
      clearPlatformMarkers();
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('todo.addTodo calls invoke("add_todo", { input })', async () => {
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      const input = { title: '测试', reminderTime: null as string | null };
      const result = await desktopApi.todo.addTodo(input);

      expect(invoke).toHaveBeenCalledWith('add_todo', { input });
      expect(result).toBe(sampleSnapshot);
    });

    it('todo commands pass through expected arguments', async () => {
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      await desktopApi.todo.toggleTodo('todo-x');
      await desktopApi.todo.deleteTodo('todo-y');
      await desktopApi.todo.snoozeTodo('todo-z', 15);

      expect(invoke).toHaveBeenNthCalledWith(1, 'toggle_todo', { id: 'todo-x' });
      expect(invoke).toHaveBeenNthCalledWith(2, 'delete_todo', { id: 'todo-y' });
      expect(invoke).toHaveBeenNthCalledWith(3, 'snooze_todo', {
        id: 'todo-z',
        minutes: 15
      });
    });

    it('reminder commands pass through expected arguments', async () => {
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      const input = {
        name: '喝水',
        intervalMinutes: 30,
        message: '该喝水了',
        soundEnabled: true,
        soundFilePath: null
      };
      await desktopApi.reminder.addReminder(input);
      await desktopApi.reminder.toggleReminder('rem-1');

      expect(invoke).toHaveBeenNthCalledWith(1, 'add_reminder', { input });
      expect(invoke).toHaveBeenNthCalledWith(2, 'toggle_reminder', { id: 'rem-1' });
    });

    it('getSnapshot calls invoke("get_snapshot")', async () => {
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      const result = await desktopApi.getSnapshot();

      expect(invoke).toHaveBeenCalledWith('get_snapshot');
      expect(result).toBe(sampleSnapshot);
    });

    it('settings.updateSettings merges with current settings before update_settings', async () => {
      const invoke = vi
        .fn()
        .mockResolvedValueOnce(sampleSettings)
        .mockResolvedValueOnce({
          ...sampleSettings,
          general: { ...sampleSettings.general, autoLaunch: true }
        });
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      const result = await desktopApi.settings.updateSettings({
        general: { autoLaunch: true }
      });

      expect(invoke).toHaveBeenNthCalledWith(1, 'get_settings');
      expect(invoke).toHaveBeenNthCalledWith(2, 'update_settings', {
        input: {
          ...sampleSettings,
          general: { ...sampleSettings.general, autoLaunch: true }
        }
      });
      expect(result.general.autoLaunch).toBe(true);
    });

    it('scheduler commands call matching Tauri commands', async () => {
      const fakeStatus = {
        running: true,
        tickIntervalSecs: 30,
        pendingPopupCount: 2
      };
      const invoke = vi.fn().mockResolvedValueOnce(fakeStatus).mockResolvedValue(undefined);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      await expect(desktopApi.scheduler.getStatus()).resolves.toEqual(fakeStatus);
      await desktopApi.scheduler.start();
      await desktopApi.scheduler.stop();

      expect(invoke).toHaveBeenNthCalledWith(1, 'get_scheduler_status');
      expect(invoke).toHaveBeenNthCalledWith(2, 'start_scheduler');
      expect(invoke).toHaveBeenNthCalledWith(3, 'stop_scheduler');
    });
  });

  describe('Tauri adapter error handling', () => {
    beforeEach(() => {
      clearPlatformMarkers();
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('core command failures reject', async () => {
      const invoke = vi.fn().mockRejectedValue(new Error('disk full'));
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();

      await expect(
        desktopApi.todo.addTodo({ title: 'a', reminderTime: null })
      ).rejects.toThrow('disk full');
    });

    it('invalid reminderTime errors are passed through', async () => {
      const invoke = vi
        .fn()
        .mockRejectedValue(new Error('提醒时间格式必须为 HH:MM，例如 08:30'));
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();

      await expect(
        desktopApi.todo.addTodo({ title: 'a', reminderTime: 'nope' })
      ).rejects.toThrow('提醒时间格式必须为 HH:MM');
    });

    it('optional notification command degrades to noop', async () => {
      const invoke = vi.fn().mockRejectedValue(new Error('command not registered'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();

      await expect(
        desktopApi.notification.showNotification({ title: 't', body: 'b' })
      ).resolves.toBeUndefined();
      expect(invoke).toHaveBeenCalledWith('show_notification', {
        payload: { title: 't', body: 'b' }
      });
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('Tauri window commands', () => {
    beforeEach(() => {
      clearPlatformMarkers();
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('delegates open and popup commands', async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));

      const desktopApi = await loadDesktopApi();
      const payload = { title: '喝水', body: '30 分钟到了', icon: '💧', soundSrc: null };

      await desktopApi.window.openTodoWindow();
      await desktopApi.window.openHealthWindow();
      await desktopApi.window.showReminderPopup(payload);

      expect(invoke).toHaveBeenNthCalledWith(1, 'open_todo_window');
      expect(invoke).toHaveBeenNthCalledWith(2, 'open_health_window');
      expect(invoke).toHaveBeenNthCalledWith(3, 'show_reminder_popup', { payload });
    });

    it('uses the current Tauri window label when closing and hiding', async () => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      const getCurrentWindow = vi.fn(() => ({ label: 'todo' }));
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
      vi.doMock('@tauri-apps/api/window', () => ({ getCurrentWindow }));

      const desktopApi = await loadDesktopApi();
      await desktopApi.window.closeCurrentWindow();
      await desktopApi.window.hideCurrentWindow();

      expect(getCurrentWindow).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenNthCalledWith(1, 'close_current_window', { label: 'todo' });
      expect(invoke).toHaveBeenNthCalledWith(2, 'hide_current_window', { label: 'todo' });
    });
  });

  describe('Tauri onStateChanged unsubscribe handling', () => {
    beforeEach(() => {
      clearPlatformMarkers();
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('calls unlisten on the normal path', async () => {
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      const unlisten = vi.fn();
      const listen = vi.fn().mockResolvedValue(unlisten);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
      vi.doMock('@tauri-apps/api/event', () => ({ listen }));

      const desktopApi = await loadDesktopApi();
      const unsubscribe = desktopApi.onStateChanged(vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 0));
      unsubscribe();

      expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it('calls unlisten if listen resolves after unsubscribe', async () => {
      let resolveListen: (unlisten: () => void) => void = () => undefined;
      const unlisten = vi.fn();
      const listen = vi.fn().mockImplementation(
        () =>
          new Promise<() => void>((resolve) => {
            resolveListen = resolve;
          })
      );
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
      vi.doMock('@tauri-apps/api/event', () => ({ listen }));

      const desktopApi = await loadDesktopApi();
      const unsubscribe = desktopApi.onStateChanged(vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 0));
      unsubscribe();
      expect(unlisten).not.toHaveBeenCalled();

      resolveListen(unlisten);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it('warns instead of throwing when listen fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const listen = vi.fn().mockRejectedValue(new Error('IPC channel not ready'));
      const invoke = vi.fn().mockResolvedValue(sampleSnapshot);
      vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
      vi.doMock('@tauri-apps/api/event', () => ({ listen }));

      const desktopApi = await loadDesktopApi();

      let unsubscribe: () => void = () => undefined;
      expect(() => {
        unsubscribe = desktopApi.onStateChanged(vi.fn());
      }).not.toThrow();
      expect(() => unsubscribe()).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(listen).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls[0]?.[0]).toContain('onStateChanged');
    });
  });

  describe('REQUIRED_TAURI_COMMANDS_FOR_TEST', () => {
    it('contains all required data, window, and scheduler commands', async () => {
      const mod = await import('./desktopApi');
      const required = mod.__testing__.REQUIRED_TAURI_COMMANDS_FOR_TEST;
      const expected = [
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
        'hide_current_window',
        'get_scheduler_status',
        'start_scheduler',
        'stop_scheduler'
      ];

      for (const cmd of expected) {
        expect(
          required.has(cmd),
          `REQUIRED_TAURI_COMMANDS_FOR_TEST must contain ${cmd}`
        ).toBe(true);
      }
    });

    it('does not treat notification as a required command', async () => {
      const mod = await import('./desktopApi');
      const required = mod.__testing__.REQUIRED_TAURI_COMMANDS_FOR_TEST;
      expect(required.has('show_notification')).toBe(false);
    });
  });
});
