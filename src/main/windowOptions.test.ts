import { describe, expect, it } from 'vitest';
import { APP_DISPLAY_NAME } from './appMetadata';
import { createHealthWindowOptions, createTodoWindowOptions } from './windowOptions';

describe('window options', () => {
  it('keeps the transparent health window out of the taskbar', () => {
    const options = createHealthWindowOptions('app-icon', 'preload.cjs');

    expect(options.transparent).toBe(true);
    expect(options.skipTaskbar).toBe(true);
    expect(options.title).toBe(`${APP_DISPLAY_NAME} - 提醒管理`);
  });

  it('keeps only the main todo window visible in the taskbar', () => {
    const options = createTodoWindowOptions({
      debugWindow: false,
      icon: 'app-icon',
      panelSize: { width: 340, height: 590 },
      position: { x: 10, y: 20 },
      preloadPath: 'preload.cjs'
    });

    expect(options.skipTaskbar).toBe(false);
    expect(options.title).toBe(APP_DISPLAY_NAME);
  });

  it('renders the todo panel without the system title bar', () => {
    const options = createTodoWindowOptions({
      debugWindow: false,
      icon: 'app-icon',
      panelSize: { width: 400, height: 590 },
      position: { x: 10, y: 20 },
      preloadPath: 'preload.cjs'
    });

    expect(options.frame).toBe(false);
    expect(options.transparent).toBe(true);
    expect(options.backgroundColor).toBe('#00000000');
  });
});
