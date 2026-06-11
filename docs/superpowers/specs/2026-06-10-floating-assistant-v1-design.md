# Floating Assistant v1.0 MVP Design

## Scope

Build a lightweight desktop floating assistant matching the v1.0 scope in `floating-assistant-design.md`.

Included:

- Floating ball that stays above normal windows.
- Drag to move the ball and persist the latest position.
- Ball opacity and size defaults from settings.
- Left click opens or closes today's todo panel.
- Right click opens an app context menu with health reminders and quit.
- Double click opens quick todo entry.
- Today's todos can be added, completed, deleted, and optionally assigned a reminder time.
- Todo reminders trigger a desktop notification at the configured time.
- Health reminders include three default loops: stand up, drink water, eye rest.
- Health reminders run independently and can be paused or resumed.
- App can enable operating system login startup.
- All user data is stored locally as JSON.

Deferred:

- Full settings center.
- Custom health reminder creation and deletion.
- Do-not-disturb mode.
- Next-day todo carry-over prompt.
- Todo priorities, export, custom sounds, and global shortcuts.

## Architecture

Use Electron for desktop integration and React with TypeScript for renderer UIs. Vite builds the renderer bundle and the Electron main/preload processes. Tailwind provides compact styling for the small floating surfaces.

The Electron main process owns stateful desktop behavior:

- Window lifecycle.
- Native menu and tray.
- Notifications.
- Scheduler timers.
- Local JSON persistence.
- Login item setting.

Renderer windows are intentionally thin. They render UI, dispatch typed IPC commands, and subscribe to state snapshots from the main process.

## Windows

### Floating Ball Window

- Transparent, frameless, always-on-top `BrowserWindow`.
- Default visible size is 40 px, adjusted by settings.
- Uses CSS hover transitions for opacity and scale.
- Shows an unfinished todo badge.
- Supports drag through renderer pointer events that call a main-process move API.

### Todo Panel Window

- Frameless, transparent, always-on-top panel.
- Width is 280 px and max height is 500 px.
- Appears next to the floating ball.
- Lists today's todos and includes an inline add form.
- The panel closes when the ball is clicked again.

### Health Reminder Window

- Normal frameless utility window.
- Shows the three preset health reminders with countdown progress.
- Each reminder can pause or resume.

Notifications use Electron's `Notification` API. For v1.0, actionable button behavior is handled in app UI where possible; OS-level notification action support differs across platforms, so todo reminder completion can also be done from the todo panel.

## Data Model

Todos are stored by local date:

```ts
type Todo = {
  id: string;
  title: string;
  reminderTime: string | null;
  completed: boolean;
  remindedAt?: string | null;
  createdAt: string;
};

type TodoStore = Record<string, Todo[]>;
```

Health reminders are stored as an array:

```ts
type HealthReminder = {
  id: string;
  name: string;
  icon: string;
  intervalMinutes: number;
  soundEnabled: boolean;
  enabled: boolean;
  lastTriggeredAt: string | null;
  nextTriggerAt: string | null;
};
```

Settings are stored as:

```ts
type AppSettings = {
  general: {
    autoLaunch: boolean;
    ballOpacity: number;
    ballSize: 'small' | 'medium' | 'large';
    rememberPosition: boolean;
    soundEnabled: boolean;
  };
  todo: {
    advanceReminderMinutes: number;
  };
  ballPosition: {
    x: number;
    y: number;
  };
};
```

Files live in `app.getPath('userData')`:

- `todos.json`
- `reminders.json`
- `settings.json`

## IPC Contract

Renderer processes call typed preload APIs exposed on `window.assistant`.

Commands:

- `getSnapshot()`
- `addTodo(input)`
- `toggleTodo(id)`
- `deleteTodo(id)`
- `snoozeTodo(id, minutes)`
- `toggleTodoPanel()`
- `openHealthWindow()`
- `moveBall(delta)`
- `setBallPosition(position)`
- `toggleHealthReminder(id)`
- `quitApp()`

Events:

- `state-changed`
- `health-tick`
- `todo-reminder-fired`

## Scheduling

The scheduler runs in the main process with one lightweight interval tick per second. It computes due reminders from persisted state instead of relying on many long-running timers.

Todo reminders:

- A todo is due when today's date matches and the current time is at or after `reminderTime`.
- Completed todos do not notify.
- A todo only notifies once per reminder timestamp unless snoozed.

Health reminders:

- Each enabled reminder tracks `nextTriggerAt`.
- On startup, missing `nextTriggerAt` values are initialized to now plus `intervalMinutes`.
- When due, the app shows a notification, updates `lastTriggeredAt`, and sets the next trigger to now plus the interval.

## UI Direction

The UI should be quiet and compact, closer to a utility than a marketing app.

- Use a restrained white and light gray surface palette.
- Use `#6C63FF` as the main accent.
- Use green for completion and orange for warning states.
- Keep rounded corners small.
- Use icon buttons where possible.
- Avoid large hero surfaces and decorative backgrounds.

## Error Handling

JSON reads recover gracefully:

- Missing files are created with defaults.
- Invalid JSON is backed up with a `.corrupt-<timestamp>` suffix and replaced with defaults.
- Write operations are atomic where practical: write temp file, then rename.

Renderer commands return typed success or error results. UI forms show inline validation for empty titles and invalid reminder intervals.

## Testing

Test pure behavior first:

- Store default creation and corrupt JSON recovery.
- Todo add, complete, delete, and snooze behavior.
- Health reminder initialization and due-time reset behavior.
- Scheduler due detection for todo and health reminders.

Renderer tests cover:

- Todo form validation.
- Todo completion and deletion callbacks.
- Health reminder pause/resume callback.

Manual verification covers:

- Floating window appears.
- Ball opens and closes todo panel.
- Drag persists position.
- Health window opens from menu.
- Notifications fire in dev mode.

## Acceptance Criteria

- `npm install` installs dependencies.
- `npm run test` passes.
- `npm run typecheck` passes.
- `npm run dev` launches the Electron app.
- App starts with a floating ball.
- User can add, complete, and delete a todo.
- Todo reminder notification fires at the configured time.
- Health reminders count down independently and notify when due.
- Data survives app restart.
