export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
}
