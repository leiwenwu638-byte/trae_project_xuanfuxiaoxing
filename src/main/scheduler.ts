import { findDueHealthReminders, resetDueHealthReminder } from '../shared/reminderService';
import { findDueTodos, findUpcomingTodos, markTodoAdvanceReminded, markTodoReminded } from '../shared/todoService';
import type { HealthReminder, Todo, TodoStore } from '../shared/types';

type SchedulerState = {
  today: string;
  todos: TodoStore;
  reminders: HealthReminder[];
  advanceReminderMinutes?: number;
};

type SchedulerDependencies = {
  getState: () => SchedulerState;
  updateTodos: (todos: TodoStore) => void;
  updateReminders: (reminders: HealthReminder[]) => void;
  saveTodos: (todos: TodoStore) => Promise<void> | void;
  saveReminders: (reminders: HealthReminder[]) => Promise<void> | void;
  notifyTodo: (todo: Todo) => void;
  notifyUpcomingTodo: (todo: Todo) => void;
  notifyHealth: (reminder: HealthReminder) => void;
};

export class AssistantScheduler {
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly dependencies: SchedulerDependencies) {}

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      void this.tick();
    }, 1000);
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  async tick(now = new Date()): Promise<void> {
    await this.tickTodos(now);
    await this.tickHealthReminders(now);
  }

  private async tickTodos(now: Date): Promise<void> {
    const state = this.dependencies.getState();
    const upcomingTodos = findUpcomingTodos(state.todos, state.today, now, state.advanceReminderMinutes ?? 10);
    const dueTodos = findDueTodos(state.todos, state.today, now);
    if (upcomingTodos.length === 0 && dueTodos.length === 0) return;

    let nextTodos = state.todos;
    for (const todo of upcomingTodos) {
      this.dependencies.notifyUpcomingTodo(todo);
      nextTodos = markTodoAdvanceReminded(nextTodos, state.today, todo.id, now);
    }

    for (const todo of dueTodos) {
      this.dependencies.notifyTodo(todo);
      nextTodos = markTodoReminded(nextTodos, state.today, todo.id, now);
    }

    this.dependencies.updateTodos(nextTodos);
    await this.dependencies.saveTodos(nextTodos);
  }

  private async tickHealthReminders(now: Date): Promise<void> {
    const state = this.dependencies.getState();
    const dueReminders = findDueHealthReminders(state.reminders, now);
    if (dueReminders.length === 0) return;

    let nextReminders = state.reminders;
    for (const reminder of dueReminders) {
      this.dependencies.notifyHealth(reminder);
      nextReminders = resetDueHealthReminder(nextReminders, reminder.id, now);
    }

    this.dependencies.updateReminders(nextReminders);
    await this.dependencies.saveReminders(nextReminders);
  }
}
