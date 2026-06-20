import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { desktopApi } from './platform/desktopApi';

const mockState = vi.hoisted(() => ({
  sampleSnapshot: {
    today: '2026-06-20',
    todos: [],
    reminders: [],
    settings: {
      general: {
        autoLaunch: true,
        ballOpacity: 0.7,
        ballSize: 'medium',
        rememberPosition: true,
        soundEnabled: true,
        soundFilePath: null
      },
      todo: { advanceReminderMinutes: 10 },
      ballPosition: { x: 0, y: 0 }
    }
  },
  aiConfig: {
    enabled: true,
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    apiKeySaved: true
  }
}));

vi.mock('./platform/desktopApi', () => ({
  desktopApi: {
    getSnapshot: vi.fn().mockResolvedValue(mockState.sampleSnapshot),
    onStateChanged: vi.fn(() => vi.fn()),
    todo: {
      addTodo: vi.fn(),
      updateTodo: vi.fn(),
      toggleTodo: vi.fn(),
      deleteTodo: vi.fn()
    },
    reminder: {
      addReminder: vi.fn(),
      updateReminder: vi.fn(),
      toggleReminder: vi.fn(),
      deleteReminder: vi.fn()
    },
    settings: {
      saveCustomSound: vi.fn(),
      updateSettings: vi.fn()
    },
    window: {
      showCurrentWindow: vi.fn(),
      closeCurrentWindow: vi.fn()
    },
    ai: {
      getConfig: vi.fn().mockResolvedValue(mockState.aiConfig),
      saveConfig: vi.fn().mockResolvedValue(mockState.aiConfig),
      clearApiKey: vi.fn(),
      testConnection: vi.fn(),
      generateDailyPlan: vi.fn(),
      applyPlan: vi.fn()
    }
  }
}));

describe('App AI settings tray event', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
  });

  it('renders AI settings as a standalone page without the todo background', async () => {
    window.history.pushState({}, '', '/?view=ai-settings');
    render(<App />);

    expect(await screen.findByText('AI 模型设置')).toBeInTheDocument();
    expect(screen.queryByText('今日待办')).toBeNull();
    expect(screen.queryByRole('button', { name: 'AI 计划' })).toBeNull();
    expect(desktopApi.getSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(desktopApi.window.closeCurrentWindow).toHaveBeenCalledTimes(1);
  });

  it('renders the normal todo page without AI settings for the default view', async () => {
    render(<App />);

    expect(await screen.findByText('今日待办')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('AI 模型设置')).toBeNull();
    });
  });
});
