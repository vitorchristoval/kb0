import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWatcher } from './FakeWatcher.js';

describe('FakeWatcher', () => {
  let watcher: FakeWatcher;

  beforeEach(() => {
    watcher = new FakeWatcher();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('emits change events to registered handlers', () => {
    const handler = vi.fn();
    watcher.on('change', handler);
    watcher.emitChange('notes/test.md');
    expect(handler).toHaveBeenCalledWith('notes/test.md');
  });

  it('emits delete events to registered handlers', () => {
    const handler = vi.fn();
    watcher.on('delete', handler);
    watcher.emitDelete('notes/test.md');
    expect(handler).toHaveBeenCalledWith('notes/test.md');
  });

  it('suppresses events for ignored paths within the cooldown window', () => {
    const handler = vi.fn();
    watcher.on('change', handler);
    watcher.ignoreFor('notes/test.md', 2000);
    watcher.emitChange('notes/test.md');
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows events for non-ignored paths', () => {
    const handler = vi.fn();
    watcher.on('change', handler);
    watcher.ignoreFor('notes/other.md', 2000);
    watcher.emitChange('notes/test.md');
    expect(handler).toHaveBeenCalledWith('notes/test.md');
  });

  it('allows events after the cooldown expires', async () => {
    const handler = vi.fn();
    watcher.on('change', handler);
    watcher.ignoreFor('notes/test.md', 10);
    await new Promise((r) => setTimeout(r, 20));
    watcher.emitChange('notes/test.md');
    expect(handler).toHaveBeenCalledWith('notes/test.md');
  });

  it('suppresses both change and delete for an ignored path', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    watcher.on('change', onChange);
    watcher.on('delete', onDelete);
    watcher.ignoreFor('notes/test.md', 2000);
    watcher.emitChange('notes/test.md');
    watcher.emitDelete('notes/test.md');
    expect(onChange).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
