import { describe, expect, it } from 'vitest';
import {
  appendCompletedTaskArchiveRow,
  appendSessionRecordWithArchive,
  archiveSessionRecords,
  completedTaskArchiveRow,
  emptyHistoryArchive,
  historyArchiveDaySummaries,
  removeCompletedTaskArchiveRow,
  sanitizeHistoryArchive,
} from './historyArchive';
import type { SessionRecord } from './sessions';

const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) => new Date(year, month - 1, day, hour, minute).getTime();

function record(
  id: string,
  endedAt: number,
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    startedAt: endedAt - 25 * 60_000,
    endedAt,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome: 'completed',
    startHour: new Date(endedAt - 25 * 60_000).getHours(),
    driftEventIds: [],
    ...overrides,
  };
}

describe('history archive session compaction', () => {
  it('moves every record displaced past the live cap into a deterministic summary', () => {
    const existing = Array.from({ length: 500 }, (_, index) =>
      record(`session-${index}`, at(2026, 7, 1, 10), {
        actualMin: index === 0 ? 12.5 : 25,
        outcome: index === 0 ? 'interrupted' : 'completed',
        driftEventIds: index === 0 ? ['drift-a', 'drift-a', 'drift-b'] : [],
      }),
    );
    const appended = record('session-500', at(2026, 7, 2, 11));

    const result = appendSessionRecordWithArchive(
      existing,
      emptyHistoryArchive(),
      appended,
    );

    expect(result.archivedRecordCount).toBe(1);
    expect(result.records).toHaveLength(500);
    expect(result.records[0].id).toBe('session-1');
    expect(result.records[result.records.length - 1]?.id).toBe('session-500');
    expect(historyArchiveDaySummaries(result.archive)).toEqual([
      {
        dayKey: '2026-07-01',
        focusMinutes: 12.5,
        sessionCount: 1,
        completedSessionCount: 0,
        driftCount: 2,
        recoveryCount: 0,
        completedTaskCount: 0,
      },
    ]);
  });

  it('merges repeated evictions from one day without losing counts', () => {
    const first = archiveSessionRecords(emptyHistoryArchive(), [
      record('one', at(2026, 7, 4, 9), {
        actualMin: 15,
        driftEventIds: ['drift-one'],
      }),
    ]);
    const second = archiveSessionRecords(first, [
      record('two', at(2026, 7, 4, 9, 30), {
        actualMin: 8,
        outcome: 'abandoned',
        driftEventIds: ['drift-two', 'drift-three'],
      }),
    ]);

    expect(second.hours).toHaveLength(1);
    expect(historyArchiveDaySummaries(second)).toEqual([
      {
        dayKey: '2026-07-04',
        focusMinutes: 23,
        sessionCount: 2,
        completedSessionCount: 1,
        driftCount: 3,
        recoveryCount: 1,
        completedTaskCount: 0,
      },
    ]);
  });

  it('re-groups archived hours when the study-day boundary changes', () => {
    const archive = archiveSessionRecords(emptyHistoryArchive(), [
      record('late', at(2026, 7, 5, 2, 30)),
      record('morning', at(2026, 7, 5, 8)),
    ]);

    expect(historyArchiveDaySummaries(archive, 0).map((day) => day.dayKey)).toEqual([
      '2026-07-05',
    ]);
    expect(historyArchiveDaySummaries(archive, 4)).toEqual([
      {
        dayKey: '2026-07-05',
        focusMinutes: 25,
        sessionCount: 1,
        completedSessionCount: 1,
        driftCount: 0,
        recoveryCount: 0,
        completedTaskCount: 0,
      },
      {
        dayKey: '2026-07-04',
        focusMinutes: 25,
        sessionCount: 1,
        completedSessionCount: 1,
        driftCount: 0,
        recoveryCount: 0,
        completedTaskCount: 0,
      },
    ]);
  });

  it('archives all pre-existing overflow, not only the newly appended row', () => {
    const existing = Array.from({ length: 5 }, (_, index) =>
      record(`session-${index}`, at(2026, 7, 6, 10 + index)),
    );
    const result = appendSessionRecordWithArchive(
      existing,
      emptyHistoryArchive(),
      record('session-5', at(2026, 7, 6, 15)),
      3,
    );

    expect(result.archivedRecordCount).toBe(3);
    expect(result.records.map((item) => item.id)).toEqual([
      'session-3',
      'session-4',
      'session-5',
    ]);
    expect(historyArchiveDaySummaries(result.archive)[0]).toMatchObject({
      sessionCount: 3,
      completedSessionCount: 3,
      focusMinutes: 75,
    });
  });
});

describe('history archive completed tasks', () => {
  it('keeps a timestamp-backed task row, dedupes delivery, and derives its study day', () => {
    const row = completedTaskArchiveRow({
      taskId: 7,
      title: '  Draft the introduction  ',
      completedAt: at(2026, 7, 7, 1, 30),
    });
    expect(row).not.toBeNull();

    const once = appendCompletedTaskArchiveRow(emptyHistoryArchive(), row!);
    const twice = appendCompletedTaskArchiveRow(once, row!);

    expect(twice.completedTasks).toEqual([
      {
        id: `task-7:${at(2026, 7, 7, 1, 30)}`,
        taskId: 7,
        title: 'Draft the introduction',
        completedAt: at(2026, 7, 7, 1, 30),
      },
    ]);
    expect(historyArchiveDaySummaries(twice, 4)[0]).toMatchObject({
      dayKey: '2026-07-06',
      completedTaskCount: 1,
    });
  });

  it('requires a real completion timestamp and removes a reopened completion', () => {
    expect(
      completedTaskArchiveRow({
        taskId: 4,
        title: 'No invented date',
        completedAt: Number.NaN,
      }),
    ).toBeNull();

    const row = completedTaskArchiveRow({
      taskId: 4,
      title: 'Review notes',
      completedAt: at(2026, 7, 8, 14),
    })!;
    const archive = appendCompletedTaskArchiveRow(emptyHistoryArchive(), row);
    expect(removeCompletedTaskArchiveRow(archive, row.id).completedTasks).toEqual([]);
  });
});

describe('history archive sanitization and caps', () => {
  it('drops malformed rows, merges duplicate hours, and makes ordering deterministic', () => {
    const sanitized = sanitizeHistoryArchive({
      hours: [
        {
          calendarDay: '2026-07-10',
          hour: 11,
          focusMinutes: 10,
          sessionCount: 1,
          completedSessionCount: 1,
          driftCount: 1,
          recoveryCount: 1,
        },
        {
          calendarDay: '2026-07-09',
          hour: 9,
          focusMinutes: 5,
          sessionCount: 1,
          completedSessionCount: 0,
          driftCount: 0,
          recoveryCount: 0,
        },
        {
          calendarDay: '2026-07-10',
          hour: 11,
          focusMinutes: 15,
          sessionCount: 2,
          completedSessionCount: 1,
          driftCount: 2,
          recoveryCount: 0,
        },
        { calendarDay: '2026-02-30', hour: 4, sessionCount: 99 },
        { calendarDay: '2026-07-10', hour: 44, sessionCount: 99 },
      ],
      completedTasks: [{ id: '', taskId: 1, title: 'bad', completedAt: 1 }],
      overflow: { sessionCount: Number.POSITIVE_INFINITY },
    });

    expect(sanitized.hours).toEqual([
      expect.objectContaining({
        calendarDay: '2026-07-09',
        sessionCount: 1,
      }),
      {
        calendarDay: '2026-07-10',
        hour: 11,
        focusMinutes: 25,
        sessionCount: 3,
        completedSessionCount: 2,
        driftCount: 3,
        recoveryCount: 1,
      },
    ]);
    expect(sanitized.completedTasks).toEqual([]);
    expect(sanitized.overflow.sessionCount).toBe(0);
  });

  it('preserves totals explicitly when defensive detail caps are reached', () => {
    const archive = archiveSessionRecords(
      emptyHistoryArchive(),
      [
        record('one', at(2026, 7, 11, 8), { actualMin: 10 }),
        record('two', at(2026, 7, 11, 9), { actualMin: 20 }),
        record('three', at(2026, 7, 11, 10), {
          actualMin: 30,
          outcome: 'interrupted',
          driftEventIds: ['drift'],
        }),
      ],
      { hourBucketCap: 2 },
    );

    expect(archive.hours).toHaveLength(2);
    expect(archive.overflow).toMatchObject({
      hourBucketCount: 1,
      focusMinutes: 10,
      sessionCount: 1,
      completedSessionCount: 1,
      driftCount: 0,
      recoveryCount: 0,
    });

    const rows = [
      completedTaskArchiveRow({
        taskId: 1,
        title: 'One',
        completedAt: at(2026, 7, 1, 9),
      })!,
      completedTaskArchiveRow({
        taskId: 2,
        title: 'Two',
        completedAt: at(2026, 7, 2, 9),
      })!,
    ];
    const withTasks = rows.reduce(
      (current, row) =>
        appendCompletedTaskArchiveRow(current, row, { completedTaskCap: 1 }),
      archive,
    );

    expect(withTasks.completedTasks.map((row) => row.taskId)).toEqual([2]);
    expect(withTasks.overflow.completedTaskCount).toBe(1);
  });
});
