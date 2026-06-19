import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AddTodoInput, AppSnapshot, Todo, UpdateTodoInput } from '../shared/types';
import { TODO_PRIORITY_DEFAULT } from '../shared/types';
import { HealthWindow } from './components/HealthWindow';
import { ReminderPopup } from './components/ReminderPopup';
import { TodoPanel } from './components/TodoPanel';
import { desktopApi } from './platform/desktopApi';
import { LoadingScreen, SnapshotErrorScreen } from './components/LoadingScreen';

/** snapshot 加载状态机。区分"还没拿到"和"拿到但失败"两种语义：
 *   - `loading`：首次拉取中，显示 loading UI，**不**渲染业务组件（避免空状态被
 *     误识别为"今天没待办"）；
 *   - `ready`：拉到 snapshot，正常渲染；
 *   - `error`：invoke 失败，渲染重试 UI，而不是默默用 fallback（fallback 会让用户
 *     误以为今天没待办）。
 */
type SnapshotState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: AppSnapshot }
  | { kind: 'error'; message: string };

/** 把 URL 中的 popup payload 转成 `ReminderPopupProps`，并把 `__REMINDER_POPUP_PAYLOAD__`
 * 作为兜底（与 Rust 端 `initialization_script` 注入的字段对齐）。URL 优先——React
 * 首屏渲染时即可拿到，避免依赖 init script 时机。
 */
function readPopupPayloadFromUrl(): {
  body: string;
  icon: string;
  soundSrc: string | null;
  title: string;
} {
  const params = new URLSearchParams(window.location.search);
  const initPayload = window.__REMINDER_POPUP_PAYLOAD__;
  return {
    body: params.get('body') ?? initPayload?.body ?? '该处理当前事项了',
    icon: params.get('icon') ?? initPayload?.icon ?? '⏰',
    soundSrc: params.get('sound') ?? initPayload?.soundSrc ?? null,
    title: params.get('title') ?? initPayload?.title ?? '提醒'
  };
}

export function App() {
  const [state, setState] = useState<SnapshotState>({ kind: 'loading' });
  const [now, setNow] = useState(new Date());
  const view = new URLSearchParams(window.location.search).get('view') ?? 'todo';

  const loadSnapshot = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const snapshot = await desktopApi.getSnapshot();
      setState({ kind: 'ready', snapshot });
    } catch (error) {
      console.error('[App] getSnapshot failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    return desktopApi.onStateChanged((snapshot) => {
      // 调度器 emit 状态变化时，直接替换（不会出现"error 态被覆盖"的情况，
      // 因为这里只在已 ready 之后才被调用——emit 由 Rust 端在 tick 成功后发出）。
      setState({ kind: 'ready', snapshot });
    });
  }, [loadSnapshot]);

  // IPC 调用的统一 snapshot setter：成功路径走这里，错误由 `loadSnapshot` 单独处理。
  // 必须放在 useEffect 之后、`return <TodoPanel/>` 之前，因为 JSX 内的回调
  // 闭包需要捕获到函数引用。
  function setSnapshotSafe(next: AppSnapshot) {
    setState({ kind: 'ready', snapshot: next });
  }

  useEffect(() => {
    if (view !== 'health') return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  // 弹窗：mount 后立刻调用 showCurrentWindow，把之前 `visible:false` 的窗口
  // 显示出来。React 第一次 render 时 payload 已经从 URL 拿到，无白窗。
  useEffect(() => {
    if (view !== 'popup') return;
    void desktopApi.window.showCurrentWindow();
  }, [view]);

  const dateLabel = useMemo(() => {
    const today = state.kind === 'ready' ? state.snapshot.today : new Date().toISOString().slice(0, 10);
    const date = new Date(`${today}T00:00:00`);
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    }).format(date);
  }, [state]);

  // 防御性兜底：Rust 端 `Todo::priority` 已经用 `#[serde(default)]` 处理老数据，
  // 但万一 IPC 拿到手的数据被手工改坏（缺字段或非法值），这里再保一道，
  // 避免渲染 `TodoPanel` 时访问 `todo.priority` 出现 undefined。
  const todos = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.snapshot.todos.map((todo) => migrateTodoPriority(todo));
  }, [state]);

  // 弹窗路径不走 snapshot——payload 直接来自 URL / init script。
  if (view === 'popup') {
    const payload = readPopupPayloadFromUrl();
    return (
      <ReminderPopup
        body={payload.body}
        icon={payload.icon}
        soundSrc={payload.soundSrc}
        title={payload.title}
        onClose={() => void desktopApi.window.closeCurrentWindow()}
      />
    );
  }

  // 弹窗之外的窗口都需要 snapshot：先按状态分派 UI。
  if (state.kind === 'loading') {
    return <LoadingScreen label="正在加载今日计划..." />;
  }
  if (state.kind === 'error') {
    return <SnapshotErrorScreen message={state.message} onRetry={() => void loadSnapshot()} />;
  }

  const snapshot = state.snapshot;

  if (view === 'health') {
    return (
      <HealthWindow
        reminders={snapshot.reminders}
        now={now}
        onToggle={(id) =>
          void desktopApi.reminder.toggleReminder(id).then(setSnapshotSafe).catch(console.error)
        }
        onAdd={(input) =>
          void desktopApi.reminder.addReminder(input).then(setSnapshotSafe).catch(console.error)
        }
        onUpdate={(id, input) =>
          void desktopApi.reminder.updateReminder(id, input).then(setSnapshotSafe).catch(console.error)
        }
        onDelete={(id) =>
          void desktopApi.reminder.deleteReminder(id).then(setSnapshotSafe).catch(console.error)
        }
      />
    );
  }

  // 默认（也包括历史上的 'ball' / 其它非法 view）：渲染 TodoPanel。
  return (
    <TodoPanel
      dateLabel={dateLabel}
      todos={todos}
      onAdd={(input: AddTodoInput) =>
        void desktopApi.todo.addTodo(input).then(setSnapshotSafe).catch(console.error)
      }
      onToggle={(id) =>
        void desktopApi.todo.toggleTodo(id).then(setSnapshotSafe).catch(console.error)
      }
      onDelete={(id) =>
        void desktopApi.todo.deleteTodo(id).then(setSnapshotSafe).catch(console.error)
      }
      onUpdate={(id: string, input: UpdateTodoInput) =>
        void desktopApi.todo.updateTodo(id, input).then(setSnapshotSafe).catch(console.error)
      }
    />
  );
}

/** 老 `todos.json` 数据兜底：缺 priority / priority 不在 4 个合法值内时落到 `medium`。
 *  Rust 端 `Todo::priority` 已有 `#[serde(default)]` 兜底，这里是前端再保一道
 *  （防止 IPC 数据被手工改坏或未来增加非法字段）。 */
function migrateTodoPriority(todo: Todo): Todo {
  const valid: ReadonlyArray<Todo['priority']> = ['critical', 'high', 'medium', 'low'];
  if (valid.includes(todo.priority)) return todo;
  return { ...todo, priority: TODO_PRIORITY_DEFAULT };
}
