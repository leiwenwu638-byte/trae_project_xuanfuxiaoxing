import type { AddHealthReminderInput, AddTodoInput, AppSnapshot, AssistantApi, UpdateHealthReminderInput } from '../shared/types';
import { contextBridge, ipcRenderer } from 'electron';

const assistant: AssistantApi = {
  getSnapshot: () => ipcRenderer.invoke('snapshot:get'),
  addTodo: (input: AddTodoInput) => ipcRenderer.invoke('todo:add', input),
  toggleTodo: (id: string) => ipcRenderer.invoke('todo:toggle', id),
  deleteTodo: (id: string) => ipcRenderer.invoke('todo:delete', id),
  snoozeTodo: (id: string, minutes: number) => ipcRenderer.invoke('todo:snooze', id, minutes),
  toggleTodoPanel: () => ipcRenderer.invoke('todo-panel:toggle'),
  openHealthWindow: () => ipcRenderer.invoke('health:open'),
  addHealthReminder: (input: AddHealthReminderInput) => ipcRenderer.invoke('health:add', input),
  updateHealthReminder: (id: string, input: UpdateHealthReminderInput) => ipcRenderer.invoke('health:update', id, input),
  deleteHealthReminder: (id: string) => ipcRenderer.invoke('health:delete', id),
  toggleHealthReminder: (id: string) => ipcRenderer.invoke('health:toggle', id),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onStateChanged: (listener: (snapshot: AppSnapshot) => void) => {
    const wrapped = (_event: unknown, snapshot: AppSnapshot) => listener(snapshot);
    ipcRenderer.on('state-changed', wrapped);
    return () => ipcRenderer.removeListener('state-changed', wrapped);
  }
};

contextBridge.exposeInMainWorld('assistant', assistant);
