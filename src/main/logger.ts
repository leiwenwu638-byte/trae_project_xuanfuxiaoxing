import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const logDir = path.join(process.cwd(), 'logs');
const logFile = path.join(logDir, 'assistant.log');

export function log(message: string, data?: unknown): void {
  mkdirSync(logDir, { recursive: true });
  const payload = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}${payload}\n`, 'utf-8');
}
