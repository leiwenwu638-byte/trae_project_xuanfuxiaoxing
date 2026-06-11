import { Check, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { AddTodoInput, Todo } from '../../shared/types';

type TodoPanelProps = {
  dateLabel: string;
  todos: Todo[];
  onAdd: (input: AddTodoInput) => void;
  onClose: () => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TodoPanel({ dateLabel, todos, onAdd, onClose, onToggle, onDelete }: TodoPanelProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [error, setError] = useState('');

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

  return (
    <section className="flex h-[520px] w-[320px] flex-col overflow-hidden rounded-lg border border-assistant-line bg-white text-[13px] text-assistant-ink shadow-utility">
      <header className="drag-region flex flex-none items-center justify-between border-b border-assistant-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] text-assistant-muted">今日待办</p>
          <h1 className="truncate text-[15px] font-semibold">{dateLabel}</h1>
        </div>
        <button
          aria-label="关闭今日待办"
          className="no-drag flex h-7 w-7 flex-none items-center justify-center rounded-md border border-assistant-line text-assistant-muted hover:border-assistant-warning hover:text-assistant-warning"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {todos.length === 0 ? (
          <div className="px-2 py-8 text-center text-[12px] text-assistant-muted">今天还没有待办</div>
        ) : (
          todos.map((todo) => (
            <div key={todo.id} className="group grid grid-cols-[28px_1fr_48px_28px] items-center gap-1 rounded-md px-2 py-2 hover:bg-assistant-wash">
              <button
                aria-label={`标记完成：${todo.title}`}
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  todo.completed
                    ? 'border-assistant-success bg-assistant-success text-white'
                    : 'border-assistant-line text-transparent hover:border-assistant-accent'
                }`}
                type="button"
                onClick={() => onToggle(todo.id)}
              >
                <Check size={13} />
              </button>
              <span className={todo.completed ? 'truncate text-assistant-muted line-through' : 'truncate'}>
                {todo.title}
              </span>
              <span className="text-right text-[11px] text-assistant-muted">
                {todo.completed ? '已完成' : todo.reminderTime ?? ''}
              </span>
              <button
                aria-label={`删除：${todo.title}`}
                className="flex h-6 w-6 items-center justify-center rounded-md text-assistant-muted hover:bg-white hover:text-assistant-warning"
                type="button"
                onClick={() => onDelete(todo.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex-none border-t border-assistant-line p-2">
        {adding ? (
          <form className="space-y-2 rounded-md border border-dashed border-assistant-line p-2" onSubmit={submit}>
            <label className="block text-[11px] text-assistant-muted">
              任务名称
              <input
                aria-label="任务名称"
                className="mt-1 w-full rounded-md border border-assistant-line px-2 py-1.5 text-[13px]"
                maxLength={40}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError('');
                }}
              />
            </label>
            <label className="block text-[11px] text-assistant-muted">
              提醒时间
              <input
                aria-label="提醒时间"
                className="mt-1 w-full rounded-md border border-assistant-line px-2 py-1.5 text-[13px]"
                type="time"
                value={reminderTime}
                onChange={(event) => setReminderTime(event.target.value)}
              />
            </label>
            {error ? <p className="text-[11px] text-assistant-warning">{error}</p> : null}
            <div className="flex justify-end gap-1">
              <button
                aria-label="取消添加"
                className="flex h-7 w-7 items-center justify-center rounded-md text-assistant-muted hover:bg-assistant-wash"
                type="button"
                onClick={() => setAdding(false)}
              >
                <X size={14} />
              </button>
              <button
                aria-label="确认添加"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-assistant-accent text-white"
                type="submit"
              >
                <Check size={14} />
              </button>
            </div>
          </form>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-assistant-line py-2 text-[12px] text-assistant-muted hover:border-assistant-accent hover:text-assistant-accent"
            type="button"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} />
            添加待办
          </button>
        )}
      </div>
    </section>
  );
}
