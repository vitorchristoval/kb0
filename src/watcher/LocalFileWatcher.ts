import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { KbWatcher } from './KbWatcher.js';

const DEBOUNCE_MS = 300;

export class LocalFileWatcher extends EventEmitter implements KbWatcher {
  private watcher: FSWatcher | null = null;
  private vaultDir = '';
  private readonly ignoreMap = new Map<string, number>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  async start(vaultDir: string): Promise<void> {
    this.vaultDir = vaultDir;
    this.watcher = watch(path.join(vaultDir, '**', '*.md'), {
      ignoreInitial: true,
      ignored: /(^|\/)(\.vault-index|\.git)(\/|$)/,
      persistent: true,
    });

    this.watcher
      .on('change', (absPath) => this.handle('change', absPath))
      .on('add', (absPath) => this.handle('change', absPath))
      .on('unlink', (absPath) => this.handle('delete', absPath));
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  ignoreFor(filePath: string, ms: number): void {
    this.ignoreMap.set(filePath, Date.now() + ms);
  }

  private handle(event: 'change' | 'delete', absPath: string): void {
    const relPath = path.relative(this.vaultDir, absPath);
    const existing = this.debounceTimers.get(relPath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      relPath,
      setTimeout(() => {
        this.debounceTimers.delete(relPath);
        if (!this.isIgnored(relPath)) {
          this.emit(event, relPath);
        }
      }, DEBOUNCE_MS),
    );
  }

  private isIgnored(filePath: string): boolean {
    const expiry = this.ignoreMap.get(filePath);
    if (expiry === undefined) return false;
    if (Date.now() < expiry) return true;
    this.ignoreMap.delete(filePath);
    return false;
  }
}
