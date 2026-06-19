import { describe, expect, it } from 'vitest';
import {
  addHealthReminder,
  calculateReminderProgress,
  deleteHealthReminder,
  findDueHealthReminders,
  initializeHealthReminders,
  resetDueHealthReminder,
  toggleHealthReminder,
  updateHealthReminder
} from './reminderService';
import type { HealthReminder } from './types';

const baseReminder: HealthReminder = {
  id: 'drink',
  name: '定时喝水',
  icon: '💧',
  intervalMinutes: 30,
  message: '已过 30 分钟，该活动一下了！',
  soundEnabled: true,
  soundFilePath: null,
  enabled: true,
  lastTriggeredAt: null,
  nextTriggerAt: null
};

describe('reminderService', () => {
  it('initializes missing next trigger times', () => {
    const initialized = initializeHealthReminders([baseReminder], new Date('2026-06-10T09:00:00.000Z'));

    expect(initialized[0].nextTriggerAt).toBe('2026-06-10T09:30:00.000Z');
  });

  it('fills default messages for legacy reminders', () => {
    const legacyReminder = { ...baseReminder, message: undefined } as unknown as HealthReminder;
    const initialized = initializeHealthReminders([legacyReminder], new Date('2026-06-10T09:00:00.000Z'));

    expect(initialized[0].message).toBe('已过 30 分钟，该活动一下了！');
  });

  it('fills missing sound file paths for legacy reminders', () => {
    const legacyReminder = { ...baseReminder, soundFilePath: undefined } as unknown as HealthReminder;
    const initialized = initializeHealthReminders([legacyReminder], new Date('2026-06-10T09:00:00.000Z'));

    expect(initialized[0].soundFilePath).toBeNull();
  });

  it('pauses and resumes reminders', () => {
    const paused = toggleHealthReminder([baseReminder], 'drink', new Date('2026-06-10T09:00:00.000Z'));
    expect(paused[0].enabled).toBe(false);

    const resumed = toggleHealthReminder(paused, 'drink', new Date('2026-06-10T09:10:00.000Z'));
    expect(resumed[0].enabled).toBe(true);
    expect(resumed[0].nextTriggerAt).toBe('2026-06-10T09:40:00.000Z');
  });

  it('calculates countdown progress', () => {
    const reminder: HealthReminder = {
      ...baseReminder,
      lastTriggeredAt: '2026-06-10T09:00:00.000Z',
      nextTriggerAt: '2026-06-10T09:30:00.000Z'
    };

    expect(calculateReminderProgress(reminder, new Date('2026-06-10T09:15:00.000Z'))).toEqual({
      remainingMinutes: 15,
      progress: 0.5
    });
  });

  it('finds and resets due reminders', () => {
    const reminder: HealthReminder = {
      ...baseReminder,
      nextTriggerAt: '2026-06-10T09:30:00.000Z'
    };

    expect(findDueHealthReminders([reminder], new Date('2026-06-10T09:31:00.000Z')).map((item) => item.id)).toEqual([
      'drink'
    ]);

    const reset = resetDueHealthReminder([reminder], 'drink', new Date('2026-06-10T09:31:00.000Z'));

    expect(reset[0].lastTriggeredAt).toBe('2026-06-10T09:31:00.000Z');
    expect(reset[0].nextTriggerAt).toBe('2026-06-10T10:01:00.000Z');
  });

  it('adds a custom reminder with validation', () => {
    const reminders = addHealthReminder([], {
      name: '拉伸',
      intervalMinutes: 20,
      message: '站起来拉伸肩颈！',
      soundEnabled: true,
      soundFilePath: 'D:\\Sounds\\ice.wav',
      now: new Date('2026-06-10T09:00:00.000Z')
    });

    expect(reminders[0]).toMatchObject({
      name: '拉伸',
      icon: '⏰',
      intervalMinutes: 20,
      message: '站起来拉伸肩颈！',
      soundEnabled: true,
      soundFilePath: 'D:\\Sounds\\ice.wav',
      enabled: true,
      lastTriggeredAt: null,
      nextTriggerAt: '2026-06-10T09:20:00.000Z'
    });

    expect(() => addHealthReminder([], { name: '', intervalMinutes: 20, soundEnabled: true })).toThrow('提醒名称不能为空');
    expect(() => addHealthReminder([], { name: '喝水', intervalMinutes: 4, soundEnabled: true })).toThrow('间隔时长不能少于 5 分钟');
    expect(() => addHealthReminder([], { name: '喝水', intervalMinutes: 481, soundEnabled: true })).toThrow('间隔时长不能超过 480 分钟');
  });

  it('updates a custom reminder and reschedules the next trigger', () => {
    const updated = updateHealthReminder(
      [
        {
          ...baseReminder,
          id: 'custom',
          name: 'Stretch',
          intervalMinutes: 20,
          soundEnabled: false,
          soundFilePath: null,
          nextTriggerAt: '2026-06-10T09:20:00.000Z'
        }
      ],
      'custom',
      {
        name: 'Walk',
        intervalMinutes: 45,
        message: '离开座位走一走！',
        soundEnabled: true,
        soundFilePath: 'D:\\Sounds\\walk.wav',
        now: new Date('2026-06-10T09:05:00.000Z')
      }
    );

    expect(updated[0]).toMatchObject({
      id: 'custom',
      name: 'Walk',
      intervalMinutes: 45,
      message: '离开座位走一走！',
      soundEnabled: true,
      soundFilePath: 'D:\\Sounds\\walk.wav',
      nextTriggerAt: '2026-06-10T09:50:00.000Z'
    });

    expect(() => updateHealthReminder([baseReminder], 'drink', { name: '', intervalMinutes: 30, soundEnabled: true, soundFilePath: null })).toThrow(
      '提醒名称不能为空'
    );
  });

  it('deletes a health reminder by id', () => {
    const reminders = [
      baseReminder,
      {
        ...baseReminder,
        id: 'stretch',
        name: '拉伸'
      }
    ];

    expect(deleteHealthReminder(reminders, 'drink')).toEqual([
      {
        ...baseReminder,
        id: 'stretch',
        name: '拉伸'
      }
    ]);
  });
});
