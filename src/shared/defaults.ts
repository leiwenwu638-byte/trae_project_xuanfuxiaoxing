import { addMinutes } from './date';
import type { AppSettings, HealthReminder } from './types';

export function createDefaultSettings(): AppSettings {
  return {
    general: {
      autoLaunch: true,
      ballOpacity: 0.7,
      ballSize: 'medium',
      rememberPosition: true,
      soundEnabled: true
    },
    todo: {
      advanceReminderMinutes: 0
    },
    ballPosition: {
      x: 120,
      y: 160
    }
  };
}

export function createDefaultHealthReminders(now = new Date()): HealthReminder[] {
  return [
    createReminder('stand', '久坐站起', '🧍', 45, now),
    createReminder('water', '定时喝水', '💧', 30, now),
    createReminder('eyes', '护眼休息', '👁️', 60, now)
  ];
}

function createReminder(
  id: string,
  name: string,
  icon: string,
  intervalMinutes: number,
  now: Date
): HealthReminder {
  return {
    id,
    name,
    icon,
    intervalMinutes,
    soundEnabled: true,
    enabled: true,
    lastTriggeredAt: null,
    nextTriggerAt: addMinutes(now, intervalMinutes).toISOString()
  };
}
