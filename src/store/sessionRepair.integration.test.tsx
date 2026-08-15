/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { completionRateByPlannedLength } from './sessionStats';
import { loadEvents } from './companion';
import { proposeSessionRepair } from './sessionRepair';
import type { SessionRecord } from './sessions';
import {
  getStorageHealthSnapshot,
  resetStorageHealthForTests,
} from './storageHealth';
import {
  DEFAULT_STATE,
  persistedShapeFromState,
  reducer,
  useBloom,
  type BloomState,
} from './useBloom';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failSetFor: string | null = null;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failSetFor === key) throw new Error(`blocked write for ${key}`);
    this.values.set(key, value);
  }
}

let storage: MemoryStorage;

function record(patch: Partial<SessionRecord> = {}): SessionRecord {
  const startedAt = new Date('2026-07-26T09:00:00').getTime();
  return {
    id: 'repair-me',
    startedAt,
    endedAt: startedAt + 10 * 60_000,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 10,
    outcome: 'interrupted',
    startHour: 9,
    goalId: 4,
    goalCredit: 'credited',
    driftEventIds: [],
    resumeCuePending: true,
    ...patch,
  };
}

function stateWithRecord(session: SessionRecord): BloomState {
  return {
    ...DEFAULT_STATE,
    now: session.endedAt,
    today: '2026-07-26',
    sessions: 8,
    streak: 5,
    palXp: { Mochi: 3 },
    goals: [{
      id: 4,
      title: 'Exam review',
      due: '2026-08-01',
      target: 6,
      done: 1,
      createdAt: 1,
    }],
    goalLedger: [{
      id: 'existing-credit',
      goalId: 4,
      delta: 1,
      source: 'session',
      sessionId: session.id,
      dayKey: '2026-07-26',
      at: session.endedAt,
    }],
    sessionRecords: [session],
  };
}

describe('persisted session repair integration', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    resetStorageHealthForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T10:00:00'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetStorageHealthForTests();
  });

  it('updates analytics fields without replaying XP, streak, sessions, or goal credit', () => {
    const source = record();
    const state = stateWithRecord(source);
    const candidate: SessionRecord = {
      ...source,
      endedAt: source.startedAt + 20 * 60_000,
      actualMin: 20,
      outcome: 'completed',
      resumeCuePending: undefined,
      edited: true,
      editedAt: Date.now(),
    };
    const next = reducer(state, { type: 'repairSession', record: candidate });

    expect(next.sessionRecords[0]).toMatchObject({
      actualMin: 20,
      outcome: 'completed',
      edited: true,
    });
    expect(completionRateByPlannedLength(next.sessionRecords, Date.now())).toEqual([
      { plannedMin: 25, total: 1, completed: 1, rate: 1 },
    ]);
    expect(next.sessions).toBe(state.sessions);
    expect(next.streak).toBe(state.streak);
    expect(next.palXp).toBe(state.palXp);
    expect(next.goals).toBe(state.goals);
    expect(next.goalLedger).toBe(state.goalLedger);
  });

  it('persists one retroactive repair event and links it without reward replay', () => {
    const source = record();
    const initial = stateWithRecord(source);
    localStorage.setItem('bloom-state', JSON.stringify(persistedShapeFromState(initial)));
    const hook = renderHook(() => useBloom());
    const result = proposeSessionRepair({
      record: source,
      records: [source],
      wallClockEndAt: source.endedAt,
      endedAt: source.endedAt,
      outcome: 'abandoned',
      retroactiveDrift: {
        onsetAt: source.startedAt + 4 * 60_000,
        durationMin: 3,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let repaired: SessionRecord | null | undefined;
    act(() => {
      repaired = hook.result.current.actions.repairSession(result.proposal);
    });

    const stored = hook.result.current.state.sessionRecords[0];
    const events = loadEvents();
    expect(repaired).toMatchObject({ edited: true, outcome: 'abandoned' });
    expect(stored).toMatchObject({ edited: true, outcome: 'abandoned' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: source.id,
      kind: 'drift',
      src: 'repair',
      min: 4,
      estOnsetMin: 4,
    });
    expect(stored.driftEventIds).toEqual([events[0].id]);
    expect(hook.result.current.state.sessions).toBe(8);
    expect(hook.result.current.state.streak).toBe(5);
    expect(hook.result.current.state.palXp).toEqual({ Mochi: 3 });
    expect(hook.result.current.state.goalLedger).toEqual(initial.goalLedger);
    expect(hook.result.current.state.goals).toEqual(initial.goals);
  });

  it('rolls back the repair event and keeps the prior record when main storage rejects save', () => {
    const source = record();
    const initial = stateWithRecord(source);
    localStorage.setItem('bloom-state', JSON.stringify(persistedShapeFromState(initial)));
    const hook = renderHook(() => useBloom());
    const priorMain = localStorage.getItem('bloom-state');
    const result = proposeSessionRepair({
      record: source,
      records: [source],
      wallClockEndAt: source.endedAt,
      endedAt: source.endedAt,
      outcome: 'abandoned',
      retroactiveDrift: {
        onsetAt: source.startedAt + 4 * 60_000,
        durationMin: 3,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    storage.failSetFor = 'bloom-state';

    let repaired: SessionRecord | null | undefined;
    act(() => {
      repaired = hook.result.current.actions.repairSession(result.proposal);
    });

    expect(repaired).toBeNull();
    expect(hook.result.current.state.sessionRecords[0]).toEqual(source);
    expect(localStorage.getItem('bloom-state')).toBe(priorMain);
    expect(loadEvents()).toEqual([]);
    expect(getStorageHealthSnapshot().failures).toEqual([
      expect.objectContaining({
        area: 'bloom-state',
        kind: 'write',
        raw: priorMain,
      }),
    ]);
  });
});
