import type { HealthReminder } from './types';

export const MAX_HEALTH_REMINDER_MESSAGE_LENGTH = 80;

export function createDefaultHealthReminderMessage(intervalMinutes: number): string {
  return `已过 ${Math.round(intervalMinutes)} 分钟，该活动一下了！`;
}

export function normalizeHealthReminderMessage(rawMessage: string | null | undefined, intervalMinutes: number): string {
  const message = rawMessage?.trim();
  return message || createDefaultHealthReminderMessage(intervalMinutes);
}

export function getHealthReminderMessage(reminder: Pick<HealthReminder, 'intervalMinutes' | 'message'>): string {
  return normalizeHealthReminderMessage(reminder.message, reminder.intervalMinutes);
}
