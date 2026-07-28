import { dayKeyFor, normalizeDayStartHour } from './dayKey';
import {
  SESSION_LOG_CAP,
  isValidSessionRecord,
  type SessionRecord,
} from './sessions';

/**
 * PLAN 9.3 archive core.
 *
 * The live session log remains bounded, but records evicted from it are folded
 * into local-calendar hour buckets. Hour buckets are still compact (at most
 * one row for an active hour) while retaining enough information to re-group
 * them when the user changes their study-day boundary.
 */

export const HISTORY_ARCHIVE_HOUR_BUCKET_CAP = 48_000;
export const HISTORY_ARCHIVE_TASK_CAP = 20_000;
export const HISTORY_ARCHIVE_TASK_TITLE_MAX = 120;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ARCHIVE_NUMBER = Number.MAX_SAFE_INTEGER;

export interface HistoryArchiveHourBucket {
  /** Local calendar day containing the session end, before study-day shifting. */
  calendarDay: string;
  /** Local clock hour containing the session end. */
  hour: number;
  focusMinutes: number;
  sessionCount: number;
  completedSessionCount: number;
  driftCount: number;
  recoveryCount: number;
}

/**
 * Timestamp-backed snapshot of a task completion. Keeping the timestamp,
 * rather than only a day key, lets History re-bucket the row after a study-day
 * boundary change and avoids inventing dates for legacy completions.
 */
export interface CompletedTaskArchiveRow {
  id: string;
  taskId: number;
  title: string;
  completedAt: number;
}

/**
 * Totals folded out of malformed or extraordinarily large imports. The
 * detailed limits are deliberately generous; if reached, totals survive
 * instead of disappearing silently.
 */
export interface HistoryArchiveOverflow {
  hourBucketCount: number;
  focusMinutes: number;
  sessionCount: number;
  completedSessionCount: number;
  driftCount: number;
  recoveryCount: number;
  completedTaskCount: number;
}

export interface HistoryArchive {
  hours: HistoryArchiveHourBucket[];
  completedTasks: CompletedTaskArchiveRow[];
  overflow: HistoryArchiveOverflow;
}

export interface HistoryArchiveDaySummary {
  dayKey: string;
  focusMinutes: number;
  sessionCount: number;
  completedSessionCount: number;
  driftCount: number;
  recoveryCount: number;
  completedTaskCount: number;
}

export interface HistoryArchiveLimits {
  hourBucketCap?: number;
  completedTaskCap?: number;
}

export interface AppendSessionWithArchiveResult {
  records: SessionRecord[];
  archive: HistoryArchive;
  /** Exact count moved from the live log in this append. */
  archivedRecordCount: number;
}

export function emptyHistoryArchive(): HistoryArchive {
  return {
    hours: [],
    completedTasks: [],
    overflow: emptyOverflow(),
  };
}

function emptyOverflow(): HistoryArchiveOverflow {
  return {
    hourBucketCount: 0,
    focusMinutes: 0,
    sessionCount: 0,
    completedSessionCount: 0,
    driftCount: 0,
    recoveryCount: 0,
    completedTaskCount: 0,
  };
}

function boundedNumber(raw: unknown, integer = false): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  const value = integer ? Math.floor(raw) : raw;
  return Math.min(value, MAX_ARCHIVE_NUMBER);
}

function safeAdd(left: number, right: number): number {
  return Math.min(MAX_ARCHIVE_NUMBER, left + right);
}

function validCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !DAY_KEY_RE.test(day)) return false;
  const [year, month, date] = day.split('-').map(Number);
  const check = new Date(year, month - 1, date, 12);
  return (
    check.getFullYear() === year &&
    check.getMonth() === month - 1 &&
    check.getDate() === date
  );
}

function localCalendarDay(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function bucketKey(bucket: Pick<HistoryArchiveHourBucket, 'calendarDay' | 'hour'>): string {
  return `${bucket.calendarDay}:${String(bucket.hour).padStart(2, '0')}`;
}

function studyDayForBucket(
  bucket: Pick<HistoryArchiveHourBucket, 'calendarDay' | 'hour'>,
  dayStartHour: number,
): string {
  const [year, month, date] = bucket.calendarDay.split('-').map(Number);
  // The middle of the recorded local hour is only a representative timestamp;
  // all actual bucketing still flows through PLAN 9.2's shared dayKeyFor.
  return dayKeyFor(
    new Date(year, month - 1, date, bucket.hour, 30).getTime(),
    dayStartHour,
  );
}

function mergeBucket(
  left: HistoryArchiveHourBucket,
  right: HistoryArchiveHourBucket,
): HistoryArchiveHourBucket {
  return {
    calendarDay: left.calendarDay,
    hour: left.hour,
    focusMinutes: safeAdd(left.focusMinutes, right.focusMinutes),
    sessionCount: safeAdd(left.sessionCount, right.sessionCount),
    completedSessionCount: safeAdd(
      left.completedSessionCount,
      right.completedSessionCount,
    ),
    driftCount: safeAdd(left.driftCount, right.driftCount),
    recoveryCount: safeAdd(left.recoveryCount, right.recoveryCount),
  };
}

function sanitizeBucket(raw: unknown): HistoryArchiveHourBucket | null {
  if (!raw || typeof raw !== 'object') return null;
  const bucket = raw as Record<string, unknown>;
  if (
    !validCalendarDay(bucket.calendarDay) ||
    typeof bucket.hour !== 'number' ||
    !Number.isInteger(bucket.hour) ||
    bucket.hour < 0 ||
    bucket.hour > 23
  ) {
    return null;
  }
  return {
    calendarDay: bucket.calendarDay,
    hour: bucket.hour,
    focusMinutes: boundedNumber(bucket.focusMinutes),
    sessionCount: boundedNumber(bucket.sessionCount, true),
    completedSessionCount: boundedNumber(bucket.completedSessionCount, true),
    driftCount: boundedNumber(bucket.driftCount, true),
    recoveryCount: boundedNumber(bucket.recoveryCount, true),
  };
}

function sanitizeTaskRow(raw: unknown): CompletedTaskArchiveRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    row.id.length === 0 ||
    row.id.length > 180 ||
    typeof row.taskId !== 'number' ||
    !Number.isSafeInteger(row.taskId) ||
    typeof row.title !== 'string' ||
    row.title.trim().length === 0 ||
    typeof row.completedAt !== 'number' ||
    !Number.isFinite(row.completedAt) ||
    row.completedAt < 0
  ) {
    return null;
  }
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title.trim().slice(0, HISTORY_ARCHIVE_TASK_TITLE_MAX),
    completedAt: row.completedAt,
  };
}

function sanitizeOverflow(raw: unknown): HistoryArchiveOverflow {
  if (!raw || typeof raw !== 'object') return emptyOverflow();
  const overflow = raw as Record<string, unknown>;
  return {
    hourBucketCount: boundedNumber(overflow.hourBucketCount, true),
    focusMinutes: boundedNumber(overflow.focusMinutes),
    sessionCount: boundedNumber(overflow.sessionCount, true),
    completedSessionCount: boundedNumber(overflow.completedSessionCount, true),
    driftCount: boundedNumber(overflow.driftCount, true),
    recoveryCount: boundedNumber(overflow.recoveryCount, true),
    completedTaskCount: boundedNumber(overflow.completedTaskCount, true),
  };
}

function normalizedLimit(raw: number | undefined, fallback: number): number {
  if (raw === undefined || !Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.floor(raw));
}

function addBucketToOverflow(
  overflow: HistoryArchiveOverflow,
  bucket: HistoryArchiveHourBucket,
): HistoryArchiveOverflow {
  return {
    ...overflow,
    hourBucketCount: safeAdd(overflow.hourBucketCount, 1),
    focusMinutes: safeAdd(overflow.focusMinutes, bucket.focusMinutes),
    sessionCount: safeAdd(overflow.sessionCount, bucket.sessionCount),
    completedSessionCount: safeAdd(
      overflow.completedSessionCount,
      bucket.completedSessionCount,
    ),
    driftCount: safeAdd(overflow.driftCount, bucket.driftCount),
    recoveryCount: safeAdd(overflow.recoveryCount, bucket.recoveryCount),
  };
}

/**
 * Total load guard for the archive slice. Duplicate hour rows merge
 * additively, duplicate task rows merge by stable id, and detailed overflow
 * is represented by explicit totals rather than silently discarded.
 */
export function sanitizeHistoryArchive(
  raw: unknown,
  limits: HistoryArchiveLimits = {},
): HistoryArchive {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mergedBuckets = new Map<string, HistoryArchiveHourBucket>();
  const rawHours = Array.isArray(source.hours) ? source.hours : [];
  for (const rawBucket of rawHours) {
    const bucket = sanitizeBucket(rawBucket);
    if (!bucket) continue;
    const key = bucketKey(bucket);
    const existing = mergedBuckets.get(key);
    mergedBuckets.set(key, existing ? mergeBucket(existing, bucket) : bucket);
  }

  let overflow = sanitizeOverflow(source.overflow);
  const hourCap = normalizedLimit(
    limits.hourBucketCap,
    HISTORY_ARCHIVE_HOUR_BUCKET_CAP,
  );
  const hours = [...mergedBuckets.values()].sort((a, b) =>
    bucketKey(a).localeCompare(bucketKey(b)),
  );
  const excessHours = Math.max(0, hours.length - hourCap);
  for (const bucket of hours.slice(0, excessHours)) {
    overflow = addBucketToOverflow(overflow, bucket);
  }

  const tasksById = new Map<string, CompletedTaskArchiveRow>();
  const rawTasks = Array.isArray(source.completedTasks)
    ? source.completedTasks
    : [];
  for (const rawTask of rawTasks) {
    const row = sanitizeTaskRow(rawTask);
    if (!row) continue;
    const existing = tasksById.get(row.id);
    if (
      !existing ||
      row.completedAt > existing.completedAt ||
      (row.completedAt === existing.completedAt &&
        row.title.localeCompare(existing.title) < 0)
    ) {
      tasksById.set(row.id, row);
    }
  }

  const taskCap = normalizedLimit(
    limits.completedTaskCap,
    HISTORY_ARCHIVE_TASK_CAP,
  );
  const completedTasks = [...tasksById.values()].sort(
    (a, b) => a.completedAt - b.completedAt || a.id.localeCompare(b.id),
  );
  const excessTasks = Math.max(0, completedTasks.length - taskCap);
  overflow = {
    ...overflow,
    completedTaskCount: safeAdd(
      overflow.completedTaskCount,
      excessTasks,
    ),
  };

  return {
    hours: hours.slice(excessHours),
    completedTasks: completedTasks.slice(excessTasks),
    overflow,
  };
}

function bucketForRecord(record: SessionRecord): HistoryArchiveHourBucket {
  const uniqueDrifts = new Set(record.driftEventIds).size;
  return {
    calendarDay: localCalendarDay(record.endedAt),
    hour: new Date(record.endedAt).getHours(),
    focusMinutes: Math.max(0, record.actualMin),
    sessionCount: 1,
    completedSessionCount: record.outcome === 'completed' ? 1 : 0,
    driftCount: uniqueDrifts,
    recoveryCount:
      record.outcome === 'completed' && uniqueDrifts > 0 ? 1 : 0,
  };
}

/** Fold finalized records into compact hour buckets without mutating input. */
export function archiveSessionRecords(
  archive: HistoryArchive,
  records: readonly SessionRecord[],
  limits: HistoryArchiveLimits = {},
): HistoryArchive {
  const current = sanitizeHistoryArchive(archive, limits);
  const additions = records.filter(isValidSessionRecord).map(bucketForRecord);
  return sanitizeHistoryArchive(
    {
      ...current,
      hours: [...current.hours, ...additions],
    },
    limits,
  );
}

/**
 * Drop-in archive-aware counterpart to `appendSessionRecord`.
 *
 * All records displaced past the live cap are compacted in the same pure
 * operation. Callers must persist both returned values together.
 */
export function appendSessionRecordWithArchive(
  records: readonly SessionRecord[],
  archive: HistoryArchive,
  record: SessionRecord,
  liveCap = SESSION_LOG_CAP,
  limits: HistoryArchiveLimits = {},
): AppendSessionWithArchiveResult {
  const cap = Math.max(0, Math.floor(liveCap));
  const combined = [...records, record];
  const archivedRecordCount = Math.max(0, combined.length - cap);
  const evicted = combined.slice(0, archivedRecordCount);
  return {
    records: combined.slice(archivedRecordCount),
    archive: archiveSessionRecords(archive, evicted, limits),
    archivedRecordCount,
  };
}

export interface CompletedTaskArchiveInput {
  taskId: number;
  title: string;
  completedAt: number;
}

/** Create a deterministic task-completion row only when a real timestamp exists. */
export function completedTaskArchiveRow(
  input: CompletedTaskArchiveInput,
): CompletedTaskArchiveRow | null {
  return sanitizeTaskRow({
    id: `task-${input.taskId}:${input.completedAt}`,
    ...input,
  });
}

/** Upsert one stable completion row; duplicate delivery remains one row. */
export function appendCompletedTaskArchiveRow(
  archive: HistoryArchive,
  row: CompletedTaskArchiveRow,
  limits: HistoryArchiveLimits = {},
): HistoryArchive {
  const current = sanitizeHistoryArchive(archive, limits);
  return sanitizeHistoryArchive(
    {
      ...current,
      completedTasks: [...current.completedTasks, row],
    },
    limits,
  );
}

/** Remove a completion when its task is explicitly reopened. */
export function removeCompletedTaskArchiveRow(
  archive: HistoryArchive,
  rowId: string,
): HistoryArchive {
  const current = sanitizeHistoryArchive(archive);
  return {
    ...current,
    completedTasks: current.completedTasks.filter((row) => row.id !== rowId),
  };
}

/**
 * Re-group compact hour buckets and timestamped task rows for the configured
 * study-day boundary. Newest study day is first for ledger paging.
 */
export function historyArchiveDaySummaries(
  archive: HistoryArchive,
  dayStartHour = 0,
): HistoryArchiveDaySummary[] {
  const current = sanitizeHistoryArchive(archive);
  const boundary = normalizeDayStartHour(dayStartHour);
  const byDay = new Map<string, HistoryArchiveDaySummary>();
  const ensureDay = (dayKey: string): HistoryArchiveDaySummary => {
    const existing = byDay.get(dayKey);
    if (existing) return existing;
    const created: HistoryArchiveDaySummary = {
      dayKey,
      focusMinutes: 0,
      sessionCount: 0,
      completedSessionCount: 0,
      driftCount: 0,
      recoveryCount: 0,
      completedTaskCount: 0,
    };
    byDay.set(dayKey, created);
    return created;
  };

  for (const bucket of current.hours) {
    const dayKey = studyDayForBucket(bucket, boundary);
    const day = ensureDay(dayKey);
    day.focusMinutes = safeAdd(day.focusMinutes, bucket.focusMinutes);
    day.sessionCount = safeAdd(day.sessionCount, bucket.sessionCount);
    day.completedSessionCount = safeAdd(
      day.completedSessionCount,
      bucket.completedSessionCount,
    );
    day.driftCount = safeAdd(day.driftCount, bucket.driftCount);
    day.recoveryCount = safeAdd(day.recoveryCount, bucket.recoveryCount);
  }

  for (const task of current.completedTasks) {
    const dayKey = dayKeyFor(task.completedAt, boundary);
    const day = ensureDay(dayKey);
    day.completedTaskCount = safeAdd(day.completedTaskCount, 1);
  }

  return [...byDay.values()].sort((a, b) =>
    b.dayKey.localeCompare(a.dayKey),
  );
}
