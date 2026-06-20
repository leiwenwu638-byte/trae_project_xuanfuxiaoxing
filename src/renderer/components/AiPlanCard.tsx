import { RefreshCw, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AiGeneratedTodo, AiPlanDraft, AppSnapshot, Todo } from '../../shared/types';
import { TODO_PRIORITY_DEFAULT } from '../../shared/types';
import { desktopApi } from '../platform/desktopApi';
import { ActionButton } from './common/ActionButton';
import { PriorityBadge } from './PrioritySelector';

type AiPlanCardProps = {
  todos: Todo[];
  onSnapshotChange: (snapshot: AppSnapshot) => void;
  onClose?: () => void;
};

type UiMessage = {
  tone: 'muted' | 'error' | 'success';
  text: string;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHHmm(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function normalizeError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (message.includes('API Key')) return '请先在 AI 设置中配置 API Key';
  if (message.includes('格式')) return '模型返回格式异常，请重试';
  return fallback;
}

function statusClass(tone: UiMessage['tone']): string {
  if (tone === 'success') return 'border-assistant-success/30 bg-green-50 text-assistant-success';
  if (tone === 'error') return 'border-assistant-warning/30 bg-orange-50 text-assistant-warning';
  return 'border-assistant-line bg-white text-assistant-muted';
}

export function AiPlanCard({ todos, onSnapshotChange, onClose }: AiPlanCardProps) {
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<AiPlanDraft | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<UiMessage | null>(null);

  const existingTodos = useMemo(
    () =>
      todos.map((todo) => ({
        title: todo.title,
        reminderTime: todo.reminderTime,
        priority: todo.priority ?? TODO_PRIORITY_DEFAULT,
        completed: todo.completed
      })),
    [todos]
  );

  const canGenerate = input.trim().length > 0 && !generating && !applying;
  const busy = generating || applying;

  async function generatePlan() {
    if (!input.trim()) return;
    setGenerating(true);
    setMessage(null);
    try {
      const nextDraft = await desktopApi.ai.generateDailyPlan({
        userInput: input.trim(),
        date: todayKey(),
        currentTime: currentHHmm(),
        existingTodos
      });
      setDraft(nextDraft);
      setSelected(new Set(nextDraft.todos.map((_, index) => index)));
      setMessage(null);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: normalizeError(error, 'AI 生成失败，请检查网络或模型配置')
      });
    } finally {
      setGenerating(false);
    }
  }

  function toggleTodo(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function applySelected() {
    if (!draft) return;
    const todosToApply: AiGeneratedTodo[] = draft.todos.filter((_, index) =>
      selected.has(index)
    );
    if (todosToApply.length === 0) {
      setMessage({ tone: 'error', text: '请选择至少一条任务。' });
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const snapshot = await desktopApi.ai.applyPlan({ todos: todosToApply });
      onSnapshotChange(snapshot);
      setInput('');
      setDraft(null);
      setSelected(new Set());
      setMessage({ tone: 'success', text: '已导入' });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : typeof error === 'string'
            ? error
            : '操作失败，请稍后重试';
      setMessage({ tone: 'error', text: `导入失败：${message}` });
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="bg-white px-4 py-3">
      <div className="rounded-md border border-assistant-line bg-assistant-wash/45 p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-assistant-ink">AI 生成今日计划</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-assistant-muted">
              描述你今天要完成的事情，我会帮你拆成待办计划。
            </p>
          </div>
          {onClose ? (
            <ActionButton
              ariaLabel="关闭 AI 计划"
              disabled={busy}
              icon={<X size={14} />}
              size="icon"
              variant="ghost"
              onClick={onClose}
            />
          ) : (
            <Sparkles className="mt-0.5 flex-none text-assistant-accent" size={14} />
          )}
        </div>

        <label className="block text-[11px] text-assistant-muted">
          今天要做的事
          <textarea
            aria-label="今天要做的事"
            className="mt-1 min-h-[58px] w-full resize-none rounded-md border border-assistant-line bg-white px-2 py-1.5 text-[13px] leading-relaxed text-assistant-ink transition placeholder:text-slate-400 focus:border-assistant-accent/60 focus:outline-none focus:ring-0"
            disabled={busy}
            placeholder="例如：上午复习 Java，下午完善项目 README，晚上运动 30 分钟"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (message?.tone === 'error') setMessage(null);
            }}
          />
        </label>

        {message ? (
          <p className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${statusClass(message.tone)}`}>
            {message.text}
          </p>
        ) : null}

        {draft ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-assistant-ink">AI 计划预览</h3>
              <span className="text-[11px] text-assistant-muted">{draft.summary}</span>
            </div>
            <ul className="space-y-1.5">
              {draft.todos.map((todo, index) => (
                <li
                  key={`${todo.title}-${index}`}
                  className="grid grid-cols-[18px_42px_1fr] gap-2 rounded-md border border-assistant-line bg-white px-2 py-2"
                >
                  <input
                    aria-label={`选择导入：${todo.title}`}
                    checked={selected.has(index)}
                    className="mt-0.5"
                    disabled={busy}
                    type="checkbox"
                    onChange={() => toggleTodo(index)}
                  />
                  <span className="mt-0.5 text-[11px] text-assistant-muted">
                    {todo.reminderTime ?? '无提醒'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="max-w-full truncate text-[12px] font-medium text-assistant-ink">
                        {todo.title}
                      </span>
                      <PriorityBadge priority={todo.priority} />
                    </div>
                    {todo.reason ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-assistant-muted">
                        {todo.reason}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {draft.warnings.length > 0 ? (
              <ul className="space-y-1">
                {draft.warnings.map((warning) => (
                  <li key={warning} className="text-[11px] text-assistant-warning">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex justify-end gap-2">
          {draft ? (
            <ActionButton
              disabled={busy}
              icon={<RefreshCw size={12} />}
              size="sm"
              variant="muted"
              onClick={generatePlan}
            >
              重新生成
            </ActionButton>
          ) : null}
          {draft ? (
            <ActionButton disabled={busy} size="sm" variant="primary" onClick={applySelected}>
              {applying ? '导入中...' : '导入选中'}
            </ActionButton>
          ) : (
            <ActionButton disabled={!canGenerate} size="sm" variant="primary" onClick={generatePlan}>
              {generating ? '生成中...' : '生成计划'}
            </ActionButton>
          )}
        </div>
      </div>
    </section>
  );
}
