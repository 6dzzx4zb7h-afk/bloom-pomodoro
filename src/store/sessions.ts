/**
 * Per-session records — data layer.
 *
 * Types and pure helpers for the session log: one `SessionRecord` per focus /
 * flow / tiny-start session, persisted inside the main bloom-state blob (see
 * useBloom.ts). No React in here. The log is the raw material every later
 * insight explains itself from — debriefs, weekly reviews, cadence
 * suggestions all read these records rather than asking the user to
 * self-report (docs/science.md#measurement: monitoring works best when the
 * behavior is actually recorded — Harkin et al. 2016).
 *
 * Records are written by the timer lifecycle in useBloom.ts: an `OpenSession`
 * is created when a session starts running and finalized into a
 * `SessionRecord` when it completes or is abandoned. A session that was live
 * when the app closed is finalized as 'interrupted' by the boot-time sweep.
 */

/** 'tiny' is the 2/5-minute starter (and its optional next rung); breaks are never recorded. */
export type SessionMode = 'focus' | 'flow' | 'tiny';

export type SessionOutcome = 'completed' | 'abandoned' | 'interrupted';

export interface SessionRecord {
  id: string;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms. */
  endedAt: number;
  mode: SessionMode;
  /** Configured length in minutes; null for flow (a stopwatch has no plan). */
  plannedMin: number | null;
  /** Minutes actually spent before the session ended, however it ended. */
  actualMin: number;
  outcome: SessionOutcome;
  /** Local hour (0–23) the session started — feeds time-of-day stats. */
  startHour: number;
  /** Task the session was credited to, if any. */
  taskId?: number;
  /** Planner goal the session counted toward, if any. */
  goalId?: number;
  /** Companion drift events triaged during this session (linked later). */
  driftEventIds: string[];
  /** The "one specific doable thing" typed at start, if any. */
  targetText?: string;
  /** If–then plan the session started with, if any (PLAN 3.2). */
  ifThenPlanId?: string;
}

/** Ring-buffer cap: only the most recent records are kept in localStorage. */
export const SESSION_LOG_CAP = 500;

let idCounter = 0;

/** Unique-enough id for a local, single-user log. */
export function newSessionId(now = Date.now()): string {
  idCounter = (idCounter + 1) % 1000;
  return `s-${now.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Append one record, dropping the oldest past the cap. Pure. */
export function appendSessionRecord(
  records: SessionRecord[],
  record: SessionRecord,
): SessionRecord[] {
  return [...records, record].slice(-SESSION_LOG_CAP);
}

const MODES: SessionMode[] = ['focus', 'flow', 'tiny'];
const OUTCOMES: SessionOutcome[] = ['completed', 'abandoned', 'interrupted'];

function isValidRecord(r: unknown): r is SessionRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.startedAt === 'number' &&
    Number.isFinite(x.startedAt) &&
    typeof x.endedAt === 'number' &&
    Number.isFinite(x.endedAt) &&
    MODES.includes(x.mode as SessionMode) &&
    (x.plannedMin === null || (typeof x.plannedMin === 'number' && Number.isFinite(x.plannedMin))) &&
    typeof x.actualMin === 'number' &&
    Number.isFinite(x.actualMin) &&
    OUTCOMES.includes(x.outcome as SessionOutcome) &&
    typeof x.startHour === 'number' &&
    x.startHour >= 0 &&
    x.startHour <= 23 &&
    (x.taskId === undefined || typeof x.taskId === 'number') &&
    (x.goalId === undefined || typeof x.goalId === 'number') &&
    Array.isArray(x.driftEventIds) &&
    (x.driftEventIds as unknown[]).every((d) => typeof d === 'string') &&
    (x.targetText === undefined || typeof x.targetText === 'string') &&
    (x.ifThenPlanId === undefined || typeof x.ifThenPlanId === 'string')
  );
}

/**
 * Load-time guard: whatever is in storage, come back with a well-formed,
 * capped log. Malformed entries are dropped individually rather than wiping
 * the whole array.
 */
export function sanitizeSessionRecords(raw: unknown): SessionRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidRecord).slice(-SESSION_LOG_CAP);
}

/**
 * A session that has started but not yet ended. Persisted so a force-closed
 * session can be finalized as 'interrupted' on next boot.
 */
export interface OpenSession {
  id: string;
  /** Epoch ms. */
  startedAt: number;
  mode: SessionMode;
  /** Configured length in minutes; null for flow. */
  plannedMin: number | null;
  /** Local hour (0–23) the session started. */
  startHour: number;
  /** Task the session will be credited to, if any. */
  taskId?: number;
  /**
   * Countdown bookkeeping for the boot-time sweep — meaningful for focus and
   * tiny sessions (flow keeps its own clock in the persisted flow state).
   */
  endsAt: number | null;
  /** Remaining seconds at the last pause (focus/tiny only). */
  remainingSec: number;
  running: boolean;
  /** Companion drift events triaged while this session runs (PLAN 1.3). */
  driftEventIds: string[];
  /** If–then plan the session started with, if any (PLAN 3.2). */
  ifThenPlanId?: string;
}

/** Start bookkeeping for a session that just began running. */
export function newOpenSession(
  mode: SessionMode,
  plannedMin: number | null,
  taskId: number | undefined,
  ifThenPlanId?: string,
  now = Date.now(),
): OpenSession {
  return {
    id: newSessionId(now),
    startedAt: now,
    mode,
    plannedMin,
    startHour: new Date(now).getHours(),
    taskId,
    endsAt: null,
    remainingSec: plannedMin != null ? plannedMin * 60 : 0,
    running: true,
    driftEventIds: [],
    ifThenPlanId,
  };
}

/** Close an open session into a permanent record. Pure. */
export function finalizeSession(
  open: OpenSession,
  outcome: SessionOutcome,
  actualMin: number,
  endedAt = Date.now(),
): SessionRecord {
  return {
    id: open.id,
    startedAt: open.startedAt,
    endedAt,
    mode: open.mode,
    plannedMin: open.plannedMin,
    actualMin: Math.max(0, Math.round(actualMin * 10) / 10),
    outcome,
    startHour: open.startHour,
    taskId: open.taskId,
    driftEventIds: [...(open.driftEventIds ?? [])],
    ifThenPlanId: open.ifThenPlanId,
  };
}

/**
 * Boot-time sweep for a session that was live when the app closed. A focus
 * countdown doesn't survive a reload, so its open record is finalized as
 * 'interrupted'. Flow is exempt: the stopwatch deliberately keeps counting
 * across reloads, so its record stays open until finish/reset. Returns the
 * finalized record, or null when the open session should stay open.
 */
export function sweepStaleOpenSession(open: OpenSession, now = Date.now()): SessionRecord | null {
  if (open.mode === 'flow') return null;
  const plannedSec = (open.plannedMin ?? 0) * 60;
  // Best estimate of the time actually focused: we can't know exactly when
  // the app closed, so a run whose end time already passed counts as its
  // full length, and one caught mid-countdown counts wall-clock time so far.
  const remainingSec =
    open.running && open.endsAt != null ? Math.max(0, (open.endsAt - now) / 1000) : open.remainingSec;
  const actualMin = Math.max(0, Math.min(plannedSec, plannedSec - remainingSec)) / 60;
  const endedAt = open.running && open.endsAt != null ? Math.min(now, open.endsAt) : now;
  return finalizeSession(open, 'interrupted', actualMin, endedAt);
}

/** Load-time guard for the persisted open-session slots. */
export function sanitizeOpenSession(raw: unknown): OpenSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  const ok =
    typeof x.id === 'string' &&
    typeof x.startedAt === 'number' &&
    Number.isFinite(x.startedAt) &&
    MODES.includes(x.mode as SessionMode) &&
    (x.plannedMin === null || (typeof x.plannedMin === 'number' && Number.isFinite(x.plannedMin))) &&
    typeof x.startHour === 'number' &&
    x.startHour >= 0 &&
    x.startHour <= 23 &&
    (x.taskId === undefined || typeof x.taskId === 'number') &&
    (x.endsAt === null || (typeof x.endsAt === 'number' && Number.isFinite(x.endsAt))) &&
    typeof x.remainingSec === 'number' &&
    Number.isFinite(x.remainingSec) &&
    typeof x.running === 'boolean';
  if (!ok) return null;
  // Normalize the drift-id list rather than reject: a missing or malformed
  // list (pre-1.3 blob) just means no linked drifts.
  const driftEventIds = Array.isArray(x.driftEventIds)
    ? (x.driftEventIds as unknown[]).filter((d): d is string => typeof d === 'string')
    : [];
  // Optional plan link (PLAN 3.2): anything but a string means "no plan".
  const ifThenPlanId = typeof x.ifThenPlanId === 'string' ? x.ifThenPlanId : undefined;
  return { ...(raw as OpenSession), driftEventIds, ifThenPlanId };
}
