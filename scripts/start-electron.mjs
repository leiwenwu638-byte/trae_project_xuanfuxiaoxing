import { spawn } from 'node:child_process';
import electronPath from 'electron';

const entry = process.argv[2] ?? 'dist/main/index.js';
const extraArgs = process.argv.slice(3);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [entry, ...extraArgs], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
