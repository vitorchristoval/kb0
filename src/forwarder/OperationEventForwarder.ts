import { createHash } from 'node:crypto';
import type { Logger } from '../logger/Logger.js';
import type { OperationEvent } from '../mcp/tool-base.js';

/** Genesis value for the rolling hash chain — 64 zeros. */
const GENESIS_HASH = '0'.repeat(64);

export interface ForwarderConfig {
  /** Ingest endpoint that receives batches of events. */
  endpoint: string;
  /** API key — sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string;
  /** Flush once this many events are queued. Default 50. */
  batchSize?: number;
  /** Flush a partial batch after this many ms of inactivity. Default 5000. */
  flushIntervalMs?: number;
  /** Hard cap on the in-memory queue; oldest events drop past it. Default 10000. */
  maxQueue?: number;
  /** Injected fetch (for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Optional logger for delivery diagnostics. */
  logger?: Logger;
}

/** An OperationEvent wrapped with a sequence number and rolling hash for tamper-evidence. */
export interface ForwardedEvent extends OperationEvent {
  /** Monotonic sequence number, starting at 1. */
  seq: number;
  /** Hash of the previous event (genesis is 64 zeros). */
  prevHash: string;
  /** sha256(prevHash + canonical(event)) — chains the log so gaps/edits are detectable. */
  hash: string;
}

/**
 * Buffers content-free OperationEvents and forwards them, in order, to an ingest
 * endpoint. Subscribe it to `ToolContext.onEvent` (the operation-event sink).
 *
 * Guarantees:
 * - **At-least-once**: a batch is removed from the queue only after the POST is
 *   confirmed; failures keep the batch and retry.
 * - **Ordered**: events keep enqueue order; a rolling sha256 chain (seq + prevHash)
 *   lets the receiver detect gaps or edits.
 * - **Non-blocking**: `enqueue` is synchronous and never throws — safe in the tool path.
 *
 * Content-free by construction: it only ships what OperationEvent carries (path,
 * query, result_paths, …) — never note bodies.
 *
 * Not yet covered (follow-ups): on-disk buffer to survive process restarts, and
 * an optional secondary forward to the client's own SIEM/webhook.
 */
export class OperationEventForwarder {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueue: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: Logger;

  private queue: ForwardedEvent[] = [];
  private seq = 0;
  private prevHash = GENESIS_HASH;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private closed = false;
  private dropped = 0;

  constructor(config: ForwarderConfig) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.batchSize = config.batchSize ?? 50;
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;
    this.maxQueue = config.maxQueue ?? 10000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.logger = config.logger;
  }

  /** Queue one event for delivery. Synchronous, never throws — safe in the tool path. */
  enqueue(event: OperationEvent): void {
    if (this.closed) return;
    try {
      this.queue.push(this.envelope(event));
      if (this.queue.length > this.maxQueue) {
        this.queue.shift();
        this.dropped += 1;
        if (this.dropped === 1 || this.dropped % 100 === 0) {
          this.logger?.log('warn', 'forwarder.dropped', {
            dropped: this.dropped,
            reason: 'queue full — ingest unreachable?',
          });
        }
      }
      if (this.queue.length >= this.batchSize) {
        void this.flush();
      } else {
        this.scheduleTimer();
      }
    } catch (e) {
      this.logger?.log('error', 'forwarder.enqueue_failed', { error: String(e) });
    }
  }

  /** Wrap an event with its sequence number and the rolling hash. */
  private envelope(event: OperationEvent): ForwardedEvent {
    const seq = ++this.seq;
    const prevHash = this.prevHash;
    const canonical = [
      seq,
      event.tool,
      event.agent,
      event.ts,
      event.ok,
      event.durationMs,
      event.mutates,
      event.errorCode ?? '',
      JSON.stringify(event.fields),
    ].join('|');
    const hash = createHash('sha256').update(prevHash + canonical).digest('hex');
    this.prevHash = hash;
    return { ...event, seq, prevHash, hash };
  }

  private scheduleTimer(): void {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
    this.timer.unref?.();
  }

  /** Send the next batch. Overlapping calls are coalesced; failures are retried. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    let delivered = false;
    try {
      const batch = this.queue.slice(0, this.batchSize);
      await this.post(batch);
      this.queue.splice(0, batch.length); // drop only after a confirmed delivery
      delivered = true;
    } catch (e) {
      this.logger?.log('warn', 'forwarder.flush_failed', {
        error: String(e),
        queued: this.queue.length,
      });
    } finally {
      this.flushing = false;
    }

    if (delivered && this.queue.length >= this.batchSize && !this.closed) {
      void this.flush(); // drain the rest of a burst promptly
    } else if (this.queue.length > 0 && !this.closed) {
      this.scheduleTimer(); // retry (failure) or send the tail (success) later
    }
  }

  private async post(events: ForwardedEvent[]): Promise<void> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      throw new Error(`ingest responded ${res.status}`);
    }
  }

  /** Stop the timer and best-effort drain whatever is queued. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Keep flushing while it makes progress; stop on a failed flush.
    let previous = -1;
    while (this.queue.length > 0 && this.queue.length !== previous) {
      previous = this.queue.length;
      await this.flush();
    }
    if (this.queue.length > 0) {
      this.logger?.log('warn', 'forwarder.closed_with_undelivered', {
        undelivered: this.queue.length,
      });
    }
  }

  /** Events currently queued (for diagnostics/tests). */
  get pending(): number {
    return this.queue.length;
  }
}
