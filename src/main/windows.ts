import { BrowserWindow, screen } from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { HealthReminder } from '../shared/types';
import { createAppIcon, createTaskbarBadgeIcon } from './appIcon';
import { log } from './logger';
import { getPanelPositionNearAnchor, getTopCenterPosition } from './windowBounds';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type WindowManagerActions = {
  openHealthWindow: () => void;
  quitApp: () => void;
};

export class WindowManager {
  private todoWindow: BrowserWindowType | null = null;
  private healthWindow: BrowserWindowType | null = null;
  private popupWindow: BrowserWindowType | null = null;

  constructor(
    private readonly actions: WindowManagerActions,
    private readonly debugWindow = false
  ) {}

  openTodoWindow(): void {
    if (this.todoWindow && !this.todoWindow.isDestroyed()) {
      this.todoWindow.show();
      this.todoWindow.focus();
      return;
    }

    const panelSize = this.debugWindow ? { width: 380, height: 620 } : { width: 340, height: 590 };
    const display = screen.getPrimaryDisplay();
    const position = getPanelPositionNearAnchor(null, display.workArea, panelSize);
    log('createTodoWindow', { debugWindow: this.debugWindow, position, panelSize, workArea: display.workArea });

    this.todoWindow = new BrowserWindow({
      width: panelSize.width,
      height: panelSize.height,
      x: position.x,
      y: position.y,
      icon: createAppIcon(),
      title: '桌面健康助手',
      frame: true,
      transparent: false,
      backgroundColor: '#ffffff',
      resizable: false,
      skipTaskbar: false,
      alwaysOnTop: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs')
      }
    });

    this.todoWindow.setMenu(null);
    this.todoWindow.loadURL(this.viewUrl(this.debugWindow ? 'debug' : 'todo'));
    this.todoWindow.once('ready-to-show', () => this.todoWindow?.show());
    this.todoWindow.on('closed', () => {
      this.todoWindow = null;
    });
    this.todoWindow.webContents.on('did-finish-load', () => {
      log('todoWindowDidFinishLoad', this.todoWindow?.getBounds());
    });
    this.todoWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      log('todoWindowDidFailLoad', { errorCode, errorDescription, validatedURL });
    });
    this.todoWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      log('rendererConsole', { level, message, line, sourceId });
    });
  }

  openHealthWindow(): void {
    if (this.healthWindow && !this.healthWindow.isDestroyed()) {
      this.healthWindow.focus();
      return;
    }

    this.healthWindow = new BrowserWindow({
      width: 420,
      height: 560,
      icon: createAppIcon(),
      title: '提醒管理',
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs')
      }
    });
    this.healthWindow.loadURL(this.viewUrl('health'));
    this.healthWindow.once('ready-to-show', () => this.healthWindow?.show());
    this.healthWindow.on('closed', () => {
      this.healthWindow = null;
    });
  }

  showHealthPopup(reminder: HealthReminder): void {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.close();
    }

    const display = screen.getPrimaryDisplay();
    const width = 360;
    const height = 180;
    const position = getTopCenterPosition(display.workArea, { width, height });
    const url = this.viewUrl('popup', {
      icon: reminder.icon,
      title: reminder.name,
      body: `已过 ${reminder.intervalMinutes} 分钟，该活动一下了。`
    });

    this.popupWindow = new BrowserWindow({
      width,
      height,
      x: position.x,
      y: position.y,
      icon: createAppIcon(),
      title: '健康提醒',
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs')
      }
    });
    this.popupWindow.loadURL(url);
    this.popupWindow.once('ready-to-show', () => this.popupWindow?.showInactive());
    this.popupWindow.on('closed', () => {
      this.popupWindow = null;
    });
    setTimeout(() => {
      if (this.popupWindow && !this.popupWindow.isDestroyed()) {
        this.popupWindow.close();
      }
    }, 30_000);
  }

  setTodoBadgeCount(count: number): void {
    if (!this.todoWindow || this.todoWindow.isDestroyed()) return;
    this.todoWindow.setOverlayIcon(count > 0 ? createTaskbarBadgeIcon(count) : null, count > 0 ? `${count} 个未完成待办` : '');
  }

  broadcast(channel: string, value: unknown): void {
    for (const window of [this.todoWindow, this.healthWindow]) {
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, value);
      }
    }
  }

  private viewUrl(view: string, params: Record<string, string> = {}): string {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer) {
      const url = new URL(devServer);
      url.searchParams.set('view', view);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    }

    const url = pathToFileURL(path.join(__dirname, '../renderer/index.html'));
    url.searchParams.set('view', view);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}
