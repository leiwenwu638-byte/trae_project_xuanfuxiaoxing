import { Check, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { calculateReminderProgress } from '../../shared/reminderService';
import type { AddHealthReminderInput, HealthReminder, UpdateHealthReminderInput } from '../../shared/types';

type HealthWindowProps = {
  reminders: HealthReminder[];
  now: Date;
  onToggle: (id: string) => void;
  onAdd: (input: AddHealthReminderInput) => void;
  onUpdate: (id: string, input: UpdateHealthReminderInput) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function HealthWindow({ reminders, now, onToggle, onAdd, onUpdate, onDelete, onClose }: HealthWindowProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState('30');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIntervalMinutes, setEditIntervalMinutes] = useState('30');
  const [editSoundEnabled, setEditSoundEnabled] = useState(true);
  const [editError, setEditError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const interval = Number(intervalMinutes);

    if (!trimmedName) {
      setError('提醒名称不能为空');
      return;
    }

    if (!Number.isFinite(interval) || interval < 5 || interval > 480) {
      setError('间隔需为 5 到 480 分钟');
      return;
    }

    onAdd({ name: trimmedName, intervalMinutes: interval, soundEnabled });
    setName('');
    setIntervalMinutes('30');
    setSoundEnabled(true);
    setAdding(false);
    setError('');
  }

  function startEdit(reminder: HealthReminder) {
    setAdding(false);
    setEditingId(reminder.id);
    setEditName(reminder.name);
    setEditIntervalMinutes(String(reminder.intervalMinutes));
    setEditSoundEnabled(reminder.soundEnabled);
    setEditError('');
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;

    const trimmedName = editName.trim();
    const interval = Number(editIntervalMinutes);

    if (!trimmedName) {
      setEditError('提醒名称不能为空');
      return;
    }

    if (!Number.isFinite(interval) || interval < 5 || interval > 480) {
      setEditError('间隔需要 5 到 480 分钟');
      return;
    }

    onUpdate(editingId, { name: trimmedName, intervalMinutes: interval, soundEnabled: editSoundEnabled });
    setEditingId(null);
    setEditError('');
  }

  return (
    <section className="flex h-[520px] w-[380px] flex-col overflow-hidden rounded-lg border border-assistant-line bg-white text-[13px] text-assistant-ink shadow-utility">
      <header className="drag-region flex flex-none items-center justify-between border-b border-assistant-line px-4 py-3">
        <div>
          <p className="text-[11px] text-assistant-muted">循环提醒</p>
          <h1 className="text-[15px] font-semibold">健康提醒</h1>
        </div>
        <div className="no-drag flex items-center gap-1">
          <button
            aria-label="添加提醒"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted hover:border-assistant-accent hover:text-assistant-accent"
            type="button"
            onClick={() => setAdding((value) => !value)}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label="关闭提醒管理"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted hover:border-assistant-warning hover:text-assistant-warning"
            type="button"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {adding ? (
        <form className="flex-none space-y-2 border-b border-assistant-line bg-assistant-wash/60 px-4 py-3" onSubmit={submit}>
          <label className="block text-[11px] text-assistant-muted">
            提醒名称
            <input
              aria-label="提醒名称"
              className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink"
              maxLength={20}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="block text-[11px] text-assistant-muted">
              间隔分钟
              <input
                aria-label="间隔分钟"
                className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink"
                max={480}
                min={5}
                type="number"
                value={intervalMinutes}
                onChange={(event) => {
                  setIntervalMinutes(event.target.value);
                  setError('');
                }}
              />
            </label>
            <label className="flex h-8 items-center gap-1 text-[11px] text-assistant-muted">
              <input
                checked={soundEnabled}
                type="checkbox"
                onChange={(event) => setSoundEnabled(event.target.checked)}
              />
              提示音
            </label>
          </div>
          {error ? <p className="text-[11px] text-assistant-warning">{error}</p> : null}
          <div className="flex justify-end gap-1">
            <button
              aria-label="取消添加提醒"
              className="flex h-7 w-7 items-center justify-center rounded-md text-assistant-muted hover:bg-white"
              type="button"
              onClick={() => setAdding(false)}
            >
              <X size={14} />
            </button>
            <button
              aria-label="保存提醒"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-assistant-accent text-white"
              type="submit"
            >
              <Check size={14} />
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex-1 divide-y divide-assistant-line overflow-y-auto">
        {reminders.map((reminder) => {
          const progress = calculateReminderProgress(reminder, now);
          const isEditing = editingId === reminder.id;
          return (
            <article key={reminder.id} className="px-4 py-3">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">
                    <span className="mr-2">{reminder.icon}</span>
                    {reminder.name}
                  </h2>
                  <p className="text-[11px] text-assistant-muted">每 {reminder.intervalMinutes} 分钟</p>
                </div>
                <span className={reminder.enabled ? 'text-[11px] text-assistant-success' : 'text-[11px] text-assistant-muted'}>
                  {reminder.enabled ? '运行' : '暂停'}
                </span>
                <button
                  aria-label={`编辑：${reminder.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted hover:border-assistant-accent hover:text-assistant-accent"
                  type="button"
                  onClick={() => startEdit(reminder)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={`${reminder.enabled ? '暂停' : '运行'}：${reminder.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted hover:border-assistant-accent hover:text-assistant-accent"
                  type="button"
                  onClick={() => onToggle(reminder.id)}
                >
                  {reminder.enabled ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  aria-label={`删除：${reminder.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted hover:border-assistant-warning hover:text-assistant-warning"
                  type="button"
                  onClick={() => onDelete(reminder.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {isEditing ? (
                <form className="mt-3 space-y-2 rounded-md border border-dashed border-assistant-line bg-assistant-wash/60 p-2" onSubmit={submitEdit}>
                  <label className="block text-[11px] text-assistant-muted">
                    修改提醒名称
                    <input
                      aria-label="修改提醒名称"
                      className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink"
                      maxLength={20}
                      value={editName}
                      onChange={(event) => {
                        setEditName(event.target.value);
                        setEditError('');
                      }}
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="block text-[11px] text-assistant-muted">
                      修改间隔分钟
                      <input
                        aria-label="修改间隔分钟"
                        className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink"
                        max={480}
                        min={5}
                        type="number"
                        value={editIntervalMinutes}
                        onChange={(event) => {
                          setEditIntervalMinutes(event.target.value);
                          setEditError('');
                        }}
                      />
                    </label>
                    <label className="flex h-8 items-center gap-1 text-[11px] text-assistant-muted">
                      <input
                        aria-label="修改提示音"
                        checked={editSoundEnabled}
                        type="checkbox"
                        onChange={(event) => setEditSoundEnabled(event.target.checked)}
                      />
                      提示音
                    </label>
                  </div>
                  {editError ? <p className="text-[11px] text-assistant-warning">{editError}</p> : null}
                  <div className="flex justify-end gap-1">
                    <button
                      aria-label="取消修改"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-assistant-muted hover:bg-white"
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      <X size={14} />
                    </button>
                    <button
                      aria-label="保存修改"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-assistant-accent text-white"
                      type="submit"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-3 grid grid-cols-[1fr_78px] items-center gap-3">
                  <div className="h-2 overflow-hidden rounded-full bg-assistant-wash">
                    <div
                      className="h-full rounded-full bg-assistant-accent transition-[width]"
                      style={{ width: `${Math.round(progress.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-right text-[11px] text-assistant-muted">剩余 {progress.remainingMinutes} 分钟</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
