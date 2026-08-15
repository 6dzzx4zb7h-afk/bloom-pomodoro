import { describe, expect, it } from 'vitest';

import twoDeviceFixture from './fixtures/two-device.json';
import {
  acceptPendingSyncEnvelope,
  createPendingSyncEnvelope,
  type AcceptedSyncEnvelope,
  type JsonObject,
  type SyncMutation,
} from './protocol';
import {
  canonicalSyncDocument,
  mergeSyncEnvelopes,
  retainedSyncLog,
  type SyncDocumentSeed,
} from './merge';
import {
  materializeBackupFromSyncDocument,
  seedSyncDocumentFromBackup,
} from './bloomAdapter';
import { createBackupEnvelope } from '../store/exportImport';
import {
  DEFAULT_STATE,
  SCHEMA_VERSION,
  persistedShapeFromState,
} from '../store/useBloom';
import type { SessionRecord } from '../store/sessions';

function envelope(
  revision: number,
  mutation: SyncMutation,
  options: { device?: string; baseRevision?: number; mutationId?: string } = {},
): AcceptedSyncEnvelope {
  const pending = createPendingSyncEnvelope({
    contentSchemaVersion: SCHEMA_VERSION,
    deviceId: options.device ?? 'device_alpha',
    mutationId: options.mutationId ?? `mutation_${revision}`,
    baseRevision: options.baseRevision ?? 0,
    mutation,
  });
  return acceptPendingSyncEnvelope(pending, revision, `cursor_${revision}`);
}

function entityValue(
  document: ReturnType<typeof mergeSyncEnvelopes>,
  kind: string,
  id: string,
): JsonObject | undefined {
  return document.entities.find((entity) => entity.kind === kind && entity.id === id)?.value;
}

describe('PLAN 11.2 deterministic merge engine', () => {
  it('is idempotent, commutative, and deterministic across replay order', () => {
    const mutations = [
      envelope(1, { operation: 'create', kind: 'task', id: '1', value: { t: 'First', done: false } }),
      envelope(2, { operation: 'create', kind: 'task', id: '2', value: { t: 'Second', done: false } }, { device: 'device_beta' }),
      envelope(3, { operation: 'set', kind: 'task', id: '1', fields: { done: true } }, { baseRevision: 1 }),
      envelope(4, { operation: 'set', kind: 'task', id: '1', fields: { t: 'Renamed' } }, { device: 'device_beta', baseRevision: 1 }),
    ];
    const forward = mergeSyncEnvelopes(mutations, SCHEMA_VERSION);
    const reverse = mergeSyncEnvelopes([...mutations].reverse(), SCHEMA_VERSION);
    const duplicated = mergeSyncEnvelopes([...mutations, ...mutations], SCHEMA_VERSION);

    expect(canonicalSyncDocument(reverse)).toBe(canonicalSyncDocument(forward));
    expect(canonicalSyncDocument(duplicated)).toBe(canonicalSyncDocument(forward));
    expect(entityValue(forward, 'task', '1')).toEqual({ t: 'Renamed', done: true });
  });

  it('unions append-only records and applies explicit repairs by server revision', () => {
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'session-record',
        id: 's-a',
        value: { id: 's-a', outcome: 'interrupted', actualMin: 10 },
      }),
      envelope(2, {
        operation: 'create',
        kind: 'goal',
        id: '4',
        value: { id: 4, title: 'Goal' },
      }),
      envelope(3, {
        operation: 'create',
        kind: 'goal-ledger-row',
        id: 'credit-a',
        value: { id: 'credit-a', goalId: 4, delta: 1 },
      }),
      envelope(4, {
        operation: 'repair',
        kind: 'session-record',
        id: 's-a',
        fields: { outcome: 'completed', actualMin: 25, edited: true },
      }, { baseRevision: 1 }),
      envelope(5, {
        operation: 'repair',
        kind: 'session-record',
        id: 's-a',
        fields: { actualMin: 24 },
      }, { device: 'device_beta', baseRevision: 1 }),
    ], SCHEMA_VERSION);

    expect(entityValue(merged, 'session-record', 's-a')).toMatchObject({
      outcome: 'completed',
      actualMin: 24,
      edited: true,
    });
    expect(entityValue(merged, 'goal-ledger-row', 'credit-a')).toMatchObject({ delta: 1 });
  });

  it('rejects ordinary edits to append-only rows and limits repair to eligible logs', () => {
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'session-record',
        id: 's-a',
        value: { id: 's-a', outcome: 'interrupted' },
      }),
      envelope(2, {
        operation: 'set',
        kind: 'session-record',
        id: 's-a',
        fields: { outcome: 'completed' },
      }, { baseRevision: 1 }),
      envelope(3, {
        operation: 'create',
        kind: 'goal',
        id: '4',
        value: { id: 4, title: 'Goal' },
      }),
      envelope(4, {
        operation: 'create',
        kind: 'goal-ledger-row',
        id: 'credit-a',
        value: { id: 'credit-a', goalId: 4, delta: 1 },
      }),
      envelope(5, {
        operation: 'repair',
        kind: 'goal-ledger-row',
        id: 'credit-a',
        fields: { delta: 9 },
      }, { baseRevision: 4 }),
    ], SCHEMA_VERSION);

    expect(entityValue(merged, 'session-record', 's-a')).toMatchObject({
      outcome: 'interrupted',
    });
    expect(entityValue(merged, 'goal-ledger-row', 'credit-a')).toMatchObject({ delta: 1 });
    expect(merged.conflicts.filter((item) => item.kind === 'disallowed-operation')).toHaveLength(2);
  });

  it('makes tombstones defeat a later-arriving long-offline edit and requires explicit recreation', () => {
    const baseMutations = [
      envelope(1, { operation: 'create', kind: 'task', id: '1', value: { t: 'Original' } }),
      envelope(2, { operation: 'delete', kind: 'task', id: '1' }, { baseRevision: 1 }),
      envelope(3, { operation: 'set', kind: 'task', id: '1', fields: { t: 'Stale offline' } }, { device: 'device_beta', baseRevision: 1 }),
    ];
    const deleted = mergeSyncEnvelopes(baseMutations, SCHEMA_VERSION);

    expect(entityValue(deleted, 'task', '1')).toBeUndefined();
    expect(deleted.tombstones).toEqual([
      expect.objectContaining({ kind: 'task', id: '1', revision: 2 }),
    ]);
    expect(deleted.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'stale-after-delete' })]),
    );

    const recreated = mergeSyncEnvelopes([
      ...baseMutations,
      envelope(4, {
        operation: 'recreate',
        kind: 'task',
        id: '1',
        recreatesRevision: 2,
        value: { t: 'Explicitly restored' },
      }, { baseRevision: 2 }),
      envelope(5, {
        operation: 'set',
        kind: 'task',
        id: '1',
        fields: { t: 'Old generation edit' },
      }, { device: 'device_beta', baseRevision: 1 }),
    ], SCHEMA_VERSION);
    expect(entityValue(recreated, 'task', '1')).toEqual({ t: 'Explicitly restored' });
    expect(recreated.tombstones).toHaveLength(0);
    expect(recreated.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'stale-after-delete' })]),
    );
  });

  it('quarantines divergent stable-id creates instead of overwriting either', () => {
    const merged = mergeSyncEnvelopes([
      envelope(1, { operation: 'create', kind: 'task', id: 'same', value: { t: 'Alpha' } }),
      envelope(2, { operation: 'create', kind: 'task', id: 'same', value: { t: 'Beta' } }, { device: 'device_beta' }),
    ], SCHEMA_VERSION);

    expect(entityValue(merged, 'task', 'same')).toBeUndefined();
    expect(merged.conflicts).toEqual([
      expect.objectContaining({
        kind: 'stable-id-collision',
        mutationIds: ['mutation_1', 'mutation_2'],
      }),
    ]);
    expect(merged.retainedEnvelopes).toHaveLength(2);
  });

  it('keeps a seeded entity when a divergent create reuses its stable id', () => {
    const seed: SyncDocumentSeed = {
      contentSchemaVersion: SCHEMA_VERSION,
      entities: [{
        kind: 'task',
        id: 'same',
        value: { t: 'Local copy' },
        revision: 0,
        fieldRevisions: { t: 0 },
        references: [],
        referencesRevision: 0,
        createdBy: 'bootstrap:task:same',
        generationRevision: 0,
      }],
    };
    const merged = mergeSyncEnvelopes([
      envelope(1, { operation: 'create', kind: 'task', id: 'same', value: { t: 'Remote copy' } }),
    ], SCHEMA_VERSION, seed);

    expect(entityValue(merged, 'task', 'same')).toEqual({ t: 'Local copy' });
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ kind: 'stable-id-collision', entityId: 'same' }),
    ]);
    expect(merged.retainedEnvelopes).toHaveLength(1);
  });

  it('quarantines payload ids that disagree with the stable envelope id', () => {
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'task',
        id: '1',
        value: { id: 2, t: 'Mismatched' },
      }),
      envelope(2, {
        operation: 'create',
        kind: 'session-record',
        id: 's-one',
        value: { id: 's-one', outcome: 'interrupted' },
      }),
      envelope(3, {
        operation: 'repair',
        kind: 'session-record',
        id: 's-one',
        fields: { id: 's-two', outcome: 'completed' },
      }, { baseRevision: 2 }),
    ], SCHEMA_VERSION);

    expect(entityValue(merged, 'task', '1')).toBeUndefined();
    expect(entityValue(merged, 'session-record', 's-one')).toMatchObject({
      id: 's-one',
      outcome: 'interrupted',
    });
    expect(merged.conflicts.filter((item) => item.kind === 'stable-id-collision')).toHaveLength(2);
  });

  it('never materializes an orphan and resolves an out-of-order reference when its target exists', () => {
    const dependent = envelope(1, {
      operation: 'create',
      kind: 'task',
      id: '1',
      value: { t: 'Linked', goalId: 4 },
      references: [{ kind: 'goal', id: '4' }],
    });
    const blocked = mergeSyncEnvelopes([dependent], SCHEMA_VERSION);
    expect(blocked.entities).toHaveLength(0);
    expect(blocked.blockedEntities.map((entity) => entity.id)).toEqual(['1']);

    const resolved = mergeSyncEnvelopes([
      dependent,
      envelope(2, { operation: 'create', kind: 'goal', id: '4', value: { title: 'Goal' } }),
    ], SCHEMA_VERSION);
    expect(resolved.blockedEntities).toHaveLength(0);
    expect(resolved.entities.map((entity) => `${entity.kind}:${entity.id}`)).toEqual([
      'goal:4',
      'task:1',
    ]);
  });

  it('derives known references even when a mutation omits its reference list', () => {
    const blocked = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'task',
        id: '1',
        value: { id: 1, t: 'Linked', goalId: 4 },
      }),
    ], SCHEMA_VERSION);

    expect(blocked.entities).toHaveLength(0);
    expect(blocked.blockedEntities[0].references).toEqual([{ kind: 'goal', id: '4' }]);

    const resolved = mergeSyncEnvelopes([
      ...retainedSyncLog(blocked),
      envelope(2, {
        operation: 'create',
        kind: 'goal',
        id: '4',
        value: { id: 4, title: 'Goal' },
      }),
    ], SCHEMA_VERSION);
    expect(resolved.blockedEntities).toHaveLength(0);
    expect(entityValue(resolved, 'task', '1')).toMatchObject({ goalId: 4 });
  });

  it('deduplicates counters and isolates overlapping archive compaction', () => {
    const increment = envelope(1, {
      operation: 'increment',
      kind: 'counter',
      id: 'sessions',
      delta: 1,
    });
    const merged = mergeSyncEnvelopes([
      increment,
      increment,
      envelope(2, {
        operation: 'increment',
        kind: 'counter',
        id: 'sessions',
        delta: 1,
      }, { device: 'device_beta' }),
      envelope(3, {
        operation: 'compact',
        kind: 'history-hour',
        id: '2026-08-12:8',
        value: { sessionCount: 2 },
        sourceMutationIds: ['mutation_source_a', 'mutation_source_b'],
      }),
      envelope(4, {
        operation: 'compact',
        kind: 'history-hour',
        id: '2026-08-12:8-overlap',
        value: { sessionCount: 1 },
        sourceMutationIds: ['mutation_source_b'],
      }, { device: 'device_beta' }),
    ], SCHEMA_VERSION);

    expect(merged.counters).toEqual([
      expect.objectContaining({ id: 'sessions', value: 2 }),
    ]);
    expect(merged.compactions).toHaveLength(1);
    expect(merged.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'overlapping-compaction' })]),
    );
  });

  it('keeps the first archive component when the same stable id has different content', () => {
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'compact',
        kind: 'history-hour',
        id: '2026-08-12:8',
        value: { sessionCount: 2 },
        sourceMutationIds: ['mutation_source_a'],
      }),
      envelope(2, {
        operation: 'compact',
        kind: 'history-hour',
        id: '2026-08-12:8',
        value: { sessionCount: 9 },
        sourceMutationIds: ['mutation_source_b'],
      }, { device: 'device_beta' }),
    ], SCHEMA_VERSION);

    expect(merged.compactions).toEqual([
      expect.objectContaining({ id: '2026-08-12:8', value: { sessionCount: 2 } }),
    ]);
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ kind: 'stable-id-collision', entityId: '2026-08-12:8' }),
    ]);
    expect(merged.retainedEnvelopes).toHaveLength(2);
  });

  it('isolates corrupt input and retains future-schema and unknown current fields', () => {
    const current = envelope(1, {
      operation: 'create',
      kind: 'task',
      id: '1',
      value: { t: 'Current' },
    });
    const currentWire = current.wire;
    currentWire.futureTopLevel = { keep: true };
    const future = {
      ...currentWire,
      contentSchemaVersion: SCHEMA_VERSION + 1,
      revision: 2,
      cursor: 'cursor_2',
      mutationId: 'mutation_future',
      mutation: { operation: 'future-op', opaque: { keep: true } },
    };
    const merged = mergeSyncEnvelopes([currentWire, future, { malformed: true }], SCHEMA_VERSION);

    expect(merged.entities).toHaveLength(1);
    expect(merged.preservedEnvelopes).toHaveLength(1);
    expect(merged.quarantinedEnvelopes).toHaveLength(1);
    expect(retainedSyncLog(merged)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ futureTopLevel: { keep: true } }),
        expect.objectContaining({ contentSchemaVersion: SCHEMA_VERSION + 1 }),
      ]),
    );
  });

  it('detects impossible duplicate server revisions deterministically', () => {
    const first = envelope(1, { operation: 'create', kind: 'task', id: '1', value: { t: 'A' } });
    const second = acceptPendingSyncEnvelope(
      createPendingSyncEnvelope({
        contentSchemaVersion: SCHEMA_VERSION,
        deviceId: 'device_beta',
        mutationId: 'mutation_other',
        mutation: { operation: 'create', kind: 'task', id: '2', value: { t: 'B' } },
      }),
      1,
      'cursor_1_other',
    );
    const merged = mergeSyncEnvelopes([second, first], SCHEMA_VERSION);

    expect(merged.entities).toHaveLength(0);
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ kind: 'revision-collision' }),
    ]);
  });

  it('stops before a server revision gap and resumes from an explicit snapshot cursor', () => {
    const later = envelope(4, {
      operation: 'create',
      kind: 'task',
      id: '4',
      value: { t: 'After the gap' },
    });
    const stopped = mergeSyncEnvelopes([later], SCHEMA_VERSION);

    expect(stopped.revision).toBe(0);
    expect(stopped.entities).toHaveLength(0);
    expect(stopped.conflicts).toEqual([
      expect.objectContaining({ kind: 'revision-gap', mutationIds: ['mutation_4'] }),
    ]);

    const resumed = mergeSyncEnvelopes([later], SCHEMA_VERSION, {
      contentSchemaVersion: SCHEMA_VERSION,
      revision: 3,
      cursor: 'cursor_3',
    });
    expect(resumed.revision).toBe(4);
    expect(resumed.cursor).toBe('cursor_4');
    expect(entityValue(resumed, 'task', '4')).toEqual({ t: 'After the gap' });
  });

  it('merges the two-device fixture through the real 9.4 backup shape without losing records', () => {
    const baseSession: SessionRecord = {
      id: 's-base',
      startedAt: 0,
      endedAt: 60,
      mode: 'focus',
      plannedMin: 1,
      actualMin: 1,
      outcome: 'completed',
      startHour: 0,
      driftEventIds: [],
    };
    const base = createBackupEnvelope(
      persistedShapeFromState({
        ...DEFAULT_STATE,
        sessions: 1,
        tasks: [{ id: 7, t: 'Base task', done: false, pomos: 1, goal: 2 }],
        activeTaskId: 7,
        goals: [{ id: 4, title: 'Shared goal', due: '2026-12-31', target: 5, done: 0, createdAt: 1 }],
        sessionRecords: [baseSession],
        flowAcc: 123,
        settings: { ...DEFAULT_STATE.settings, name: 'Local name' },
      }),
      [{ id: 'event-base', ts: 60, min: 1, len: 1, kind: 'focused', src: 'checkin' }],
      99,
    );
    const seed = seedSyncDocumentFromBackup(base);
    const merged = mergeSyncEnvelopes(twoDeviceFixture, SCHEMA_VERSION, seed);
    const materialized = materializeBackupFromSyncDocument(base, merged);

    expect(materialized.bloom.tasks.map((task) => task.id).sort((a, b) => a - b)).toEqual([7, 11, 12]);
    expect(materialized.bloom.sessionRecords.map((record) => record.id).sort()).toEqual([
      's-alpha',
      's-base',
      's-beta',
    ]);
    expect(materialized.bloom.goalLedger.map((row) => row.id).sort()).toEqual([
      'credit-alpha',
      'credit-beta',
    ]);
    expect(materialized.bloom.goals[0].done).toBe(2);
    expect(materialized.companion.events.map((event) => event.id).sort()).toEqual([
      'event-alpha',
      'event-base',
      'event-beta',
    ]);
    expect(materialized.bloom.sessions).toBe(3);
    expect(materialized.bloom.settings.name).toBe('Shared name');
    expect(materialized.bloom.flow.acc).toBe(123);
    expect(materialized.bloom.activeTaskId).toBe(7);
    expect(merged.conflicts).toEqual([]);
  });

  it('round-trips every composite and counter-backed synchronized slice', () => {
    const session: SessionRecord = {
      id: 's-rich',
      startedAt: 10,
      endedAt: 1_510,
      mode: 'focus',
      plannedMin: 25,
      actualMin: 25,
      outcome: 'completed',
      startHour: 0,
      taskId: 7,
      goalId: 4,
      driftEventIds: ['event-rich'],
    };
    const persisted = persistedShapeFromState({
      ...DEFAULT_STATE,
      sessions: 8,
      streak: 3,
      lastFocusDay: '2026-08-12',
      restDayUsedOn: '2026-08-11',
      comeBack: true,
      tasks: [{ id: 7, t: 'Rich task', done: false, pomos: 6, goal: 3, goalId: 4 }],
      activeTaskId: 7,
      palXp: { Mochi: 12.5 },
      goals: [{
        id: 4,
        title: 'Rich goal',
        due: '2026-12-31',
        target: 5,
        done: 2,
        createdAt: 1,
      }],
      goalLedger: [
        { id: 'credit-one', goalId: 4, delta: 1, source: 'manual', dayKey: '2026-08-11', at: 2 },
        { id: 'credit-two', goalId: 4, delta: 1, source: 'session', sessionId: 's-rich', dayKey: '2026-08-12', at: 1_510 },
      ],
      ifThenPlans: [{
        id: 'plan-rich',
        cueType: 'time',
        cueText: 'after breakfast',
        actionText: 'open the notes',
        taskId: 7,
        usageCount: 4,
        lastUsedAt: 10,
        createdAt: 1,
      }],
      foundations: {
        instances: [{
          id: 'fnd-desk-reset',
          type: 'desk-reset',
          enabled: true,
          order: 0,
          ranges: [{ from: '2026-07-01', to: '2026-07-31' }, { from: '2026-08-01' }],
          ifThenId: 'plan-rich',
          createdAt: 1,
        }],
        entries: [{
          id: 'fnd-desk-reset:2026-08-12',
          instanceId: 'fnd-desk-reset',
          dayKey: '2026-08-12',
          recordedAt: 20,
        }],
        archive: [{ instanceId: 'fnd-desk-reset', monthKey: '2026-07', doneDays: 7 }],
      },
      dayPlan: {
        targets: [{
          id: 'target-rich',
          dayKey: '2026-08-12',
          plannedAmount: 2,
          snapshot: { title: 'Rich task', unit: 'sessions' },
          createdAt: 3,
          taskId: 7,
        }],
        archive: [{ weekKey: '2026-08-03', plannedSum: 5, actualSum: 4 }],
      },
      lastRolloverOfferDay: '2026-08-12',
      flowAcc: 321,
      sessionRecords: [session],
      historyArchive: {
        hours: [{
          calendarDay: '2026-07-01',
          hour: 9,
          focusMinutes: 25,
          sessionCount: 1,
          completedSessionCount: 1,
          driftCount: 0,
          recoveryCount: 0,
        }],
        completedTasks: [{ id: 'done-7', taskId: 7, title: 'Old task', completedAt: 5 }],
        overflow: {
          hourBucketCount: 2,
          focusMinutes: 50,
          sessionCount: 2,
          completedSessionCount: 2,
          driftCount: 1,
          recoveryCount: 1,
          completedTaskCount: 1,
        },
      },
      lastWeeklyReviewWeek: '2026-08-10',
      ritual: {
        enabled: true,
        suggestionSeen: true,
        items: [{ id: 'phone', text: 'phone in another room' }],
      },
      lastWoopOfferAt: 100,
      preSlump: {
        day: '2026-08-12',
        count: 2,
        silenced: true,
        lastSessionId: 's-rich',
      },
      personalCadence: {
        computedAt: 90,
        recommendation: null,
        history: [{ focusMin: 20, breakMin: 5 }, { focusMin: 40, breakMin: 8 }],
      },
      parking: [
        { id: 'hidden', text: 'keep local', parkedAt: 30, sessionId: 'open', revealedAt: null },
        { id: 'shown', text: 'sync me', parkedAt: 31, sessionId: 's-rich', revealedAt: 40 },
      ],
      guideRead: {
        readAt: { 'first-pebble': 50 },
        suggestions: [{ articleId: 'first-pebble', surfacedAt: 60, momentKey: 'debrief:s-rich' }],
      },
      settings: {
        ...DEFAULT_STATE.settings,
        name: 'Rich local copy',
        companion: { ...DEFAULT_STATE.settings.companion, on: true },
      },
    });
    const base = createBackupEnvelope(
      persisted,
      [{
        id: 'event-rich',
        sessionId: 's-rich',
        ts: 500,
        min: 8,
        len: 25,
        kind: 'drift',
        src: 'checkin',
      }],
      99,
    );
    const merged = mergeSyncEnvelopes([], SCHEMA_VERSION, seedSyncDocumentFromBackup(base));
    const materialized = materializeBackupFromSyncDocument(base, merged);

    expect(materialized).toEqual(base);
    expect(merged.entities.some((entity) => entity.kind === 'foundation-range')).toBe(true);
    expect(merged.entities.some((entity) => entity.kind === 'ritual-item')).toBe(true);
    expect(merged.entities.some((entity) => entity.kind === 'cadence-history')).toBe(true);
    expect(merged.entities.some((entity) => entity.kind === 'guide-suggestion')).toBe(true);
    expect(merged.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'task-pomos:7', value: 6 }),
        expect.objectContaining({ id: 'if-then-usage:plan-rich', value: 4 }),
      ]),
    );
  });

  it('preserves local list order and appends new rows in authoritative revision order', () => {
    const base = createBackupEnvelope(
      persistedShapeFromState({
        ...DEFAULT_STATE,
        tasks: [
          { id: 20, t: 'First locally', done: false, pomos: 0, goal: 1 },
          { id: 10, t: 'Second locally', done: false, pomos: 0, goal: 1 },
        ],
        activeTaskId: 20,
      }),
      [
        { id: 'z-local', ts: 1, min: 1, len: 1, kind: 'focused', src: 'checkin' },
        { id: 'a-local', ts: 2, min: 1, len: 1, kind: 'focused', src: 'checkin' },
      ],
      99,
    );
    const merged = mergeSyncEnvelopes([
      envelope(2, {
        operation: 'create',
        kind: 'task',
        id: '30',
        value: { id: 30, t: 'Later revision', done: false, goal: 1 },
      }),
      envelope(1, {
        operation: 'create',
        kind: 'task',
        id: '40',
        value: { id: 40, t: 'Earlier revision', done: false, goal: 1 },
      }, { device: 'device_beta' }),
    ], SCHEMA_VERSION, seedSyncDocumentFromBackup(base));

    const materialized = materializeBackupFromSyncDocument(base, merged);

    expect(materialized.bloom.tasks.map((task) => task.id)).toEqual([20, 10, 40, 30]);
    expect(materialized.companion.events.map((event) => event.id)).toEqual([
      'z-local',
      'a-local',
    ]);
  });

  it('retains unknown setting paths without applying or traversing them', () => {
    const base = createBackupEnvelope(
      persistedShapeFromState(DEFAULT_STATE),
      [],
      99,
    );
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'setting',
        id: '__proto__.polluted',
        value: { value: 'unsafe' },
      }),
      envelope(2, {
        operation: 'create',
        kind: 'setting',
        id: 'newer.preference',
        value: { value: true },
      }),
    ], SCHEMA_VERSION, seedSyncDocumentFromBackup(base));

    const materialized = materializeBackupFromSyncDocument(base, merged);

    expect(materialized.bloom.settings).toEqual(base.bloom.settings);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(merged.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'setting', id: '__proto__.polluted' }),
        expect.objectContaining({ kind: 'setting', id: 'newer.preference' }),
      ]),
    );
  });

  it('accepts a seed independent of input order', () => {
    const seed: SyncDocumentSeed = {
      contentSchemaVersion: SCHEMA_VERSION,
      entities: [{
        kind: 'setting',
        id: 'name',
        value: { value: 'Before' },
        revision: 0,
        fieldRevisions: { value: 0 },
        references: [],
        referencesRevision: 0,
        createdBy: 'bootstrap:setting:name',
        generationRevision: 0,
      }],
    };
    const changes = [
      envelope(2, { operation: 'set', kind: 'setting', id: 'name', fields: { value: 'Later' } }),
      envelope(1, { operation: 'set', kind: 'setting', id: 'name', fields: { value: 'Earlier' } }),
    ];

    expect(entityValue(mergeSyncEnvelopes(changes, SCHEMA_VERSION, seed), 'setting', 'name')).toEqual({ value: 'Later' });
    expect(entityValue(mergeSyncEnvelopes([...changes].reverse(), SCHEMA_VERSION, seed), 'setting', 'name')).toEqual({ value: 'Later' });
  });

  it('keeps greatest study-day markers even when an older day has a later revision', () => {
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'marker',
        id: 'last-weekly-review-week',
        value: { value: '2026-08-10' },
      }),
      envelope(2, {
        operation: 'set',
        kind: 'marker',
        id: 'last-weekly-review-week',
        fields: { value: '2026-08-03' },
      }, { baseRevision: 1 }),
      envelope(3, {
        operation: 'create',
        kind: 'day-summary',
        id: 'current',
        value: { lastFocusDay: '2026-08-12', streak: 3 },
      }),
      envelope(4, {
        operation: 'set',
        kind: 'day-summary',
        id: 'current',
        fields: { lastFocusDay: '2026-08-11', streak: 99 },
      }, { baseRevision: 3 }),
    ], SCHEMA_VERSION);

    expect(entityValue(merged, 'marker', 'last-weekly-review-week')).toEqual({
      value: '2026-08-10',
    });
    expect(entityValue(merged, 'day-summary', 'current')).toEqual({
      lastFocusDay: '2026-08-12',
      streak: 3,
    });
  });

  it('requires counter-backed fields to arrive as idempotent increments', () => {
    const increment = envelope(3, {
      operation: 'increment',
      kind: 'counter',
      id: 'task-pomos:7',
      delta: 2,
    });
    const merged = mergeSyncEnvelopes([
      envelope(1, {
        operation: 'create',
        kind: 'task',
        id: '7',
        value: { id: 7, t: 'Invalid seed', done: false, goal: 1, pomos: 9 },
      }),
      envelope(2, {
        operation: 'create',
        kind: 'task',
        id: '8',
        value: { id: 8, t: 'Valid task', done: false, goal: 1 },
      }),
      increment,
      increment,
    ], SCHEMA_VERSION);

    expect(entityValue(merged, 'task', '7')).toBeUndefined();
    expect(entityValue(merged, 'task', '8')).toBeDefined();
    expect(merged.counters).toEqual([
      expect.objectContaining({ id: 'task-pomos:7', value: 2 }),
    ]);
    expect(merged.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'disallowed-operation' })]),
    );
  });
});
