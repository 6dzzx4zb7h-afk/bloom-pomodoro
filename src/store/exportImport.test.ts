import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupError,
  IMPORT_RECOVERY_KEY,
  MAX_BACKUP_BYTES,
  commitPreparedImport,
  createBackupEnvelope,
  parseBackup,
  prepareImport,
  readBackupFile,
  serializeBackup,
  sessionRecordsCsv,
  type StorageLike,
} from './exportImport';
import {
  BLOOM_STORAGE_KEY,
  DEFAULT_STATE,
  SCHEMA_VERSION,
  migratePersistedBlob,
  persistedShapeFromState,
} from './useBloom';
import { COMPANION_STORAGE_KEY } from './companion';
import type { SessionRecord } from './sessions';

const session: SessionRecord = {
  id: 's-one',
  startedAt: Date.UTC(2026, 6, 20, 8),
  endedAt: Date.UTC(2026, 6, 20, 8, 25),
  mode: 'focus',
  plannedMin: 25,
  actualMin: 25,
  outcome: 'completed',
  startHour: 8,
  driftEventIds: [],
  targetText: '=SUM(A1:A2)',
};

function stateWithData() {
  return persistedShapeFromState({
    ...DEFAULT_STATE,
    tasks: [{ id: 7, t: 'Read chapter', done: false, pomos: 1, goal: 2 }],
    activeTaskId: 7,
    goals: [
      { id: 4, title: 'Exam review', due: '2026-08-10', target: 8, done: 2, createdAt: 1 },
    ],
    sessionRecords: [session],
    sessions: 1,
    settings: { ...DEFAULT_STATE.settings, name: 'Lina', dayStartHour: 4 },
  });
}

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  failOnSet: string | null = null;
  failOnSetTimes = 1;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (key === this.failOnSet && this.failOnSetTimes > 0) {
      this.failOnSetTimes -= 1;
      throw new Error('injected write failure');
    }
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('Bloom backup envelope', () => {
  it('round-trips the complete main and Companion stores after a wipe', () => {
    const bloom = stateWithData();
    const events = [
      { id: 'e-one', ts: 5, min: 2, len: 25, kind: 'focused' as const, src: 'checkin' as const },
    ];
    const exported = createBackupEnvelope(bloom, events, 123);
    const parsed = parseBackup(serializeBackup(exported));
    const prepared = prepareImport(parsed, null);
    const storage = new MemoryStorage();

    commitPreparedImport(prepared, storage);

    expect(JSON.parse(storage.getItem(BLOOM_STORAGE_KEY)!)).toEqual(bloom);
    expect(JSON.parse(storage.getItem(COMPANION_STORAGE_KEY)!)).toEqual({
      version: 2,
      events,
    });
    expect(storage.getItem(IMPORT_RECOVERY_KEY)).not.toBeNull();
  });

  it('migrates an older-schema envelope through the localStorage chain', () => {
    const old = {
      version: 12,
      sessions: 3,
      tasks: [],
      settings: { name: 'Older backup', durations: { focus: 1200, short: 300, long: 900 } },
    };
    const text = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: 1,
      bloom: old,
      companion: { version: 1, events: [] },
    });

    const parsed = parseBackup(text);

    expect(parsed.bloom).toEqual(migratePersistedBlob(old));
    expect(parsed.bloom.version).toBe(SCHEMA_VERSION);
    expect(parsed.bloom.settings.dayStartHour).toBe(0);
    expect(prepareImport(parsed, null).preview.sourceSchemaVersion).toBe(12);
  });

  it('merges disjoint stable ids and refuses a divergent collision', () => {
    const current = createBackupEnvelope(stateWithData(), [], 1);
    const disjoint = createBackupEnvelope(
      {
        ...stateWithData(),
        tasks: [{ id: 8, t: 'New task', done: false, pomos: 0, goal: 1 }],
        activeTaskId: 8,
        goals: [],
        sessionRecords: [{ ...session, id: 's-two', startedAt: 9, endedAt: 10 }],
      },
      [],
      2,
    );
    const prepared = prepareImport(disjoint, current);
    expect(prepared.merged.bloom.tasks.map((task) => task.id)).toEqual([7, 8]);
    expect(prepared.merged.bloom.sessionRecords.map((record) => record.id)).toEqual([
      's-two',
      's-one',
    ]);

    const conflict = createBackupEnvelope(
      { ...stateWithData(), tasks: [{ ...stateWithData().tasks[0], t: 'Changed elsewhere' }] },
      [],
      3,
    );
    expect(() => prepareImport(conflict, current)).toThrow(BackupError);
  });

  it('rejects malformed, oversized, future-schema, and canceled input', () => {
    expect(() => parseBackup('{')).toThrowError(BackupError);
    expect(() => parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1))).toThrowError(BackupError);

    const future = createBackupEnvelope(stateWithData(), []);
    const futureText = JSON.stringify({
      ...future,
      bloom: { ...future.bloom, version: SCHEMA_VERSION + 1 },
    });
    expect(() => parseBackup(futureText)).toThrowError(
      expect.objectContaining({ code: 'future-schema' }),
    );

    const controller = new AbortController();
    controller.abort();
    expect(() => parseBackup(serializeBackup(future), controller.signal)).toThrowError(
      expect.objectContaining({ code: 'canceled' }),
    );
  });

  it('rejects malformed persisted rows and unsupported Companion data without dropping them', () => {
    const base = createBackupEnvelope(stateWithData(), []);
    const invalidTask = JSON.stringify({
      ...base,
      bloom: {
        ...base.bloom,
        tasks: [{ ...base.bloom.tasks[0], done: 'yes' }],
      },
    });
    expect(() => parseBackup(invalidTask)).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );

    const invalidGoal = JSON.stringify({
      ...base,
      bloom: {
        ...base.bloom,
        goals: [{ ...base.bloom.goals[0], due: '2026-02-31' }],
      },
    });
    expect(() => parseBackup(invalidGoal)).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );

    const invalidSession = JSON.stringify({
      ...base,
      bloom: {
        ...base.bloom,
        sessionRecords: [{ ...session, outcome: 'vanished' }],
      },
    });
    expect(() => parseBackup(invalidSession)).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );

    const invalidCompanion = JSON.stringify({
      ...base,
      companion: {
        version: 2,
        events: [{ id: 'e-bad', ts: 5, min: 2, len: 25, kind: 'mystery', src: 'checkin' }],
      },
    });
    expect(() => parseBackup(invalidCompanion)).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );

    const futureCompanion = JSON.stringify({
      ...base,
      companion: { version: 3, events: [] },
    });
    expect(() => parseBackup(futureCompanion)).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );
  });

  it('stops instead of truncating combined session or Companion history', () => {
    const sessions = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...session,
        id: `${prefix}-${index}`,
        startedAt: index * 2,
        endedAt: index * 2 + 1,
      }));
    const current = createBackupEnvelope(
      { ...stateWithData(), sessionRecords: sessions('current', 260) },
      Array.from({ length: 210 }, (_, index) => ({
        id: `current-event-${index}`,
        ts: index + 1,
        min: 1,
        len: 25,
        kind: 'focused' as const,
        src: 'checkin' as const,
      })),
    );
    const incomingSessions = createBackupEnvelope(
      { ...stateWithData(), sessionRecords: sessions('incoming', 260) },
      [],
    );
    expect(() => prepareImport(incomingSessions, current)).toThrowError(
      expect.objectContaining({ code: 'conflict' }),
    );

    const incomingEvents = createBackupEnvelope(
      { ...stateWithData(), sessionRecords: [] },
      Array.from({ length: 210 }, (_, index) => ({
        id: `incoming-event-${index}`,
        ts: index + 1,
        min: 1,
        len: 25,
        kind: 'focused' as const,
        src: 'checkin' as const,
      })),
    );
    const currentWithoutSessions = createBackupEnvelope(
      { ...stateWithData(), sessionRecords: [] },
      current.companion.events,
    );
    expect(() => prepareImport(incomingEvents, currentWithoutSessions)).toThrowError(
      expect.objectContaining({ code: 'conflict' }),
    );
  });

  it('rolls both live keys back after an injected commit failure', () => {
    const storage = new MemoryStorage();
    const current = createBackupEnvelope(
      persistedShapeFromState(DEFAULT_STATE),
      [],
      1,
    );
    const priorMain = JSON.stringify(current.bloom);
    const priorCompanion = JSON.stringify({ version: 2, events: [] });
    storage.setItem(BLOOM_STORAGE_KEY, priorMain);
    storage.setItem(COMPANION_STORAGE_KEY, priorCompanion);
    const prepared = prepareImport(createBackupEnvelope(stateWithData(), []), current);
    storage.failOnSet = COMPANION_STORAGE_KEY;

    expect(() => commitPreparedImport(prepared, storage)).toThrowError(
      expect.objectContaining({ code: 'storage', recoveryRequired: false }),
    );
    expect(storage.getItem(BLOOM_STORAGE_KEY)).toBe(priorMain);
    expect(storage.getItem(COMPANION_STORAGE_KEY)).toBe(priorCompanion);
    expect(storage.getItem(IMPORT_RECOVERY_KEY)).not.toBeNull();
  });

  it('reports a rollback failure truthfully and retains the recovery envelope', () => {
    const storage = new MemoryStorage();
    const current = createBackupEnvelope(persistedShapeFromState(DEFAULT_STATE), [], 1);
    storage.setItem(BLOOM_STORAGE_KEY, JSON.stringify(current.bloom));
    storage.setItem(COMPANION_STORAGE_KEY, JSON.stringify({ version: 2, events: [] }));
    const prepared = prepareImport(createBackupEnvelope(stateWithData(), []), current);
    storage.failOnSet = COMPANION_STORAGE_KEY;
    storage.failOnSetTimes = 2;

    expect(() => commitPreparedImport(prepared, storage)).toThrowError(
      expect.objectContaining({
        code: 'storage',
        message: expect.stringContaining('could not be saved or fully rolled back'),
        recoveryRequired: true,
      }),
    );
    expect(storage.getItem(IMPORT_RECOVERY_KEY)).toBe(serializeBackup(current));
  });

  it('streams progress and honors cancellation before commit', async () => {
    const controller = new AbortController();
    const chunks = [
      new TextEncoder().encode('{"format":'),
      new TextEncoder().encode('"bloom-backup"}'),
    ];
    let read = 0;
    const file = {
      size: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
      stream: () =>
        new ReadableStream<Uint8Array>({
          pull(stream) {
            const chunk = chunks[read++];
            if (chunk) stream.enqueue(chunk);
            else stream.close();
          },
        }),
    } as File;
    const progress: number[] = [];

    await expect(
      readBackupFile(file, controller.signal, (percent) => {
        progress.push(percent);
        controller.abort();
      }),
    ).rejects.toMatchObject({ code: 'canceled' });
    expect(progress).toHaveLength(1);
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress[0]).toBeLessThan(100);
  });

  it('writes spreadsheet-friendly CSV and neutralizes formulas', () => {
    const csv = sessionRecordsCsv([session]);
    expect(csv).toContain('"started_at","ended_at","mode"');
    expect(csv).toContain('"2026-07-20T08:00:00.000Z"');
    expect(csv).toContain('"\'=SUM(A1:A2)"');
    expect(csv).toContain('"drift_moments"');
  });
});
