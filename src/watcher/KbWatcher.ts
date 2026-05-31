export interface KbWatcher {
  start(vaultDir: string): Promise<void>;
  stop(): Promise<void>;
  on(event: 'change' | 'delete', handler: (filePath: string) => void): void;
  /**
   * Suppress events for filePath for the given duration.
   * Used by KbStore to prevent indexing its own writes.
   * Cooldown via timestamp avoids race conditions with FSEvent latency.
   */
  ignoreFor(filePath: string, ms: number): void;
}
