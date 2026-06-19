import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AddTodoInput,
  AppSettings,
  AppSnapshot,
  Todo,
  UpdateTodoInput
} from '../shared/types';
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
  // 操作错误提示：除了 console.error，UI 顶部也显示一行低干扰错误。
  // 后端 command（addTodo / updateTodo / deleteTodo / addReminder / updateReminder /
  // deleteReminder / toggleTodo / toggleReminder）失败时设置，下次 snapshot 广播
  // 或 5s 自动清除。
  const [operationError, setOperationError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const view = new URLSearchParams(window.location.search).get('view') ?? 'todo';

  const loadSnapshot = useCallback(async () => {
    setState({ kind: 'loading' });
    // 启动耗时诊断：分别记录"开始 → 拿到 snapshot"和"setState 完成"
    // 两个时间点，便于判断慢在 IPC 还是 React 重渲染。
    const t0 = performance.now();
    try {
      const snapshot = await desktopApi.getSnapshot();
      const t1 = performance.now();
      setState({ kind: 'ready', snapshot });
      const t2 = performance.now();
      // 50ms 以上才打噪音更小；启动期"卡顿阈值"留给用户
      const total = Math.round(t2 - t0);
      if (total >= 50) {
        // eslint-disable-next-line no-console
        console.info(
          `[App] getSnapshot total=${total}ms (ipc=${Math.round(t1 - t0)}ms, setState=${Math.round(t2 - t1)}ms, todos=${snapshot.todos.length}, reminders=${snapshot.reminders.length})`
        );
      }
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
    // snapshot 成功刷新 → 自动清掉之前残留的"操作失败"提示。
    setOperationError(null);
  }

  /**
   * 把 IPC 失败包装成"UI 错误条 + console.warn"。
   *   - 后端 `update_todo` / `toggle_todo` 对不存在 id 现在会返错（避免静默掩盖同步失败）；
   *     这些错误要给用户看。
   *   - 不引入 toast 库，5 秒后自动消失（或下次成功操作时立刻清掉）。
   */
  function reportOperationError(context: string, error: unknown) {
    console.warn(`[App] ${context} failed:`, error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : typeof error === 'string'
          ? error
          : '操作失败，请稍后重试';
    setOperationError(`${context}：${message}`);
  }

  // 5s 自动清除残留错误（不阻塞新错误覆盖）。
  useEffect(() => {
    if (!operationError) return;
    const timer = window.setTimeout(() => setOperationError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [operationError]);

  // ---------------------------------------------------------------------------
  // 全局提示音设置（今日计划 / 健康节律共用）
  // ---------------------------------------------------------------------------
  //
  // 流程：
  //   1. 前端用 `<input type="file">` 拿到 File；
  //   2. `File.arrayBuffer()` → `Uint8Array`；
  //   3. `desktopApi.settings.saveCustomSound(name, bytes)` → Rust 写到
  //      `<app_data_dir>/sounds/<safe_name>`，返回真实绝对路径；
  //   4. `desktopApi.settings.updateSettings({ general: { soundFilePath } })`
  //      把路径写进 settings.json；
  //   5. `setSnapshotSafe` 触发 React 重渲染，UI 立即显示"自定义"。
  //
  // "恢复默认" 只调 `updateSettings({ general: { soundFilePath: null } })`，
  // 不删磁盘文件（防止用户误操作"恢复默认"后音频文件丢失）。
  //
  // 注意：`setSnapshotSafe` 接受的是 `AppSnapshot`（含 today / todos / reminders），
  // `updateSettings` 只返回 `AppSettings`。所以"换音源"时必须**保留**
  // 现有 snapshot 的列表数据，只把 `settings` 字段替换。
  function applySettingsToSnapshot(nextSettings: AppSettings) {
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      return {
        kind: 'ready',
        snapshot: { ...prev.snapshot, settings: nextSettings }
      };
    });
  }

  const handleSelectSound = useCallback(
    async (file: File) => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const savedPath = await desktopApi.settings.saveCustomSound(file.name, bytes);
        const next = await desktopApi.settings.updateSettings({
          general: { soundFilePath: savedPath }
        });
        applySettingsToSnapshot(next);
      } catch (error) {
        reportOperationError('保存提示音失败', error);
      }
    },
    []
  );

  const handleResetSound = useCallback(async () => {
    try {
      const next = await desktopApi.settings.updateSettings({
        general: { soundFilePath: null }
      });
      applySettingsToSnapshot(next);
    } catch (error) {
      reportOperationError('恢复默认提示音失败', error);
    }
  }, []);

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
      <div className="flex h-full w-full flex-col overflow-hidden bg-white text-[13px] text-assistant-ink">
        {operationError ? <OperationErrorBar message={operationError} onDismiss={() => setOperationError(null)} /> : null}
        <div className="min-h-0 flex-1">
          <HealthWindow
            reminders={snapshot.reminders}
            now={now}
            soundFilePath={snapshot.settings.general.soundFilePath}
            onResetSound={() => void handleResetSound()}
            onSelectSound={(file) => void handleSelectSound(file)}
            onToggle={(id) =>
              void desktopApi.reminder
                .toggleReminder(id)
                .then(setSnapshotSafe)
                .catch((error) => reportOperationError('运行/暂停失败', error))
            }
            onAdd={(input) =>
              void desktopApi.reminder
                .addReminder(input)
                .then(setSnapshotSafe)
                .catch((error) => reportOperationError('添加提醒失败', error))
            }
            onUpdate={(id, input) =>
              void desktopApi.reminder
                .updateReminder(id, input)
                .then(setSnapshotSafe)
                .catch((error) => reportOperationError('保存提醒失败', error))
            }
            onDelete={(id) =>
              void desktopApi.reminder
                .deleteReminder(id)
                .then(setSnapshotSafe)
                .catch((error) => reportOperationError('删除提醒失败', error))
            }
          />
        </div>
      </div>
    );
  }

  // 默认（也包括历史上的 'ball' / 其它非法 view）：渲染 TodoPanel。
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-[13px] text-assistant-ink">
      {operationError ? <OperationErrorBar message={operationError} onDismiss={() => setOperationError(null)} /> : null}
      <div className="min-h-0 flex-1">
        <TodoPanel
          dateLabel={dateLabel}
          todos={todos}
          soundFilePath={snapshot.settings.general.soundFilePath}
          onResetSound={() => void handleResetSound()}
          onSelectSound={(file) => void handleSelectSound(file)}
          onAdd={(input: AddTodoInput) =>
            void desktopApi.todo
              .addTodo(input)
              .then(setSnapshotSafe)
              .catch((error) => reportOperationError('添加待办失败', error))
          }
          onToggle={(id) =>
            void desktopApi.todo
              .toggleTodo(id)
              .then(setSnapshotSafe)
              .catch((error) => reportOperationError('更新状态失败', error))
          }
          onDelete={(id) =>
            void desktopApi.todo
              .deleteTodo(id)
              .then(setSnapshotSafe)
              .catch((error) => reportOperationError('删除待办失败', error))
          }
          onUpdate={(id: string, input: UpdateTodoInput) =>
            void desktopApi.todo
              .updateTodo(id, input)
              .then(setSnapshotSafe)
              .catch((error) => reportOperationError('保存待办失败', error))
          }
        />
      </div>
    </div>
  );
}

/** 低干扰错误条：固定在窗口顶部，红边 + 错误图标 + 文本 + 关闭按钮。 */
function OperationErrorBar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-none items-center gap-2 border-b border-orange-200 bg-orange-50 px-3 py-1.5 text-[12px] text-orange-800"
    >
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-assistant-warning text-white">
        <AlertTriangle size={12} />
      </span>
      <span className="flex-1 truncate">{message}</span>
      <button
        type="button"
        aria-label="关闭错误提示"
        className="flex h-5 w-5 flex-none items-center justify-center rounded text-orange-700 transition hover:bg-orange-100 focus:outline-none focus:ring-0"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
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
