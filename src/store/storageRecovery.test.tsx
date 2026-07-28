/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageRecoveryNotice } from '../components/StorageRecoveryNotice';
import { appendEvent, loadEvents } from './companion';
import {
  BLOOM_STORAGE_KEY,
  SCHEMA_VERSION,
  readPersisted,
  useBloom,
} from './useBloom';
import {
  getStorageHealthSnapshot,
  reportStorageFailure,
  resetStorageHealthForTests,
} from './storageHealth';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failSet = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error('injected quota failure');
    this.values.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  resetStorageHealthForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetStorageHealthForTests();
});

describe('persisted-state recovery', () => {
  it('normalizes malformed current rows, preserves the exact payload, and blocks overwrite', () => {
    const raw = JSON.stringify({
      version: SCHEMA_VERSION,
      tasks: [
        { id: 1, t: 'keep me', done: false, pomos: 0, goal: 1 },
        { id: 'bad', t: '', done: 'yes' },
      ],
      goals: [{ id: 2, title: 'bad date', due: 'tomorrow', target: 2, done: 0 }],
      settings: { name: 'Mira' },
    });
    storage.setItem(BLOOM_STORAGE_KEY, raw);

    const recovered = readPersisted();

    expect(recovered?.tasks.map((task) => task.id)).toEqual([1]);
    expect(recovered?.goals).toEqual([]);
    expect(getStorageHealthSnapshot().failures).toEqual([
      expect.objectContaining({
        area: 'bloom-state',
        kind: 'validation',
        raw,
      }),
    ]);
    expect(storage.getItem(BLOOM_STORAGE_KEY)).toBe(raw);
  });

  it('keeps corrupt current bytes while recovering a valid legacy candidate', () => {
    storage.setItem(BLOOM_STORAGE_KEY, '{broken');
    storage.setItem('bloom-state-v2', JSON.stringify({
      version: 18,
      settings: { name: 'Legacy bloom' },
    }));

    expect(readPersisted()?.settings.name).toBe('Legacy bloom');
    expect(getStorageHealthSnapshot().failures[0]).toMatchObject({
      key: BLOOM_STORAGE_KEY,
      raw: '{broken',
    });
    expect(storage.getItem(BLOOM_STORAGE_KEY)).toBe('{broken');
  });

  it('surfaces write failure while leaving the prior saved copy byte-for-byte unchanged', async () => {
    const prior = JSON.stringify({ version: 18, settings: { name: 'Mira' } });
    storage.setItem(BLOOM_STORAGE_KEY, prior);
    storage.failSet = true;

    function Harness() {
      useBloom();
      return null;
    }
    render(<Harness />);

    await waitFor(() => {
      expect(getStorageHealthSnapshot().failures[0]).toMatchObject({
        area: 'bloom-state',
        kind: 'write',
        raw: prior,
      });
    });
    expect(storage.getItem(BLOOM_STORAGE_KEY)).toBe(prior);
  });
});

describe('Companion storage isolation', () => {
  it('keeps valid moments in memory without overwriting a malformed log', () => {
    const raw = JSON.stringify({
      version: 2,
      events: [
        { id: 'good', ts: 10, min: 1, len: 25, kind: 'focused', src: 'checkin' },
        { id: 'bad', ts: 'later' },
      ],
    });
    storage.setItem('bloom-companion-v1', raw);

    expect(loadEvents().map((event) => event.id)).toEqual(['good']);
    appendEvent({ ts: 20, min: 2, len: 25, kind: 'focused', src: 'checkin' });

    expect(storage.getItem('bloom-companion-v1')).toBe(raw);
    expect(getStorageHealthSnapshot().failures[0]).toMatchObject({
      area: 'companion-log',
      kind: 'validation',
      raw,
    });
  });
});

describe('accessible recovery notice', () => {
  it('announces the problem and exposes retry, export, and recovery actions', () => {
    reportStorageFailure({
      area: 'bloom-state',
      key: BLOOM_STORAGE_KEY,
      kind: 'read',
      reason: 'broken JSON',
      raw: '{broken',
    });
    render(
      <StorageRecoveryNotice
        recoveredBloom={{ version: SCHEMA_VERSION }}
        onRetry={vi.fn()}
        onRecover={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'download recovery file' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'try storage again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'keep this recovered copy' })).toBeTruthy();
  });
});
