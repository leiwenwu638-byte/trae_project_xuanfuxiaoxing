import { describe, expect, it, vi } from 'vitest';
import { AssistantScheduler } from './scheduler';
import type { HealthReminder, TodoStore } from '../shared/types';

describe('AssistantScheduler', () => {
  it('notifies due todos and marks them as reminded', async () => {
    const todos: TodoStore = {
      '2026-06-10': [
        {
          id: 'todo-1',
          title: '完成作业',
          reminderTime: '10:00',
          completed: false,
          advanceRemindedAt: null,
          remindedAt: null,
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };
    const notifyTodo = vi.fn();
    const saveTodos = vi.fn();

    const scheduler = new AssistantScheduler({
      getState: () => ({
        today: '2026-06-10',
        todos,
        reminders: []
      }),
      saveTodos,
      saveReminders: vi.fn(),
      notifyTodo,
      notifyUpcomingTodo: vi.fn(),
      notifyHealth: vi.fn(),
      updateTodos: (next) => {
        Object.assign(todos, next);
      },
      updateReminders: vi.fn()
    });

    await scheduler.tick(new Date(2026, 5, 10, 10, 0, 0));

    expect(notifyTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo-1', title: '完成作业' }));
    expect(todos['2026-06-10'][0].remindedAt).toBeTruthy();
    expect(saveTodos).toHaveBeenCalledOnce();
  });

  it('notifies upcoming todos 10 minutes early and marks them as advance reminded', async () => {
    const todos: TodoStore = {
      '2026-06-10': [
        {
          id: 'todo-1',
          title: '五点吃饭',
          reminderTime: '17:00',
          completed: false,
          advanceRemindedAt: null,
          remindedAt: null,
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };
    const notifyUpcomingTodo = vi.fn();
    const saveTodos = vi.fn();

    const scheduler = new AssistantScheduler({
      getState: () => ({
        today: '2026-06-10',
        todos,
        reminders: [],
        advanceReminderMinutes: 10
      }),
      saveTodos,
      saveReminders: vi.fn(),
      notifyTodo: vi.fn(),
      notifyUpcomingTodo,
      notifyHealth: vi.fn(),
      updateTodos: (next) => {
        Object.assign(todos, next);
      },
      updateReminders: vi.fn()
    });

    await scheduler.tick(new Date(2026, 5, 10, 16, 50, 0));

    expect(notifyUpcomingTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo-1', title: '五点吃饭' }));
    expect(todos['2026-06-10'][0].advanceRemindedAt).toBeTruthy();
    expect(saveTodos).toHaveBeenCalledOnce();
  });

  it('notifies due health reminders and schedules the next round', async () => {
    let reminders: HealthReminder[] = [
      {
        id: 'water',
        name: '定时喝水',
        icon: '💧',
        intervalMinutes: 30,
        soundEnabled: true,
        enabled: true,
        lastTriggeredAt: null,
        nextTriggerAt: new Date(2026, 5, 10, 10, 0, 0).toISOString()
      }
    ];
    const notifyHealth = vi.fn();
    const saveReminders = vi.fn();

    const scheduler = new AssistantScheduler({
      getState: () => ({
        today: '2026-06-10',
        todos: {},
        reminders
      }),
      saveTodos: vi.fn(),
      saveReminders,
      notifyTodo: vi.fn(),
      notifyUpcomingTodo: vi.fn(),
      notifyHealth,
      updateTodos: vi.fn(),
      updateReminders: (next) => {
        reminders = next;
      }
    });

    await scheduler.tick(new Date(2026, 5, 10, 10, 1, 0));

    expect(notifyHealth).toHaveBeenCalledWith(expect.objectContaining({ id: 'water' }));
    expect(reminders[0].lastTriggeredAt).toBe(new Date(2026, 5, 10, 10, 1, 0).toISOString());
    expect(reminders[0].nextTriggerAt).toBe(new Date(2026, 5, 10, 10, 31, 0).toISOString());
    expect(saveReminders).toHaveBeenCalledOnce();
  });
});
