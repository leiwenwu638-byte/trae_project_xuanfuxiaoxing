import { Menu, Tray } from 'electron';
import type { Tray as TrayType } from 'electron';
import { createAppIcon } from './appIcon';
import { APP_DISPLAY_NAME } from './appMetadata';

export function createTray(actions: { toggleTodoWindow: () => void; openHealthWindow: () => void; quitApp: () => void }): TrayType {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.on('click', actions.toggleTodoWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '今日待办', click: actions.toggleTodoWindow },
      { label: '提醒管理', click: actions.openHealthWindow },
      { type: 'separator' },
      { label: '退出', click: actions.quitApp }
    ])
  );
  return tray;
}

function createTrayIcon() {
  return createAppIcon();
}
