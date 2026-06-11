import { useEffect, useMemo, useState } from 'react';
import { createDefaultHealthReminders, createDefaultSettings } from '../shared/defaults';
import { HealthWindow } from './components/HealthWindow';
import { ReminderPopup } from './components/ReminderPopup';
import { TodoPanel } from './components/TodoPanel';
import type { AddHealthReminderInput, AddTodoInput, AppSnapshot, UpdateHealthReminderInput, UpdateTodoInput } from '../shared/types';

const fallbackSnapshot: AppSnapshot = {
  today: new Date().toISOString().slice(0, 10),
  todos: [],
  reminders: createDefaultHealthReminders(),
  settings: createDefaultSettings()
};

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(fallbackSnapshot);
  const [now, setNow] = useState(new Date());
  const view = new URLSearchParams(window.location.search).get('view') ?? 'todo';

  useEffect(() => {
    if (!window.assistant) return;
    void window.assistant.getSnapshot().then(setSnapshot);
    return window.assistant.onStateChanged(setSnapshot);
  }, []);

  useEffect(() => {
    if (view !== 'health') return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  const dateLabel = useMemo(() => {
    const date = snapshot?.today ? new Date(`${snapshot.today}T00:00:00`) : new Date();
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(date);
  }, [snapshot?.today]);

  if (view === 'todo' || view === 'ball') {
    return (
      <TodoPanel
        dateLabel={dateLabel}
        todos={snapshot.todos}
        onAdd={(input: AddTodoInput) => void window.assistant.addTodo(input).then(setSnapshot)}
        onClose={() => window.close()}
        onToggle={(id) => void window.assistant.toggleTodo(id).then(setSnapshot)}
        onDelete={(id) => void window.assistant.deleteTodo(id).then(setSnapshot)}
        onUpdate={(id: string, input: UpdateTodoInput) => void window.assistant.updateTodo(id, input).then(setSnapshot)}
      />
    );
  }

  if (view === 'health') {
    return (
      <div className="p-3">
        <HealthWindow
          reminders={snapshot.reminders}
          now={now}
          onToggle={(id) => void window.assistant.toggleHealthReminder(id).then(setSnapshot)}
          onAdd={(input: AddHealthReminderInput) => void window.assistant.addHealthReminder(input).then(setSnapshot)}
          onUpdate={(id, input: UpdateHealthReminderInput) => void window.assistant.updateHealthReminder(id, input).then(setSnapshot)}
          onDelete={(id) => void window.assistant.deleteHealthReminder(id).then(setSnapshot)}
          onClose={() => window.close()}
        />
      </div>
    );
  }

  if (view === 'popup') {
    const params = new URLSearchParams(window.location.search);
    return (
      <ReminderPopup
        body={params.get('body') ?? '提醒时间到了。'}
        icon={params.get('icon') ?? '⏰'}
        title={params.get('title') ?? '悬浮小醒提醒'}
      />
    );
  }

  if (view === 'debug') {
    return (
      <main className="flex h-screen flex-col gap-4 bg-white p-5 text-assistant-ink">
        <div>
          <h1 className="text-[15px] font-semibold">悬浮小醒调试窗口</h1>
          <p className="mt-1 text-[12px] text-assistant-muted">如果能看到这个窗口，说明 Electron 窗口和页面加载都正常。</p>
        </div>
        <p className="text-[12px] text-assistant-muted">日志位置：D:\desktop-health-assistant\logs\assistant.log</p>
      </main>
    );
  }

  return null;
}
