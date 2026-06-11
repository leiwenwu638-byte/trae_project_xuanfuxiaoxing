import { describe, expect, it } from 'vitest';
import {
  addTodo,
  deleteTodo,
  findDueTodos,
  findUpcomingTodos,
  markTodoAdvanceReminded,
  snoozeTodo,
  toggleTodo,
  updateTodo
} from './todoService';
import type { TodoStore } from './types';

const today = '2026-06-10';

describe('todoService', () => {
  it('adds a trimmed todo to today', () => {
    const store = addTodo({}, today, {
      title: '  完成作业  ',
      reminderTime: '10:00',
      now: new Date('2026-06-10T08:30:00.000Z')
    });

    expect(store[today]).toHaveLength(1);
    expect(store[today][0]).toMatchObject({
      title: '完成作业',
      reminderTime: '10:00',
      completed: false,
      advanceRemindedAt: null,
      remindedAt: null
    });
  });

  it('rejects empty and overly long titles', () => {
    expect(() => addTodo({}, today, { title: '   ', reminderTime: null })).toThrow('任务名称不能为空');
    expect(() =>
      addTodo({}, today, { title: '一'.repeat(41), reminderTime: null })
    ).toThrow('任务名称不能超过 40 字');
  });

  it('toggles completion without deleting the todo', () => {
    const store = addTodo({}, today, { title: '开组会', reminderTime: null });
    const id = store[today][0].id;

    const next = toggleTodo(store, today, id);

    expect(next[today]).toHaveLength(1);
    expect(next[today][0].completed).toBe(true);
  });

  it('updates a todo title and reminder time while clearing reminder state', () => {
    const store: TodoStore = {
      [today]: [
        {
          id: 'todo-1',
          title: '吃饭',
          reminderTime: '17:00',
          completed: false,
          advanceRemindedAt: '2026-06-10T16:50:00.000Z',
          remindedAt: '2026-06-10T17:00:00.000Z',
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };

    const next = updateTodo(store, today, 'todo-1', { title: '五点半吃饭', reminderTime: '17:30' });

    expect(next[today][0]).toMatchObject({
      title: '五点半吃饭',
      reminderTime: '17:30',
      advanceRemindedAt: null,
      remindedAt: null
    });
  });

  it('rejects invalid todo updates', () => {
    const store = addTodo({}, today, { title: '开组会', reminderTime: null });
    const id = store[today][0].id;

    expect(() => updateTodo(store, today, id, { title: '   ', reminderTime: null })).toThrow('任务名称不能为空');
  });

  it('deletes a todo', () => {
    const store = addTodo({}, today, { title: '开组会', reminderTime: null });
    const id = store[today][0].id;

    expect(deleteTodo(store, today, id)[today]).toEqual([]);
  });

  it('snoozes a todo by replacing its reminder time and clearing remindedAt', () => {
    const store: TodoStore = {
      [today]: [
        {
          id: 'todo-1',
          title: '喝水',
          reminderTime: '10:00',
          completed: false,
          advanceRemindedAt: '2026-06-10T09:50:00.000Z',
          remindedAt: '2026-06-10T10:00:00.000Z',
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };

    const next = snoozeTodo(store, today, 'todo-1', 10, new Date(2026, 5, 10, 10, 5, 0));

    expect(next[today][0].reminderTime).toBe('10:15');
    expect(next[today][0].advanceRemindedAt).toBeNull();
    expect(next[today][0].remindedAt).toBeNull();
  });

  it('finds due todos only once per reminder timestamp', () => {
    const store: TodoStore = {
      [today]: [
        {
          id: 'todo-1',
          title: '完成作业',
          reminderTime: '10:00',
          completed: false,
          advanceRemindedAt: null,
          remindedAt: null,
          createdAt: '2026-06-10T08:00:00.000Z'
        },
        {
          id: 'todo-2',
          title: '已提醒',
          reminderTime: '09:00',
          completed: false,
          advanceRemindedAt: null,
          remindedAt: '2026-06-10T09:00:00.000Z',
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };

    expect(findDueTodos(store, today, new Date('2026-06-10T10:00:00.000Z')).map((todo) => todo.id)).toEqual([
      'todo-1'
    ]);
  });

  it('finds upcoming todos in the 10 minute reminder window only once', () => {
    const store: TodoStore = {
      [today]: [
        {
          id: 'todo-1',
          title: '吃饭',
          reminderTime: '17:00',
          completed: false,
          advanceRemindedAt: null,
          remindedAt: null,
          createdAt: '2026-06-10T08:00:00.000Z'
        },
        {
          id: 'todo-2',
          title: '已提前提醒',
          reminderTime: '17:00',
          completed: false,
          advanceRemindedAt: '2026-06-10T16:50:00.000Z',
          remindedAt: null,
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };

    expect(findUpcomingTodos(store, today, new Date(2026, 5, 10, 16, 49, 59), 10)).toEqual([]);
    expect(findUpcomingTodos(store, today, new Date(2026, 5, 10, 16, 50, 0), 10).map((todo) => todo.id)).toEqual(['todo-1']);
    expect(findUpcomingTodos(store, today, new Date(2026, 5, 10, 17, 0, 0), 10)).toEqual([]);
  });

  it('marks an upcoming todo as advance reminded', () => {
    const store: TodoStore = {
      [today]: [
        {
          id: 'todo-1',
          title: '吃饭',
          reminderTime: '17:00',
          completed: false,
          advanceRemindedAt: null,
          remindedAt: null,
          createdAt: '2026-06-10T08:00:00.000Z'
        }
      ]
    };

    const next = markTodoAdvanceReminded(store, today, 'todo-1', new Date('2026-06-10T08:50:00.000Z'));

    expect(next[today][0].advanceRemindedAt).toBe('2026-06-10T08:50:00.000Z');
  });
});
