import {
  BLOOM_STORAGE_KEY,
  SCHEMA_VERSION,
  migratePersistedBlob,
  type PersistedShape,
} from './useBloom';
import {
  COMPANION_EVENT_CAP,
  COMPANION_LOG_VERSION,
  COMPANION_STORAGE_KEY,
  DRIFT_KINDS,
  type CompanionEvent,
} from './companion';
import {
  SESSION_LOG_CAP,
  isValidSessionRecord,
  type SessionRecord,
} from './sessions';
import { CUE_TYPES } from './ifThen';
import { isGuideArticleId, sanitizeGuideReadState } from './guide';
import { sanitizeParkedThoughts } from './parking';
import { sanitizeRitual } from './ritual';
import { sanitizePersonalCadenceMemory } from '../insights/cadence';
import { compactGoalLedger, sanitizeGoalLedger } from './goalLedger';
import { sanitizeFoundations, type FoundationsState } from './foundations';
import { sanitizeDayPlan } from './dailyTarget';
import {
  archiveSessionRecords,
  sanitizeHistoryArchive,
  type HistoryArchive,
} from './historyArchive';

export const BACKUP_FORMAT = 'bloom-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const IMPORT_RECOVERY_KEY = 'bloom-import-recovery-v1';

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: number;
  bloom: PersistedShape;
  companion: {
    version: number;
    events: CompanionEvent[];
  };
}

export interface ParsedBackupEnvelope extends BackupEnvelope {
  /** Original schema before migration; deliberately omitted from serialized backups. */
  sourceSchemaVersion: number;
}

export interface ImportPreview {
  sessions: number;
  tasks: number;
  goals: number;
  companionMoments: number;
  sourceSchemaVersion: number;
}

export interface PreparedImport {
  incoming: BackupEnvelope;
  merged: BackupEnvelope;
  preview: ImportPreview;
  safetyBackup: BackupEnvelope | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class BackupError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'canceled'
      | 'conflict'
      | 'future-schema'
      | 'invalid'
      | 'oversized'
      | 'storage',
    /** Live keys may be partially changed; prefer the saved recovery envelope. */
    readonly recoveryRequired = false,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

function assertNotCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BackupError('Import canceled.', 'canceled');
}

function encodedBytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  return stableValue(a) === stableValue(b);
}

function companionEventKey(event: CompanionEvent): string {
  return event.id ? `id:${event.id}` : `legacy:${stableValue(event)}`;
}

function isCompanionEvent(value: unknown): value is CompanionEvent {
  if (!isObject(value)) return false;
  const kinds = [...DRIFT_KINDS, 'drift', 'focused', 'away', 'skip'];
  return (
    (value.id === undefined || (typeof value.id === 'string' && value.id.length > 0)) &&
    (value.sessionId === undefined ||
      (typeof value.sessionId === 'string' && value.sessionId.length > 0)) &&
    typeof value.ts === 'number' &&
    Number.isFinite(value.ts) &&
    value.ts >= 0 &&
    (value.shownAt === undefined ||
      (typeof value.shownAt === 'number' &&
        Number.isFinite(value.shownAt) &&
        value.shownAt >= 0 &&
        value.shownAt <= value.ts)) &&
    typeof value.min === 'number' &&
    Number.isFinite(value.min) &&
    value.min >= 0 &&
    typeof value.len === 'number' &&
    Number.isFinite(value.len) &&
    value.len > 0 &&
    value.min <= value.len &&
    (value.estOnsetMin === undefined ||
      (typeof value.estOnsetMin === 'number' &&
        Number.isFinite(value.estOnsetMin) &&
        value.estOnsetMin >= 0 &&
        value.estOnsetMin <= value.min)) &&
    (value.estDurationMin === undefined ||
      (typeof value.estDurationMin === 'number' &&
        Number.isFinite(value.estDurationMin) &&
        value.estDurationMin >= 1 &&
        value.estDurationMin <= value.len)) &&
    kinds.includes(value.kind as string) &&
    (value.src === 'checkin' || value.src === 'return' || value.src === 'repair')
  );
}

function sanitizeCompanionEvents(raw: unknown): CompanionEvent[] {
  if (!Array.isArray(raw)) throw new BackupError('The Companion log is not a list.', 'invalid');
  if (raw.length > COMPANION_EVENT_CAP) {
    throw new BackupError('The Companion log is larger than Bloom supports.', 'invalid');
  }
  if (!raw.every(isCompanionEvent)) {
    throw new BackupError('The Companion log contains an invalid moment.', 'invalid');
  }
  return raw.map((event) => ({ ...event }));
}

export function createBackupEnvelope(
  bloom: PersistedShape,
  companionEvents: CompanionEvent[],
  exportedAt = Date.now(),
): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    bloom,
    companion: {
      version: COMPANION_LOG_VERSION,
      events: companionEvents.map((event) => ({ ...event })),
    },
  };
}

export function serializeBackup(envelope: BackupEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * Validate the outer backup before passing its main blob through the exact
 * migration path used by localStorage. Unknown future schemas are rejected so
 * an older client can never silently discard newer fields.
 */
export function parseBackup(
  text: string,
  signal?: AbortSignal,
): ParsedBackupEnvelope {
  assertNotCanceled(signal);
  if (encodedBytes(text) > MAX_BACKUP_BYTES) {
    throw new BackupError('This backup is larger than Bloom can safely import.', 'oversized');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not valid JSON.', 'invalid');
  }
  assertNotCanceled(signal);
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT || raw.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError('This is not a Bloom backup file.', 'invalid');
  }
  if (!isObject(raw.bloom)) {
    throw new BackupError('This backup does not contain Bloom data.', 'invalid');
  }
  const sourceVersion = raw.bloom.version;
  if (typeof sourceVersion !== 'number' || !Number.isInteger(sourceVersion) || sourceVersion < 0) {
    throw new BackupError('This backup has an invalid schema version.', 'invalid');
  }
  if (sourceVersion > SCHEMA_VERSION) {
    throw new BackupError(
      'This backup was made by a newer Bloom version. Update Bloom before importing it.',
      'future-schema',
    );
  }
  if (!isObject(raw.companion)) {
    throw new BackupError('This backup does not contain its Companion log.', 'invalid');
  }
  const companionVersion = raw.companion.version;
  if (
    typeof companionVersion !== 'number' ||
    !Number.isInteger(companionVersion) ||
    companionVersion < 1 ||
    companionVersion > COMPANION_LOG_VERSION
  ) {
    throw new BackupError('This backup has an unsupported Companion log version.', 'invalid');
  }

  const bloom = migratePersistedBlob(raw.bloom);
  validateImportedState(raw.bloom, bloom);
  const events = sanitizeCompanionEvents(raw.companion.events);
  assertUnique(events, companionEventKey, 'Companion moment');
  assertNotCanceled(signal);
  const envelope = createBackupEnvelope(
    bloom,
    events,
    typeof raw.exportedAt === 'number' && Number.isFinite(raw.exportedAt)
      ? raw.exportedAt
      : Date.now(),
  );
  Object.defineProperty(envelope, 'sourceSchemaVersion', {
    value: sourceVersion,
    enumerable: false,
  });
  return envelope as ParsedBackupEnvelope;
}

function finite(value: unknown, min = -Infinity, max = Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

function optionalFinite(value: unknown, min = 0): boolean {
  return value === undefined || finite(value, min);
}

function assertUnique<T>(rows: T[], keyOf: (row: T) => string, label: string): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key || keys.has(key)) {
      throw new BackupError(`The backup contains a duplicate ${label} id.`, 'invalid');
    }
    keys.add(key);
  }
}

function isValidTask(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    integer(value.id, 0) &&
    typeof value.t === 'string' &&
    value.t.trim().length > 0 &&
    value.t.length <= 500 &&
    typeof value.done === 'boolean' &&
    integer(value.pomos, 0) &&
    integer(value.goal, 1, 6) &&
    (value.goalId === undefined || integer(value.goalId, 0)) &&
    optionalFinite(value.completedAt)
  );
}

function isValidDue(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isValidGoal(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    integer(value.id, 0) &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    value.title.length <= 500 &&
    isValidDue(value.due) &&
    integer(value.target, 1, 500) &&
    integer(value.done, 0, value.target as number) &&
    finite(value.createdAt, 0) &&
    optionalFinite(value.completedAt)
  );
}

function isValidIfThenPlan(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    CUE_TYPES.includes(value.cueType as (typeof CUE_TYPES)[number]) &&
    typeof value.cueText === 'string' &&
    value.cueText.trim().length > 0 &&
    value.cueText.length <= 120 &&
    typeof value.actionText === 'string' &&
    value.actionText.trim().length > 0 &&
    value.actionText.length <= 120 &&
    (value.taskId === undefined || integer(value.taskId, 0)) &&
    integer(value.usageCount, 0) &&
    (value.lastUsedAt === null || finite(value.lastUsedAt, 0)) &&
    finite(value.createdAt, 0)
  );
}

function isValidSettings(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.durations) || !isObject(value.companion)) return false;
  const companion = value.companion;
  return (
    typeof value.name === 'string' &&
    finite(value.durations.focus, 1) &&
    finite(value.durations.short, 1) &&
    finite(value.durations.long, 1) &&
    typeof value.sound === 'boolean' &&
    typeof value.autoStart === 'boolean' &&
    typeof value.night === 'boolean' &&
    typeof value.pal === 'string' &&
    value.pal.length > 0 &&
    typeof value.flow === 'boolean' &&
    typeof value.planner === 'boolean' &&
    typeof value.foundations === 'boolean' &&
    ['betterEarlier', 'betterLater', 'notSure'].includes(value.chronotype as string) &&
    typeof value.preSlumpCheck === 'boolean' &&
    integer(value.dayStartHour, 0, 23) &&
    typeof companion.on === 'boolean' &&
    integer(companion.checkinMins, 1) &&
    typeof companion.tabDetect === 'boolean' &&
    integer(companion.awaySecs, 1) &&
    typeof companion.quiet === 'boolean' &&
    typeof companion.intention === 'boolean'
  );
}

/**
 * Import is stricter than normal boot recovery: a backup with malformed rows
 * must stop instead of letting load-time sanitizers quietly drop user data.
 */
function validateImportedState(
  raw: Record<string, unknown>,
  bloom: PersistedShape,
): void {
  if (
    !integer(bloom.sessions, 0) ||
    !integer(bloom.streak, 0) ||
    (bloom.lastFocusDay !== null && !isValidDue(bloom.lastFocusDay)) ||
    (bloom.restDayUsedOn !== null && !isValidDue(bloom.restDayUsedOn)) ||
    (bloom.lastRolloverOfferDay !== null &&
      !isValidDue(bloom.lastRolloverOfferDay)) ||
    typeof bloom.comeBack !== 'boolean' ||
    !isValidSettings(bloom.settings)
  ) {
    throw new BackupError('The backup contains invalid Bloom settings or counters.', 'invalid');
  }

  if (!bloom.tasks.every(isValidTask) || !bloom.goals.every(isValidGoal)) {
    throw new BackupError('The backup contains an invalid task or goal.', 'invalid');
  }
  assertUnique(bloom.tasks, (task) => String(task.id), 'task');
  assertUnique(bloom.goals, (goal) => String(goal.id), 'goal');

  if (!bloom.sessionRecords.every(isValidSessionRecord)) {
    throw new BackupError('The backup contains an invalid session record.', 'invalid');
  }
  assertUnique(bloom.sessionRecords, (record) => record.id, 'session');

  if (!bloom.ifThenPlans.every(isValidIfThenPlan)) {
    throw new BackupError('The backup contains an invalid saved plan.', 'invalid');
  }
  assertUnique(bloom.ifThenPlans, (plan) => plan.id, 'saved plan');
  assertUnique(bloom.parking, (item) => item.id, 'parked thought');

  const palXpValid = Object.entries(bloom.palXp).every(
    ([name, xp]) => name.length > 0 && finite(xp, 0),
  );
  if (
    !palXpValid ||
    !finite(bloom.flow.acc, 0) ||
    (bloom.flow.startedAt !== null && !finite(bloom.flow.startedAt, 0)) ||
    typeof bloom.flow.running !== 'boolean' ||
    !sameValue(sanitizeRitual(raw.ritual), bloom.ritual) ||
    !sameValue(sanitizePersonalCadenceMemory(raw.personalCadence), bloom.personalCadence) ||
    !sameValue(sanitizeParkedThoughts(raw.parking), bloom.parking) ||
    !sameValue(sanitizeGuideReadState(raw.guideRead), bloom.guideRead) ||
    (raw.foundations !== undefined &&
      !sameValue(
        sanitizeFoundations(raw.foundations, {
          validIfThenIds: bloom.ifThenPlans.map((plan) => plan.id),
        }),
        bloom.foundations,
      )) ||
    (raw.dayPlan !== undefined &&
      !sameValue(sanitizeDayPlan(raw.dayPlan), bloom.dayPlan)) ||
    (raw.historyArchive !== undefined &&
      !sameValue(
        sanitizeHistoryArchive(raw.historyArchive),
        bloom.historyArchive,
      )) ||
    (raw.openFocus != null && bloom.openFocus == null) ||
    (raw.openFlow != null && bloom.openFlow == null)
  ) {
    throw new BackupError('The backup contains invalid supporting records.', 'invalid');
  }

  for (const [id, timestamp] of Object.entries(bloom.guideRead.readAt)) {
    if (!isGuideArticleId(id) || !finite(timestamp, 0)) {
      throw new BackupError('The backup contains an invalid Guide record.', 'invalid');
    }
  }

  const arrays: Array<[string, unknown[], unknown[]]> = [
    ['tasks', Array.isArray(raw.tasks) ? raw.tasks : [], bloom.tasks],
    ['goals', Array.isArray(raw.goals) ? raw.goals : [], bloom.goals],
    ['sessions', Array.isArray(raw.sessionRecords) ? raw.sessionRecords : [], bloom.sessionRecords],
    ['saved plans', Array.isArray(raw.ifThenPlans) ? raw.ifThenPlans : [], bloom.ifThenPlans],
    ['parked thoughts', Array.isArray(raw.parking) ? raw.parking : [], bloom.parking],
    [
      'archived session hours',
      isObject(raw.historyArchive) && Array.isArray(raw.historyArchive.hours)
        ? raw.historyArchive.hours
        : [],
      bloom.historyArchive.hours,
    ],
    [
      'archived completed tasks',
      isObject(raw.historyArchive) && Array.isArray(raw.historyArchive.completedTasks)
        ? raw.historyArchive.completedTasks
        : [],
      bloom.historyArchive.completedTasks,
    ],
  ];
  for (const [label, before, after] of arrays) {
    if (before.length !== after.length) {
      throw new BackupError(`The backup contains invalid or unsupported ${label}.`, 'invalid');
    }
  }
}

function mergeFoundations(
  current: FoundationsState,
  incoming: FoundationsState,
  validIfThenIds: string[],
): FoundationsState {
  const instances = new Map(current.instances.map((instance) => [instance.id, instance]));
  for (const instance of incoming.instances) {
    const prior = instances.get(instance.id);
    if (!prior) {
      instances.set(instance.id, instance);
      continue;
    }
    const ranges = [...prior.ranges];
    for (const range of instance.ranges) {
      if (!ranges.some((item) => sameValue(item, range))) ranges.push(range);
    }
    instances.set(instance.id, { ...prior, ranges });
  }
  const entries = new Map(current.entries.map((entry) => [entry.id, entry]));
  for (const entry of incoming.entries) {
    const prior = entries.get(entry.id);
    if (!prior || entry.recordedAt > prior.recordedAt) entries.set(entry.id, entry);
  }
  const archive = new Map(
    current.archive.map((summary) => [
      `${summary.instanceId}:${summary.monthKey}`,
      summary,
    ]),
  );
  for (const summary of incoming.archive) {
    const key = `${summary.instanceId}:${summary.monthKey}`;
    const prior = archive.get(key);
    if (!prior || summary.doneDays > prior.doneDays) archive.set(key, summary);
  }
  return sanitizeFoundations(
    {
      instances: [...instances.values()],
      entries: [...entries.values()],
      archive: [...archive.values()],
    },
    { validIfThenIds },
  );
}

function mergeStableRows<T>(
  current: T[],
  incoming: T[],
  keyOf: (row: T) => string,
  label: string,
): T[] {
  const merged = new Map<string, T>();
  for (const row of current) merged.set(keyOf(row), row);
  for (const row of incoming) {
    const key = keyOf(row);
    const prior = merged.get(key);
    if (prior !== undefined && !sameValue(prior, row)) {
      throw new BackupError(
        `The current data and backup contain different ${label} with the same id.`,
        'conflict',
      );
    }
    if (prior === undefined) merged.set(key, row);
  }
  return [...merged.values()];
}

/**
 * Goal progress is a denormalized ledger cache, so two otherwise-identical
 * goals must not conflict merely because their devices exported different
 * `done` values. Metadata still conflicts; the unioned ledger re-derives
 * progress below. Keep the earliest known completion instant when available.
 */
function mergeGoals(
  current: PersistedShape['goals'],
  incoming: PersistedShape['goals'],
): PersistedShape['goals'] {
  const merged = new Map(current.map((goal) => [goal.id, goal]));
  for (const goal of incoming) {
    const prior = merged.get(goal.id);
    if (!prior) {
      merged.set(goal.id, goal);
      continue;
    }
    const { done: _priorDone, completedAt: priorCompletedAt, ...priorMetadata } = prior;
    const { done: _goalDone, completedAt: goalCompletedAt, ...goalMetadata } = goal;
    const compactMetadata = (metadata: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(metadata).filter(([, value]) => value !== undefined),
      );
    if (
      !sameValue(
        compactMetadata(priorMetadata),
        compactMetadata(goalMetadata),
      )
    ) {
      throw new BackupError(
        'The current data and backup contain different goals with the same id.',
        'conflict',
      );
    }
    const completionTimes = [priorCompletedAt, goalCompletedAt].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    merged.set(goal.id, {
      ...prior,
      done: 0,
      ...(completionTimes.length > 0
        ? { completedAt: Math.min(...completionTimes) }
        : { completedAt: undefined }),
    });
  }
  return [...merged.values()];
}

function mergeNullableStable<T extends { id: string }>(
  current: T | null,
  incoming: T | null,
  label: string,
): T | null {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current.id !== incoming.id) return current;
  if (!sameValue(current, incoming)) {
    throw new BackupError(
      `The current data and backup contain different ${label} with the same id.`,
      'conflict',
    );
  }
  return current;
}

function newestDaySummary(
  current: Pick<PersistedShape, 'streak' | 'lastFocusDay' | 'restDayUsedOn' | 'comeBack'>,
  incoming: Pick<PersistedShape, 'streak' | 'lastFocusDay' | 'restDayUsedOn' | 'comeBack'>,
) {
  const currentDay = current.lastFocusDay ?? '';
  const incomingDay = incoming.lastFocusDay ?? '';
  return incomingDay > currentDay ? incoming : current;
}

function newestTimed<T extends { computedAt?: number | null }>(current: T, incoming: T): T {
  return (incoming.computedAt ?? -1) > (current.computedAt ?? -1) ? incoming : current;
}

function archiveOverflowIsEmpty(archive: HistoryArchive): boolean {
  return Object.values(archive.overflow).every((value) => value === 0);
}

/**
 * Detailed archive rows have deterministic natural ids. Divergent aggregates
 * for the same hour cannot be safely added or maxed without knowing whether
 * their source sessions overlap, so import stops on that collision.
 */
function mergeHistoryArchives(
  current: HistoryArchive,
  incoming: HistoryArchive,
): HistoryArchive {
  const hours = mergeStableRows(
    current.hours,
    incoming.hours,
    (bucket) => `${bucket.calendarDay}:${bucket.hour}`,
    'archived session-hour summaries',
  );
  const completedTasks = mergeStableRows(
    current.completedTasks,
    incoming.completedTasks,
    (row) => row.id,
    'archived task completions',
  );
  let overflow = current.overflow;
  if (!sameValue(current.overflow, incoming.overflow)) {
    if (archiveOverflowIsEmpty(current)) overflow = incoming.overflow;
    else if (!archiveOverflowIsEmpty(incoming)) {
      throw new BackupError(
        'The current data and backup contain different compacted History totals.',
        'conflict',
      );
    }
  }
  return sanitizeHistoryArchive({ hours, completedTasks, overflow });
}

/**
 * Deterministic local merge rules. Append-only/id-bearing slices union by
 * stable id and stop on a divergent collision. Device preferences remain
 * current; maxima preserve cumulative counters; newer dated summaries win.
 */
export function mergePersistedState(
  current: PersistedShape,
  incoming: PersistedShape,
): PersistedShape {
  const tasks = mergeStableRows(current.tasks, incoming.tasks, (task) => String(task.id), 'tasks');
  const goals = mergeGoals(current.goals, incoming.goals);
  const goalLedger = compactGoalLedger(
    mergeStableRows(
      current.goalLedger,
      incoming.goalLedger,
      (credit) => credit.id,
      'goal progress',
    ),
  );
  const derivedGoals = sanitizeGoalLedger(goalLedger, goals).goals;
  let sessionRecords = mergeStableRows(
    current.sessionRecords,
    incoming.sessionRecords,
    (record) => record.id,
    'sessions',
  ).sort(
    (a, b) => a.endedAt - b.endedAt || a.startedAt - b.startedAt || a.id.localeCompare(b.id),
  );
  let historyArchive = mergeHistoryArchives(
    current.historyArchive,
    incoming.historyArchive,
  );
  if (sessionRecords.length > SESSION_LOG_CAP) {
    const evictedCount = sessionRecords.length - SESSION_LOG_CAP;
    historyArchive = archiveSessionRecords(
      historyArchive,
      sessionRecords.slice(0, evictedCount),
    );
    sessionRecords = sessionRecords.slice(evictedCount);
  }
  const ifThenPlans = mergeStableRows(
    current.ifThenPlans,
    incoming.ifThenPlans,
    (plan) => plan.id,
    'saved plans',
  );
  const foundations = mergeFoundations(
    current.foundations,
    incoming.foundations,
    ifThenPlans.map((plan) => plan.id),
  );
  const dayPlan = sanitizeDayPlan({
    targets: mergeStableRows(
      current.dayPlan.targets,
      incoming.dayPlan.targets,
      (target) => target.id,
      'daily targets',
    ),
    archive: mergeStableRows(
      current.dayPlan.archive,
      incoming.dayPlan.archive,
      (pair) => pair.weekKey,
      'daily target summaries',
    ),
  });
  const parking = mergeStableRows(
    current.parking,
    incoming.parking,
    (item) => item.id,
    'parked thoughts',
  );
  const daySummary = newestDaySummary(current, incoming);
  const guideReads = { ...incoming.guideRead.readAt, ...current.guideRead.readAt };
  for (const [id, at] of Object.entries(incoming.guideRead.readAt)) {
    guideReads[id as keyof typeof guideReads] = Math.max(
      at,
      current.guideRead.readAt[id as keyof typeof current.guideRead.readAt] ?? 0,
    );
  }
  const suggestionsByMoment = new Map(
    current.guideRead.suggestions.map((item) => [item.momentKey, item]),
  );
  for (const item of incoming.guideRead.suggestions) {
    const prior = suggestionsByMoment.get(item.momentKey);
    if (!prior || item.surfacedAt > prior.surfacedAt) {
      suggestionsByMoment.set(item.momentKey, item);
    }
  }
  const suggestions = [...suggestionsByMoment.values()]
    .sort((a, b) => a.surfacedAt - b.surfacedAt)
    .slice(-100);
  const palXp = { ...incoming.palXp };
  for (const [pal, xp] of Object.entries(current.palXp)) {
    palXp[pal] = Math.max(xp, incoming.palXp[pal] ?? 0);
  }

  return {
    ...current,
    version: SCHEMA_VERSION,
    sessions: Math.max(current.sessions, incoming.sessions),
    streak: daySummary.streak,
    lastFocusDay: daySummary.lastFocusDay,
    restDayUsedOn: daySummary.restDayUsedOn,
    comeBack: daySummary.comeBack,
    tasks,
    activeTaskId:
      current.activeTaskId != null && tasks.some((task) => task.id === current.activeTaskId)
        ? current.activeTaskId
        : incoming.activeTaskId != null && tasks.some((task) => task.id === incoming.activeTaskId)
          ? incoming.activeTaskId
          : null,
    palXp,
    goals: derivedGoals,
    goalLedger,
    foundations,
    dayPlan,
    lastRolloverOfferDay:
      current.lastRolloverOfferDay && incoming.lastRolloverOfferDay
        ? current.lastRolloverOfferDay > incoming.lastRolloverOfferDay
          ? current.lastRolloverOfferDay
          : incoming.lastRolloverOfferDay
        : current.lastRolloverOfferDay ?? incoming.lastRolloverOfferDay,
    flow:
      current.flow.running || current.flow.acc > 0 || current.flow.startedAt != null
        ? current.flow
        : incoming.flow,
    sessionRecords,
    historyArchive,
    openFocus: mergeNullableStable(current.openFocus, incoming.openFocus, 'open focus sessions'),
    openFlow: mergeNullableStable(current.openFlow, incoming.openFlow, 'open flow sessions'),
    lastWeeklyReviewWeek:
      current.lastWeeklyReviewWeek && incoming.lastWeeklyReviewWeek
        ? current.lastWeeklyReviewWeek > incoming.lastWeeklyReviewWeek
          ? current.lastWeeklyReviewWeek
          : incoming.lastWeeklyReviewWeek
        : current.lastWeeklyReviewWeek ?? incoming.lastWeeklyReviewWeek,
    ifThenPlans,
    ritual: current.ritual,
    lastWoopOfferAt: Math.max(current.lastWoopOfferAt ?? 0, incoming.lastWoopOfferAt ?? 0) || null,
    preSlump:
      (incoming.preSlump.day ?? '') > (current.preSlump.day ?? '')
        ? incoming.preSlump
        : current.preSlump,
    personalCadence: newestTimed(current.personalCadence, incoming.personalCadence),
    parking,
    guideRead: { readAt: guideReads, suggestions },
    settings: current.settings,
  };
}

export function prepareImport(
  incoming: BackupEnvelope & { sourceSchemaVersion?: number },
  current: BackupEnvelope | null,
): PreparedImport {
  const events = current
    ? mergeStableRows(
        current.companion.events,
        incoming.companion.events,
        companionEventKey,
        'Companion moments',
      ).sort((a, b) => a.ts - b.ts)
    : incoming.companion.events;
  if (events.length > COMPANION_EVENT_CAP) {
    throw new BackupError(
      'The combined Companion history is too large for this Bloom version. Nothing was changed.',
      'conflict',
    );
  }
  const merged = current
    ? createBackupEnvelope(
        mergePersistedState(current.bloom, incoming.bloom),
        events,
        Date.now(),
      )
    : createBackupEnvelope(incoming.bloom, events, Date.now());
  return {
    incoming,
    merged,
    safetyBackup: current,
    preview: {
      sessions: incoming.bloom.sessionRecords.length,
      tasks: incoming.bloom.tasks.length,
      goals: incoming.bloom.goals.length,
      companionMoments: incoming.companion.events.length,
      sourceSchemaVersion: incoming.sourceSchemaVersion ?? incoming.bloom.version,
    },
  };
}

function restoreKey(storage: StorageLike, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

/**
 * Commit both stores as one recoverable operation. The current envelope is
 * written first to a dedicated recovery key; if either data write fails, both
 * live keys are restored before the error returns.
 */
export function commitPreparedImport(
  prepared: PreparedImport,
  storage: StorageLike,
): void {
  const priorBloom = storage.getItem(BLOOM_STORAGE_KEY);
  const priorCompanion = storage.getItem(COMPANION_STORAGE_KEY);
  const recovery = prepared.safetyBackup
    ? serializeBackup(prepared.safetyBackup)
    : serializeBackup(
        createBackupEnvelope(
          migratePersistedBlob(priorBloom ? JSON.parse(priorBloom) : {}),
          priorCompanion
            ? sanitizeCompanionEvents(JSON.parse(priorCompanion).events)
            : [],
        ),
      );

  try {
    storage.setItem(IMPORT_RECOVERY_KEY, recovery);
  } catch {
    throw new BackupError('Bloom could not create the safety backup, so nothing was changed.', 'storage');
  }

  try {
    storage.setItem(BLOOM_STORAGE_KEY, JSON.stringify(prepared.merged.bloom));
    storage.setItem(
      COMPANION_STORAGE_KEY,
      JSON.stringify({
        version: COMPANION_LOG_VERSION,
        events: prepared.merged.companion.events,
      }),
    );
  } catch {
    let restored = true;
    try {
      restoreKey(storage, BLOOM_STORAGE_KEY, priorBloom);
      restoreKey(storage, COMPANION_STORAGE_KEY, priorCompanion);
    } catch {
      restored = false;
    }
    throw new BackupError(
      restored
        ? 'The import could not be saved. Bloom restored the current data and kept a recovery backup.'
        : 'The import could not be saved or fully rolled back. Bloom kept the complete recovery backup so you can download it before retrying.',
      'storage',
      !restored,
    );
  }
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function sessionRecordsCsv(records: SessionRecord[]): string {
  const columns = [
    'id',
    'started_at',
    'ended_at',
    'mode',
    'planned_minutes',
    'actual_minutes',
    'outcome',
    'start_hour',
    'task_id',
    'goal_id',
    'target',
    'target_outcome',
    'drift_moments',
  ];
  const rows = records.map((record) => [
    record.id,
    new Date(record.startedAt).toISOString(),
    new Date(record.endedAt).toISOString(),
    record.mode,
    record.plannedMin,
    record.actualMin,
    record.outcome,
    record.startHour,
    record.taskId,
    record.goalId,
    record.targetText,
    record.targetOutcome,
    record.driftEventIds.length,
  ]);
  return `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export async function readBackupFile(
  file: File,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<string> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError('This backup is larger than Bloom can safely import.', 'oversized');
  }
  assertNotCanceled(signal);
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      assertNotCanceled(signal);
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress(file.size > 0 ? Math.min(99, Math.round((received / file.size) * 100)) : 99);
    }
  } finally {
    reader.releaseLock();
  }
  assertNotCanceled(signal);
  const all = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(100);
  return new TextDecoder().decode(all);
}
