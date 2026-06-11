import { describe, expect, it } from 'vitest';
import { createDefaultHealthReminders, createDefaultSettings } from './defaults';

describe('defaults', () => {
  it('creates the three v1 health reminders', () => {
    const reminders = createDefaultHealthReminders(new Date('2026-06-10T09:00:00.000Z'));

    expect(reminders).toHaveLength(3);
    expect(reminders.map((reminder) => reminder.name)).toEqual(['久坐站起', '定时喝水', '护眼休息']);
    expect(reminders.map((reminder) => reminder.intervalMinutes)).toEqual([45, 30, 60]);
    expect(reminders.every((reminder) => reminder.enabled)).toBe(true);
    expect(reminders.every((reminder) => reminder.nextTriggerAt)).toBe(true);
  });

  it('creates v1 default settings', () => {
    expect(createDefaultSettings()).toEqual({
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
    });
  });
});
