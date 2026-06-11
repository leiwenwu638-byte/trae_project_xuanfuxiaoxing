import type { AddHealthReminderInput, AppSnapshot, AddTodoInput, UpdateHealthReminderInput, UpdateTodoInput } from '../shared/types';
import { ipcMain } from 'electron';

export type IpcHandlers = {
  getSnapshot: () => AppSnapshot;
  addTodo: (input: AddTodoInput) => Promise<AppSnapshot>;
  updateTodo: (id: string, input: UpdateTodoInput) => Promise<AppSnapshot>;
  toggleTodo: (id: string) => Promise<AppSnapshot>;
  deleteTodo: (id: string) => Promise<AppSnapshot>;
  snoozeTodo: (id: string, minutes: number) => Promise<AppSnapshot>;
  toggleTodoPanel: () => void;
  openHealthWindow: () => void;
  addHealthReminder: (input: AddHealthReminderInput) => Promise<AppSnapshot>;
  updateHealthReminder: (id: string, input: UpdateHealthReminderInput) => Promise<AppSnapshot>;
  deleteHealthReminder: (id: string) => Promise<AppSnapshot>;
  toggleHealthReminder: (id: string) => Promise<AppSnapshot>;
  quitApp: () => void;
};

export function registerIpcHandlers(handlers: IpcHandlers): void {
  ipcMain.handle('snapshot:get', () => handlers.getSnapshot());
  ipcMain.handle('todo:add', (_event, input: AddTodoInput) => handlers.addTodo(input));
  ipcMain.handle('todo:update', (_event, id: string, input: UpdateTodoInput) => handlers.updateTodo(id, input));
  ipcMain.handle('todo:toggle', (_event, id: string) => handlers.toggleTodo(id));
  ipcMain.handle('todo:delete', (_event, id: string) => handlers.deleteTodo(id));
  ipcMain.handle('todo:snooze', (_event, id: string, minutes: number) => handlers.snoozeTodo(id, minutes));
  ipcMain.handle('todo-panel:toggle', () => handlers.toggleTodoPanel());
  ipcMain.handle('health:open', () => handlers.openHealthWindow());
  ipcMain.handle('health:add', (_event, input: AddHealthReminderInput) => handlers.addHealthReminder(input));
  ipcMain.handle('health:update', (_event, id: string, input: UpdateHealthReminderInput) =>
    handlers.updateHealthReminder(id, input)
  );
  ipcMain.handle('health:delete', (_event, id: string) => handlers.deleteHealthReminder(id));
  ipcMain.handle('health:toggle', (_event, id: string) => handlers.toggleHealthReminder(id));
  ipcMain.handle('app:quit', () => handlers.quitApp());
}
