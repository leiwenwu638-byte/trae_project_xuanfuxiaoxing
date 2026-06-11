import type { Settings } from 'electron';
import path from 'node:path';

export function createLoginItemSettings(
  openAtLogin: boolean,
  argv: string[],
  execPath: string,
  isPackaged: boolean,
  cwd = process.cwd()
): Settings {
  if (isPackaged) {
    return { openAtLogin };
  }

  const args = argv
    .slice(1)
    .filter((arg) => arg !== '--debug-window')
    .map((arg, index) => (index === 0 && isLocalEntryArg(arg) ? path.resolve(cwd, arg) : arg));

  return {
    openAtLogin,
    path: execPath,
    args
  };
}

function isLocalEntryArg(arg: string): boolean {
  if (path.isAbsolute(arg)) return true;
  return arg.startsWith('.') || arg.startsWith('dist/') || arg.startsWith('dist\\');
}
