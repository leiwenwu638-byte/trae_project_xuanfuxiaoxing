import { addMinutes, isTimeDue, toTimeString } from './date';
import type { AddTodoInput, Todo, TodoStore, UpdateTodoInput } from './types';

type AddTodoOptions = AddTodoInput & {
  now?: Date;
};

export function addTodo(store: TodoStore, dateKey: string, input: AddTodoOptions): TodoStore {
  const title = validateTitle(input.title);
  const now = input.now ?? new Date();
  const todo: Todo = {
    id: createId(),
    title,
    reminderTime: input.reminderTime || null,
    completed: false,
    advanceRemindedAt: null,
    remindedAt: null,
    createdAt: now.toISOString()
  };

  return {
    ...store,
    [dateKey]: [...(store[dateKey] ?? []), todo]
  };
}

export function toggleTodo(store: TodoStore, dateKey: string, id: string): TodoStore {
  return updateTodoById(store, dateKey, id, (todo) => ({
    ...todo,
    completed: !todo.completed
  }));
}

export function updateTodo(store: TodoStore, dateKey: string, id: string, input: UpdateTodoInput): TodoStore {
  const title = validateTitle(input.title);
  return updateTodoById(store, dateKey, id, (todo) => ({
    ...todo,
    title,
    reminderTime: input.reminderTime || null,
    advanceRemindedAt: null,
    remindedAt: null
  }));
}

export function deleteTodo(store: TodoStore, dateKey: string, id: string): TodoStore {
  return {
    ...store,
    [dateKey]: (store[dateKey] ?? []).filter((todo) => todo.id !== id)
  };
}

export function snoozeTodo(store: TodoStore, dateKey: string, id: string, minutes: number, now = new Date()): TodoStore {
  return updateTodoById(store, dateKey, id, (todo) => ({
    ...todo,
    reminderTime: toTimeString(addMinutes(now, minutes)),
    advanceRemindedAt: null,
    remindedAt: null
  }));
}

export function markTodoAdvanceReminded(store: TodoStore, dateKey: string, id: string, now = new Date()): TodoStore {
  return updateTodoById(store, dateKey, id, (todo) => ({
    ...todo,
    advanceRemindedAt: now.toISOString()
  }));
}

export function markTodoReminded(store: TodoStore, dateKey: string, id: string, now = new Date()): TodoStore {
  return updateTodoById(store, dateKey, id, (todo) => ({
    ...todo,
    remindedAt: now.toISOString()
  }));
}

export function findDueTodos(store: TodoStore, dateKey: string, now = new Date()): Todo[] {
  return (store[dateKey] ?? []).filter((todo) => {
    if (todo.completed || !todo.reminderTime || todo.remindedAt) return false;
    return isTimeDue(todo.reminderTime, now);
  });
}

export function findUpcomingTodos(
  store: TodoStore,
  dateKey: string,
  now = new Date(),
  advanceReminderMinutes = 10
): Todo[] {
  if (advanceReminderMinutes <= 0) return [];

  return (store[dateKey] ?? []).filter((todo) => {
    if (todo.completed || !todo.reminderTime || todo.advanceRemindedAt || todo.remindedAt) return false;
    const due = reminderDateFor(todo.reminderTime, now);
    const advanceStart = addMinutes(due, -advanceReminderMinutes);
    return now.getTime() >= advanceStart.getTime() && now.getTime() < due.getTime();
  });
}

function updateTodoById(store: TodoStore, dateKey: string, id: string, update: (todo: Todo) => Todo): TodoStore {
  return {
    ...store,
    [dateKey]: (store[dateKey] ?? []).map((todo) => (todo.id === id ? update(todo) : todo))
  };
}

function validateTitle(rawTitle: string): string {
  const title = rawTitle.trim();
  if (!title) throw new Error('任务名称不能为空');
  if ([...title].length > 40) throw new Error('任务名称不能超过 40 字');
  return title;
}

function reminderDateFor(time: string, now: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const due = new Date(now);
  due.setHours(hours, minutes, 0, 0);
  return due;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
