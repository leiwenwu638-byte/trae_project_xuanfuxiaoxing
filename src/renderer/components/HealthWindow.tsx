import { AlertTriangle, Check, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  createDefaultHealthReminderMessage,
  getHealthReminderMessage,
  MAX_HEALTH_REMINDER_MESSAGE_LENGTH
} from '../../shared/reminderContent';
import { calculateReminderProgress } from '../../shared/reminderService';
import type { AddHealthReminderInput, HealthReminder, UpdateHealthReminderInput } from '../../shared/types';
import { ActionButton } from './common/ActionButton';
import { SoundSettingsBar } from './SoundSettingsBar';

type HealthWindowProps = {
  reminders: HealthReminder[];
  now: Date;
  onToggle: (id: string) => void;
  onAdd: (input: AddHealthReminderInput) => void;
  onUpdate: (id: string, input: UpdateHealthReminderInput) => void;
  onDelete: (id: string) => void;
  /** 全局提示音设置（今日计划 / 健康节律共用）。 */
  soundFilePath: string | null;
  /** 用户选了新提示音文件。父组件负责写盘 + 写 settings。 */
  onSelectSound: (file: File) => void;
  /** 用户点了"恢复默认"。父组件负责把 settings.general.soundFilePath 写回 null。 */
  onResetSound: () => void;
};

/**
 * 健康节律窗口。
 *
 * 布局策略：
 *   - 顶部 header 与 TodoPanel 风格一致：小标题（循环提醒）+ 主标题（健康提醒）
 *     + 右侧只放 + 添加按钮（不再放 × 关闭，避免和 Windows 原生标题栏重复）；
 *   - 每条提醒用"卡片式"两行布局：
 *       1) 图标 / 名称 / 间隔 / 状态徽章
 *       2) 进度条 + 剩余时间
 *       3) 操作按钮行（编辑 / 暂停）
 *     状态和操作分层，**不**再挤在 grid 五列里。
 *   - `h-full w-full` 占满窗口（tauri.conf.json 380x600），
 *     不再使用 `h-[520px] w-[380px]` 像素内框。
 *   - 滚动区独立可滚：`flex flex-col overflow-hidden` 外层 + `flex-none` 头部 +
 *     `min-h-0 flex-1 overflow-y-auto` 列表容器，10+ 条提醒不会撑出窗口。
 *   - 单条删除入口（编辑 / 暂停 / 删除），点击后直接走 `onDelete` →
 *     `desktopApi.reminder.deleteReminder` →
 *     Tauri 端 `reminders.retain(...)` 落盘 `reminders.json`。
 */
export function HealthWindow({
  reminders,
  now,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  soundFilePath,
  onSelectSound,
  onResetSound
}: HealthWindowProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState('30');
  const [message, setMessage] = useState(createDefaultHealthReminderMessage(30));
  const [messageEdited, setMessageEdited] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIntervalMinutes, setEditIntervalMinutes] = useState('30');
  const [editMessage, setEditMessage] = useState(createDefaultHealthReminderMessage(30));
  const [editMessageEdited, setEditMessageEdited] = useState(false);
  const [editError, setEditError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const interval = Number(intervalMinutes);

    if (!trimmedName) {
      setError('提醒名称不能为空！');
      return;
    }

    if (!Number.isFinite(interval) || interval < 5 || interval > 480) {
      setError('间隔需为 5 到 480 分钟！');
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError('提醒内容不能为空！');
      return;
    }

    if ([...trimmedMessage].length > MAX_HEALTH_REMINDER_MESSAGE_LENGTH) {
      setError(`提醒内容不能超过 ${MAX_HEALTH_REMINDER_MESSAGE_LENGTH} 字！`);
      return;
    }

    onAdd({
      name: trimmedName,
      intervalMinutes: interval,
      message: trimmedMessage,
      soundEnabled: true,
      soundFilePath: null
    });
    setName('');
    setIntervalMinutes('30');
    setMessage(createDefaultHealthReminderMessage(30));
    setMessageEdited(false);
    setAdding(false);
    setError('');
  }

  function updateAddInterval(value: string) {
    setIntervalMinutes(value);
    setError('');
    if (!messageEdited) {
      setMessage(createDefaultHealthReminderMessage(intervalFromValue(value)));
    }
  }

  function startEdit(reminder: HealthReminder) {
    setAdding(false);
    setEditingId(reminder.id);
    setEditName(reminder.name);
    setEditIntervalMinutes(String(reminder.intervalMinutes));
    setEditMessage(getHealthReminderMessage(reminder));
    setEditMessageEdited(false);
    setEditError('');
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;

    const trimmedName = editName.trim();
    const interval = Number(editIntervalMinutes);

    if (!trimmedName) {
      setEditError('提醒名称不能为空！');
      return;
    }

    if (!Number.isFinite(interval) || interval < 5 || interval > 480) {
      setEditError('间隔需要 5 到 480 分钟！');
      return;
    }

    const trimmedMessage = editMessage.trim();
    if (!trimmedMessage) {
      setEditError('提醒内容不能为空！');
      return;
    }

    if ([...trimmedMessage].length > MAX_HEALTH_REMINDER_MESSAGE_LENGTH) {
      setEditError(`提醒内容不能超过 ${MAX_HEALTH_REMINDER_MESSAGE_LENGTH} 字！`);
      return;
    }

    onUpdate(editingId, {
      name: trimmedName,
      intervalMinutes: interval,
      message: trimmedMessage,
      soundEnabled: true,
      soundFilePath: null
    });
    setEditingId(null);
    setEditError('');
  }

  function updateEditInterval(value: string) {
    setEditIntervalMinutes(value);
    setEditError('');
    if (!editMessageEdited) {
      setEditMessage(createDefaultHealthReminderMessage(intervalFromValue(value)));
    }
  }

  function deleteReminder(reminder: HealthReminder) {
    if (editingId === reminder.id) {
      setEditingId(null);
    }
    try {
      onDelete(reminder.id);
    } catch (error) {
      console.warn('[HealthWindow] delete reminder failed:', error);
    }
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-[13px] text-assistant-ink">
      <header className="drag-region flex flex-none items-center justify-between gap-3 border-b border-assistant-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-assistant-muted">循环提醒</p>
          <h1 className="truncate text-[15px] font-semibold leading-snug">健康提醒</h1>
          <p className="mt-0.5 truncate text-[11px] text-assistant-muted">
            {reminders.length > 0 ? `${reminders.length} 条循环提醒` : '尚未添加提醒'}
          </p>
        </div>
        <div className="no-drag flex flex-none items-center">
          <ActionButton
            variant="muted"
            size="icon"
            icon={<Plus size={14} />}
            ariaLabel="添加提醒"
            onClick={() => setAdding((value) => !value)}
          />
        </div>
      </header>

      <SoundSettingsBar
        soundFilePath={soundFilePath}
        onSelectSound={onSelectSound}
        onResetSound={onResetSound}
        testIdPrefix="health-sound"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding ? (
          <form
            className="space-y-2 border-b border-assistant-line bg-assistant-wash/60 px-4 py-3"
            noValidate
            onSubmit={submit}
          >
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
            <label className="block text-[11px] text-assistant-muted">
              间隔分钟
              <input
                aria-label="间隔分钟"
                className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink"
                max={480}
                min={5}
                type="number"
                value={intervalMinutes}
                onChange={(event) => updateAddInterval(event.target.value)}
              />
            </label>
            <label className="block text-[11px] text-assistant-muted">
              提醒内容
              <textarea
                aria-label="提醒内容"
                className="mt-1 h-14 w-full resize-none rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] leading-5 text-assistant-ink"
                maxLength={MAX_HEALTH_REMINDER_MESSAGE_LENGTH}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setMessageEdited(true);
                  setError('');
                }}
              />
            </label>
            {error ? <InlineAlert>{error}</InlineAlert> : null}
            <div className="flex justify-end gap-2.5">
              <ActionButton
                variant="ghost"
                size="icon"
                icon={<X size={14} />}
                ariaLabel="取消添加提醒"
                onClick={() => setAdding(false)}
              />
              <ActionButton
                variant="primary"
                size="icon"
                icon={<Check size={14} />}
                ariaLabel="保存提醒"
                type="submit"
              />
            </div>
          </form>
        ) : null}
        <div className="space-y-2 p-3">
          {reminders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <div className="text-[28px]" aria-hidden>
                ⏰
              </div>
              <p className="text-[13px] font-medium text-assistant-ink">尚未添加循环提醒</p>
              <p className="max-w-[260px] text-[12px] text-assistant-muted">
                点击右上角 + 添加第一条健康提醒
              </p>
            </div>
          ) : (
            reminders.map((reminder) => {
            const progress = calculateReminderProgress(reminder, now);
            const isEditing = editingId === reminder.id;
            return (
              <article
                key={reminder.id}
                className="rounded-md border border-assistant-line bg-white p-3 transition hover:border-assistant-accent/40"
              >
                {/* 第一行：图标 / 名称 / 间隔 / 状态徽章 */}
                <div className="flex items-center gap-2">
                  <div className="text-[18px] leading-none" aria-hidden>
                    {reminder.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[13px] font-medium">{reminder.name}</h2>
                    <p className="text-[11px] text-assistant-muted">每 {reminder.intervalMinutes} 分钟</p>
                  </div>
                  <span
                    className={
                      reminder.enabled
                        ? 'rounded-full bg-assistant-success/10 px-2 py-0.5 text-[11px] text-assistant-success'
                        : 'rounded-full bg-assistant-wash px-2 py-0.5 text-[11px] text-assistant-muted'
                    }
                  >
                    {reminder.enabled ? '运行' : '已暂停'}
                  </span>
                </div>

                {/* 第二行：进度条 + 剩余时间 */}
                {!isEditing ? (
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full bg-assistant-wash"
                      role="progressbar"
                      aria-valuenow={Math.round(progress.progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-assistant-accent transition-[width]"
                        style={{ width: `${Math.round(progress.progress * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-assistant-muted" data-testid="remaining-time">
                      剩余 {progress.remainingMinutes} 分钟
                    </p>
                  </div>
                ) : null}

                {/* 第三行：编辑 / 暂停 / 删除（接入 ActionButton 统一样式） */}
                {!isEditing ? (
                  <div className="mt-2 flex items-center gap-2.5">
                    <ActionButton
                      variant="muted"
                      size="sm"
                      icon={<Pencil size={11} />}
                      ariaLabel={`编辑：${reminder.name}`}
                      onClick={() => startEdit(reminder)}
                    >
                      编辑
                    </ActionButton>
                    <ActionButton
                      variant="muted"
                      size="sm"
                      icon={reminder.enabled ? <Pause size={11} /> : <Play size={11} />}
                      ariaLabel={`${reminder.enabled ? '暂停' : '运行'}：${reminder.name}`}
                      onClick={() => onToggle(reminder.id)}
                    >
                      {reminder.enabled ? '暂停' : '运行'}
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={11} />}
                      ariaLabel={`删除：${reminder.name}`}
                      data-testid={`delete-reminder-${reminder.id}`}
                      onClick={() => deleteReminder(reminder)}
                    >
                      删除
                    </ActionButton>
                  </div>
                ) : null}

                {isEditing ? (
                  <form
                    className="mt-3 space-y-2 rounded-md border border-dashed border-assistant-line bg-assistant-wash/60 p-2"
                    noValidate
                    onSubmit={submitEdit}
                  >
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
                    <label className="block text-[11px] text-assistant-muted">
                      修改间隔分钟
                      <input
                        aria-label="修改间隔分钟"
                        className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink"
                        max={480}
                        min={5}
                        type="number"
                        value={editIntervalMinutes}
                        onChange={(event) => updateEditInterval(event.target.value)}
                      />
                    </label>
                    <label className="block text-[11px] text-assistant-muted">
                      修改提醒内容
                      <textarea
                        aria-label="修改提醒内容"
                        className="mt-1 h-14 w-full resize-none rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] leading-5 text-assistant-ink"
                        maxLength={MAX_HEALTH_REMINDER_MESSAGE_LENGTH}
                        value={editMessage}
                        onChange={(event) => {
                          setEditMessage(event.target.value);
                          setEditMessageEdited(true);
                          setEditError('');
                        }}
                      />
                    </label>
                    {editError ? <InlineAlert>{editError}</InlineAlert> : null}
                    <div className="flex justify-end gap-2.5">
                      <ActionButton
                        variant="ghost"
                        size="icon"
                        icon={<X size={14} />}
                        ariaLabel="取消修改"
                        onClick={() => setEditingId(null)}
                      />
                      <ActionButton
                        variant="primary"
                        size="icon"
                        icon={<Check size={14} />}
                        ariaLabel="保存修改"
                        type="submit"
                      />
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })
        )}
        </div>
      </div>
    </section>
  );
}

function intervalFromValue(value: string): number {
  const interval = Number(value);
  return Number.isFinite(interval) && interval > 0 ? interval : 30;
}

function InlineAlert({ children }: { children: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 text-[12px] leading-5 text-orange-800"
      role="alert"
    >
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-assistant-warning text-white">
        <AlertTriangle size={12} />
      </span>
      <span>{children}</span>
    </div>
  );
}
