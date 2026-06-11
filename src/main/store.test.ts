import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStore } from './store';

const tempDirs: string[] = [];

describe('AppStore', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }))));
    tempDirs.length = 0;
  });

  it('creates defaults when files are missing', async () => {
    const dir = await tempDir();
    const store = new AppStore(dir, new Date('2026-06-10T09:00:00.000Z'));

    const snapshot = await store.load();

    expect(snapshot.todos).toEqual({});
    expect(snapshot.settings.general.ballOpacity).toBe(0.7);
    expect(snapshot.reminders.map((reminder) => reminder.name)).toEqual(['久坐站起', '定时喝水', '护眼休息']);
  });

  it('persists writes', async () => {
    const dir = await tempDir();
    const store = new AppStore(dir, new Date('2026-06-10T09:00:00.000Z'));
    const snapshot = await store.load();

    snapshot.todos['2026-06-10'] = [
      {
        id: 'todo-1',
        title: '完成作业',
        reminderTime: null,
        completed: false,
        remindedAt: null,
        createdAt: '2026-06-10T09:00:00.000Z'
      }
    ];
    await store.saveTodos(snapshot.todos);

    const next = await store.load();
    expect(next.todos['2026-06-10'][0].title).toBe('完成作业');
  });

  it('backs up corrupt JSON and replaces it with defaults', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'settings.json'), '{bad json', 'utf-8');
    const store = new AppStore(dir, new Date('2026-06-10T09:00:00.000Z'));

    const snapshot = await store.load();
    const files = await import('node:fs/promises').then((fs) => fs.readdir(dir));

    expect(snapshot.settings.general.ballSize).toBe('medium');
    expect(files.some((file) => file.startsWith('settings.json.corrupt-'))).toBe(true);
    expect(JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf-8')).general.ballSize).toBe('medium');
  });

  it('migrates old settings so todo advance reminders are enabled', async () => {
    const dir = await tempDir();
    await writeFile(
      path.join(dir, 'settings.json'),
      JSON.stringify({
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
      }),
      'utf-8'
    );
    const store = new AppStore(dir, new Date('2026-06-10T09:00:00.000Z'));

    const snapshot = await store.load();
    const persistedSettings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf-8'));

    expect(snapshot.settings.todo.advanceReminderMinutes).toBe(10);
    expect(persistedSettings.todo.advanceReminderMinutes).toBe(10);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'assistant-store-'));
  tempDirs.push(dir);
  return dir;
}
