import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const mockState = vi.hoisted(() => ({
  openAiSettingsListener: null as (() => void) | null,
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
    onOpenAiSettings: vi.fn((listener: () => void) => {
      mockState.openAiSettingsListener = listener;
      return vi.fn();
    }),
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
    mockState.openAiSettingsListener = null;
  });

  it('shows and hides AI settings when the tray event is received', async () => {
    render(<App />);

    expect(await screen.findByText('今日待办')).toBeInTheDocument();
    expect(screen.queryByText('AI 模型设置')).toBeNull();

    act(() => {
      mockState.openAiSettingsListener?.();
    });

    expect(await screen.findByText('AI 模型设置')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(screen.queryByText('AI 模型设置')).toBeNull();
    });
  });
});
