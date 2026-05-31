import { EventEmitter } from 'node:events';
import type { KbWatcher } from './KbWatcher.js';

export class FakeWatcher extends EventEmitter implements KbWatcher {
  private readonly ignoreMap = new Map<string, number>();

  async start(_vaultDir: string): Promise<void> {}
  async stop(): Promise<void> {}

  ignoreFor(filePath: string, ms: number): void {
    this.ignoreMap.set(filePath, Date.now() + ms);
  }

  /** Test helper — emits 'change' unless filePath is currently ignored. */
  emitChange(filePath: string): void {
    if (!this.isIgnored(filePath)) this.emit('change', filePath);
  }

  /** Test helper — emits 'delete' unless filePath is currently ignored. */
  emitDelete(filePath: string): void {
    if (!this.isIgnored(filePath)) this.emit('delete', filePath);
  }

  private isIgnored(filePath: string): boolean {
    const expiry = this.ignoreMap.get(filePath);
    if (expiry === undefined) return false;
    if (Date.now() < expiry) return true;
    this.ignoreMap.delete(filePath);
    return false;
  }
}
