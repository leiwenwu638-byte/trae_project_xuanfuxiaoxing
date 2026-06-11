import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultHealthReminders, createDefaultSettings } from '../shared/defaults';
import type { AppSettings, HealthReminder, TodoStore } from '../shared/types';

export type PersistedSnapshot = {
  todos: TodoStore;
  reminders: HealthReminder[];
  settings: AppSettings;
};

export class AppStore {
  constructor(
    private readonly dataDir: string,
    private readonly startupDate = new Date()
  ) {}

  async load(): Promise<PersistedSnapshot> {
    await mkdir(this.dataDir, { recursive: true });
    const [todos, reminders, rawSettings] = await Promise.all([
      this.readJson<TodoStore>('todos.json', {}),
      this.readJson<HealthReminder[]>('reminders.json', createDefaultHealthReminders(this.startupDate)),
      this.readJson<AppSettings>('settings.json', createDefaultSettings())
    ]);
    const settings = normalizeSettings(rawSettings);
    if (JSON.stringify(settings) !== JSON.stringify(rawSettings)) {
      await this.saveSettings(settings);
    }

    return { todos, reminders, settings };
  }

  async saveTodos(todos: TodoStore): Promise<void> {
    await this.writeJson('todos.json', todos);
  }

  async saveReminders(reminders: HealthReminder[]): Promise<void> {
    await this.writeJson('reminders.json', reminders);
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.writeJson('settings.json', settings);
  }

  async saveAll(snapshot: PersistedSnapshot): Promise<void> {
    await Promise.all([
      this.saveTodos(snapshot.todos),
      this.saveReminders(snapshot.reminders),
      this.saveSettings(snapshot.settings)
    ]);
  }

  private async readJson<T>(fileName: string, defaults: T): Promise<T> {
    const filePath = path.join(this.dataDir, fileName);
    try {
      return JSON.parse(await readFile(filePath, 'utf-8')) as T;
    } catch (error) {
      if (isMissingFile(error)) {
        await this.writeJson(fileName, defaults);
        return defaults;
      }

      await this.backupCorruptFile(filePath);
      await this.writeJson(fileName, defaults);
      return defaults;
    }
  }

  private async writeJson(fileName: string, value: unknown): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const filePath = path.join(this.dataDir, fileName);
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
    await rename(tempPath, filePath);
  }

  private async backupCorruptFile(filePath: string): Promise<void> {
    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    try {
      await rename(filePath, backupPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const defaults = createDefaultSettings();
  return {
    general: {
      ...defaults.general,
      ...settings.general
    },
    todo: {
      ...defaults.todo,
      ...settings.todo,
      advanceReminderMinutes:
        settings.todo?.advanceReminderMinutes && settings.todo.advanceReminderMinutes > 0
          ? settings.todo.advanceReminderMinutes
          : defaults.todo.advanceReminderMinutes
    },
    ballPosition: {
      ...defaults.ballPosition,
      ...settings.ballPosition
    }
  };
}
