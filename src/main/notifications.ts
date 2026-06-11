import { Notification } from 'electron';
import type { HealthReminder, Todo } from '../shared/types';

export function notifyTodo(todo: Todo): void {
  if (!Notification.isSupported()) return;
  new Notification({
    title: '待办提醒',
    body: `该完成「${todo.title}」啦！${todo.reminderTime ? ` 设定时间：${todo.reminderTime}` : ''}`,
    silent: false
  }).show();
}

export function notifyHealth(reminder: HealthReminder): void {
  if (!Notification.isSupported()) return;
  new Notification({
    title: `${reminder.icon} ${reminder.name}`,
    body: `已过 ${reminder.intervalMinutes} 分钟，该活动一下了。`,
    silent: !reminder.soundEnabled
  }).show();
}
