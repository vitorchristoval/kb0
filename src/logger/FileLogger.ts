import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Logger, LogLevel } from './Logger.js';

export class FileLogger implements Logger {
  constructor(private readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...fields,
    });
    try {
      appendFileSync(this.filePath, entry + '\n', 'utf-8');
    } catch {
      // log write failure is non-fatal
    }
  }
}
