export type BallSize = 'small' | 'medium' | 'large';

export type Todo = {
  id: string;
  title: string;
  reminderTime: string | null;
  completed: boolean;
  remindedAt: string | null;
  createdAt: string;
};

export type TodoStore = Record<string, Todo[]>;

export type HealthReminder = {
  id: string;
  name: string;
  icon: string;
  intervalMinutes: number;
  soundEnabled: boolean;
  enabled: boolean;
  lastTriggeredAt: string | null;
  nextTriggerAt: string | null;
};

export type AddHealthReminderInput = {
  name: string;
  intervalMinutes: number;
  soundEnabled: boolean;
};

export type UpdateHealthReminderInput = AddHealthReminderInput;

export type AppSettings = {
  general: {
    autoLaunch: boolean;
    ballOpacity: number;
    ballSize: BallSize;
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

export type AppSnapshot = {
  today: string;
  todos: Todo[];
  reminders: HealthReminder[];
  settings: AppSettings;
};

export type AddTodoInput = {
  title: string;
  reminderTime: string | null;
};

export type AssistantApi = {
  getSnapshot: () => Promise<AppSnapshot>;
  addTodo: (input: AddTodoInput) => Promise<AppSnapshot>;
  toggleTodo: (id: string) => Promise<AppSnapshot>;
  deleteTodo: (id: string) => Promise<AppSnapshot>;
  snoozeTodo: (id: string, minutes: number) => Promise<AppSnapshot>;
  toggleTodoPanel: () => Promise<void>;
  openHealthWindow: () => Promise<void>;
  addHealthReminder: (input: AddHealthReminderInput) => Promise<AppSnapshot>;
  updateHealthReminder: (id: string, input: UpdateHealthReminderInput) => Promise<AppSnapshot>;
  deleteHealthReminder: (id: string) => Promise<AppSnapshot>;
  toggleHealthReminder: (id: string) => Promise<AppSnapshot>;
  quitApp: () => Promise<void>;
  onStateChanged: (listener: (snapshot: AppSnapshot) => void) => () => void;
};
