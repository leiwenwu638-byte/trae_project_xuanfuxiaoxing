import { addMinutes } from './date';
import { createDefaultHealthReminderMessage } from './reminderContent';
import type { AppSettings, HealthReminder } from './types';

export function createDefaultSettings(): AppSettings {
  return {
    general: {
      autoLaunch: true,
      ballOpacity: 0.7,
      ballSize: 'medium',
      rememberPosition: true,
      soundEnabled: true,
      // 自定义提示音文件路径：null = 走内置默认（`public/sound-default.wav`）。
      // 老 settings.json 没有此字段时由 Tauri 端 `#[serde(default)]` 给 None，
      // 前端 `createDefaultSettings` 与之保持一致——保证双端默认值对得上。
      soundFilePath: null
    },
    todo: {
      advanceReminderMinutes: 10
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
    message: createDefaultHealthReminderMessage(intervalMinutes),
    soundEnabled: true,
    soundFilePath: null,
    enabled: true,
    lastTriggeredAt: null,
    nextTriggerAt: addMinutes(now, intervalMinutes).toISOString()
  };
}
