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

/** Optional self-report for the session's concrete target (PLAN 4.2). */
export type TargetOutcome = 'done' | 'partly' | 'no';
/** Durable resolution for one offered goal-progress credit. */
export type GoalCreditStatus = 'pending' | 'credited' | 'skipped';

/** A return check only appears for a gap long enough to be meaningful. */
export const RETURN_GAP_MIN_SEC = 45;

/**
 * Persisted timer state captured the instant a running work tab goes away.
 * Seconds use the timer's own whole-second precision, so "pause it back"
 * restores exactly what the user saw before leaving (PLAN 5.2).
 */
export interface TimerSnapshot {
  capturedAt: number;
  /** Set once the user is back and the gap passed RETURN_GAP_MIN_SEC. */
  returnedAt?: number;
  elapsedSec: number;
  remainingSec: number;
  mode: SessionMode;
  /** One-based Pomodoro round inside the current four-session cycle. */
  round: number;
  sessionId: string;
}

export type ReturnResolution = 'focused' | 'drifted' | 'pauseBack';

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
  /**
   * Resolution of the one-part goal credit offered for this completed
   * session. Absent means no credit was offered (for example, the feature was
   * off or the linked goal was already complete).
   */
  goalCredit?: GoalCreditStatus;
  /** Companion drift events triaged during this session (linked later). */
  driftEventIds: string[];
  /** The "one specific doable thing" typed at start, if any. */
  targetText?: string;
  /** How the user says that target went; absent until they answer the debrief. */
  targetOutcome?: TargetOutcome;
  /** If–then plan the session started with, if any (PLAN 3.2). */
  ifThenPlanId?: string;
  /** The smallest visible action to restore after an interruption (PLAN 5.2). */
  nextActionText?: string;
  /**
   * Thoughts parked during this session. Stamped at finalization so removing
   * an individual parked note later does not rewrite the History ledger.
   */
  parkedThoughtCount?: number;
  /** Last tab-leave snapshot, retained on interrupted records for re-entry. */
  returnSnapshot?: TimerSnapshot;
  /** Reopening onto this interrupted record should offer its resume cue. */
  resumeCuePending?: boolean;
  /** True after a user repairs this record from History or its debrief. */
  edited?: true;
  /** Epoch ms when the latest repair was saved. Repaired values are estimates. */
  editedAt?: number;
}

/**
 * The one shared policy for day-level "finished work" signals. Keeping this
 * predicate beside the record model makes streaks and derived foundations
 * agree even as session modes evolve.
 */
export function sessionCountsTowardDay(
  record: Pick<SessionRecord, 'outcome'>,
): boolean {
  return record.outcome === 'completed';
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
const TARGET_OUTCOMES: TargetOutcome[] = ['done', 'partly', 'no'];
const GOAL_CREDIT_STATUSES: GoalCreditStatus[] = ['pending', 'credited', 'skipped'];

function isValidTimerSnapshot(raw: unknown, sessionId?: string): raw is TimerSnapshot {
  if (!raw || typeof raw !== 'object') return false;
  const x = raw as Record<string, unknown>;
  return (
    typeof x.capturedAt === 'number' &&
    Number.isFinite(x.capturedAt) &&
    (x.returnedAt === undefined ||
      (typeof x.returnedAt === 'number' && Number.isFinite(x.returnedAt))) &&
    typeof x.elapsedSec === 'number' &&
    Number.isFinite(x.elapsedSec) &&
    x.elapsedSec >= 0 &&
    typeof x.remainingSec === 'number' &&
    Number.isFinite(x.remainingSec) &&
    x.remainingSec >= 0 &&
    MODES.includes(x.mode as SessionMode) &&
    typeof x.round === 'number' &&
    Number.isFinite(x.round) &&
    x.round >= 1 &&
    x.round <= 4 &&
    typeof x.sessionId === 'string' &&
    (sessionId === undefined || x.sessionId === sessionId)
  );
}

export function isValidSessionRecord(r: unknown): r is SessionRecord {
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
    (x.goalCredit === undefined ||
      GOAL_CREDIT_STATUSES.includes(x.goalCredit as GoalCreditStatus)) &&
    Array.isArray(x.driftEventIds) &&
    (x.driftEventIds as unknown[]).every((d) => typeof d === 'string') &&
    (x.targetText === undefined || typeof x.targetText === 'string') &&
    (x.targetOutcome === undefined || TARGET_OUTCOMES.includes(x.targetOutcome as TargetOutcome)) &&
    (x.ifThenPlanId === undefined || typeof x.ifThenPlanId === 'string') &&
    (x.nextActionText === undefined || typeof x.nextActionText === 'string') &&
    (x.parkedThoughtCount === undefined ||
      (Number.isSafeInteger(x.parkedThoughtCount) && (x.parkedThoughtCount as number) >= 0)) &&
    (x.returnSnapshot === undefined || isValidTimerSnapshot(x.returnSnapshot, x.id as string)) &&
    (x.resumeCuePending === undefined || typeof x.resumeCuePending === 'boolean') &&
    (x.edited === undefined
      ? x.editedAt === undefined
      : x.edited === true &&
        typeof x.editedAt === 'number' &&
        Number.isFinite(x.editedAt) &&
        x.editedAt >= x.endedAt)
  );
}

/**
 * Load-time guard: whatever is in storage, come back with a well-formed,
 * capped log. Malformed entries are dropped individually rather than wiping
 * the whole array.
 */
export function sanitizeSessionRecords(raw: unknown): SessionRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSessionRecord).slice(-SESSION_LOG_CAP);
}

/** Save one target answer without disturbing the record's captured session data. */
export function setSessionTargetOutcome(
  records: SessionRecord[],
  sessionId: string,
  targetOutcome: TargetOutcome,
): SessionRecord[] {
  return records.map((record) =>
    record.id === sessionId && record.targetText
      ? { ...record, targetOutcome }
      : record,
  );
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
  /** Planner goal this session counts toward — stamped at start from the
   *  linked task (v20). Recording only: nothing auto-advances the goal. */
  goalId?: number;
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
  /** The concrete target captured when this session began (PLAN 4.2). */
  targetText?: string;
  /** If–then plan the session started with, if any (PLAN 3.2). */
  ifThenPlanId?: string;
  /** The next physical action to restore on return (PLAN 5.2). */
  nextActionText?: string;
  /** Persisted tab-leave/return question. Overwritten cleanly on each leave. */
  returnSnapshot?: TimerSnapshot;
}

/** Start bookkeeping for a session that just began running. */
export function newOpenSession(
  mode: SessionMode,
  plannedMin: number | null,
  taskId: number | undefined,
  ifThenPlanId?: string,
  now = Date.now(),
  goalId?: number,
): OpenSession {
  return {
    id: newSessionId(now),
    startedAt: now,
    mode,
    plannedMin,
    startHour: new Date(now).getHours(),
    taskId,
    goalId,
    endsAt: null,
    remainingSec: plannedMin != null ? plannedMin * 60 : 0,
    running: true,
    driftEventIds: [],
    ifThenPlanId,
  };
}

/** Capture one leave. A duplicate blur/visibility event never overwrites it. */
export function captureTimerSnapshot(
  open: OpenSession,
  remainingSec: number,
  round: number,
  now = Date.now(),
): OpenSession {
  if (open.returnSnapshot) return open;
  const plannedSec = Math.max(0, (open.plannedMin ?? 0) * 60);
  const remaining = Math.max(0, Math.min(plannedSec, Math.ceil(remainingSec)));
  return {
    ...open,
    returnSnapshot: {
      capturedAt: now,
      elapsedSec: Math.max(0, plannedSec - remaining),
      remainingSec: remaining,
      mode: open.mode,
      round: Math.max(1, Math.min(4, Math.round(round))),
      sessionId: open.id,
    },
  };
}

/**
 * Mark a return as prompt-worthy, or quietly discard a short blip. Repeated
 * focus/visibility events are idempotent, so one leave yields one question.
 */
export function markTimerReturn(
  open: OpenSession,
  returnedAt = Date.now(),
  thresholdSec = RETURN_GAP_MIN_SEC,
): { open: OpenSession; shouldPrompt: boolean } {
  const snapshot = open.returnSnapshot;
  if (!snapshot) return { open, shouldPrompt: false };
  if (snapshot.returnedAt != null) return { open, shouldPrompt: true };
  if (returnedAt - snapshot.capturedAt < Math.max(0, thresholdSec) * 1000) {
    const { returnSnapshot: _discarded, ...rest } = open;
    void _discarded;
    return { open: rest, shouldPrompt: false };
  }
  return {
    open: { ...open, returnSnapshot: { ...snapshot, returnedAt } },
    shouldPrompt: true,
  };
}

/** Resolve the persisted question without changing the session identity. */
export function resolveTimerReturn(
  open: OpenSession,
  resolution: ReturnResolution,
  now = Date.now(),
): OpenSession {
  const snapshot = open.returnSnapshot;
  if (!snapshot) return open;
  const { returnSnapshot: _resolved, ...rest } = open;
  void _resolved;
  if (resolution === 'pauseBack') {
    return {
      ...rest,
      running: false,
      endsAt: null,
      remainingSec: snapshot.remainingSec,
    };
  }
  // Drifting away doesn't count as focus: the time lost while gone is added
  // back onto the clock, restarting from what the timer showed at leave.
  if (resolution === 'drifted') {
    return rest.running
      ? { ...rest, endsAt: now + snapshot.remainingSec * 1000, remainingSec: snapshot.remainingSec }
      : { ...rest, remainingSec: snapshot.remainingSec };
  }
  return rest;
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
    goalId: open.goalId,
    driftEventIds: [...(open.driftEventIds ?? [])],
    targetText: open.targetText,
    ifThenPlanId: open.ifThenPlanId,
    nextActionText: open.nextActionText,
    returnSnapshot: open.returnSnapshot,
    resumeCuePending: outcome === 'interrupted' ? true : undefined,
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
  // Optional goal link (v20): anything but a number means "no goal".
  const goalId = typeof x.goalId === 'number' && Number.isFinite(x.goalId) ? x.goalId : undefined;
  // Optional plan link (PLAN 3.2): anything but a string means "no plan".
  const ifThenPlanId = typeof x.ifThenPlanId === 'string' ? x.ifThenPlanId : undefined;
  // Optional target (PLAN 4.2): old open sessions simply have none.
  const targetText = typeof x.targetText === 'string' ? x.targetText : undefined;
  const nextActionText = typeof x.nextActionText === 'string' ? x.nextActionText : undefined;
  const returnSnapshot = isValidTimerSnapshot(x.returnSnapshot, x.id as string)
    ? x.returnSnapshot
    : undefined;
  return {
    ...(raw as OpenSession),
    driftEventIds,
    targetText,
    goalId,
    ifThenPlanId,
    nextActionText,
    returnSnapshot,
  };
}
