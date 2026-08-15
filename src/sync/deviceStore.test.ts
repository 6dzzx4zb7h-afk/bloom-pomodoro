import { describe, expect, it } from 'vitest';

import {
  SYNC_DEVICE_STORAGE_KEY,
  acknowledgeSyncMutations,
  bindSyncAccount,
  createSyncDeviceState,
  loadOrCreateSyncDeviceState,
  loadSyncDeviceState,
  preserveFutureEnvelope,
  queueSyncMutation,
  saveSyncDeviceState,
  type SyncDeviceStorageLike,
} from './deviceStore';
import type { RandomByteFiller } from './protocol';

const fill = (value: number): RandomByteFiller => (bytes) => bytes.fill(value);

class MemoryStorage implements SyncDeviceStorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('PLAN 11.2 device-local sync metadata', () => {
  it('persists one random installation id on first initialization', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateSyncDeviceState(storage, fill(1));
    const second = loadOrCreateSyncDeviceState(storage, fill(9));

    expect(first.state.installationId).toBe(second.state.installationId);
    expect(first.state.installationId).toMatch(/^install_/);
    expect(storage.getItem(SYNC_DEVICE_STORAGE_KEY)).not.toBeNull();
  });

  it('keeps account/device/cursor/outbox state in a separate device-store record', () => {
    const storage = new MemoryStorage();
    const local = createSyncDeviceState(fill(1));
    const bound = bindSyncAccount(local, 'account_example', {
      cloudGeneration: 1,
      keyVersion: 1,
      mode: 'enabled',
      fillRandom: fill(2),
    });
    const queued = queueSyncMutation(
      bound,
      34,
      {
        operation: 'create',
        kind: 'task',
        id: 'task-1',
        value: { t: 'Local and queued' },
      },
      fill(3),
    );
    saveSyncDeviceState(storage, queued);

    expect(storage.values.has(SYNC_DEVICE_STORAGE_KEY)).toBe(true);
    expect(storage.values.has('bloom-state')).toBe(false);
    expect(loadSyncDeviceState(storage).state).toEqual(queued);
    expect(JSON.stringify(queued)).not.toMatch(/token|credential|rootKey|recovery/i);
  });

  it('acknowledges only named mutations and rejects cursor/generation rollback', () => {
    const bound = bindSyncAccount(createSyncDeviceState(fill(1)), 'account_example', {
      cloudGeneration: 2,
      keyVersion: 1,
      mode: 'enabled',
      fillRandom: fill(2),
    });
    const first = queueSyncMutation(
      bound,
      34,
      { operation: 'create', kind: 'task', id: 'a', value: { t: 'A' } },
      fill(3),
    );
    const second = queueSyncMutation(
      first,
      34,
      { operation: 'create', kind: 'task', id: 'b', value: { t: 'B' } },
      fill(4),
    );
    const acknowledged = acknowledgeSyncMutations(
      second,
      [second.outbox[0].mutationId],
      { revision: 5, cursor: 'cursor_5', cloudGeneration: 2 },
    );

    expect(acknowledged.outbox.map((item) => item.mutationId)).toEqual([
      second.outbox[1].mutationId,
    ]);
    expect(acknowledged.binding).toMatchObject({ lastRevision: 5, cursor: 'cursor_5' });
    expect(() =>
      acknowledgeSyncMutations(acknowledged, [], {
        revision: 4,
        cursor: 'cursor_4',
        cloudGeneration: 2,
      }),
    ).toThrow(/rolled back/);
    expect(() =>
      acknowledgeSyncMutations(acknowledged, [], {
        revision: 6,
        cursor: 'cursor_6',
        cloudGeneration: 3,
      }),
    ).toThrow(/generation changed/);
    expect(() =>
      acknowledgeSyncMutations(acknowledged, ['mutation_not_queued'], {
        revision: 6,
        cursor: 'cursor_6',
        cloudGeneration: 2,
      }),
    ).toThrow(/outside this outbox/);
  });

  it('does not silently replace an existing account binding or its queue', () => {
    const bound = bindSyncAccount(createSyncDeviceState(fill(1)), 'account_a', {
      cloudGeneration: 1,
      keyVersion: 1,
      mode: 'enabled',
      fillRandom: fill(2),
    });
    const queued = queueSyncMutation(
      bound,
      34,
      { operation: 'create', kind: 'task', id: 'a', value: { t: 'A' } },
      fill(3),
    );

    expect(() =>
      bindSyncAccount(queued, 'account_b', {
        cloudGeneration: 1,
        keyVersion: 1,
        fillRandom: fill(4),
      }),
    ).toThrow(/account-switch recovery flow/);
    expect(queued.outbox).toHaveLength(1);
  });

  it('returns corrupt metadata for recovery instead of overwriting it', () => {
    const storage = new MemoryStorage();
    storage.setItem(SYNC_DEVICE_STORAGE_KEY, '{not-json');

    const loaded = loadSyncDeviceState(storage, fill(9));

    expect(loaded.issue).toContain('not valid JSON');
    expect(loaded.rejectedRaw).toBe('{not-json');
    expect(storage.getItem(SYNC_DEVICE_STORAGE_KEY)).toBe('{not-json');
    expect(loaded.state.binding).toBeNull();
  });

  it('preserves opaque future envelopes without duplicates', () => {
    const initial = createSyncDeviceState(fill(1));
    const raw = { contentSchemaVersion: 35, opaque: { whole: true } };

    const once = preserveFutureEnvelope(initial, raw);
    const reordered = { opaque: { whole: true }, contentSchemaVersion: 35 };
    const twice = preserveFutureEnvelope(once, reordered);

    expect(twice.preservedInbox).toEqual([raw]);
  });
});
