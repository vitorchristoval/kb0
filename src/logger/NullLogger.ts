import type { Logger } from './Logger.js';

export class NullLogger implements Logger {
  log(): void {}
}
