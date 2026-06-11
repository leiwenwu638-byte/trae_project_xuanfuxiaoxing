import { describe, expect, it } from 'vitest';
import { createLoginItemSettings } from './loginItemSettings';

describe('createLoginItemSettings', () => {
  it('keeps packaged login item settings simple', () => {
    expect(createLoginItemSettings(true, ['C:\\App\\HealthAssistant.exe'], 'C:\\App\\HealthAssistant.exe', true)).toEqual({
      openAtLogin: true
    });
  });

  it('passes the app entry when running from Electron in development', () => {
    expect(
      createLoginItemSettings(
        true,
        ['D:\\desktop-health-assistant\\node_modules\\electron\\dist\\electron.exe', 'dist/main/index.cjs'],
        'D:\\desktop-health-assistant\\node_modules\\electron\\dist\\electron.exe',
        false,
        'D:\\desktop-health-assistant'
      )
    ).toEqual({
      openAtLogin: true,
      path: 'D:\\desktop-health-assistant\\node_modules\\electron\\dist\\electron.exe',
      args: ['D:\\desktop-health-assistant\\dist\\main\\index.cjs']
    });
  });

  it('does not persist debug-window startup into auto launch', () => {
    expect(
      createLoginItemSettings(
        true,
        ['electron.exe', 'dist/main/index.cjs', '--debug-window'],
        'electron.exe',
        false,
        'D:\\desktop-health-assistant'
      )
    ).toEqual({
      openAtLogin: true,
      path: 'electron.exe',
      args: ['D:\\desktop-health-assistant\\dist\\main\\index.cjs']
    });
  });
});
