import { Check, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { AddTodoInput, Todo, UpdateTodoInput } from '../../shared/types';

type TodoPanelProps = {
  dateLabel: string;
  todos: Todo[];
  onAdd: (input: AddTodoInput) => void;
  onClose: () => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, input: UpdateTodoInput) => void;
};

export function TodoPanel({ dateLabel, todos, onAdd, onClose, onToggle, onDelete, onUpdate }: TodoPanelProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [error, setError] = useState('');
  const [timePulse, setTimePulse] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editReminderTime, setEditReminderTime] = useState('');
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

    onAdd({ title: trimmed, reminderTime: reminderTime || null });
    setTitle('');
    setReminderTime('');
    setError('');
    setAdding(false);
  }

  function startEdit(todo: Todo) {
    setAdding(false);
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditReminderTime(todo.reminderTime ?? '');
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

    onUpdate(editingId, { title: trimmed, reminderTime: editReminderTime || null });
    setEditingId(null);
    setEditTitle('');
    setEditReminderTime('');
    setEditError('');
  }

  function updateReminderTime(value: string) {
    setReminderTime(value);
    if (value) setTimePulse(true);
  }

  function updateEditReminderTime(value: string) {
    setEditReminderTime(value);
    if (value) setEditTimePulse(true);
  }

  const unfinishedCount = todos.filter((todo) => !todo.completed).length;

  return (
    <section className="flex h-[520px] w-[380px] flex-col overflow-hidden rounded-lg border border-assistant-line bg-white text-[13px] text-assistant-ink shadow-utility">
      <header className="drag-region flex flex-none items-center justify-between border-b border-assistant-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] text-assistant-muted">今日待办</p>
          <h1 className="truncate text-[15px] font-semibold">{dateLabel}</h1>
          <p className="mt-0.5 text-[11px] text-assistant-muted">
            {unfinishedCount > 0 ? `${unfinishedCount} 项未完成` : '今日事项已清空'}
          </p>
        </div>
        <div className="no-drag flex items-center gap-1">
          <button
            aria-label="添加待办"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-assistant-line text-assistant-muted transition hover:border-assistant-accent hover:text-assistant-accent"
            type="button"
            onClick={() => setAdding((value) => !value)}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label="关闭今日待办"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-assistant-line text-assistant-muted transition hover:border-assistant-warning hover:text-assistant-warning"
            type="button"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {adding ? (
        <form
          className="todo-form-enter flex-none space-y-2 border-b border-assistant-line bg-assistant-wash/60 px-4 py-3"
          data-testid="todo-add-form"
          onSubmit={submit}
        >
          <label className="block text-[11px] text-assistant-muted">
            任务名称
            <input
              aria-label="任务名称"
              className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink transition focus:border-assistant-accent"
              maxLength={40}
              placeholder="写下今天要完成的事"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError('');
              }}
            />
          </label>
          <label className="block text-[11px] text-assistant-muted">
            提醒时间
            <span
              className={`todo-time-field mt-1 grid grid-cols-[18px_1fr] items-center gap-2 rounded-md border bg-white px-2 text-assistant-ink transition ${
                reminderTime ? 'border-assistant-accent shadow-[0_0_0_3px_rgba(108,99,255,0.10)]' : 'border-assistant-line'
              } ${timePulse ? 'todo-time-pop' : ''}`}
              data-testid="todo-reminder-time-field"
            >
              <Clock className="text-assistant-muted" size={14} />
              <input
                aria-label="提醒时间"
                className="h-8 w-full border-0 bg-transparent px-0 text-[13px] outline-none"
                type="time"
                value={reminderTime}
                onChange={(event) => updateReminderTime(event.target.value)}
              />
            </span>
          </label>
          {error ? <p className="text-[11px] text-assistant-warning">{error}</p> : null}
          <div className="flex justify-end gap-1">
            <button
              aria-label="取消添加"
              className="flex h-7 w-7 items-center justify-center rounded-md text-assistant-muted transition hover:bg-white"
              type="button"
              onClick={() => setAdding(false)}
            >
              <X size={14} />
            </button>
            <button
              aria-label="确认添加"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-assistant-accent text-white transition hover:brightness-95"
              type="submit"
            >
              <Check size={14} />
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex-1 divide-y divide-assistant-line overflow-y-auto">
        {todos.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-assistant-muted">今天还没有待办</div>
        ) : (
          todos.map((todo) => (
            <article key={todo.id} className="todo-row-enter px-4 py-3 transition hover:bg-assistant-wash/70">
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
                  <p className="text-[11px] text-assistant-muted">{todo.completed ? '已完成' : '待完成'}</p>
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
                      className="mt-1 w-full rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] text-assistant-ink transition focus:border-assistant-accent"
                      maxLength={40}
                      value={editTitle}
                      onChange={(event) => {
                        setEditTitle(event.target.value);
                        setEditError('');
                      }}
                    />
                  </label>
                  <label className="block text-[11px] text-assistant-muted">
                    修改提醒时间
                    <span
                      className={`todo-time-field mt-1 grid grid-cols-[18px_1fr] items-center gap-2 rounded-md border bg-white px-2 text-assistant-ink transition ${
                        editReminderTime ? 'border-assistant-accent shadow-[0_0_0_3px_rgba(108,99,255,0.10)]' : 'border-assistant-line'
                      } ${editTimePulse ? 'todo-time-pop' : ''}`}
                    >
                      <Clock className="text-assistant-muted" size={14} />
                      <input
                        aria-label="修改提醒时间"
                        className="h-8 w-full border-0 bg-transparent px-0 text-[13px] outline-none"
                        type="time"
                        value={editReminderTime}
                        onChange={(event) => updateEditReminderTime(event.target.value)}
                      />
                    </span>
                  </label>
                  {editError ? <p className="text-[11px] text-assistant-warning">{editError}</p> : null}
                  <div className="flex justify-end gap-1">
                    <button
                      aria-label="取消待办修改"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-assistant-muted transition hover:bg-assistant-wash"
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      <X size={14} />
                    </button>
                    <button
                      aria-label="保存待办修改"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-assistant-accent text-white transition hover:brightness-95"
                      type="submit"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
