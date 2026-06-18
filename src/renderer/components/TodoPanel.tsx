import { Check, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type {
  AddTodoInput,
  Todo,
  TodoPriority,
  UpdateTodoInput
} from '../../shared/types';
import { TODO_PRIORITY_DEFAULT } from '../../shared/types';
import { ActionButton } from './common/ActionButton';
import { PriorityBadge, PrioritySelector } from './PrioritySelector';
import { TimeWheelPicker } from './TimeWheelPicker';

type TodoPanelProps = {
  dateLabel: string;
  todos: Todo[];
  onAdd: (input: AddTodoInput) => void;
  onClose: () => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, input: UpdateTodoInput) => void;
};

/**
 * 今日待办主面板。
 *
 * 布局策略：
 *   - 用 `h-full w-full` 占满主窗口（tauri.conf.json 400x600），不再固定 380x520
 *     像素内框；让 400px 窄窗口也"看着像桌面工具"而不是"手机端卡片"；
 *   - header / form / list 用 `border-b` / `divide-y` 显式分割，避免"内容无边界
 *     一片白"的视觉；
 *   - 顶部新增按钮单独显示在右侧（不再放 × 关闭按钮，避免和 Windows 原生
 *     标题栏关闭按钮重复/误触；用户通过系统托盘回到应用）；
 *   - 列表为空时只显示"未完成项"一句（不显示"今日事项已清空"+ "今天还没有待办"
 *     两条重复信息），附"点击右上 + 添加第一个待办"引导；
 *   - 列表非空时只显示 `unfinishedCount` 一句，**不**叠加"今日事项已清空"等
 *     历史重复标签。
 */
export function TodoPanel({ dateLabel, todos, onAdd, onClose, onToggle, onDelete, onUpdate }: TodoPanelProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [priority, setPriority] = useState<TodoPriority>(TODO_PRIORITY_DEFAULT);
  const [error, setError] = useState('');
  const [timePulse, setTimePulse] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editReminderTime, setEditReminderTime] = useState('');
  const [editSoundEnabled, setEditSoundEnabled] = useState(true);
  const [editPriority, setEditPriority] = useState<TodoPriority>(TODO_PRIORITY_DEFAULT);
  const [editError, setEditError] = useState('');
  const [editTimePulse, setEditTimePulse] = useState(false);

  useEffect(() => {
    if (!timePulse) return;
    const timer = window.setTimeout(() => setTimePulse(false), 260);
    return () => window.clearTimeout(timer);
  }, [timePulse]);

  useEffect(() => {
    if (!editTimePulse) return;
    const timer = window.setTimeout(() => setEditTimePulse(false), 260);
    return () => window.clearTimeout(timer);
  }, [editTimePulse]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('任务名称不能为空');
      return;
    }

    onAdd({ title: trimmed, reminderTime: reminderTime || null, soundEnabled, priority });
    setTitle('');
    setReminderTime('');
    setSoundEnabled(true);
    setPriority(TODO_PRIORITY_DEFAULT);
    setError('');
    setAdding(false);
  }

  function startEdit(todo: Todo) {
    setAdding(false);
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditReminderTime(todo.reminderTime ?? '');
    setEditSoundEnabled(todo.soundEnabled ?? true);
    setEditPriority(todo.priority ?? TODO_PRIORITY_DEFAULT);
    setEditError('');
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditError('任务名称不能为空');
      return;
    }

    onUpdate(editingId, {
      title: trimmed,
      reminderTime: editReminderTime || null,
      soundEnabled: editSoundEnabled,
      priority: editPriority
    });
    setEditingId(null);
    setEditTitle('');
    setEditReminderTime('');
    setEditError('');
  }

  function updateReminderTime(value: string) {
    setReminderTime(value);
    if (value) setTimePulse(true);
  }

  function clearReminderTime() {
    setReminderTime('');
  }

  function updateEditReminderTime(value: string) {
    setEditReminderTime(value);
    if (value) setEditTimePulse(true);
  }

  function clearEditReminderTime() {
    setEditReminderTime('');
  }

  const unfinishedCount = todos.filter((todo) => !todo.completed).length;

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-[13px] text-assistant-ink">
      <header className="drag-region flex flex-none items-center justify-between gap-3 border-b border-assistant-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-assistant-muted">今日待办</p>
          <h1 className="truncate text-[15px] font-semibold leading-snug">{dateLabel}</h1>
          <p className="mt-0.5 truncate text-[11px] text-assistant-muted">
            {todos.length === 0
              ? '今天还没有待办'
              : unfinishedCount > 0
                ? `${unfinishedCount} 项未完成`
                : '今日全部完成'}
          </p>
        </div>
        <div className="no-drag flex flex-none items-center">
          <button
            aria-label="添加待办"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted transition hover:border-assistant-accent hover:text-assistant-accent"
            type="button"
            onClick={() => setAdding((value) => !value)}
          >
            <Plus size={14} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding ? (
          <form
            className="todo-form-enter space-y-2 border-b border-assistant-line bg-assistant-wash/60 px-4 py-3"
            data-testid="todo-add-form"
            onSubmit={submit}
          >
            <label className="block text-[11px] text-assistant-muted">
              任务名称
              <input
                aria-label="任务名称"
                className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink transition focus:border-assistant-accent/60 focus:outline-none focus:ring-0 hover:border-assistant-accent/50"
                maxLength={40}
                placeholder="写下今天要完成的事"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError('');
                }}
              />
            </label>
            <div className="block text-[11px] text-assistant-muted">
              任务优先级
              <PrioritySelector
                value={priority}
                onChange={setPriority}
                ariaLabel="任务优先级"
                testId="todo-priority-selector"
              />
            </div>
            <label className="block text-[11px] text-assistant-muted">
              提醒时间
              <span
                data-testid="todo-reminder-time-field"
                className={`mt-1 block ${timePulse ? 'todo-time-pop' : ''}`}
              >
                <TimeWheelPicker
                  ariaLabel="提醒时间"
                  testId="todo-reminder-time-trigger"
                  value={reminderTime || null}
                  onChange={updateReminderTime}
                  onClear={clearReminderTime}
                />
              </span>
            </label>
            <label className="flex h-7 items-center gap-2 text-[11px] text-assistant-muted">
              <input
                aria-label="待办提示音"
                checked={soundEnabled}
                type="checkbox"
                onChange={(event) => setSoundEnabled(event.target.checked)}
              />
              提示音
            </label>
            {error ? <p className="text-[11px] text-assistant-warning">{error}</p> : null}
            <div className="flex justify-end gap-2.5">
              <ActionButton
                variant="ghost"
                size="icon"
                icon={<X size={14} />}
                ariaLabel="取消添加"
                onClick={() => setAdding(false)}
              />
              <ActionButton
                variant="primary"
                size="icon"
                icon={<Check size={14} />}
                ariaLabel="确认添加"
                type="submit"
              />
            </div>
          </form>
        ) : null}
        {todos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <div className="text-[28px]" aria-hidden>
              📝
            </div>
            <p className="text-[13px] font-medium text-assistant-ink">今天还没有待办</p>
            <p className="max-w-[260px] text-[12px] text-assistant-muted">
              点击右上角 + 添加今天的第一个待办
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-assistant-line">
            {todos.map((todo) => (
              <li key={todo.id} className="todo-row-enter px-4 py-3 transition hover:bg-assistant-wash/70">
                <div className="grid grid-cols-[28px_1fr_auto_28px_28px] items-center gap-2">
                  <button
                    aria-label={`标记完成：${todo.title}`}
                    className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
                      todo.completed
                        ? 'border-assistant-success bg-assistant-success text-white'
                        : 'border-assistant-line text-transparent hover:border-assistant-accent'
                    }`}
                    type="button"
                    onClick={() => onToggle(todo.id)}
                  >
                    <Check size={13} />
                  </button>
                  <div className="min-w-0">
                    <h2 className={todo.completed ? 'truncate font-medium text-assistant-muted line-through' : 'truncate font-medium'}>
                      {todo.title}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <p className="text-[11px] text-assistant-muted">{todo.completed ? '已完成' : '待完成'}</p>
                      <PriorityBadge priority={todo.priority ?? TODO_PRIORITY_DEFAULT} completed={todo.completed} />
                    </div>
                  </div>
                  {todo.completed ? (
                    <span className="rounded-full bg-assistant-wash px-2 py-1 text-[11px] text-assistant-muted">完成</span>
                  ) : todo.reminderTime ? (
                    <span className="grid grid-cols-[12px_auto] items-center gap-1 rounded-full bg-assistant-wash px-2 py-1 text-[11px] text-assistant-muted">
                      <Clock size={12} />
                      {todo.reminderTime}
                    </span>
                  ) : (
                    <span className="text-[11px] text-assistant-muted">无提醒</span>
                  )}
                  <button
                    aria-label={`编辑：${todo.title}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-assistant-muted transition hover:border-assistant-line hover:bg-white hover:text-assistant-accent"
                    type="button"
                    onClick={() => startEdit(todo)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label={`删除：${todo.title}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-assistant-muted transition hover:border-assistant-line hover:bg-white hover:text-assistant-warning"
                    type="button"
                    onClick={() => onDelete(todo.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {editingId === todo.id ? (
                  <form className="todo-form-enter mt-3 space-y-2 rounded-md border border-dashed border-assistant-line bg-white/80 p-2" onSubmit={submitEdit}>
                    <label className="block text-[11px] text-assistant-muted">
                      修改任务名称
                      <input
                        aria-label="修改任务名称"
                        className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink transition focus:border-assistant-accent/60 focus:outline-none focus:ring-0 hover:border-assistant-accent/50"
                        maxLength={40}
                        value={editTitle}
                        onChange={(event) => {
                          setEditTitle(event.target.value);
                          setEditError('');
                        }}
                      />
                    </label>
                    <div className="block text-[11px] text-assistant-muted">
                      任务优先级
                      <PrioritySelector
                        value={editPriority}
                        onChange={setEditPriority}
                        ariaLabel="任务优先级（编辑）"
                        testId="todo-edit-priority-selector"
                      />
                    </div>
                    <label className="block text-[11px] text-assistant-muted">
                      修改提醒时间
                      <span
                        className={`mt-1 block ${editTimePulse ? 'todo-time-pop' : ''}`}
                      >
                        <TimeWheelPicker
                          ariaLabel="修改提醒时间"
                          testId="todo-edit-reminder-time-trigger"
                          value={editReminderTime || null}
                          onChange={updateEditReminderTime}
                          onClear={clearEditReminderTime}
                        />
                      </span>
                    </label>
                    <label className="flex h-7 items-center gap-2 text-[11px] text-assistant-muted">
                      <input
                        aria-label="修改待办提示音"
                        checked={editSoundEnabled}
                        type="checkbox"
                        onChange={(event) => setEditSoundEnabled(event.target.checked)}
                      />
                      提示音
                    </label>
                    {editError ? <p className="text-[11px] text-assistant-warning">{editError}</p> : null}
                    <div className="flex justify-end gap-2.5">
                      <ActionButton
                        variant="ghost"
                        size="icon"
                        icon={<X size={14} />}
                        ariaLabel="取消待办修改"
                        onClick={() => setEditingId(null)}
                      />
                      <ActionButton
                        variant="primary"
                        size="icon"
                        icon={<Check size={14} />}
                        ariaLabel="保存待办修改"
                        type="submit"
                      />
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
