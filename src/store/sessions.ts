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
 * Nothing writes records yet; the timer lifecycle starts logging in a later
 * step. This module only defines the shape, the cap, and the load-time
 * sanitizer so existing users migrate onto an empty log safely.
 */

/** 'tiny' is the future 2–5 minute starter; breaks are never recorded. */
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
    (x.targetText === undefined || typeof x.targetText === 'string')
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
