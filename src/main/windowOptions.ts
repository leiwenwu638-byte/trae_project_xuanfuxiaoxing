import type { BrowserWindowConstructorOptions, NativeImage } from 'electron';
import { APP_DISPLAY_NAME } from './appMetadata';

type WindowIcon = NativeImage | string;
type Size = { width: number; height: number };
type Position = { x: number; y: number };

export function createTodoWindowOptions(input: {
  debugWindow: boolean;
  icon: WindowIcon;
  panelSize: Size;
  position: Position;
  preloadPath: string;
}): BrowserWindowConstructorOptions {
  return {
    width: input.panelSize.width,
    height: input.panelSize.height,
    x: input.position.x,
    y: input.position.y,
    icon: input.icon,
    title: input.debugWindow ? `${APP_DISPLAY_NAME} - 调试` : APP_DISPLAY_NAME,
    frame: input.debugWindow,
    transparent: !input.debugWindow,
    backgroundColor: input.debugWindow ? '#ffffff' : '#00000000',
    resizable: input.debugWindow,
    skipTaskbar: false,
    alwaysOnTop: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: input.preloadPath
    }
  };
}

export function createHealthWindowOptions(icon: WindowIcon, preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 420,
    height: 560,
    icon,
    title: `${APP_DISPLAY_NAME} - 提醒管理`,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: preloadPath
    }
  };
}

export function createHealthPopupWindowOptions(input: {
  icon: WindowIcon;
  position: Position;
  preloadPath: string;
  size: Size;
}): BrowserWindowConstructorOptions {
  return {
    width: input.size.width,
    height: input.size.height,
    x: input.position.x,
    y: input.position.y,
    icon: input.icon,
    title: `${APP_DISPLAY_NAME} - 提醒`,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: input.preloadPath
    }
  };
}
