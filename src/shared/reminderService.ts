import { addMinutes } from './date';
import type { AddHealthReminderInput, HealthReminder, UpdateHealthReminderInput } from './types';

type AddHealthReminderOptions = Omit<AddHealthReminderInput, 'soundEnabled'> & {
  soundEnabled?: boolean;
  now?: Date;
};

type UpdateHealthReminderOptions = Omit<UpdateHealthReminderInput, 'soundEnabled'> & {
  soundEnabled?: boolean;
  now?: Date;
};

export function initializeHealthReminders(reminders: HealthReminder[], now = new Date()): HealthReminder[] {
  return reminders.map((reminder) =>
    reminder.nextTriggerAt
      ? reminder
      : {
          ...reminder,
          nextTriggerAt: addMinutes(now, reminder.intervalMinutes).toISOString()
        }
  );
}

export function toggleHealthReminder(reminders: HealthReminder[], id: string, now = new Date()): HealthReminder[] {
  return reminders.map((reminder) => {
    if (reminder.id !== id) return reminder;
    const enabled = !reminder.enabled;
    return {
      ...reminder,
      enabled,
      nextTriggerAt: enabled ? addMinutes(now, reminder.intervalMinutes).toISOString() : reminder.nextTriggerAt
    };
  });
}

export function addHealthReminder(reminders: HealthReminder[], input: AddHealthReminderOptions): HealthReminder[] {
  const name = validateReminderName(input.name);
  const intervalMinutes = validateInterval(input.intervalMinutes);
  const now = input.now ?? new Date();

  return [
    ...reminders,
    {
      id: createReminderId(),
      name,
      icon: '⏰',
      intervalMinutes,
      soundEnabled: input.soundEnabled ?? true,
      enabled: true,
      lastTriggeredAt: null,
      nextTriggerAt: addMinutes(now, intervalMinutes).toISOString()
    }
  ];
}

export function updateHealthReminder(
  reminders: HealthReminder[],
  id: string,
  input: UpdateHealthReminderOptions
): HealthReminder[] {
  const name = validateReminderName(input.name);
  const intervalMinutes = validateInterval(input.intervalMinutes);
  const now = input.now ?? new Date();

  return reminders.map((reminder) => {
    if (reminder.id !== id) return reminder;
    return {
      ...reminder,
      name,
      intervalMinutes,
      soundEnabled: input.soundEnabled ?? reminder.soundEnabled,
      nextTriggerAt: reminder.enabled ? addMinutes(now, intervalMinutes).toISOString() : reminder.nextTriggerAt
    };
  });
}

export function deleteHealthReminder(reminders: HealthReminder[], id: string): HealthReminder[] {
  return reminders.filter((reminder) => reminder.id !== id);
}

export function findDueHealthReminders(reminders: HealthReminder[], now = new Date()): HealthReminder[] {
  return reminders.filter((reminder) => {
    if (!reminder.enabled || !reminder.nextTriggerAt) return false;
    return now.getTime() >= new Date(reminder.nextTriggerAt).getTime();
  });
}

export function resetDueHealthReminder(reminders: HealthReminder[], id: string, now = new Date()): HealthReminder[] {
  return reminders.map((reminder) =>
    reminder.id === id
      ? {
          ...reminder,
          lastTriggeredAt: now.toISOString(),
          nextTriggerAt: addMinutes(now, reminder.intervalMinutes).toISOString()
        }
      : reminder
  );
}

export function calculateReminderProgress(reminder: HealthReminder, now = new Date()) {
  if (!reminder.nextTriggerAt) {
    return { remainingMinutes: reminder.intervalMinutes, progress: 0 };
  }

  const next = new Date(reminder.nextTriggerAt);
  const remainingMs = Math.max(0, next.getTime() - now.getTime());
  const totalMs = reminder.intervalMinutes * 60_000;
  const elapsed = Math.min(totalMs, totalMs - remainingMs);

  return {
    remainingMinutes: Math.ceil(remainingMs / 60_000),
    progress: Number((elapsed / totalMs).toFixed(2))
  };
}

function validateReminderName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new Error('提醒名称不能为空');
  if ([...name].length > 20) throw new Error('提醒名称不能超过 20 字');
  return name;
}

function validateInterval(intervalMinutes: number): number {
  if (!Number.isFinite(intervalMinutes)) throw new Error('间隔时长必须是数字');
  if (intervalMinutes < 5) throw new Error('间隔时长不能少于 5 分钟');
  if (intervalMinutes > 480) throw new Error('间隔时长不能超过 480 分钟');
  return Math.round(intervalMinutes);
}

function createReminderId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reminder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
