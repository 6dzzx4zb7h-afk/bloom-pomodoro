import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { friendByName } from '../data/friends';
import type { AnimalKind } from '../engine/pixelpals';
import { audioEngine, notify } from '../engine/audio';
import {
  consumeIOSCompletionAlertDelivery,
  isIOSCompletionAlertPlatform,
  readIOSCompletionAlertStatus,
  reconcileIOSCompletionAlert,
  requestIOSCompletionAlertPermission,
  UNSUPPORTED_COMPLETION_ALERT_STATUS,
  type IOSCompletionAlertStatus,
} from '../native/iosCompletionAlerts';
import {
  isIOSLiveActivityPlatform,
  readIOSLiveActivityStatus,
  reconcileIOSLiveActivity,
  type IOSLiveActivityMode,
  type IOSLiveActivitySnapshot,
  type IOSLiveActivityStatus,
} from '../native/iosLiveActivity';
import {
  cancelIOSAlarm,
  consumeIOSAlarmDelivery,
  isIOSAlarmPlatform,
  readIOSAlarmStatus,
  reconcileIOSAlarm,
  requestIOSAlarmAuthorization,
  UNSUPPORTED_ALARM_STATUS,
  type IOSAlarmStatus,
} from '../native/iosAlarm';
import {
  acknowledgeIOSCommands,
  clearIOSCommands,
  drainIOSCommands,
  isIOSCommandPlatform,
} from '../native/iosCommands';
import {
  EMPTY_PRE_SLUMP_CAPS,
  PRE_SLUMP_DAILY_CAP,
  type PreSlumpCaps,
} from '../insights/triggers';
import {
  CADENCE_BREAK_MAX,
  CADENCE_BREAK_MIN,
  CADENCE_FOCUS_MAX,
  CADENCE_FOCUS_MIN,
  EMPTY_PERSONAL_CADENCE,
  PERSONAL_CADENCE_RECOMPUTE_MS,
  rememberPreviousCadence,
  sanitizePersonalCadenceMemory,
  type CadencePair,
  type PersonalCadenceMemory,
  type PersonalCadenceRecommendation,
} from '../insights/cadence';
import {
  appendDriftEvent,
  clearEvents,
  DEFAULT_COMPANION,
  loadEvents,
  replaceCompanionLog,
  type Chronotype,
  type CompanionSettings,
} from './companion';
import type { SessionRepairProposal } from './sessionRepair';
import { dayKeyFor, nextDayBoundaryAt, normalizeDayStartHour } from './dayKey';
import {
  GOAL_TARGET_MAX,
  normalizeGoalUnit,
  type Goal,
} from './goals';
import {
  appendGoalCredit,
  removeGoalCredits,
  sanitizeGoalLedger,
  type GoalCredit,
} from './goalLedger';
import {
  EMPTY_GUIDE_READ_STATE,
  markGuideArticleRead,
  markGuideArticleSuggested,
  sanitizeGuideReadState,
  type GuideReadState,
} from './guide';
import type { GuideArticleId } from '../content/guide';
import {
  addIfThenPlan,
  markIfThenPlanUsed,
  removeIfThenPlan,
  sanitizeIfThenPlans,
  updateIfThenPlan,
  type CueType,
  type IfThenPlan,
} from './ifThen';
import {
  captureTimerSnapshot,
  finalizeSession,
  isValidSessionRecord,
  markTimerReturn,
  newOpenSession,
  resolveTimerReturn,
  sanitizeOpenSession,
  sanitizeSessionRecords,
  sessionCountsTowardDay,
  setSessionTargetOutcome,
  sweepStaleOpenSession,
  type OpenSession,
  type GoalCreditStatus,
  type ReturnResolution,
  type SessionRecord,
  type TargetOutcome,
} from './sessions';
import {
  appendCompletedTaskArchiveRow,
  appendSessionRecordWithArchive,
  completedTaskArchiveRow,
  emptyHistoryArchive,
  removeCompletedTaskArchiveRow,
  sanitizeHistoryArchive,
  type HistoryArchive,
} from './historyArchive';
import {
  EMPTY_FOUNDATIONS,
  createFoundationInstance,
  foundationEntryId,
  foundationInstanceId,
  isFoundationDayKey,
  isManualFoundationType,
  renameCustomFoundation as renameCustomFoundationState,
  reorderFoundation as reorderFoundationState,
  sanitizeFoundations,
  setFoundationEnabled as setFoundationEnabledState,
  toggleFoundationDay as toggleFoundationDayState,
  type FoundationsState,
  type ManualFoundationType,
} from './foundations';
import {
  EMPTY_DAY_PLAN,
  addGoalDailyTarget,
  addTaskDailyTarget,
  carryRolloverTarget,
  compactDailyTargets,
  dismissDailyTarget,
  editDailyTarget,
  liftLegacyDailyTarget,
  rolloverOffers,
  sanitizeDayPlan,
  type DayPlanState,
  type TaskDailyTarget,
} from './dailyTarget';
import { DEFAULT_RITUAL, sanitizeRitual, updateRitualItem, type RitualSettings } from './ritual';
import { bumpStreakGentle, streakAlive, type StreakData } from './streak';
import {
  addParkedThought,
  removeParkedThought,
  revealAllParkedThoughts,
  revealParkedThoughts,
  sanitizeParkedThoughts,
  type ParkedThought,
} from './parking';
import {
  clearStorageFailure,
  getStorageHealthSnapshot,
  reportStorageFailure,
  storageWritesBlocked,
} from './storageHealth';

/** 'flow' is the opt-in count-up stopwatch; the rest count down. */
export type TimerMode = 'focus' | 'tiny' | 'short' | 'long' | 'flow';
/** The countdown modes — the only ones with a configured length. */
export type DurationMode = 'focus' | 'short' | 'long';
export type TimerTransitionIntent =
  | 'mode'
  | 'reset'
  | 'skip'
  | 'activeTask'
  | 'flowOff'
  | 'cadence'
  | 'duration'
  | 'navigation';

export type TimerTransitionDecision =
  | { kind: 'allow' }
  | { kind: 'discardFalseStart' }
  | {
      kind: 'confirm';
      title: string;
      description: string;
      confirmLabel: string;
    };

/** Honest, deliberately small first rungs offered by Tiny Start (PLAN 3.3). */
export const TINY_START_OPTIONS = [2, 5] as const;
export type TinyStartMinutes = (typeof TINY_START_OPTIONS)[number];
export const TINY_EXTENSION_MIN = 10;
/** A target stays a quiet single line in the timer and debrief. */
export const SESSION_TARGET_MAX = 80;

export interface Task {
  id: number;
  t: string;
  done: boolean;
  pomos: number;
  /**
   * Pomodoro-count target for this task (1–6) — NOT a link to a planner
   * Goal. The planner link lives in `goalId` here and on session records.
   */
  goal: number;
  /** Planner goal this task counts toward, if linked (v20). */
  goalId?: number;
  /** Resolution of the current manual-completion credit offer (v24). */
  goalCredit?: GoalCreditStatus;
  /** Epoch ms when the task was last marked done; cleared on un-check (v19). */
  completedAt?: number;
}

/** All values in seconds. */
export type Durations = Record<DurationMode, number>;

export interface Settings {
  /** What the app calls the user (chosen on first run, editable in settings). */
  name: string;
  durations: Durations;
  /** Play the end-of-session chime and post a notification when available. */
  sound: boolean;
  /** Automatically start the next timer after the celebrate animation. */
  autoStart: boolean;
  /** Night sky theme: dark palette + animated stars and meteors. */
  night: boolean;
  /** Name of the friend on duty (drives the focus-screen sprite). */
  pal: string;
  /** Companion Mode: gentle check-ins + local focus-pattern insights. */
  companion: CompanionSettings;
  /** Flow timer: an opt-in count-up stopwatch tab beside the pomodoro modes. */
  flow: boolean;
  /** Goals & deadlines: the opt-in goal/deadline planner tab. */
  planner: boolean;
  /** Small, opt-in daily foundation card (PLAN 10.7). */
  foundations: boolean;
  /**
   * Goal credit is independent of enabling the planner. Automatic movement
   * only happens after the user explicitly chooses `auto`.
   */
  goalCredit: 'off' | 'ask' | 'auto';
  /** Self-tag used as a light prior for time-of-day suggestions (PLAN 4.4). */
  chronotype: Chronotype;
  /** Optional data-timed breath/stretch cue (PLAN 4.5); off unless chosen. */
  preSlumpCheck: boolean;
  /** Local hour (0–23) when a new study day begins (PLAN 9.2). */
  dayStartHour: number;
}

export interface BloomState {
  /** Runtime-only local study-day key. Never written to the persisted blob. */
  today: string;
  /** Runtime-only instant captured when `today` last changed. */
  now: number;
  mode: TimerMode;
  running: boolean;
  /** Wall-clock epoch ms the current run ends at; null when paused/stopped. */
  endsAt: number | null;
  /** Authoritative remaining seconds when paused. */
  remaining: number;
  sessions: number;
  streak: number;
  /** YYYY-MM-DD of the last completed focus session (for streak). */
  lastFocusDay: string | null;
  /** YYYY-MM-DD of the day the weekly free rest day last covered (PLAN 5.4). */
  restDayUsedOn: string | null;
  /** True after a longer pause, until the next finished work session — the
   *  streak chip greets the return instead of showing a zero (PLAN 5.4). */
  comeBack: boolean;
  justDone: boolean;
  tasks: Task[];
  /** The task pomodoros are credited to; falls back to first undone task. */
  activeTaskId: number | null;
  /** Focus sessions completed with each friend on duty → drives their level. */
  palXp: Record<string, number>;
  /** Deadline planner entries (only shown when settings.planner is on). */
  goals: Goal[];
  /** Append-only source of truth for every goal progress movement (PLAN 10.1). */
  goalLedger: GoalCredit[];
  /** Binary manual foundation entries and their active ranges (PLAN 10.7). */
  foundations: FoundationsState;
  /** Optional goal/task targets for individual study days (PLAN 9.6 + 10.3). */
  dayPlan: DayPlanState;
  /** Study day on which rollover triage was most recently shown (PLAN 10.5). */
  lastRolloverOfferDay: string | null;
  /** Runtime-only goal override for the next session start (PLAN 10.2). */
  armedGoalId: number | null;
  /** Flow stopwatch: epoch ms the current run started at; null when paused. */
  flowStart: number | null;
  /** Flow stopwatch: seconds banked across pauses. */
  flowAcc: number;
  /** Per-session log (capped ring buffer) — the raw data behind insights. */
  sessionRecords: SessionRecord[];
  /** Compact summaries and removed completed-task rows older than live slices. */
  historyArchive: HistoryArchive;
  /** The focus/tiny countdown currently underway, if any (finalized on end). */
  openFocus: OpenSession | null;
  /**
   * The flow stopwatch's open record, if any. Lives in its own slot because
   * a paused stopwatch survives mode switches — it can sit banked in the
   * background while focus sessions run.
   */
  openFlow: OpenSession | null;
  /** weekKey() of the last week the weekly review auto-surfaced (PLAN 2.3). */
  lastWeeklyReviewWeek: string | null;
  /** Saved if–then plans — the starting toolkit's implementation intentions (PLAN 3.1). */
  ifThenPlans: IfThenPlan[];
  /** Optional pre-session environment reset (PLAN 3.4). */
  ritual: RitualSettings;
  /** Last time the conditional WOOP card surfaced (PLAN 3.5 cooldown). */
  lastWoopOfferAt: number | null;
  /** Persisted per-session/day caps for the opt-in pre-slump cue (PLAN 4.5). */
  preSlump: PreSlumpCaps;
  /** Weekly learned cadence cache + reversible applied-rung history (PLAN 4.6). */
  personalCadence: PersonalCadenceMemory;
  /** Thoughts hidden during a session and returned at its next pause (PLAN 5.1). */
  parking: ParkedThought[];
  /** Neutral, timestamped Field Guide read markers (PLAN 6.2). */
  guideRead: GuideReadState;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  durations: { focus: 1500, short: 300, long: 900 },
  sound: true,
  autoStart: false,
  night: false,
  pal: 'Mochi',
  companion: DEFAULT_COMPANION,
  flow: false,
  planner: false,
  foundations: false,
  goalCredit: 'off',
  chronotype: 'notSure',
  preSlumpCheck: false,
  dayStartHour: 0,
};

/** New users begin with an honest empty list; examples are never stored as their work (PLAN 8.13). */
const DEFAULT_TASKS: Task[] = [];

const DEFAULT_NOW = Date.now();
export const DEFAULT_STATE: BloomState = {
  today: dayKeyFor(DEFAULT_NOW),
  now: DEFAULT_NOW,
  mode: 'focus',
  running: false,
  endsAt: null,
  remaining: DEFAULT_SETTINGS.durations.focus,
  sessions: 0,
  streak: 0,
  lastFocusDay: null,
  restDayUsedOn: null,
  comeBack: false,
  justDone: false,
  tasks: DEFAULT_TASKS,
  activeTaskId: null,
  palXp: {},
  goals: [],
  goalLedger: [],
  foundations: EMPTY_FOUNDATIONS,
  dayPlan: EMPTY_DAY_PLAN,
  lastRolloverOfferDay: null,
  armedGoalId: null,
  flowStart: null,
  flowAcc: 0,
  sessionRecords: [],
  historyArchive: emptyHistoryArchive(),
  openFocus: null,
  openFlow: null,
  lastWeeklyReviewWeek: null,
  ifThenPlans: [],
  ritual: DEFAULT_RITUAL,
  lastWoopOfferAt: null,
  preSlump: EMPTY_PRE_SLUMP_CAPS,
  personalCadence: EMPTY_PERSONAL_CADENCE,
  parking: [],
  guideRead: EMPTY_GUIDE_READ_STATE,
  settings: DEFAULT_SETTINGS,
};

/* ------------------------------------------------------------------ *
 * Persistence
 *
 * Saved data lives under one stable key with an internal `version`.
 * On load we (a) import any older key, then (b) step the blob forward
 * through `MIGRATIONS`, then (c) merge against defaults so any field
 * added in a future release simply picks up its default value instead
 * of wiping the user's data. Bump SCHEMA_VERSION + append a migration
 * whenever the shape changes structurally.
 * ------------------------------------------------------------------ */

export const BLOOM_STORAGE_KEY = 'bloom-state';
const STORAGE_KEY = BLOOM_STORAGE_KEY;
/** Older keys we still read from once, newest first. */
const LEGACY_KEYS = ['bloom-state-v2', 'bloom-state-v1'];
export const SCHEMA_VERSION = 31;

export interface PersistedShape {
  version: number;
  sessions: number;
  streak: number;
  lastFocusDay: string | null;
  /** Gentle-streak bookkeeping: last covered rest day + pending welcome (PLAN 5.4). */
  restDayUsedOn: string | null;
  comeBack: boolean;
  tasks: Task[];
  activeTaskId: number | null;
  palXp: Record<string, number>;
  goals: Goal[];
  goalLedger: GoalCredit[];
  foundations: FoundationsState;
  dayPlan: DayPlanState;
  lastRolloverOfferDay: string | null;
  /** Flow stopwatch survives reloads — a stopwatch keeps counting while away. */
  flow: { startedAt: number | null; acc: number; running: boolean };
  /** Per-session records, newest last, capped in sessions.ts. */
  sessionRecords: SessionRecord[];
  /** Compact history retained when live session/task rows leave their slices. */
  historyArchive: HistoryArchive;
  /** Open-session slots — swept into `interrupted` records on boot (focus). */
  openFocus: OpenSession | null;
  openFlow: OpenSession | null;
  /** weekKey() of the last week the weekly review auto-surfaced (PLAN 2.3). */
  lastWeeklyReviewWeek: string | null;
  /** Saved if–then plans (PLAN 3.1). */
  ifThenPlans: IfThenPlan[];
  /** Optional pre-session environment reset (PLAN 3.4). */
  ritual: RitualSettings;
  /** Last conditional WOOP offer; null for users who have never seen it. */
  lastWoopOfferAt: number | null;
  /** Daily/session pre-slump caps; kept outside Settings as runtime history. */
  preSlump: PreSlumpCaps;
  /** Weekly learned cadence cache and prior applied work/break pairs. */
  personalCadence: PersonalCadenceMemory;
  /** Persisted distraction parking lot (PLAN 5.1). */
  parking: ParkedThought[];
  /** Article ids mapped to the last time their read view opened (PLAN 6.2). */
  guideRead: GuideReadState;
  settings: Settings;
}

/**
 * MIGRATIONS[i] upgrades a blob from schema version i to i+1.
 * Append here (never rewrite past entries) when the shape changes.
 */
const MIGRATIONS: Array<(blob: Record<string, unknown>) => Record<string, unknown>> = [
  // v0 (pre-versioned / legacy keys) -> v1 is handled by withDefaults,
  // which tolerates both the old top-level `durations` layout and the v2 shape.
  (blob) => blob,
  // v1 -> v2: per-session records (PLAN 1.1). Existing users start with an
  // empty log; every other field passes through untouched.
  (blob) => ({ ...blob, sessionRecords: [] }),
  // v2 -> v3: open-session bookkeeping (PLAN 1.2). The live session survives
  // in storage so a force-closed one can be finalized as 'interrupted' on
  // next boot. Existing users simply have nothing open.
  (blob) => ({ ...blob, openFocus: null, openFlow: null }),
  // v3 -> v4: drift-event linking (PLAN 1.3). Open sessions now carry the
  // companion drift-event ids logged while they run. Persisted open slots
  // start with an empty list; companion events logged before this version
  // simply stay unlinked (their sessionId is optional).
  (blob) => ({
    ...blob,
    openFocus: blob.openFocus
      ? { ...(blob.openFocus as Record<string, unknown>), driftEventIds: [] }
      : null,
    openFlow: blob.openFlow
      ? { ...(blob.openFlow as Record<string, unknown>), driftEventIds: [] }
      : null,
  }),
  // v4 -> v5: patient check-ins + estimated drift onset (PLAN 1.5). The new
  // fields (`shownAt`, `estOnsetMin`) live on companion events, which persist
  // under their own key and are optional — old events parse unchanged, so
  // this blob needs no transformation. Bumped anyway so every persisted-shape
  // change has a version (constraint #2) and 7.1 gets a fixture per version.
  (blob) => blob,
  // v5 -> v6: weekly review (PLAN 2.3). Tracks the Monday-key of the last
  // calendar week the review card auto-surfaced, so it appears at most once
  // per week. Existing users have never seen one.
  (blob) => ({ ...blob, lastWeeklyReviewWeek: null }),
  // v6 -> v7: if–then plans (PLAN 3.1). Existing users start with an empty
  // list; the fill-in templates live in code, not storage.
  (blob) => ({ ...blob, ifThenPlans: [] }),
  // v7 -> v8: planner wiring (PLAN 3.2). Session records and open-session
  // slots may now carry an optional `ifThenPlanId`; absent on every existing
  // entry, so the blob passes through untouched. Bumped anyway so every
  // persisted-shape change has a version (constraint #2) and 7.1 gets a
  // fixture per version.
  (blob) => blob,
  // v8 -> v9: Tiny Start (PLAN 3.3). The session model already allowed
  // `mode:'tiny'`; this version begins persisting tiny open sessions and
  // proportional (fractional) pal XP. Both fit the existing fields, so no
  // rewrite is needed and every existing value passes through losslessly.
  (blob) => blob,
  // v9 -> v10: Environment reset ritual (PLAN 3.4). Existing users get the
  // feature off, with the four bundled defaults ready if they opt in.
  (blob) => ({ ...blob, ritual: DEFAULT_RITUAL }),
  // v10 -> v11: conditional WOOP offer cooldown (PLAN 3.5). Existing users
  // have never been offered the card; all existing data passes through.
  (blob) => ({ ...blob, lastWoopOfferAt: null }),
  // v11 -> v12: session targets + target outcome (PLAN 4.2). Both fields are
  // optional on records and open sessions, so existing data passes through
  // losslessly and simply has no target answer yet.
  (blob) => blob,
  // v12 -> v13: chronotype self-tag (PLAN 4.4). Preserve the complete settings
  // object and add the neutral answer for existing users; no history changes.
  (blob) => ({
    ...blob,
    settings: {
      ...(blob.settings && typeof blob.settings === 'object'
        ? (blob.settings as Record<string, unknown>)
        : {}),
      chronotype: 'notSure',
    },
  }),
  // v13 -> v14: pre-slump gentle check (PLAN 4.5). It is opt-in, so existing
  // users stay off. Fresh cap state records no prompts and preserves every
  // existing setting and history field unchanged.
  (blob) => ({
    ...blob,
    preSlump: EMPTY_PRE_SLUMP_CAPS,
    settings: {
      ...(blob.settings && typeof blob.settings === 'object'
        ? (blob.settings as Record<string, unknown>)
        : {}),
      preSlumpCheck: false,
    },
  }),
  // v14 -> v15: learned personal cadence (PLAN 4.6). Existing timer settings
  // stay untouched. The weekly cache starts empty and history starts blank;
  // the first natural-pause surface learns from the records already present.
  (blob) => ({ ...blob, personalCadence: EMPTY_PERSONAL_CADENCE }),
  // v15 -> v16: distraction parking lot (PLAN 5.1). Existing users begin
  // with an empty lot; every prior field passes through untouched.
  (blob) => ({ ...blob, parking: [] }),
  // v16 -> v17: persisted re-entry snapshots and next-action cues (PLAN 5.2).
  // Every new field is optional, so old open sessions and permanent records
  // remain valid and acquire no invented history.
  (blob) => blob,
  // v17 -> v18: gentle streak (PLAN 5.4). Existing streak counts and
  // lastFocusDay pass through untouched; the weekly free rest day starts
  // unused and nobody boots into a welcome-back greeting they didn't earn.
  (blob) => ({ ...blob, restDayUsedOn: null, comeBack: false }),
  // v18 -> v19: completion timestamps (a first slice of PLAN 8.20, July
  // 2026). Tasks and goals may now carry an optional `completedAt` epoch-ms
  // stamp, written the moment they finish. Absent on every existing entry —
  // nothing acquires invented history — so the blob passes through
  // untouched. Bumped anyway so every persisted-shape change has a version
  // (constraint #2) and 7.1 gets a fixture per version.
  (blob) => blob,
  // v19 -> v20: task→goal links (the first slice of PLAN 8.12, July 2026).
  // Tasks and open sessions may now carry an optional `goalId` pointing at a
  // planner goal; SessionRecord reserved the field back in PLAN 1.1 and now
  // gets it written. Optional everywhere, so existing data passes through
  // untouched.
  (blob) => blob,
  // v20 -> v21: Field Guide read state (PLAN 6.2). Existing users have not
  // opened a guide article yet; every other persisted slice passes through
  // untouched and the bundled article content remains outside localStorage.
  (blob) => ({ ...blob, guideRead: EMPTY_GUIDE_READ_STATE }),
  // v21 -> v22: contextual Field Guide presentation markers (PLAN 6.3).
  // Preserve every article read timestamp; the new suggestion log starts
  // empty so weekly and 30-day caps can be enforced across future reloads.
  (blob) => ({
    ...blob,
    guideRead: {
      ...((blob.guideRead && typeof blob.guideRead === 'object') ? blob.guideRead : {}),
      suggestions: [],
    },
  }),
  // v22 -> v23: user-controlled study-day boundary (PLAN 9.2). Existing
  // calendar semantics remain midnight; raw session timestamps stay intact.
  (blob) => ({
    ...blob,
    settings: {
      ...(blob.settings && typeof blob.settings === 'object'
        ? (blob.settings as Record<string, unknown>)
        : {}),
      dayStartHour: 0,
    },
  }),
  // v23 -> v24: durable, exactly-once goal-credit offers (PLAN 8.12).
  // Existing users remain fully manual. Optional task/session resolution
  // markers are absent until linked work completes.
  (blob) => ({
    ...blob,
    settings: {
      ...(blob.settings && typeof blob.settings === 'object'
        ? (blob.settings as Record<string, unknown>)
        : {}),
      goalCredit: 'off',
    },
  }),
  // v24 -> v25: goal progress ledger + optional counting unit (PLAN 10.1).
  // Seed one carryover row for every existing positive `done` cache so the
  // new source-of-truth sum preserves progress exactly.
  (blob) => {
    const goals = Array.isArray(blob.goals) ? blob.goals : [];
    const goalLedger = goals.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const goal = value as Record<string, unknown>;
      if (
        !Number.isSafeInteger(goal.id) ||
        !Number.isSafeInteger(goal.done) ||
        (goal.done as number) <= 0
      ) {
        return [];
      }
      const at =
        typeof goal.createdAt === 'number' && Number.isFinite(goal.createdAt)
          ? goal.createdAt
          : 0;
      return [{
        id: `g-carry-${String(goal.id)}`,
        goalId: goal.id,
        delta: goal.done,
        source: 'carryover',
        dayKey: dayKeyFor(at),
        at,
      }];
    });
    return { ...blob, goalLedger };
  },
  // v25 -> v26: daily foundations (PLAN 10.7). The new feature is opt-in and
  // the slice is optional on old blobs, so withDefaults supplies an empty
  // model without inventing any entries or active periods.
  (blob) => blob,
  // v26 -> v27: the original optional single daily target becomes the
  // multi-target day plan (PLAN 9.6 + 10.3). Lift the row without changing
  // its frozen snapshot; normal load validation decides whether it is valid.
  (blob) => ({
    ...blob,
    dayPlan: {
      targets: liftLegacyDailyTarget(blob.dailyTarget),
      archive: Array.isArray(blob.dailyTargetArchive)
        ? blob.dailyTargetArchive
      : [],
    },
  }),
  // v27 -> v28: once-per-study-day rollover triage marker (PLAN 10.5).
  // Existing day plans are unchanged; withDefaults supplies null until the
  // first eligible card is actually shown.
  (blob) => blob,
  // v28 -> v29: repaired session metadata (PLAN 9.5). `edited` and
  // `editedAt` are optional on SessionRecord, so old records remain exact and
  // acquire no invented edit history.
  (blob) => blob,
  // v29 -> v30: compact History archive (PLAN 9.3). Existing records stay in
  // the live log; only future evictions are summarized, so no historical
  // session or task date is inferred during migration.
  (blob) => ({ ...blob, historyArchive: emptyHistoryArchive() }),
  // v30 -> v31: ambient soundscapes removed (PLAN 12.1). `settings.sound`
  // remains the user's completion-chime preference; `settings.bgSound` has no
  // successor and is dropped.
  (blob) => {
    const settings = (blob.settings ?? {}) as Record<string, unknown>;
    const { bgSound: _bgSound, ...rest } = settings;
    return {
      ...blob,
      settings: rest,
    };
  },
];

type ValidationNote = (reason: string) => void;

function finite(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

function validDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function sanitizeTasks(raw: unknown, note?: ValidationNote): Task[] {
  if (raw === undefined) return DEFAULT_TASKS;
  if (!Array.isArray(raw)) {
    note?.('Tasks were not stored as a list.');
    return DEFAULT_TASKS;
  }
  const tasks = raw.filter((value): value is Task => {
    if (!value || typeof value !== 'object') return false;
    const task = value as Record<string, unknown>;
    return (
      integer(task.id) &&
      typeof task.t === 'string' &&
      task.t.trim().length > 0 &&
      task.t.length <= 500 &&
      typeof task.done === 'boolean' &&
      integer(task.pomos) &&
      integer(task.goal, 1, 6) &&
      (task.goalId === undefined || integer(task.goalId)) &&
      (task.goalCredit === undefined ||
        task.goalCredit === 'pending' ||
        task.goalCredit === 'applied' ||
        task.goalCredit === 'skipped') &&
      (task.completedAt === undefined || finite(task.completedAt))
    );
  });
  if (tasks.length !== raw.length) note?.('Malformed tasks were set aside.');
  return tasks;
}

function sanitizeGoals(raw: unknown, note?: ValidationNote): Goal[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    note?.('Goals were not stored as a list.');
    return [];
  }
  const goals: Goal[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const goal = value as Record<string, unknown>;
    if (
      !integer(goal.id) ||
      typeof goal.title !== 'string' ||
      goal.title.trim().length === 0 ||
      goal.title.length > 500 ||
      !validDayKey(goal.due) ||
      !integer(goal.target, 1, GOAL_TARGET_MAX) ||
      !integer(goal.done, 0, goal.target as number) ||
      (goal.unit !== undefined && typeof goal.unit !== 'string') ||
      (goal.createdAt !== undefined && !finite(goal.createdAt)) ||
      (goal.completedAt !== undefined && !finite(goal.completedAt))
    ) {
      continue;
    }
    goals.push({
      ...(goal as unknown as Goal),
      // Very old planner blobs omitted this field. Zero is an honest
      // timestamp-unknown sentinel; never invent the migration instant.
      createdAt: finite(goal.createdAt) ? goal.createdAt : 0,
      unit: normalizeGoalUnit(goal.unit),
      completedAt:
        goal.done === goal.target && finite(goal.completedAt)
          ? goal.completedAt
          : undefined,
    });
  }
  if (goals.length !== raw.length) note?.('Malformed goals were set aside.');
  return goals;
}

function sanitizePalXp(raw: unknown, note?: ValidationNote): Record<string, number> {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    note?.('Friend progress was not stored as an object.');
    return {};
  }
  const xp: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (name && finite(value)) xp[name] = value;
    else note?.('Malformed friend progress was set aside.');
  }
  return xp;
}

function withDefaults(blob: Record<string, unknown>, note?: ValidationNote): PersistedShape {
  const b = blob ?? {};
  const bSettings =
    b.settings && typeof b.settings === 'object' && !Array.isArray(b.settings)
      ? (b.settings as Partial<Settings>)
      : {};
  if (b.settings !== undefined && bSettings !== b.settings) {
    note?.('Settings were not stored as an object.');
  }
  // Legacy v1 stored durations at the top level, not under `settings`.
  const legacyDurations =
    b.durations && typeof b.durations === 'object'
      ? (b.durations as Partial<Durations>)
      : {};
  const validChronotypes: Chronotype[] = ['betterEarlier', 'betterLater', 'notSure'];
  const validGoalCredit = ['off', 'ask', 'auto'] as const;
  const invalidSetting = (
    key: keyof Settings,
    valid: (value: unknown) => boolean,
  ) => {
    if (bSettings[key] !== undefined && !valid(bSettings[key])) {
      note?.(`The ${String(key)} setting was invalid.`);
    }
  };
  invalidSetting('name', (value) => typeof value === 'string');
  invalidSetting('sound', (value) => typeof value === 'boolean');
  invalidSetting('autoStart', (value) => typeof value === 'boolean');
  invalidSetting('night', (value) => typeof value === 'boolean');
  invalidSetting('pal', (value) => typeof value === 'string' && value.length > 0);
  invalidSetting('flow', (value) => typeof value === 'boolean');
  invalidSetting('planner', (value) => typeof value === 'boolean');
  invalidSetting('foundations', (value) => typeof value === 'boolean');
  invalidSetting('goalCredit', (value) =>
    validGoalCredit.includes(value as (typeof validGoalCredit)[number]));
  invalidSetting('chronotype', (value) =>
    validChronotypes.includes(value as Chronotype));
  invalidSetting('preSlumpCheck', (value) => typeof value === 'boolean');
  invalidSetting('dayStartHour', (value) => integer(value, 0, 23));
  const rawDurations = {
    ...legacyDurations,
    ...(bSettings.durations && typeof bSettings.durations === 'object'
      ? bSettings.durations
      : {}),
  };
  if (
    bSettings.durations !== undefined &&
    (!bSettings.durations || typeof bSettings.durations !== 'object')
  ) {
    note?.('Timer durations were not stored as an object.');
  }
  const duration = (mode: DurationMode): number => {
    const value = rawDurations[mode];
    if (value === undefined) return DEFAULT_SETTINGS.durations[mode];
    if (!finite(value, 1)) {
      note?.(`The ${mode} duration was invalid.`);
      return DEFAULT_SETTINGS.durations[mode];
    }
    return value;
  };
  const rawCompanion: Partial<CompanionSettings> =
    bSettings.companion &&
    typeof bSettings.companion === 'object' &&
    !Array.isArray(bSettings.companion)
      ? bSettings.companion
      : {};
  if (
    bSettings.companion !== undefined &&
    (!bSettings.companion ||
      typeof bSettings.companion !== 'object' ||
      Array.isArray(bSettings.companion))
  ) {
    note?.('Companion settings were not stored as an object.');
  }
  const companion: CompanionSettings = {
    on:
      typeof rawCompanion.on === 'boolean'
        ? rawCompanion.on
        : DEFAULT_COMPANION.on,
    checkinMins: integer(rawCompanion.checkinMins, 1)
      ? rawCompanion.checkinMins
      : DEFAULT_COMPANION.checkinMins,
    tabDetect:
      typeof rawCompanion.tabDetect === 'boolean'
        ? rawCompanion.tabDetect
        : DEFAULT_COMPANION.tabDetect,
    awaySecs: integer(rawCompanion.awaySecs, 1)
      ? rawCompanion.awaySecs
      : DEFAULT_COMPANION.awaySecs,
    quiet:
      typeof rawCompanion.quiet === 'boolean'
        ? rawCompanion.quiet
        : DEFAULT_COMPANION.quiet,
    intention:
      typeof rawCompanion.intention === 'boolean'
        ? rawCompanion.intention
        : DEFAULT_COMPANION.intention,
  };
  if (
    bSettings.companion !== undefined &&
    JSON.stringify(companion) !== JSON.stringify({ ...DEFAULT_COMPANION, ...rawCompanion })
  ) {
    note?.('Companion settings were normalized.');
  }
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    name: typeof bSettings.name === 'string' ? bSettings.name : DEFAULT_SETTINGS.name,
    sound: typeof bSettings.sound === 'boolean' ? bSettings.sound : DEFAULT_SETTINGS.sound,
    autoStart:
      typeof bSettings.autoStart === 'boolean'
        ? bSettings.autoStart
        : DEFAULT_SETTINGS.autoStart,
    night: typeof bSettings.night === 'boolean' ? bSettings.night : DEFAULT_SETTINGS.night,
    pal:
      typeof bSettings.pal === 'string' && bSettings.pal.length > 0
        ? bSettings.pal
        : DEFAULT_SETTINGS.pal,
    flow: typeof bSettings.flow === 'boolean' ? bSettings.flow : DEFAULT_SETTINGS.flow,
    planner:
      typeof bSettings.planner === 'boolean'
        ? bSettings.planner
        : DEFAULT_SETTINGS.planner,
    foundations:
      typeof bSettings.foundations === 'boolean'
        ? bSettings.foundations
        : DEFAULT_SETTINGS.foundations,
    chronotype: validChronotypes.includes(bSettings.chronotype as Chronotype)
      ? (bSettings.chronotype as Chronotype)
      : DEFAULT_SETTINGS.chronotype,
    goalCredit: validGoalCredit.includes(
      bSettings.goalCredit as (typeof validGoalCredit)[number],
    )
      ? (bSettings.goalCredit as Settings['goalCredit'])
      : DEFAULT_SETTINGS.goalCredit,
    preSlumpCheck:
      typeof bSettings.preSlumpCheck === 'boolean'
        ? bSettings.preSlumpCheck
        : DEFAULT_SETTINGS.preSlumpCheck,
    dayStartHour: normalizeDayStartHour(bSettings.dayStartHour),
    durations: {
      focus: duration('focus'),
      short: duration('short'),
      long: duration('long'),
    },
    companion,
  };
  const sanitizedGoals = sanitizeGoals(b.goals, note);
  const sanitizedLedger = sanitizeGoalLedger(b.goalLedger, sanitizedGoals);
  const goals = sanitizedLedger.goals;
  const goalLedger = sanitizedLedger.ledger;
  if (
    b.goalLedger !== undefined &&
    (!Array.isArray(b.goalLedger) || b.goalLedger.length !== goalLedger.length)
  ) {
    note?.('Malformed goal progress rows were set aside.');
  }
  const goalIds = new Set(goals.map((goal) => goal.id));
  const tasks = sanitizeTasks(b.tasks, note).map((task) => {
    if (task.goalId === undefined || goalIds.has(task.goalId)) return task;
    note?.('A dangling task goal link was cleared.');
    return { ...task, goalId: undefined };
  });
  const rawFlow = (b.flow as Partial<PersistedShape['flow']> | undefined) ?? {};
  const flow = {
    startedAt: typeof rawFlow.startedAt === 'number' ? rawFlow.startedAt : null,
    acc: typeof rawFlow.acc === 'number' && Number.isFinite(rawFlow.acc) ? Math.max(0, rawFlow.acc) : 0,
    running: rawFlow.running === true,
  };
  const sessionRecords = sanitizeSessionRecords(b.sessionRecords);
  const historyArchive = sanitizeHistoryArchive(b.historyArchive);
  const openFocus = keepOpenSession(b.openFocus, 'focus');
  const openFlow = keepOpenSession(b.openFlow, 'flow');
  const ifThenPlans = sanitizeIfThenPlans(b.ifThenPlans);
  const foundations = sanitizeFoundations(b.foundations, {
    validIfThenIds: ifThenPlans.map((plan) => plan.id),
    todayKey: dayKeyFor(Date.now(), settings.dayStartHour),
  });
  const dayPlan = sanitizeDayPlan(b.dayPlan);
  const ritual = sanitizeRitual(b.ritual);
  const preSlump = sanitizePreSlumpCaps(b.preSlump);
  const personalCadence = sanitizePersonalCadenceMemory(b.personalCadence);
  const parking = sanitizeParkedThoughts(b.parking);
  const guideRead = sanitizeGuideReadState(b.guideRead);
  if (b.flow !== undefined && (!b.flow || typeof b.flow !== 'object')) {
    note?.('Flow state was malformed.');
  }
  if (b.sessions !== undefined && !integer(b.sessions)) {
    note?.('The session counter was invalid.');
  }
  if (b.streak !== undefined && !integer(b.streak)) {
    note?.('The streak counter was invalid.');
  }
  if (b.lastFocusDay !== undefined && b.lastFocusDay !== null && !validDayKey(b.lastFocusDay)) {
    note?.('The last focus day was invalid.');
  }
  if (b.restDayUsedOn !== undefined && b.restDayUsedOn !== null && !validDayKey(b.restDayUsedOn)) {
    note?.('The rest-day marker was invalid.');
  }
  if (b.comeBack !== undefined && typeof b.comeBack !== 'boolean') {
    note?.('The welcome-back marker was invalid.');
  }
  if (
    b.activeTaskId !== undefined &&
    b.activeTaskId !== null &&
    (!integer(b.activeTaskId) ||
      !tasks.some((task) => task.id === b.activeTaskId && !task.done))
  ) {
    note?.('The active-task link was invalid.');
  }
  if (
    b.lastWoopOfferAt !== undefined &&
    b.lastWoopOfferAt !== null &&
    !finite(b.lastWoopOfferAt)
  ) {
    note?.('The last offer timestamp was invalid.');
  }
  if (
    Array.isArray(b.sessionRecords) &&
    sessionRecords.length !== b.sessionRecords.length
  ) {
    note?.('Malformed session records were set aside.');
  } else if (b.sessionRecords !== undefined && !Array.isArray(b.sessionRecords)) {
    note?.('Session records were not stored as a list.');
  }
  if (b.openFocus !== undefined && b.openFocus !== null && openFocus === null) {
    note?.('The open focus session was malformed.');
  }
  if (b.openFlow !== undefined && b.openFlow !== null && openFlow === null) {
    note?.('The open flow session was malformed.');
  }
  if (
    Array.isArray(b.ifThenPlans) &&
    ifThenPlans.length !== b.ifThenPlans.length
  ) {
    note?.('Malformed saved plans were set aside.');
  }
  if (Array.isArray(b.parking) && parking.length !== b.parking.length) {
    note?.('Malformed parked thoughts were set aside.');
  }
  for (const key of ['ritual', 'preSlump', 'personalCadence', 'guideRead', 'foundations', 'dayPlan', 'historyArchive'] as const) {
    if (b[key] !== undefined && (!b[key] || typeof b[key] !== 'object')) {
      note?.(`${key} was malformed.`);
    }
  }
  return {
    version: SCHEMA_VERSION,
    sessions: integer(b.sessions) ? b.sessions : 0,
    streak: integer(b.streak) ? b.streak : 0,
    lastFocusDay: validDayKey(b.lastFocusDay) ? b.lastFocusDay : null,
    restDayUsedOn: validDayKey(b.restDayUsedOn) ? b.restDayUsedOn : null,
    comeBack: b.comeBack === true,
    tasks,
    activeTaskId:
      integer(b.activeTaskId) && tasks.some((task) => task.id === b.activeTaskId && !task.done)
        ? b.activeTaskId
        : null,
    palXp: sanitizePalXp(b.palXp, note),
    goals,
    goalLedger,
    foundations,
    dayPlan,
    lastRolloverOfferDay: validDayKey(b.lastRolloverOfferDay)
      ? b.lastRolloverOfferDay
      : null,
    flow,
    sessionRecords,
    historyArchive,
    openFocus,
    openFlow,
    lastWeeklyReviewWeek:
      typeof b.lastWeeklyReviewWeek === 'string' ? (b.lastWeeklyReviewWeek as string) : null,
    ifThenPlans,
    ritual,
    lastWoopOfferAt:
      typeof b.lastWoopOfferAt === 'number' && Number.isFinite(b.lastWoopOfferAt)
        ? b.lastWoopOfferAt
        : null,
    preSlump,
    personalCadence,
    parking,
    guideRead,
    settings,
  };
}

function sanitizePreSlumpCaps(raw: unknown): PreSlumpCaps {
  if (!raw || typeof raw !== 'object') return EMPTY_PRE_SLUMP_CAPS;
  const value = raw as Partial<PreSlumpCaps>;
  return {
    day: typeof value.day === 'string' ? value.day : null,
    count:
      typeof value.count === 'number' && Number.isFinite(value.count)
        ? Math.max(0, Math.min(PRE_SLUMP_DAILY_CAP, Math.floor(value.count)))
        : 0,
    silenced: value.silenced === true,
    lastSessionId: typeof value.lastSessionId === 'string' ? value.lastSessionId : null,
  };
}

/** An open-session slot only counts if it parses and sits in the right slot. */
function keepOpenSession(raw: unknown, slot: 'focus' | 'flow'): OpenSession | null {
  const open = sanitizeOpenSession(raw);
  const fitsSlot = slot === 'flow' ? open?.mode === 'flow' : open?.mode === 'focus' || open?.mode === 'tiny';
  return open && fitsSlot ? open : null;
}

export function migratePersistedBlob(
  blob: Record<string, unknown>,
  note?: ValidationNote,
): PersistedShape {
  let cur = blob && typeof blob === 'object' ? { ...blob } : {};
  let v = Number.isSafeInteger(cur.version) ? (cur.version as number) : 0;
  if (v < 0 || v > SCHEMA_VERSION) throw new Error('unsupported Bloom storage version');
  for (; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) cur = step(cur);
  }
  return withDefaults(cur, note);
}

export function readPersisted(): PersistedShape | null {
  // A corrupt newest blob must not hide a valid legacy backup. Parse each
  // candidate independently and keep walking when one is unreadable.
  let sawFailure = false;
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('the saved Bloom copy is not an object');
      }
      const sourceVersion = Number.isSafeInteger(
        (parsed as Record<string, unknown>).version,
      )
        ? ((parsed as Record<string, unknown>).version as number)
        : 0;
      const reasons = new Set<string>();
      const persisted = migratePersistedBlob(
        parsed as Record<string, unknown>,
        sourceVersion === SCHEMA_VERSION
          ? (reason) => reasons.add(reason)
          : undefined,
      );
      if (reasons.size) {
        sawFailure = true;
        reportStorageFailure({
          area: 'bloom-state',
          key,
          kind: 'validation',
          reason: [...reasons].join(' '),
          raw,
        });
      } else if (!sawFailure) {
        clearStorageFailure('bloom-state');
      }
      return persisted;
    } catch (error) {
      sawFailure = true;
      reportStorageFailure({
        area: 'bloom-state',
        key,
        kind: 'read',
        reason: error instanceof Error ? error.message : 'The saved Bloom copy could not be read.',
        raw,
      });
    }
  }
  if (!sawFailure) clearStorageFailure('bloom-state');
  return null;
}

/** A flow run restored past this is treated as forgotten, not still going. */
const FLOW_RESTORE_CAP_S = 4 * 3600;

export function loadState(): BloomState {
  const now = Date.now();
  const p = readPersisted();
  if (!p) return initializeDay(DEFAULT_STATE, now);
  // A return question that was already on screen survives a reload exactly
  // as-is. Every other stale focus countdown keeps the existing safety rule:
  // finalize it as interrupted and offer a one-tap re-entry cue.
  const pendingReturn = Boolean(p.openFocus?.returnSnapshot?.returnedAt);
  const swept = p.openFocus && !pendingReturn ? sweepStaleOpenSession(p.openFocus) : null;
  const sweptHistory = swept
    ? appendSessionRecordWithArchive(p.sessionRecords, p.historyArchive, swept)
    : null;
  const sessionRecords = sweptHistory?.records ?? p.sessionRecords;
  const historyArchive = sweptHistory?.archive ?? p.historyArchive;
  const parking = swept
    ? revealParkedThoughts(p.parking, swept.id, swept.endedAt)
    : p.parking;
  const base: BloomState = {
    ...DEFAULT_STATE,
    today: dayKeyFor(now, p.settings.dayStartHour),
    now,
    settings: p.settings,
    remaining: p.settings.durations.focus,
    sessions: p.sessions,
    // Keep the prior count in storage while it is set aside. The next
    // finished session starts the fresh count; booting must not erase data.
    streak: p.streak,
    lastFocusDay: p.lastFocusDay,
    restDayUsedOn: p.restDayUsedOn,
    comeBack: p.comeBack,
    tasks: p.tasks,
    activeTaskId: p.activeTaskId,
    palXp: p.palXp,
    goals: p.goals,
    goalLedger: p.goalLedger,
    foundations: p.foundations,
    dayPlan: p.dayPlan,
    lastRolloverOfferDay: p.lastRolloverOfferDay,
    flowAcc: p.flow.acc,
    sessionRecords,
    historyArchive,
    openFocus: pendingReturn ? p.openFocus : null,
    openFlow: p.openFlow,
    lastWeeklyReviewWeek: p.lastWeeklyReviewWeek,
    ifThenPlans: p.ifThenPlans,
    ritual: p.ritual,
    lastWoopOfferAt: p.lastWoopOfferAt,
    preSlump: p.preSlump,
    personalCadence: p.personalCadence,
    parking,
    guideRead: p.guideRead,
  };
  if (pendingReturn && p.openFocus?.returnSnapshot) {
    // The clock kept moving while away; show the live countdown (held at
    // zero — completion waits for the return question's answer).
    const live =
      p.openFocus.running && p.openFocus.endsAt != null
        ? Math.max(0, Math.ceil((p.openFocus.endsAt - now) / 1000))
        : p.openFocus.returnSnapshot.remainingSec;
    return initializeDay({
      ...base,
      mode: p.openFocus.mode,
      running: p.openFocus.running,
      endsAt: p.openFocus.endsAt,
      remaining: live,
    }, now);
  }
  // A flow run that was live when the app closed keeps counting (that's what
  // a stopwatch does) — unless it's been so long it was clearly abandoned, in
  // which case it comes back paused, banked at the cap.
  if (p.settings.flow && p.flow.running && p.flow.startedAt != null) {
    const elapsed = p.flow.acc + (now - p.flow.startedAt) / 1000;
    if (elapsed < FLOW_RESTORE_CAP_S) {
      return initializeDay({
        ...base,
        mode: 'flow',
        running: true,
        flowStart: p.flow.startedAt,
        remaining: Math.floor(elapsed),
      }, now);
    }
    return initializeDay({
      ...base,
      mode: 'flow',
      flowAcc: FLOW_RESTORE_CAP_S,
      remaining: FLOW_RESTORE_CAP_S,
    }, now);
  }
  return initializeDay(base, now);
}

/**
 * Apply the gentle-streak day sweep used by both boot and live rollover.
 * `today`/`now` are runtime clock fields and deliberately stay out of
 * PersistedShape, so PLAN 8.23 does not change the storage schema.
 */
function initializeDay(s: BloomState, now: number): BloomState {
  const today = dayKeyFor(now, s.settings.dayStartHour);
  const alive = streakAlive(
    { streak: s.streak, lastFocusDay: s.lastFocusDay, restDayUsedOn: s.restDayUsedOn },
    today,
  );
  const taskActual = (target: TaskDailyTarget) =>
    s.sessionRecords.filter(
      (record) =>
        record.taskId === target.taskId &&
        sessionCountsTowardDay(record) &&
        dayKeyFor(record.endedAt, s.settings.dayStartHour) === target.dayKey,
    ).length;
  return {
    ...s,
    today,
    now,
    dayPlan: compactDailyTargets(s.dayPlan, s.goalLedger, today, taskActual),
    comeBack: alive ? s.comeBack : s.comeBack || s.streak > 0,
  };
}

/** Same-day clock checks are a strict no-op so consumers do not re-render. */
function rollOverDay(s: BloomState, now: number): BloomState {
  return dayKeyFor(now, s.settings.dayStartHour) === s.today
    ? s
    : initializeDay(s, now);
}

export function persistedShapeFromState(s: BloomState): PersistedShape {
  return {
    version: SCHEMA_VERSION,
    sessions: s.sessions,
    streak: s.streak,
    lastFocusDay: s.lastFocusDay,
    restDayUsedOn: s.restDayUsedOn,
    comeBack: s.comeBack,
    tasks: s.tasks,
    activeTaskId: s.activeTaskId,
    palXp: s.palXp,
    goals: s.goals,
    goalLedger: s.goalLedger,
    foundations: s.foundations,
    dayPlan: s.dayPlan,
    lastRolloverOfferDay: s.lastRolloverOfferDay,
    flow: { startedAt: s.flowStart, acc: s.flowAcc, running: s.running && s.mode === 'flow' },
    sessionRecords: s.sessionRecords,
    historyArchive: s.historyArchive,
    openFocus: s.openFocus,
    openFlow: s.openFlow,
    lastWeeklyReviewWeek: s.lastWeeklyReviewWeek,
    ifThenPlans: s.ifThenPlans,
    ritual: s.ritual,
    lastWoopOfferAt: s.lastWoopOfferAt,
    preSlump: s.preSlump,
    personalCadence: s.personalCadence,
    parking: s.parking,
    guideRead: s.guideRead,
    settings: s.settings,
  };
}

function persist(s: BloomState, force = false): boolean {
  const data = persistedShapeFromState(s);
  if (!force && storageWritesBlocked('bloom-state')) return false;
  let prior: string | null = null;
  try {
    prior = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    clearStorageFailure('bloom-state');
    return true;
  } catch (error) {
    reportStorageFailure({
      area: 'bloom-state',
      key: STORAGE_KEY,
      kind: 'write',
      reason: error instanceof Error ? error.message : 'Bloom could not save this change.',
      raw: prior,
    });
    return false;
  }
}

/** Count a finished work session into the configured study day (PLAN 5.4/9.2). */
function bumpStreak(
  s: BloomState,
  record: SessionRecord,
): Pick<BloomState, 'streak' | 'lastFocusDay' | 'restDayUsedOn' | 'comeBack'> {
  if (!sessionCountsTowardDay(record)) {
    return {
      streak: s.streak,
      lastFocusDay: s.lastFocusDay,
      restDayUsedOn: s.restDayUsedOn,
      comeBack: s.comeBack,
    };
  }
  const bumped = bumpStreakGentle(
    { streak: s.streak, lastFocusDay: s.lastFocusDay, restDayUsedOn: s.restDayUsedOn },
    dayKeyFor(record.endedAt, s.settings.dayStartHour),
  );
  // Any finished work session settles the welcome-back state: the user is
  // simply here again, and the count is growing.
  return { ...bumped, comeBack: false };
}

function beginGoalCredit(
  ledger: GoalCredit[],
  goals: Goal[],
  goalId: number | undefined,
  preference: Settings['goalCredit'],
  source: 'manual' | 'session',
  dayStartHour: number,
  at = Date.now(),
  sessionId?: string,
): { ledger: GoalCredit[]; goals: Goal[]; status?: GoalCreditStatus } {
  if (
    goalId == null ||
    preference === 'off' ||
    !goals.some((goal) => goal.id === goalId && goal.done < goal.target)
  ) {
    return { ledger, goals };
  }
  if (preference === 'ask') return { ledger, goals, status: 'pending' };
  const credited = appendGoalCredit(ledger, goals, {
    goalId,
    requestedDelta: 1,
    source,
    at,
    dayStartHour,
    sessionId,
  });
  return {
    ledger: credited.ledger,
    goals: credited.goals,
    status: credited.appliedDelta !== 0 ? 'credited' : undefined,
  };
}

function streakFromRawRecords(
  records: SessionRecord[],
  dayStartHour: number,
): StreakData | null {
  const days = [...new Set(
    records
      .filter((record) => record.outcome === 'completed')
      .map((record) => dayKeyFor(record.endedAt, dayStartHour)),
  )].sort();
  if (days.length === 0) return null;
  return days.reduce<StreakData>(
    (current, day) => bumpStreakGentle(current, day),
    { streak: 0, lastFocusDay: null, restDayUsedOn: null },
  );
}

/**
 * Re-group the observable streak tail without inventing missing history.
 *
 * The session ring is the raw source available today. When its newest
 * completion agrees with the persisted summary, the difference between the
 * stored streak and the observable tail is an older prefix; preserve that
 * prefix while re-deriving the tail under the new boundary. If they do not
 * agree, the log cannot safely explain the summary, so leave it untouched.
 */
export function rederiveStreakForBoundary(
  state: Pick<
    BloomState,
    'streak' | 'lastFocusDay' | 'restDayUsedOn' | 'sessionRecords' | 'settings'
  >,
  nextDayStartHour: number,
): StreakData {
  const current: StreakData = {
    streak: state.streak,
    lastFocusDay: state.lastFocusDay,
    restDayUsedOn: state.restDayUsedOn,
  };
  const priorTail = streakFromRawRecords(
    state.sessionRecords,
    state.settings.dayStartHour,
  );
  const nextTail = streakFromRawRecords(state.sessionRecords, nextDayStartHour);
  if (
    !priorTail ||
    !nextTail ||
    priorTail.lastFocusDay !== state.lastFocusDay
  ) {
    return current;
  }
  const olderPrefix = Math.max(0, state.streak - priorTail.streak);
  return {
    streak: olderPrefix + nextTail.streak,
    lastFocusDay: nextTail.lastFocusDay,
    restDayUsedOn:
      nextTail.restDayUsedOn ?? (olderPrefix > 0 ? state.restDayUsedOn : null),
  };
}

/** The task pomodoros are credited to: the chosen one if still open, else first undone. */
export function resolveActiveTask(tasks: Task[], activeTaskId: number | null): Task | undefined {
  const chosen = tasks.find((t) => t.id === activeTaskId && !t.done);
  return chosen ?? tasks.find((t) => !t.done);
}

/** Seconds on the flow stopwatch right now (banked + the live run, if any). */
function flowElapsed(s: BloomState, now = Date.now()): number {
  const live = s.running && s.flowStart != null ? (now - s.flowStart) / 1000 : 0;
  return Math.max(0, s.flowAcc + live);
}

/** A finished flow banks at most this many pomodoro-equivalents. */
const FLOW_CREDIT_CAP = 12;

/**
 * Convert elapsed Flow time into the same nearest-block credit used by both
 * the live preview and the reducer reward (PLAN 7.4f).
 */
export function flowCreditsForElapsed(elapsedSec: number, focusSec: number): number {
  const safeElapsed = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  const safeFocus = Number.isFinite(focusSec) ? Math.max(60, focusSec) : 60;
  return Math.min(FLOW_CREDIT_CAP, Math.round(safeElapsed / safeFocus));
}

/** Minutes the open focus countdown has actually run (paused time excluded). */
function focusElapsedMin(s: BloomState, now = Date.now()): number {
  const plannedSec = (s.openFocus?.plannedMin ?? 0) * 60;
  const remaining =
    s.running && s.endsAt != null ? Math.max(0, (s.endsAt - now) / 1000) : s.remaining;
  return Math.max(0, (plannedSec - remaining) / 60);
}

export const FALSE_START_GRACE_SEC = 15;

/**
 * One transition matrix for every UI control that can touch timer identity.
 * `allow` means the reducer already preserves the open record (task changes,
 * next-session duration edits, navigation, or banking Flow). Focus/Tiny
 * false starts are the sole discard path and never become behavior evidence.
 */
export function timerTransitionPolicy(
  state: BloomState,
  intent: TimerTransitionIntent,
  now = Date.now(),
): TimerTransitionDecision {
  if (intent === 'activeTask' || intent === 'cadence' || intent === 'duration') {
    return { kind: 'allow' };
  }
  if (intent === 'navigation') {
    return state.openFocus?.returnSnapshot
      ? {
          kind: 'confirm',
          title: 'Settle this return first?',
          description: 'Keep this moment open, or end the session before leaving.',
          confirmLabel: 'end & leave',
        }
      : { kind: 'allow' };
  }

  const destructiveFocusIntent =
    intent === 'mode' || intent === 'reset' || intent === 'skip';
  if (state.openFocus && (state.mode === 'focus' || state.mode === 'tiny') && destructiveFocusIntent) {
    if (state.openFocus.returnSnapshot) {
      return {
        kind: 'confirm',
        title: 'End this open session?',
        description: 'Your return check is still open. Keep going, or end this session.',
        confirmLabel: 'end session',
      };
    }
    const elapsedSec = focusElapsedMin(state, now) * 60;
    if (elapsedSec <= FALSE_START_GRACE_SEC) return { kind: 'discardFalseStart' };
    const elapsedLabel =
      elapsedSec < 60 ? 'under a minute' : `${Math.max(1, Math.round(elapsedSec / 60))} min`;
    if (intent === 'reset') {
      return {
        kind: 'confirm',
        title: 'Reset this session?',
        description: `You’re ${elapsedLabel} in. Resetting ends this session and records it as ended early.`,
        confirmLabel: 'end & reset',
      };
    }
    if (intent === 'skip') {
      return {
        kind: 'confirm',
        title: 'Skip this session?',
        description: `You’re ${elapsedLabel} in. Skipping ends this session and records it as ended early.`,
        confirmLabel: 'end & skip',
      };
    }
    return {
      kind: 'confirm',
      title: 'End this session?',
      description: `You’re ${elapsedLabel} into this ${state.mode} — end it and continue?`,
      confirmLabel: 'end & continue',
    };
  }

  if (
    state.openFlow &&
    (intent === 'reset' || intent === 'flowOff')
  ) {
    const elapsedSec = flowElapsed(state, now);
    const elapsedLabel =
      elapsedSec < 60 ? 'under a minute' : `${Math.max(1, Math.round(elapsedSec / 60))} min`;
    return {
      kind: 'confirm',
      title: 'End this Flow session?',
      description: `This stopwatch has ${elapsedLabel} banked. Keep it, or end it without session credit.`,
      confirmLabel: 'end flow',
    };
  }

  return { kind: 'allow' };
}

/**
 * Tiny sessions earn the same XP unit as focus sessions, scaled by minutes.
 * Keep two decimals so even the smallest allowed rung against a 90-minute
 * focus preset remains visibly positive; a tiny rung can never mint more than
 * one full focus session's XP.
 */
export function tinyXpFor(plannedMin: number, focusMin: number): number {
  const ratio = Math.max(0, plannedMin) / Math.max(1, focusMin);
  return Math.max(0.01, Math.min(1, Math.round(ratio * 100) / 100));
}

/** Reset keeps a selected 2/5-minute rung; a reset extension returns to 2. */
export function tinyResetMinutes(
  openPlannedMin: number | null | undefined,
  remainingSec: number,
): TinyStartMinutes {
  const selectedMin = openPlannedMin ?? remainingSec / 60;
  return TINY_START_OPTIONS.includes(selectedMin as TinyStartMinutes)
    ? (selectedMin as TinyStartMinutes)
    : TINY_START_OPTIONS[0];
}

/** The one-time 10-minute offer follows only a completed 2/5-minute rung. */
export function isTinyFirstRung(record: SessionRecord | undefined): boolean {
  return Boolean(
    record &&
      record.mode === 'tiny' &&
      record.outcome === 'completed' &&
      record.plannedMin != null &&
      TINY_START_OPTIONS.includes(record.plannedMin as TinyStartMinutes),
  );
}

export interface CompletionNotice {
  title: string;
  body: string;
}

/** Mode-aware completion copy so finishing a break never suggests another break. */
export function completionNotice(
  mode: TimerMode,
  holdsTinyOffer = false,
): CompletionNotice {
  if (mode === 'flow') {
    return {
      title: '🌸 Flow banked!',
      body: 'Lovely stretch of focus — treat yourself to a real break.',
    };
  }
  if (holdsTinyOffer) {
    return {
      title: '🌸 Tiny start complete!',
      body: 'That first step bloomed — ten more minutes are optional.',
    };
  }
  if (mode === 'short' || mode === 'long') {
    return {
      title: '🌱 Break complete!',
      body: 'Ready when you are — the next focus session is yours to start.',
    };
  }
  return {
    title: '🌸 Session done!',
    body: 'Nice work — time for a little break.',
  };
}

export type Action =
  | { type: 'replaceState'; state: BloomState }
  | { type: 'tick'; at?: number }
  | { type: 'rollOverDay'; at: number }
  // `at` (PLAN 13.18): the wall clock this toggle actually happened at. A
  // control pressed in system UI while the WebView was suspended replays with
  // its recorded instant, never with the instant the queue was drained.
  | { type: 'toggle'; ifThenPlanId?: string; targetText?: string; at?: number }
  | { type: 'reset' }
  | { type: 'discardFalseStart' }
  | { type: 'pick'; mode: TimerMode; tinyMinutes?: TinyStartMinutes }
  | { type: 'skip' }
  | { type: 'complete' }
  | { type: 'extendTiny' }
  | { type: 'declineTiny' }
  | { type: 'finishFlow' }
  | { type: 'clearDone' }
  | { type: 'toggleTask'; id: number }
  | { type: 'setTaskGoal'; id: number; goalId?: number }
  | {
      type: 'resolveGoalCredit';
      source: 'task' | 'session';
      id: number | string;
      apply: boolean;
      /** PLAN 10.2 debrief amount; task credits keep their one-part default. */
      amount?: number;
    }
  | { type: 'addTask'; text: string; goal: number; goalId?: number }
  | { type: 'removeTask'; id: number }
  | { type: 'restoreTask'; task: Task; index: number; wasActive: boolean }
  | { type: 'setActiveTask'; id: number }
  | { type: 'addGoal'; title: string; due: string; target: number; unit?: string }
  | { type: 'updateGoal'; id: number; patch: Partial<Pick<Goal, 'title' | 'due' | 'target' | 'unit'>> }
  | { type: 'removeGoal'; id: number }
  | {
      type: 'restoreGoal';
      goal: Goal;
      index: number;
      linkedTaskIds: number[];
      goalCredits?: GoalCredit[];
    }
  | { type: 'logGoal'; id: number; delta: number }
  | { type: 'addGoalDailyTarget'; goalId: number; plannedAmount: number; targetAt: number }
  | { type: 'addTaskDailyTarget'; taskId: number; plannedAmount: number; targetAt: number }
  | { type: 'editDailyTarget'; id: string; plannedAmount: number }
  | { type: 'dismissDailyTarget'; id: string }
  | { type: 'armGoal'; goalId: number | null }
  | { type: 'markRolloverOffered'; dayKey: string }
  | { type: 'resolveRollover'; id: string; choice: 'carry' | 'rest' }
  | { type: 'clearFocusData' }
  | { type: 'linkDrift'; eventId: string; sessionId: string }
  | { type: 'markWeeklyReview'; week: string }
  | { type: 'addIfThenPlan'; cueType: CueType; cueText: string; actionText: string; taskId?: number }
  | { type: 'updateIfThenPlan'; id: string; patch: Partial<Pick<IfThenPlan, 'cueType' | 'cueText' | 'actionText' | 'taskId'>> }
  | { type: 'removeIfThenPlan'; id: string }
  | { type: 'useIfThenPlan'; id: string }
  | { type: 'patchRitual'; patch: Partial<Pick<RitualSettings, 'enabled' | 'suggestionSeen'>> }
  | { type: 'updateRitualItem'; id: string; text: string }
  | { type: 'markWoopOffered'; at: number }
  | { type: 'recordPreSlump'; sessionId: string; at: number }
  | { type: 'silencePreSlump'; at: number }
  | { type: 'cachePersonalCadence'; recommendation: PersonalCadenceRecommendation; at: number }
  | { type: 'applyCadence'; pair: CadencePair }
  | { type: 'setTargetOutcome'; sessionId: string; targetOutcome: TargetOutcome }
  | { type: 'repairSession'; record: SessionRecord }
  | { type: 'parkThought'; text: string }
  | { type: 'sendParkedToTasks'; id: string }
  | { type: 'dismissParked'; id: string }
  | { type: 'markGuideArticleRead'; id: GuideArticleId; at: number }
  | {
      type: 'markGuideArticleSuggested';
      id: GuideArticleId;
      momentKey: string;
      at: number;
    }
  | { type: 'captureTabLeave'; at: number }
  | { type: 'markTabReturn'; at: number; thresholdSec: number }
  | { type: 'resolveTabReturn'; resolution: ReturnResolution }
  | { type: 'setNextAction'; sessionId: string; text: string }
  | { type: 'resumeInterrupted'; sessionId: string }
  | { type: 'dismissResumeCue'; sessionId: string }
  | { type: 'toggleFoundationDay'; instanceId: string; at: number; targetAt?: number }
  | {
      type: 'setFoundationEnabled';
      foundationType: ManualFoundationType;
      enabled: boolean;
      customName?: string;
      at: number;
    }
  | { type: 'reorderFoundation'; instanceId: string; direction: -1 | 1 }
  | { type: 'renameCustomFoundation'; name: string }
  | { type: 'setFoundationIfThen'; instanceId: string; ifThenId?: string }
  | { type: 'markFoundationRestartOffered'; instanceId: string; dayKey: string }
  | { type: 'patchSettings'; patch: Partial<Settings>; at?: number };

export function reducer(s: BloomState, a: Action): BloomState {
  const dur = s.settings.durations;
  switch (a.type) {
    case 'replaceState':
      return a.state;
    case 'tick': {
      const now = a.at ?? Date.now();
      const current = rollOverDay(s, now);
      if (!current.running) return current;
      // Flow counts up: `remaining` holds elapsed seconds, and there is no
      // completion — the session ends when the user says so.
      if (current.mode === 'flow') {
        const elapsed = Math.floor(flowElapsed(current, now));
        return elapsed === current.remaining ? current : { ...current, remaining: elapsed };
      }
      // While a return question is pending the countdown keeps moving in real
      // time, but completion waits for the user's answer — "I drifted" or
      // "pause it back" rewinds the away time back onto the clock (PLAN 5.2).
      if (current.openFocus?.returnSnapshot) {
        if (current.endsAt == null) return current;
        const remaining = Math.max(0, Math.ceil((current.endsAt - now) / 1000));
        return remaining === current.remaining ? current : { ...current, remaining };
      }
      if (current.endsAt == null) return current;
      // ceil, not round: the session only completes once the full time elapsed.
      const remaining = Math.max(0, Math.ceil((current.endsAt - now) / 1000));
      if (remaining <= 0) return reducer(current, { type: 'complete' });
      if (remaining === current.remaining) return current;
      return { ...current, remaining };
    }
    case 'rollOverDay':
      return rollOverDay(s, a.at);
    case 'toggle': {
      // PLAN 13.18: a replayed command carries the instant it was pressed, so
      // the arithmetic below is identical whether the press happened live or on
      // a locked screen thirty seconds before the WebView woke up.
      const now = a.at ?? Date.now();
      if (s.mode === 'flow') {
        if (s.running) {
          const acc = flowElapsed(s);
          return { ...s, running: false, flowStart: null, flowAcc: acc, remaining: Math.floor(acc), justDone: false };
        }
        // First press of a fresh stopwatch opens its session record; a
        // resume just keeps the existing one.
        const flowTask = resolveActiveTask(s.tasks, s.activeTaskId);
        const armedGoalId =
          s.armedGoalId != null &&
          s.goals.some((goal) => goal.id === s.armedGoalId && goal.done < goal.target)
            ? s.armedGoalId
            : flowTask?.goalId;
        const openFlow =
          s.openFlow ?? {
            ...newOpenSession('flow', null, flowTask?.id, undefined, undefined, armedGoalId),
            targetText: a.targetText,
          };
        return { ...s, running: true, flowStart: now, remaining: Math.floor(s.flowAcc), justDone: false, openFlow };
      }
      if (s.running) {
        const remaining = s.endsAt
          ? Math.max(0, Math.ceil((s.endsAt - now) / 1000))
          : s.remaining;
        // Snapshot pause progress so the boot sweep can estimate actual time.
        const openFocus = s.openFocus
          ? { ...s.openFocus, running: false, endsAt: null, remainingSec: remaining }
          : s.openFocus;
        return { ...s, running: false, endsAt: null, remaining, justDone: false, openFocus };
      }
      const fallbackSec =
        s.mode === 'tiny'
          ? TINY_START_OPTIONS[0] * 60
          : dur[s.mode];
      const rem = s.remaining > 0 ? s.remaining : fallbackSec;
      const endsAt = now + rem * 1000;
      // Focus and tiny sessions are recorded; breaks never open a record.
      let openFocus = s.openFocus;
      let ifThenPlans = s.ifThenPlans;
      if (s.mode === 'focus' || s.mode === 'tiny') {
        if (openFocus) {
          // Resuming a paused session keeps its record (and plan) as-is.
          openFocus = { ...openFocus, running: true, endsAt };
        } else {
          const task = resolveActiveTask(s.tasks, s.activeTaskId);
          const taskId = task?.id;
          const goalId =
            s.armedGoalId != null &&
            s.goals.some((goal) => goal.id === s.armedGoalId && goal.done < goal.target)
              ? s.armedGoalId
              : task?.goalId;
          // The plan picked in the pre-session planner (PLAN 3.2): stamp it on
          // the fresh record, bump its usage, and remember it for the active
          // task so the planner preselects it next time.
          const plan = s.mode === 'focus' && a.ifThenPlanId
            ? ifThenPlans.find((p) => p.id === a.ifThenPlanId)
            : undefined;
          const plannedMin = s.mode === 'tiny' ? rem / 60 : dur.focus / 60;
          openFocus = {
            ...newOpenSession(s.mode, plannedMin, taskId, plan?.id, undefined, goalId),
            endsAt,
            targetText: a.targetText,
            // The start target is already a concrete action. It is editable
            // on the re-entry card if a smaller physical step would help.
            nextActionText: a.targetText,
          };
          if (plan) {
            ifThenPlans = markIfThenPlanUsed(ifThenPlans, plan.id);
            if (taskId != null && plan.taskId !== taskId) {
              ifThenPlans = updateIfThenPlan(ifThenPlans, plan.id, { taskId });
            }
          }
        }
      }
      return { ...s, running: true, endsAt, remaining: rem, justDone: false, openFocus, ifThenPlans };
    }
    case 'discardFalseStart': {
      if (
        !s.openFocus ||
        (s.mode !== 'focus' && s.mode !== 'tiny') ||
        focusElapsedMin(s) * 60 > FALSE_START_GRACE_SEC
      ) {
        return s;
      }
      const remaining =
        s.mode === 'tiny'
          ? tinyResetMinutes(s.openFocus.plannedMin, s.remaining) * 60
          : dur.focus;
      return {
        ...s,
        running: false,
        endsAt: null,
        remaining,
        justDone: false,
        openFocus: null,
        parking: revealParkedThoughts(s.parking, s.openFocus.id),
      };
    }
    case 'reset': {
      if (s.mode === 'flow') {
        // Zeroing a started stopwatch abandons its session record.
        const appended = s.openFlow
          ? appendSessionRecordWithArchive(
              s.sessionRecords,
              s.historyArchive,
              finalizeSession(s.openFlow, 'abandoned', flowElapsed(s) / 60),
            )
          : null;
        const parking = revealParkedThoughts(s.parking, s.openFlow?.id);
        return {
          ...s,
          running: false,
          flowStart: null,
          flowAcc: 0,
          remaining: 0,
          justDone: false,
          sessionRecords: appended?.records ?? s.sessionRecords,
          historyArchive: appended?.archive ?? s.historyArchive,
          openFlow: null,
          parking,
        };
      }
      // Resetting a started focus/tiny countdown abandons its session record.
      const tinyResetMin = tinyResetMinutes(s.openFocus?.plannedMin, s.remaining);
      const resetSec =
        s.mode === 'tiny'
          ? tinyResetMin * 60
          : dur[s.mode];
      const appended = s.openFocus
        ? appendSessionRecordWithArchive(
            s.sessionRecords,
            s.historyArchive,
            finalizeSession(s.openFocus, 'abandoned', focusElapsedMin(s)),
          )
        : null;
      const parking = revealParkedThoughts(s.parking, s.openFocus?.id);
      return {
        ...s,
        running: false,
        endsAt: null,
        justDone: false,
        remaining: resetSec,
        sessionRecords: appended?.records ?? s.sessionRecords,
        historyArchive: appended?.archive ?? s.historyArchive,
        openFocus: null,
        parking,
      };
    }
    case 'pick': {
      // Never wipe a live stopwatch by re-tapping its tab.
      if (a.mode === 'flow' && s.mode === 'flow') return s;
      // Walking away from a started focus/tiny countdown abandons that session
      // (re-picking its tab resets it, which is the same thing for the record).
      let sessionRecords = s.sessionRecords;
      let historyArchive = s.historyArchive;
      let openFocus = s.openFocus;
      let parking = s.parking;
      if ((s.mode === 'focus' || s.mode === 'tiny') && openFocus) {
        const endedSessionId = openFocus.id;
        const appended = appendSessionRecordWithArchive(
          sessionRecords,
          historyArchive,
          finalizeSession(openFocus, 'abandoned', focusElapsedMin(s)),
        );
        sessionRecords = appended.records;
        historyArchive = appended.archive;
        openFocus = null;
        parking = revealParkedThoughts(parking, endedSessionId);
      }
      // A break is the promised natural pause even if another work mode
      // (notably Flow) is merely banked in the background rather than ended.
      if (a.mode === 'short' || a.mode === 'long') {
        parking = revealAllParkedThoughts(parking);
      }
      if (a.mode === 'flow') {
        return { ...s, sessionRecords, historyArchive, openFocus, parking, mode: 'flow', running: false, endsAt: null, justDone: false, remaining: Math.floor(s.flowAcc) };
      }
      // Leaving flow banks the elapsed time; the stopwatch waits, paused —
      // its open record waits with it.
      const base =
        s.mode === 'flow' && s.running
          ? { ...s, running: false, flowStart: null, flowAcc: flowElapsed(s) }
          : s;
      const remaining =
        a.mode === 'tiny'
          ? (a.tinyMinutes ?? TINY_START_OPTIONS[0]) * 60
          : dur[a.mode];
      return { ...base, sessionRecords, historyArchive, openFocus, parking, mode: a.mode, running: false, endsAt: null, justDone: false, remaining };
    }
    case 'skip': {
      if (s.mode === 'flow') return s; // flow has finish, not skip
      const next: TimerMode = s.mode === 'focus' ? 'short' : 'focus';
      return reducer(s, { type: 'pick', mode: next });
    }
    case 'finishFlow': {
      if (s.mode !== 'flow' || !s.openFlow) return s;
      const elapsed = flowElapsed(s);
      const record = finalizeSession(s.openFlow, 'completed', elapsed / 60);
      const credit = beginGoalCredit(
        s.goalLedger,
        s.goals,
        s.openFlow.goalId,
        s.settings.goalCredit,
        'session',
        s.settings.dayStartHour,
        record.endedAt,
        record.id,
      );
      // The user chose to end it, so the record is 'completed' either way —
      // even a stretch too short to bank XP is a real session that happened.
      const appended = appendSessionRecordWithArchive(
        s.sessionRecords,
        s.historyArchive,
        {
          ...record,
          goalCredit: credit.status,
        },
      );
      const parking = revealParkedThoughts(s.parking, s.openFlow?.id);
      // Nearest focus-length wins: half a session or more banks the first
      // bloom. Capped so a stopwatch left running can't mint a day of XP.
      const credited = flowCreditsForElapsed(elapsed, dur.focus);
      if (credited < 1) {
        // Too short to bank XP, but still a deliberately finished work
        // session. It can gently mark today without minting a pomodoro.
        return {
          ...s,
          running: false,
          flowStart: null,
          flowAcc: 0,
          remaining: 0,
          justDone: false,
          ...bumpStreak(s, record),
          sessionRecords: appended.records,
          historyArchive: appended.archive,
          goals: credit.goals,
          goalLedger: credit.ledger,
          openFlow: null,
          parking,
        };
      }
      const streakPatch = bumpStreak(s, record);
      // Credit pomodoros one by one so they cascade across tasks exactly like
      // finished focus sessions do. Begin with the task stamped at Flow start,
      // even if the global selection changed while the stopwatch was open.
      let tasks = s.tasks;
      let creditTaskId = s.openFlow?.taskId ?? s.activeTaskId;
      for (let i = 0; i < credited; i++) {
        const cur = resolveActiveTask(tasks, creditTaskId);
        if (!cur) break;
        const nowDone = cur.pomos + 1 >= cur.goal;
        tasks = tasks.map((t) =>
          t.id === cur.id
            ? {
                ...t,
                pomos: Math.min(t.pomos + 1, t.goal),
                done: nowDone,
                completedAt: nowDone ? (t.completedAt ?? Date.now()) : t.completedAt,
              }
            : t,
        );
        creditTaskId = nowDone ? (tasks.find((t) => !t.done)?.id ?? null) : cur.id;
      }
      const activeTaskId = resolveActiveTask(tasks, s.activeTaskId)?.id ?? null;
      return {
        ...s,
        running: false,
        flowStart: null,
        flowAcc: 0,
        remaining: 0,
        justDone: true,
        sessions: s.sessions + credited,
        ...streakPatch,
        tasks,
        activeTaskId,
        goals: credit.goals,
        goalLedger: credit.ledger,
        palXp: { ...s.palXp, [s.settings.pal]: (s.palXp[s.settings.pal] ?? 0) + credited },
        sessionRecords: appended.records,
        historyArchive: appended.archive,
        openFlow: null,
        parking,
      };
    }
    case 'extendTiny': {
      // The first rung is already safely finalized and credited. Accepting
      // begins the next tiny record immediately: no break screen and no
      // pressure to continue beyond these ten minutes.
      const lastRecord = s.sessionRecords[s.sessionRecords.length - 1];
      if (s.mode !== 'tiny' || !s.justDone || !isTinyFirstRung(lastRecord)) return s;
      const remaining = TINY_EXTENSION_MIN * 60;
      const endsAt = Date.now() + remaining * 1000;
      const task = resolveActiveTask(s.tasks, s.activeTaskId);
      const openFocus = {
        ...newOpenSession(
          'tiny',
          TINY_EXTENSION_MIN,
          task?.id,
          undefined,
          undefined,
          s.armedGoalId != null &&
            s.goals.some((goal) => goal.id === s.armedGoalId && goal.done < goal.target)
            ? s.armedGoalId
            : task?.goalId,
        ),
        endsAt,
        targetText: lastRecord.targetText,
      };
      return {
        ...s,
        running: true,
        endsAt,
        remaining,
        justDone: false,
        openFocus,
      };
    }
    case 'declineTiny': {
      const lastRecord = s.sessionRecords[s.sessionRecords.length - 1];
      if (s.mode !== 'tiny' || !s.justDone || !isTinyFirstRung(lastRecord)) return s;
      return reducer(s, { type: 'clearDone' });
    }
    case 'complete': {
      if (s.mode === 'flow' || !s.running || s.justDone) return s; // Flow ends via finishFlow only.
      const wasFocus = s.mode === 'focus';
      const wasTiny = s.mode === 'tiny';
      const wasWork = wasFocus || wasTiny;
      const sessions = s.sessions + (wasFocus ? 1 : 0);
      const completedRecord =
        wasWork && s.openFocus
          ? finalizeSession(
              s.openFocus,
              'completed',
              s.openFocus.plannedMin ?? dur.focus / 60,
            )
          : null;
      const streakPatch = completedRecord
        ? bumpStreak(s, completedRecord)
        : {
            streak: s.streak,
            lastFocusDay: s.lastFocusDay,
            restDayUsedOn: s.restDayUsedOn,
            comeBack: s.comeBack,
          };
      // Credit the task stamped when the session began. Changing the global
      // active task mid-session must not rewrite this session's identity.
      let tasks = s.tasks;
      let activeTaskId = s.activeTaskId;
      if (wasFocus) {
        const cur = s.openFocus?.taskId == null
          ? undefined
          : s.tasks.find((task) => task.id === s.openFocus?.taskId);
        if (cur && cur.pomos < cur.goal) {
          const nowDone = cur.pomos + 1 >= cur.goal;
          tasks = s.tasks.map((t) =>
            t.id === cur.id
              ? {
                  ...t,
                  pomos: Math.min(t.pomos + 1, t.goal),
                  done: nowDone,
                  completedAt: nowDone ? (t.completedAt ?? Date.now()) : t.completedAt,
                }
              : t,
          );
          activeTaskId = nowDone
            ? (resolveActiveTask(tasks, s.activeTaskId)?.id ?? null)
            : s.activeTaskId;
        }
      }
      // Credit XP toward the on-duty friend's level. Tiny rungs get a
      // positive, proportional share of one configured focus session.
      const xpEarned = wasFocus
        ? 1
        : wasTiny
          ? tinyXpFor(s.openFocus?.plannedMin ?? 0, dur.focus / 60)
          : 0;
      const palXp =
        xpEarned > 0
          ? {
              ...s.palXp,
              [s.settings.pal]: Math.round(((s.palXp[s.settings.pal] ?? 0) + xpEarned) * 100) / 100,
            }
          : s.palXp;
      // The countdown ran its full course: finalize the session record.
      let goals = s.goals;
      let goalLedger = s.goalLedger;
      let sessionRecords = s.sessionRecords;
      let historyArchive = s.historyArchive;
      if (completedRecord) {
        const record = completedRecord;
        const credit = beginGoalCredit(
          goalLedger,
          goals,
          record.goalId,
          s.settings.goalCredit,
          'session',
          s.settings.dayStartHour,
          record.endedAt,
          record.id,
        );
        goals = credit.goals;
        goalLedger = credit.ledger;
        const appended = appendSessionRecordWithArchive(s.sessionRecords, s.historyArchive, {
          ...record,
          goalCredit: credit.status,
        });
        sessionRecords = appended.records;
        historyArchive = appended.archive;
      }
      const parking = wasWork
        ? revealParkedThoughts(s.parking, s.openFocus?.id)
        : s.parking;
      return {
        ...s,
        running: false,
        endsAt: null,
        remaining: 0,
        justDone: true,
        sessions,
        ...streakPatch,
        tasks,
        activeTaskId,
        goals,
        goalLedger,
        palXp,
        sessionRecords,
        historyArchive,
        openFocus: wasWork ? null : s.openFocus,
        parking,
      };
    }
    case 'clearDone': {
      if (!s.justDone) return s;
      // A finished flow session just settles back to an idle stopwatch —
      // whether to break (and for how long) stays the user's call.
      if (s.mode === 'flow') {
        return { ...s, justDone: false, running: false, endsAt: null, remaining: 0 };
      }
      // Tiny rungs finish as real sessions, then return to an idle focus
      // timer. They never force a break or auto-start another block.
      if (s.mode === 'tiny') {
        return {
          ...s,
          justDone: false,
          mode: 'focus',
          running: false,
          endsAt: null,
          remaining: dur.focus,
        };
      }
      // After the celebrate animation: advance to the next mode, and keep the
      // flow going automatically if auto-start is on.
      const wasFocus = s.mode === 'focus';
      const next: TimerMode = wasFocus ? (s.sessions % 4 === 0 ? 'long' : 'short') : 'focus';
      const rem = dur[next];
      const run = s.settings.autoStart;
      const now = Date.now();
      const endsAt = run ? now + rem * 1000 : null;
      const task = next === 'focus'
        ? resolveActiveTask(s.tasks, s.activeTaskId)
        : undefined;
      const openFocus = run && next === 'focus'
        ? {
            ...newOpenSession(
              'focus',
              rem / 60,
              task?.id,
              undefined,
              now,
              s.armedGoalId != null &&
                s.goals.some((goal) => goal.id === s.armedGoalId && goal.done < goal.target)
                ? s.armedGoalId
                : task?.goalId,
            ),
            endsAt,
          }
        : s.openFocus;
      return {
        ...s,
        justDone: false,
        mode: next,
        remaining: rem,
        running: run,
        endsAt,
        openFocus,
      };
    }
    case 'toggleTask': {
      const current = s.tasks.find((task) => task.id === a.id);
      if (!current) return s;
      let goals = s.goals;
      let goalLedger = s.goalLedger;
      let goalCredit: GoalCreditStatus | undefined;
      if (!current.done) {
        const credit = beginGoalCredit(
          goalLedger,
          goals,
          current.goalId,
          s.settings.goalCredit,
          'manual',
          s.settings.dayStartHour,
        );
        goals = credit.goals;
        goalLedger = credit.ledger;
        goalCredit = credit.status;
      }
      const tasks = s.tasks.map((task) =>
        task.id === a.id
          ? {
              ...task,
              done: !task.done,
              completedAt: task.done ? undefined : Date.now(),
              goalCredit: task.done ? undefined : goalCredit,
            }
          : task,
      );
      // If the active task was just checked off, hand focus to the next open one.
      const activeTaskId = resolveActiveTask(tasks, s.activeTaskId)?.id ?? null;
      return { ...s, tasks, activeTaskId, goals, goalLedger };
    }
    case 'setTaskGoal': {
      const goalId =
        a.goalId != null && s.goals.some((goal) => goal.id === a.goalId)
          ? a.goalId
          : undefined;
      return {
        ...s,
        tasks: s.tasks.map((task) =>
          task.id === a.id && !task.done ? { ...task, goalId } : task,
        ),
      };
    }
    case 'resolveGoalCredit': {
      if (a.source === 'task') {
        const taskId = typeof a.id === 'number' ? a.id : Number.NaN;
        const task = s.tasks.find(
          (item) => item.id === taskId && item.goalCredit === 'pending',
        );
        if (!task) return s;
        const credit = a.apply && task.goalId != null
          ? appendGoalCredit(s.goalLedger, s.goals, {
              goalId: task.goalId,
              requestedDelta: 1,
              source: 'manual',
              dayStartHour: s.settings.dayStartHour,
            })
          : { ledger: s.goalLedger, goals: s.goals, appliedDelta: 0 };
        return {
          ...s,
          goals: credit.goals,
          goalLedger: credit.ledger,
          tasks: s.tasks.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  goalCredit: credit.appliedDelta !== 0 ? 'credited' : 'skipped',
                }
              : item,
          ),
        };
      }
      const sessionId = typeof a.id === 'string' ? a.id : '';
      const record = s.sessionRecords.find(
        (item) => item.id === sessionId && item.goalCredit === 'pending',
      );
      if (!record) return s;
      const credit = a.apply && record.goalId != null
        ? appendGoalCredit(s.goalLedger, s.goals, {
            goalId: record.goalId,
            requestedDelta: a.amount ?? 1,
            source: 'session',
            at: record.endedAt,
            dayStartHour: s.settings.dayStartHour,
            sessionId: record.id,
          })
        : { ledger: s.goalLedger, goals: s.goals, appliedDelta: 0 };
      return {
        ...s,
        goals: credit.goals,
        goalLedger: credit.ledger,
        sessionRecords: s.sessionRecords.map((item) =>
          item.id === record.id
            ? {
                ...item,
                goalCredit: credit.appliedDelta !== 0 ? 'credited' : 'skipped',
              }
            : item,
        ),
      };
    }
    case 'addTask': {
      const text = a.text.trim();
      if (!text) return s;
      const id = s.tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      const goal = Math.max(1, Math.min(6, a.goal));
      // Only keep a link that points at a real goal — a stale id would ride
      // along on every session started from this task.
      const goalId =
        a.goalId != null && s.goals.some((g) => g.id === a.goalId) ? a.goalId : undefined;
      const tasks = [...s.tasks, { id, t: text, done: false, pomos: 0, goal, goalId }];
      return { ...s, tasks, activeTaskId: s.activeTaskId ?? id };
    }
    case 'removeTask': {
      const removed = s.tasks.find((task) => task.id === a.id);
      const tasks = s.tasks.filter((t) => t.id !== a.id);
      const activeTaskId =
        s.activeTaskId === a.id ? (tasks.find((t) => !t.done)?.id ?? null) : s.activeTaskId;
      const archiveRow =
        removed?.done && removed.completedAt !== undefined
          ? completedTaskArchiveRow({
              taskId: removed.id,
              title: removed.t,
              completedAt: removed.completedAt,
            })
          : null;
      const historyArchive = archiveRow
        ? appendCompletedTaskArchiveRow(s.historyArchive, archiveRow)
        : s.historyArchive;
      return { ...s, tasks, activeTaskId, historyArchive };
    }
    case 'restoreTask': {
      if (s.tasks.some((task) => task.id === a.task.id)) return s;
      const tasks = [...s.tasks];
      tasks.splice(Math.max(0, Math.min(a.index, tasks.length)), 0, { ...a.task });
      const archiveRow =
        a.task.done && a.task.completedAt !== undefined
          ? completedTaskArchiveRow({
              taskId: a.task.id,
              title: a.task.t,
              completedAt: a.task.completedAt,
            })
          : null;
      return {
        ...s,
        tasks,
        activeTaskId: a.wasActive && !a.task.done ? a.task.id : s.activeTaskId,
        historyArchive: archiveRow
          ? removeCompletedTaskArchiveRow(s.historyArchive, archiveRow.id)
          : s.historyArchive,
      };
    }
    case 'setActiveTask': {
      const t = s.tasks.find((x) => x.id === a.id);
      if (!t || t.done) return s;
      return { ...s, activeTaskId: a.id };
    }
    case 'addGoal': {
      const title = a.title.trim().slice(0, 60);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(a.due)) return s;
      const target = Math.max(1, Math.min(GOAL_TARGET_MAX, Math.round(a.target) || 1));
      const id = s.goals.reduce((m, g) => Math.max(m, g.id), 0) + 1;
      return {
        ...s,
        goals: [...s.goals, {
          id,
          title,
          due: a.due,
          target,
          done: 0,
          unit: normalizeGoalUnit(a.unit),
          createdAt: Date.now(),
        }],
      };
    }
    case 'linkDrift': {
      // Attach a companion drift event to the open session it happened in.
      // Matching by id guards the race where the session ended (or a new one
      // started) between the event being logged and this action landing.
      const link = (open: OpenSession | null): OpenSession | null =>
        open && open.id === a.sessionId && !open.driftEventIds.includes(a.eventId)
          ? { ...open, driftEventIds: [...open.driftEventIds, a.eventId] }
          : open;
      const openFocus = link(s.openFocus);
      const openFlow = link(s.openFlow);
      if (openFocus === s.openFocus && openFlow === s.openFlow) return s;
      return { ...s, openFocus, openFlow };
    }
    case 'markWeeklyReview':
      // The weekly review card surfaced this week — don't auto-show another
      // until the next calendar week (PLAN 2.3).
      return s.lastWeeklyReviewWeek === a.week ? s : { ...s, lastWeeklyReviewWeek: a.week };
    case 'removeGoal':
      // Unlink any task that pointed at the removed goal, so no dangling id
      // gets stamped onto future sessions.
      return {
        ...s,
        goals: s.goals.filter((g) => g.id !== a.id),
        goalLedger: removeGoalCredits(s.goalLedger, a.id),
        armedGoalId: s.armedGoalId === a.id ? null : s.armedGoalId,
        tasks: s.tasks.map((t) =>
          t.goalId === a.id
            ? {
                ...t,
                goalId: undefined,
                goalCredit: t.goalCredit === 'pending' ? 'skipped' : t.goalCredit,
              }
            : t,
        ),
        sessionRecords: s.sessionRecords.map((record) =>
          record.goalId === a.id && record.goalCredit === 'pending'
            ? { ...record, goalCredit: 'skipped' }
            : record,
        ),
        openFocus:
          s.openFocus?.goalId === a.id ? { ...s.openFocus, goalId: undefined } : s.openFocus,
        openFlow:
          s.openFlow?.goalId === a.id ? { ...s.openFlow, goalId: undefined } : s.openFlow,
      };
    case 'restoreGoal': {
      if (s.goals.some((goal) => goal.id === a.goal.id)) return s;
      const goals = [...s.goals];
      goals.splice(Math.max(0, Math.min(a.index, goals.length)), 0, { ...a.goal });
      const linkedTaskIds = new Set(a.linkedTaskIds);
      return {
        ...s,
        goals,
        goalLedger: [...s.goalLedger, ...(a.goalCredits ?? [])],
        tasks: s.tasks.map((task) =>
          linkedTaskIds.has(task.id) ? { ...task, goalId: a.goal.id } : task,
        ),
      };
    }
    case 'updateGoal': {
      let changed = false;
      const goals = s.goals.map((g) => {
        if (g.id !== a.id) return g;
        const title =
          a.patch.title !== undefined ? a.patch.title.trim().slice(0, 60) : g.title;
        if (!title) return g;
        const due =
          a.patch.due !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(a.patch.due)
            ? a.patch.due
            : g.due;
        const unit =
          a.patch.unit !== undefined ? normalizeGoalUnit(a.patch.unit) : g.unit;
        const target =
          a.patch.target !== undefined
            ? Math.max(1, Math.min(GOAL_TARGET_MAX, Math.round(a.patch.target) || 1))
            : g.target;
        // Shrinking the target below the logged count folds the extra into
        // "complete" rather than remembering an impossible overshoot.
        const done = Math.min(g.done, target);
        changed = true;
        return {
          ...g,
          title,
          due,
          unit,
          target,
          done,
          completedAt: done >= target ? (g.completedAt ?? Date.now()) : undefined,
        };
      });
      return changed ? { ...s, goals } : s;
    }
    case 'addIfThenPlan':
      return {
        ...s,
        ifThenPlans: addIfThenPlan(s.ifThenPlans, {
          cueType: a.cueType,
          cueText: a.cueText,
          actionText: a.actionText,
          taskId: a.taskId,
        }),
      };
    case 'updateIfThenPlan':
      return { ...s, ifThenPlans: updateIfThenPlan(s.ifThenPlans, a.id, a.patch) };
    case 'removeIfThenPlan':
      return {
        ...s,
        ifThenPlans: removeIfThenPlan(s.ifThenPlans, a.id),
        foundations: {
          ...s.foundations,
          instances: s.foundations.instances.map((instance) =>
            instance.ifThenId === a.id
              ? { ...instance, ifThenId: undefined }
              : instance,
          ),
        },
      };
    case 'useIfThenPlan':
      return { ...s, ifThenPlans: markIfThenPlanUsed(s.ifThenPlans, a.id) };
    case 'patchRitual':
      return { ...s, ritual: { ...s.ritual, ...a.patch } };
    case 'updateRitualItem':
      return { ...s, ritual: { ...s.ritual, items: updateRitualItem(s.ritual.items, a.id, a.text) } };
    case 'markWoopOffered':
      return { ...s, lastWoopOfferAt: a.at };
    case 'recordPreSlump': {
      if (s.preSlump.lastSessionId === a.sessionId) return s;
      const day = dayKeyFor(a.at, s.settings.dayStartHour);
      const sameDay = s.preSlump.day === day;
      const count = sameDay ? s.preSlump.count : 0;
      if ((sameDay && s.preSlump.silenced) || count >= PRE_SLUMP_DAILY_CAP) return s;
      return {
        ...s,
        preSlump: {
          day,
          count: count + 1,
          silenced: false,
          lastSessionId: a.sessionId,
        },
      };
    }
    case 'silencePreSlump': {
      const day = dayKeyFor(a.at, s.settings.dayStartHour);
      const sameDay = s.preSlump.day === day;
      return {
        ...s,
        preSlump: {
          day,
          count: sameDay ? s.preSlump.count : 0,
          silenced: true,
          lastSessionId: s.preSlump.lastSessionId,
        },
      };
    }
    case 'cachePersonalCadence': {
      const computedAt = s.personalCadence.computedAt;
      if (computedAt != null && a.at - computedAt < PERSONAL_CADENCE_RECOMPUTE_MS) return s;
      return {
        ...s,
        personalCadence: {
          ...s.personalCadence,
          computedAt: a.at,
          recommendation: a.recommendation,
        },
      };
    }
    case 'clearFocusData':
      // One reducer transition clears the raw reflection history and the
      // recommendation derived from it. Accomplishment counters and explicit
      // task/goal progress stay intact; Settings explains that scope before
      // dispatching this action (PLAN 8.2).
      return {
        ...s,
        sessionRecords: [],
        historyArchive: {
          ...s.historyArchive,
          hours: [],
          overflow: {
            ...s.historyArchive.overflow,
            hourBucketCount: 0,
            focusMinutes: 0,
            sessionCount: 0,
            completedSessionCount: 0,
            driftCount: 0,
            recoveryCount: 0,
          },
        },
        lastWeeklyReviewWeek: null,
        personalCadence: {
          ...s.personalCadence,
          computedAt: null,
          recommendation: null,
        },
      };
    case 'applyCadence': {
      const next: CadencePair = {
        focusMin: Math.max(CADENCE_FOCUS_MIN, Math.min(CADENCE_FOCUS_MAX, Math.round(a.pair.focusMin))),
        breakMin: Math.max(CADENCE_BREAK_MIN, Math.min(CADENCE_BREAK_MAX, Math.round(a.pair.breakMin))),
      };
      const current: CadencePair = {
        focusMin: Math.round(s.settings.durations.focus / 60),
        breakMin: Math.round(s.settings.durations.short / 60),
      };
      const changed = current.focusMin !== next.focusMin || current.breakMin !== next.breakMin;
      const replaceRemaining =
        !s.running &&
        !s.justDone &&
        ((s.mode === 'focus' && !s.openFocus) || s.mode === 'short');
      const remaining = replaceRemaining
        ? (s.mode === 'focus' ? next.focusMin : next.breakMin) * 60
        : s.remaining;
      if (!changed && remaining === s.remaining) return s;
      return {
        ...s,
        remaining,
        settings: {
          ...s.settings,
          durations: {
            ...s.settings.durations,
            focus: next.focusMin * 60,
            short: next.breakMin * 60,
          },
        },
        personalCadence: {
          ...s.personalCadence,
          computedAt: null,
          recommendation: null,
          history: changed
            ? rememberPreviousCadence(s.personalCadence.history, current, next)
            : s.personalCadence.history,
        },
      };
    }
    case 'setTargetOutcome':
      return {
        ...s,
        sessionRecords: setSessionTargetOutcome(
          s.sessionRecords,
          a.sessionId,
          a.targetOutcome,
        ),
      };
    case 'repairSession': {
      const current = s.sessionRecords.find((record) => record.id === a.record.id);
      if (
        !current ||
        !isValidSessionRecord(a.record) ||
        a.record.startedAt !== current.startedAt ||
        a.record.mode !== current.mode ||
        a.record.plannedMin !== current.plannedMin ||
        a.record.taskId !== current.taskId ||
        a.record.goalId !== current.goalId ||
        a.record.goalCredit !== current.goalCredit ||
        a.record.edited !== true
      ) return s;
      const overlaps = s.sessionRecords.some(
        (record) =>
          record.id !== current.id &&
          record.startedAt < a.record.endedAt &&
          record.endedAt > a.record.startedAt,
      );
      if (overlaps) return s;
      return {
        ...s,
        sessionRecords: s.sessionRecords.map((record) =>
          record.id === current.id
            ? {
                ...record,
                endedAt: a.record.endedAt,
                actualMin: a.record.actualMin,
                outcome: a.record.outcome,
                driftEventIds: [...a.record.driftEventIds],
                resumeCuePending: a.record.resumeCuePending,
                edited: true,
                editedAt: a.record.editedAt,
              }
            : record,
        ),
      };
    }
    case 'parkThought': {
      const open = s.mode === 'flow' ? s.openFlow : s.openFocus;
      const isWorkMode = s.mode === 'focus' || s.mode === 'tiny' || s.mode === 'flow';
      if (!isWorkMode || !open || s.justDone) return s;
      return { ...s, parking: addParkedThought(s.parking, a.text, open.id) };
    }
    case 'sendParkedToTasks': {
      const item = s.parking.find((thought) => thought.id === a.id && thought.revealedAt !== null);
      if (!item) return s;
      const id = s.tasks.reduce((m, task) => Math.max(m, task.id), 0) + 1;
      return {
        ...s,
        tasks: [...s.tasks, { id, t: item.text, done: false, pomos: 0, goal: 1 }],
        activeTaskId: s.activeTaskId ?? id,
        parking: removeParkedThought(s.parking, a.id),
      };
    }
    case 'dismissParked':
      return s.parking.some((thought) => thought.id === a.id && thought.revealedAt !== null)
        ? { ...s, parking: removeParkedThought(s.parking, a.id) }
        : s;
    case 'markGuideArticleRead': {
      const guideRead = markGuideArticleRead(s.guideRead, a.id, a.at);
      return guideRead === s.guideRead ? s : { ...s, guideRead };
    }
    case 'markGuideArticleSuggested': {
      const guideRead = markGuideArticleSuggested(s.guideRead, a.id, a.momentKey, a.at);
      return guideRead === s.guideRead ? s : { ...s, guideRead };
    }
    case 'captureTabLeave': {
      if (
        !s.running ||
        (s.mode !== 'focus' && s.mode !== 'tiny') ||
        !s.openFocus ||
        s.openFocus.returnSnapshot
      ) {
        return s;
      }
      const remaining = s.endsAt
        ? Math.max(0, Math.ceil((s.endsAt - a.at) / 1000))
        : s.remaining;
      const round = (s.sessions % 4) + 1;
      const openFocus = captureTimerSnapshot(s.openFocus, remaining, round, a.at);
      return openFocus === s.openFocus ? s : { ...s, openFocus, remaining };
    }
    case 'markTabReturn': {
      if (!s.openFocus?.returnSnapshot) return s;
      const result = markTimerReturn(s.openFocus, a.at, a.thresholdSec);
      if (result.shouldPrompt) {
        // The display catches up to wall clock (the timer never stopped) but
        // holds at zero without completing until the question is answered.
        const live = s.endsAt
          ? Math.max(0, Math.ceil((s.endsAt - a.at) / 1000))
          : s.remaining;
        return { ...s, openFocus: result.open, remaining: live };
      }
      // Short blips are invisible to the user. Catch the display up now; if
      // the timer ended during the blip, finish it normally without a card.
      const remaining = s.endsAt
        ? Math.max(0, Math.ceil((s.endsAt - a.at) / 1000))
        : s.remaining;
      const caughtUp = { ...s, openFocus: result.open, remaining };
      return remaining <= 0 ? reducer(caughtUp, { type: 'complete' }) : caughtUp;
    }
    case 'resolveTabReturn': {
      const snapshot = s.openFocus?.returnSnapshot;
      if (!s.openFocus || !snapshot?.returnedAt) return s;
      const now = Date.now();
      const openFocus = resolveTimerReturn(s.openFocus, a.resolution, now);
      if (a.resolution === 'pauseBack') {
        return {
          ...s,
          running: false,
          endsAt: null,
          remaining: snapshot.remainingSec,
          openFocus,
        };
      }
      // Drifting rewinds the away time back onto the clock; the countdown
      // resumes from what it showed the moment the tab was left.
      if (a.resolution === 'drifted') {
        return {
          ...s,
          remaining: snapshot.remainingSec,
          endsAt: s.running ? now + snapshot.remainingSec * 1000 : null,
          openFocus,
        };
      }
      // "I kept working": the timer already ran in real time — nothing to
      // adjust, just complete if the full length elapsed while away.
      const remaining = s.endsAt
        ? Math.max(0, Math.ceil((s.endsAt - now) / 1000))
        : s.remaining;
      const caughtUp = { ...s, openFocus, remaining };
      return remaining <= 0 ? reducer(caughtUp, { type: 'complete' }) : caughtUp;
    }
    case 'setNextAction': {
      const text = a.text.trim().slice(0, SESSION_TARGET_MAX) || undefined;
      if (s.openFocus?.id === a.sessionId) {
        return { ...s, openFocus: { ...s.openFocus, nextActionText: text } };
      }
      let changed = false;
      const sessionRecords = s.sessionRecords.map((record) => {
        if (record.id !== a.sessionId || !record.resumeCuePending) return record;
        changed = true;
        return { ...record, nextActionText: text };
      });
      return changed ? { ...s, sessionRecords } : s;
    }
    case 'resumeInterrupted': {
      const record = s.sessionRecords.find(
        (item) => item.id === a.sessionId && item.outcome === 'interrupted' && item.resumeCuePending,
      );
      if (!record || record.mode === 'flow' || record.plannedMin == null) return s;
      const plannedSec = Math.max(0, record.plannedMin * 60);
      const remaining = Math.max(
        1,
        Math.min(
          plannedSec,
          record.returnSnapshot?.remainingSec ?? plannedSec - record.actualMin * 60,
        ),
      );
      const endsAt = Date.now() + remaining * 1000;
      const openFocus: OpenSession = {
        id: record.id,
        startedAt: record.startedAt,
        mode: record.mode,
        plannedMin: record.plannedMin,
        startHour: record.startHour,
        taskId: record.taskId,
        goalId: record.goalId,
        endsAt,
        remainingSec: remaining,
        running: true,
        driftEventIds: [...record.driftEventIds],
        targetText: record.targetText,
        ifThenPlanId: record.ifThenPlanId,
        nextActionText: record.nextActionText,
      };
      return {
        ...s,
        mode: record.mode,
        running: true,
        endsAt,
        remaining,
        justDone: false,
        openFocus,
        sessionRecords: s.sessionRecords.filter((item) => item.id !== record.id),
      };
    }
    case 'dismissResumeCue': {
      let changed = false;
      const sessionRecords = s.sessionRecords.map((record) => {
        if (record.id !== a.sessionId || !record.resumeCuePending) return record;
        changed = true;
        return { ...record, resumeCuePending: false };
      });
      return changed ? { ...s, sessionRecords } : s;
    }
    case 'logGoal': {
      const result = appendGoalCredit(s.goalLedger, s.goals, {
        goalId: a.id,
        requestedDelta: a.delta,
        source: 'manual',
        dayStartHour: s.settings.dayStartHour,
      });
      return result.appliedDelta === 0
        ? s
        : { ...s, goals: result.goals, goalLedger: result.ledger };
    }
    case 'addGoalDailyTarget': {
      const goal = s.goals.find((item) => item.id === a.goalId);
      if (!goal) return s;
      const dayPlan = addGoalDailyTarget(s.dayPlan, {
        goal,
        plannedAmount: a.plannedAmount,
        targetAt: a.targetAt,
        dayStartHour: s.settings.dayStartHour,
      });
      return dayPlan === s.dayPlan ? s : { ...s, dayPlan };
    }
    case 'addTaskDailyTarget': {
      const task = s.tasks.find((item) => item.id === a.taskId);
      if (!task) return s;
      const dayPlan = addTaskDailyTarget(s.dayPlan, {
        task: { id: task.id, t: task.t, unit: 'sessions' },
        plannedAmount: a.plannedAmount,
        targetAt: a.targetAt,
        dayStartHour: s.settings.dayStartHour,
      });
      return dayPlan === s.dayPlan ? s : { ...s, dayPlan };
    }
    case 'editDailyTarget': {
      const taskActual = (target: TaskDailyTarget) =>
        s.sessionRecords.filter(
          (record) =>
            record.taskId === target.taskId &&
            sessionCountsTowardDay(record) &&
            dayKeyFor(record.endedAt, s.settings.dayStartHour) === target.dayKey,
        ).length;
      const dayPlan = editDailyTarget(s.dayPlan, {
        id: a.id,
        plannedAmount: a.plannedAmount,
        ledger: s.goalLedger,
        dayStartHour: s.settings.dayStartHour,
        taskActual,
      });
      return dayPlan === s.dayPlan ? s : { ...s, dayPlan };
    }
    case 'dismissDailyTarget': {
      const dayPlan = dismissDailyTarget(s.dayPlan, a.id);
      return dayPlan === s.dayPlan ? s : { ...s, dayPlan };
    }
    case 'armGoal': {
      const goalId =
        a.goalId != null &&
        s.goals.some((goal) => goal.id === a.goalId && goal.done < goal.target)
          ? a.goalId
          : null;
      return goalId === s.armedGoalId ? s : { ...s, armedGoalId: goalId };
    }
    case 'markRolloverOffered':
      return a.dayKey === s.today && s.lastRolloverOfferDay !== a.dayKey
        ? { ...s, lastRolloverOfferDay: a.dayKey }
        : s;
    case 'resolveRollover': {
      if (a.choice === 'rest') return s;
      const taskActual = (target: TaskDailyTarget) =>
        s.sessionRecords.filter(
          (record) =>
            record.taskId === target.taskId &&
            sessionCountsTowardDay(record) &&
            dayKeyFor(record.endedAt, s.settings.dayStartHour) === target.dayKey,
        ).length;
      const offer = rolloverOffers(s.dayPlan, {
        todayKey: s.today,
        ledger: s.goalLedger,
        goals: s.goals,
        taskActual,
      }).find((item) => item.target.id === a.id);
      if (!offer) return s;
      const dayPlan = carryRolloverTarget(s.dayPlan, {
        offer,
        todayKey: s.today,
        goals: s.goals,
      });
      return dayPlan === s.dayPlan ? s : { ...s, dayPlan };
    }
    case 'toggleFoundationDay': {
      const targetAt = a.targetAt ?? a.at;
      const targetDayKey = dayKeyFor(targetAt, s.settings.dayStartHour);
      const entryId = foundationEntryId(a.instanceId, targetDayKey);
      const hadEntry = s.foundations.entries.some((entry) => entry.id === entryId);
      const foundations = toggleFoundationDayState(
        s.foundations,
        a.instanceId,
        targetAt,
        a.at,
        s.settings.dayStartHour,
      );
      if (foundations === s.foundations) return s;
      const addedEntry =
        !hadEntry && foundations.entries.some((entry) => entry.id === entryId);
      const ifThenId = addedEntry
        ? s.foundations.instances.find((instance) => instance.id === a.instanceId)?.ifThenId
        : undefined;
      return {
        ...s,
        foundations,
        ifThenPlans:
          ifThenId && s.ifThenPlans.some((plan) => plan.id === ifThenId)
            ? markIfThenPlanUsed(s.ifThenPlans, ifThenId, a.at)
            : s.ifThenPlans,
      };
    }
    case 'setFoundationEnabled': {
      const instanceId = foundationInstanceId(a.foundationType);
      let foundations = s.foundations;
      if (!foundations.instances.some((instance) => instance.id === instanceId)) {
        if (!a.enabled) return s;
        const nextOrder =
          foundations.instances.reduce(
            (highest, instance) => Math.max(highest, instance.order),
            -1,
          ) + 1;
        const instance = createFoundationInstance({
          type: a.foundationType,
          customName: a.customName,
          order: nextOrder,
          at: a.at,
          dayStartHour: s.settings.dayStartHour,
        });
        if (!instance) return s;
        foundations = { ...foundations, instances: [...foundations.instances, instance] };
      } else {
        foundations = setFoundationEnabledState(
          foundations,
          instanceId,
          a.enabled,
          a.at,
          s.settings.dayStartHour,
        );
      }
      return foundations === s.foundations ? s : { ...s, foundations };
    }
    case 'reorderFoundation': {
      const foundations = reorderFoundationState(
        s.foundations,
        a.instanceId,
        a.direction,
      );
      return foundations === s.foundations ? s : { ...s, foundations };
    }
    case 'renameCustomFoundation': {
      const foundations = renameCustomFoundationState(s.foundations, a.name);
      return foundations === s.foundations ? s : { ...s, foundations };
    }
    case 'setFoundationIfThen': {
      if (a.ifThenId && !s.ifThenPlans.some((plan) => plan.id === a.ifThenId)) return s;
      let changed = false;
      const instances = s.foundations.instances.map((instance) => {
        if (
          instance.id !== a.instanceId ||
          !isManualFoundationType(instance.type) ||
          instance.ifThenId === a.ifThenId
        ) return instance;
        changed = true;
        return { ...instance, ifThenId: a.ifThenId };
      });
      return changed ? { ...s, foundations: { ...s.foundations, instances } } : s;
    }
    case 'markFoundationRestartOffered': {
      if (!isFoundationDayKey(a.dayKey)) return s;
      let changed = false;
      const instances = s.foundations.instances.map((instance) => {
        if (
          instance.id !== a.instanceId ||
          !isManualFoundationType(instance.type) ||
          instance.lastRestartOfferDayKey === a.dayKey
        ) return instance;
        changed = true;
        return { ...instance, lastRestartOfferDayKey: a.dayKey };
      });
      return changed ? { ...s, foundations: { ...s.foundations, instances } } : s;
    }
    case 'patchSettings': {
      const nextDayStartHour =
        a.patch.dayStartHour === undefined
          ? s.settings.dayStartHour
          : normalizeDayStartHour(a.patch.dayStartHour);
      const settings: Settings = {
        ...s.settings,
        ...a.patch,
        dayStartHour: nextDayStartHour,
        durations: { ...s.settings.durations, ...(a.patch.durations || {}) },
        companion: { ...s.settings.companion, ...(a.patch.companion || {}) },
      };
      let foundations = s.foundations;
      if (
        a.patch.foundations === true &&
        !foundations.instances.some((instance) => instance.type === 'focused-work')
      ) {
        const focusedWork = createFoundationInstance({
          type: 'focused-work',
          order: 0,
          at: a.at ?? Date.now(),
          dayStartHour: settings.dayStartHour,
        });
        if (focusedWork) {
          foundations = {
            ...foundations,
            instances: [
              ...foundations.instances.map((instance) => ({
                ...instance,
                order: instance.order + 1,
              })),
              focusedWork,
            ],
          };
        }
      }
      const dayBoundaryChanged = nextDayStartHour !== s.settings.dayStartHour;
      const current = dayBoundaryChanged
        ? initializeDay(
            {
              ...s,
              settings,
              foundations,
              ...rederiveStreakForBoundary(s, nextDayStartHour),
            },
            a.at ?? Date.now(),
          )
        : { ...s, settings, foundations };
      // Switching the flow timer off while standing in it: land back on a
      // fresh focus timer instead of a tab that no longer exists. The zeroed
      // stopwatch's session record is finalized as abandoned.
      if (a.patch.flow === false && (current.mode === 'flow' || current.openFlow)) {
        const appended = current.openFlow
          ? appendSessionRecordWithArchive(
              current.sessionRecords,
              current.historyArchive,
              finalizeSession(current.openFlow, 'abandoned', flowElapsed(current) / 60),
            )
          : null;
        return {
          ...current,
          settings,
          ...(current.mode === 'flow'
            ? {
                mode: 'focus' as const,
                running: false,
                endsAt: null,
                justDone: false,
                remaining: settings.durations.focus,
              }
            : {}),
          flowStart: null,
          flowAcc: 0,
          sessionRecords: appended?.records ?? current.sessionRecords,
          historyArchive: appended?.archive ?? current.historyArchive,
          openFlow: null,
          parking: revealParkedThoughts(current.parking, current.openFlow?.id),
        };
      }
      // Only an actual duration edit may replace a fresh idle countdown.
      // A paused work record owns its remaining time, and unrelated settings
      // such as name or theme must never reset it.
      const durationChanged = a.patch.durations !== undefined;
      const remaining =
        durationChanged &&
        current.mode !== 'flow' &&
        current.mode !== 'tiny' &&
        !current.running &&
        !current.justDone &&
        !current.openFocus
          ? settings.durations[current.mode]
          : current.remaining;
      const personalCadence = durationChanged
        ? { ...current.personalCadence, computedAt: null, recommendation: null }
        : current.personalCadence;
      return { ...current, settings, remaining, personalCadence };
    }
    default:
      return s;
  }
}

export function useBloom() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const dayStartHour = state.settings.dayStartHour;

  // Persist durable fields whenever they change. Flow start/pause lands here
  // too (running/mode/flowStart), so a live stopwatch survives a reload; the
  // per-second tick only touches `remaining`, which is not persisted.
  useEffect(() => {
    persist(state);
  }, [state.sessions, state.streak, state.lastFocusDay, state.restDayUsedOn, state.comeBack, state.tasks, state.activeTaskId, state.palXp, state.goals, state.goalLedger, state.foundations, state.dayPlan, state.lastRolloverOfferDay, state.flowStart, state.flowAcc, state.running, state.mode, state.sessionRecords, state.openFocus, state.openFlow, state.lastWeeklyReviewWeek, state.ifThenPlans, state.ritual, state.lastWoopOfferAt, state.preSlump, state.personalCadence, state.parking, state.guideRead, state.settings]);

  // Wall-clock tick: recompute remaining ~4x/sec and let the same reducer
  // decision own a day rollover while a timer is active.
  useEffect(() => {
    if (!state.running) return;
    const iv = setInterval(
      () => dispatch({ type: 'tick', at: Date.now() }),
      250,
    );
    return () => clearInterval(iv);
  }, [dayStartHour, state.running]);

  // Idle apps still wake at the local boundary. A running app normally rolls
  // over on its 250 ms tick first; the reducer makes the scheduled duplicate
  // a strict no-op and this effect then schedules the following boundary.
  useEffect(() => {
    const current = Date.now();
    const delay = Math.max(1, nextDayBoundaryAt(current, dayStartHour) - current + 1);
    const timeout = window.setTimeout(
      () => dispatch({ type: 'rollOverDay', at: Date.now() }),
      delay,
    );
    return () => window.clearTimeout(timeout);
  }, [dayStartHour, state.today]);

  // Background tabs throttle intervals: catch up the moment the tab is
  // visible again so a session that ended while hidden completes immediately.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        dispatch({ type: 'tick', at: Date.now() });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [dayStartHour]);

  // When a session completes: play the optional chime, post its paired notice,
  // hold the celebrate state, then advance. A finished first tiny rung stays
  // put until the user freely chooses the 10-minute extension or says this was
  // enough (PLAN 12.1).
  const celRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCountdownDeadlineRef = useRef<number | null>(state.endsAt);
  if (state.running && state.mode !== 'flow' && state.endsAt != null) {
    lastCountdownDeadlineRef.current = state.endsAt;
  }
  const handledCompletionCueRef = useRef<string | null>(null);
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  const runningRef = useRef(state.running);
  runningRef.current = state.running;
  const modeRef = useRef(state.mode);
  modeRef.current = state.mode;
  const [completionAlertStatus, setCompletionAlertStatus] =
    useState<IOSCompletionAlertStatus>(() =>
      isIOSCompletionAlertPlatform()
        ? {
            ...UNSUPPORTED_COMPLETION_ALERT_STATUS,
            permission: 'checking',
          }
        : UNSUPPORTED_COMPLETION_ALERT_STATUS,
    );
  const [completionAlertPrimerOpen, setCompletionAlertPrimerOpen] = useState(false);
  const completionAlertPrimerOfferedRef = useRef(false);

  // PLAN 13.12: on iOS 26 and later an authorized alarm can sound a bounded
  // finish through Silent Mode and an active Focus. Authorization is explicit
  // and system-owned; until it exists, and on every system without AlarmKit,
  // PLAN 13.11's ordinary notification and the foreground chime stay in charge.
  const alarmPlatform = isIOSAlarmPlatform();
  const [alarmStatus, setAlarmStatus] = useState<IOSAlarmStatus>(() =>
    alarmPlatform
      ? { supported: false, authorization: 'checking' }
      : UNSUPPORTED_ALARM_STATUS,
  );
  // Keyed by the exact snapshot the answer belongs to, so `alarmOwnsCue` reads
  // as `null` — undecided — the instant the timer changes and before the native
  // answer arrives. That distinction is what keeps the generic Live Activity
  // from being created and dismissed again in the same moment.
  const alarmSnapshotKey = `${state.mode}:${state.running ? 1 : 0}:${
    state.settings.sound ? 1 : 0
  }:${state.endsAt ?? 'none'}:${state.openFocus?.id ?? 'none'}`;
  const [alarmDecision, setAlarmDecision] = useState<{
    key: string;
    owns: boolean;
  } | null>(null);
  const alarmOwnsCue =
    alarmDecision && alarmDecision.key === alarmSnapshotKey
      ? alarmDecision.owns
      : null;
  // An authorized alarm is expected to take this bounded countdown. Holding the
  // surface for it costs one native round trip; not holding it flashes a second
  // countdown into the Dynamic Island at every start.
  const alarmHoldsSurface =
    alarmOwnsCue === true ||
    (alarmOwnsCue === null &&
      alarmPlatform &&
      alarmStatus.authorization === 'granted' &&
      state.settings.sound &&
      state.running &&
      state.endsAt != null &&
      state.mode !== 'flow');

  const refreshAlarmStatus = useCallback(async () => {
    const status = await readIOSAlarmStatus();
    setAlarmStatus(status);
    return status;
  }, []);

  const requestAlarmAuthorization = useCallback(async () => {
    const status = await requestIOSAlarmAuthorization();
    setAlarmStatus(status);
    return status;
  }, []);

  // Authorization stays outside persisted Bloom data. Re-read it on return so
  // a change made in iOS Settings is reflected without a stored copy.
  useEffect(() => {
    if (!alarmPlatform) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshAlarmStatus();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [alarmPlatform, refreshAlarmStatus]);

  // Mirror the reducer-owned deadline into one alarm. The returned ownership is
  // the handoff: while AlarmKit holds this exact deadline, the notification and
  // the generic Live Activity below stand down, so one finish never produces two
  // sounds or two system countdowns. Nothing here completes or records anything.
  useEffect(() => {
    if (!alarmPlatform) return;
    const key = alarmSnapshotKey;
    void reconcileIOSAlarm({
      enabled: state.settings.sound,
      running: state.running,
      mode: state.mode,
      deadlineMs: state.endsAt,
      // PLAN 13.19: the AlarmKit surface's controls address this session.
      // Breaks open none, so they send '' and render no control.
      sessionId: state.openFocus?.id ?? '',
    }).then((result) => {
      setAlarmDecision({ key, owns: result.owns });
      setAlarmStatus((current) =>
        current.supported === result.supported &&
        current.authorization === result.authorization
          ? current
          : { supported: result.supported, authorization: result.authorization },
      );
    });
  }, [
    alarmPlatform,
    alarmSnapshotKey,
    alarmStatus.authorization,
    state.endsAt,
    state.mode,
    state.running,
    state.settings.sound,
  ]);

  const refreshCompletionAlertStatus = useCallback(async () => {
    const status = await readIOSCompletionAlertStatus();
    setCompletionAlertStatus(status);
    if (status.permission === 'granted') setCompletionAlertPrimerOpen(false);
    return status;
  }, []);

  const requestCompletionAlertPermission = useCallback(async () => {
    const status = await requestIOSCompletionAlertPermission();
    setCompletionAlertStatus(status);
    if (status.permission === 'granted') setCompletionAlertPrimerOpen(false);
    return status;
  }, []);

  const maybeOfferCompletionAlertPermission = useCallback(() => {
    if (
      completionAlertPrimerOfferedRef.current ||
      !soundRef.current ||
      !isIOSCompletionAlertPlatform()
    ) {
      return;
    }
    completionAlertPrimerOfferedRef.current = true;
    void readIOSCompletionAlertStatus().then((status) => {
      setCompletionAlertStatus(status);
      if (status.permission === 'prompt' || status.permission === 'unavailable') {
        setCompletionAlertPrimerOpen(true);
      }
    });
  }, []);

  // Permission remains system-owned. Refresh when Bloom returns so a change
  // made in iOS Settings is reflected without adding persisted app state.
  useEffect(() => {
    if (!isIOSCompletionAlertPlatform()) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshCompletionAlertStatus();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [refreshCompletionAlertStatus]);

  // PLAN 13.11: mirror the reducer-owned deadline into one native local
  // request. This effect never completes or persists a session; after process
  // termination, the existing boot sweep remains the source of record truth.
  // PLAN 13.12 hands this cue to AlarmKit whenever an authorized alarm mirrors
  // the same deadline, so the two never sound together.
  useEffect(() => {
    // Undecided keeps the notification scheduled: a duplicate pending request
    // that gets cancelled seconds later is a far smaller failure than a finish
    // with no cue at all if the alarm turns out not to be scheduled.
    void reconcileIOSCompletionAlert({
      enabled: state.settings.sound && alarmOwnsCue !== true,
      running: state.running,
      mode: state.mode,
      deadlineMs: state.endsAt,
    });
  }, [
    alarmOwnsCue,
    completionAlertStatus.permission,
    state.endsAt,
    state.mode,
    state.running,
    state.settings.sound,
  ]);

  // PLAN 13.18: drain commands left by controls in system UI.
  //
  // A `LiveActivityIntent` runs in the app's process while this WebView is
  // suspended, so it can only record intent. Replay happens here, against the
  // wall clock each command carries — never against the instant it was read —
  // which is what keeps the reducer the single timer authority instead of
  // making the native layer a second one. See docs/adr/0001.
  const commandStateRef = useRef(state);
  commandStateRef.current = state;
  const appliedCommandIdsRef = useRef<Set<string>>(new Set());
  const drainingCommandsRef = useRef(false);

  const drainCommands = useCallback(async () => {
    // One drain at a time: resume and visibilitychange routinely fire together,
    // and a command applied twice from overlapping reads is exactly what the
    // idempotency guard below exists to prevent.
    if (!isIOSCommandPlatform() || drainingCommandsRef.current) return;
    drainingCommandsRef.current = true;
    try {
      const commands = await drainIOSCommands();
      if (commands.length === 0) return;

      const current = commandStateRef.current;
      const openSessionId = current.openFocus?.id ?? null;
      // Dispatches in this loop do not re-render before the next iteration, so
      // track the running state we are steering toward rather than re-reading
      // a ref that is still one render behind.
      let projectedRunning = current.running;
      const handled: string[] = [];

      for (const command of commands) {
        // Acknowledge everything read, including commands deliberately dropped:
        // a command that can never apply should not be re-delivered forever.
        handled.push(command.id);
        if (appliedCommandIdsRef.current.has(command.id)) continue;
        appliedCommandIdsRef.current.add(command.id);
        // A command whose session is gone is dropped, so a queue that survived
        // a force-quit can never revive a session the boot sweep already closed
        // as interrupted.
        if (openSessionId == null || openSessionId !== command.sessionId) continue;
        const wantsRunning = command.kind === 'resume';
        // Already in the state this command asks for — replaying it would
        // invert the timer rather than confirm it.
        if (projectedRunning === wantsRunning) continue;
        dispatch({ type: 'toggle', at: command.occurredAt });
        projectedRunning = wantsRunning;
      }

      // The set only has to cover the window before acknowledgement lands;
      // after a relaunch, session matching drops anything stale.
      if (appliedCommandIdsRef.current.size > 64) {
        appliedCommandIdsRef.current = new Set(
          [...appliedCommandIdsRef.current].slice(-32),
        );
      }
      await acknowledgeIOSCommands(handled);
    } finally {
      drainingCommandsRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isIOSCommandPlatform()) return;
    void drainCommands();
    const onResume = () => {
      if (!document.hidden) void drainCommands();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [drainCommands]);

  // PLAN 13.8: mirror only reducer lifecycle changes into one local Live
  // Activity. Running snapshots use the wall-clock deadline; paused snapshots
  // use the frozen remaining seconds. Neither dependency changes on the
  // reducer's 250 ms display tick, so ActivityKit never receives per-second
  // bridge traffic. A null session ends stale native state after terminal
  // actions or the existing interrupted-session boot sweep.
  const liveActivitySessionId = state.openFocus?.id ?? null;
  const liveActivityMode: IOSLiveActivityMode | null =
    state.openFocus?.mode === 'focus' || state.openFocus?.mode === 'tiny'
      ? state.openFocus.mode
      : null;
  const liveActivityStartedAtMs = state.openFocus?.startedAt ?? null;
  const liveActivityPhase =
    liveActivitySessionId && liveActivityMode
      ? state.running && state.endsAt != null
        ? 'running'
        : 'paused'
      : null;
  const liveActivityDeadlineMs =
    liveActivityPhase === 'running' ? state.endsAt : null;
  const liveActivityRemainingSeconds =
    liveActivityPhase === 'paused' ? state.remaining : null;
  const liveActivityPlatform = isIOSLiveActivityPlatform();
  const [liveActivityStatus, setLiveActivityStatus] = useState<IOSLiveActivityStatus>({
    supported: false,
    enabled: false,
    active: false,
  });
  const [liveActivityStatusChecking, setLiveActivityStatusChecking] =
    useState(liveActivityPlatform);
  const liveActivityMirrorRef = useRef<{
    key: string;
    snapshot: IOSLiveActivitySnapshot | null;
    active: boolean | null;
  }>({ key: 'none', snapshot: null, active: null });

  const refreshLiveActivityStatus = useCallback(async () => {
    if (!isIOSLiveActivityPlatform()) {
      const unsupported: IOSLiveActivityStatus = {
        supported: false,
        enabled: false,
        active: false,
      };
      setLiveActivityStatus(unsupported);
      setLiveActivityStatusChecking(false);
      return unsupported;
    }
    setLiveActivityStatusChecking(true);
    const status = await readIOSLiveActivityStatus();
    setLiveActivityStatus(status);
    setLiveActivityStatusChecking(false);
    return status;
  }, []);

  const mirrorLiveActivity = useCallback(
    (snapshot: IOSLiveActivitySnapshot | null) => {
      const key = JSON.stringify(snapshot);
      liveActivityMirrorRef.current = { key, snapshot, active: null };
      void reconcileIOSLiveActivity(snapshot).then((result) => {
        if (liveActivityMirrorRef.current.key === key) {
          liveActivityMirrorRef.current.active = result.active;
          setLiveActivityStatus((status) => ({
            ...status,
            supported: result.supported,
            active: result.active,
          }));
        }
      });
    },
    [],
  );

  useEffect(() => {
    let snapshot: IOSLiveActivitySnapshot | null = null;
    if (
      liveActivitySessionId &&
      liveActivityMode &&
      liveActivityStartedAtMs != null &&
      // PLAN 13.12: an authorized alarm brings its own countdown presentation.
      // Yield the surface to it rather than stacking a second Bloom activity;
      // pausing cancels the alarm and hands this one straight back.
      !alarmHoldsSurface
    ) {
      snapshot =
        liveActivityPhase === 'running' && liveActivityDeadlineMs != null
          ? {
              sessionId: liveActivitySessionId,
              mode: liveActivityMode,
              state: 'running',
              startedAtMs: liveActivityStartedAtMs,
              deadlineMs: liveActivityDeadlineMs,
            }
          : {
              sessionId: liveActivitySessionId,
              mode: liveActivityMode,
              state: 'paused',
              startedAtMs: liveActivityStartedAtMs,
              remainingSeconds: Math.max(
                0,
                Math.floor(liveActivityRemainingSeconds ?? 0),
              ),
            };
    }
    mirrorLiveActivity(snapshot);
  }, [
    alarmHoldsSurface,
    liveActivityDeadlineMs,
    liveActivityMode,
    liveActivityPhase,
    liveActivityRemainingSeconds,
    liveActivitySessionId,
    liveActivityStartedAtMs,
    mirrorLiveActivity,
  ]);

  // Refresh system-owned availability on return. If iOS declined an initial
  // request for a still-current session, retry that same stable snapshot once
  // per foreground transition. A manually dismissed activity remains absent:
  // native reconciliation returns `dismissed` for its session tombstone.
  useEffect(() => {
    if (!liveActivityPlatform) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshLiveActivityStatus();
      const mirror = liveActivityMirrorRef.current;
      if (mirror.snapshot && mirror.active === false) {
        mirrorLiveActivity(mirror.snapshot);
      }
    };
    void refreshLiveActivityStatus();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [liveActivityPlatform, mirrorLiveActivity, refreshLiveActivityStatus]);

  useEffect(() => {
    if (!state.justDone) return;
    const lastRecord = state.sessionRecords[state.sessionRecords.length - 1];
    const holdsTinyOffer = state.mode === 'tiny' && isTinyFirstRung(lastRecord);
    const completedDeadline = lastCountdownDeadlineRef.current;
    const completionCueToken = `${state.mode}:${completedDeadline ?? 'unknown'}`;
    if (handledCompletionCueRef.current !== completionCueToken) {
      handledCompletionCueRef.current = completionCueToken;
      void (async () => {
        // PLAN 13.12: only an alarm that is genuinely alerting replaces this
        // chime. One the person stopped early still leaves them a finish cue.
        const systemAlarmSounded =
          completedDeadline != null && isIOSAlarmPlatform()
            ? (await consumeIOSAlarmDelivery(completedDeadline)) === 'system-alarm'
            : false;
        const presentation =
          completedDeadline != null && isIOSCompletionAlertPlatform()
            ? await consumeIOSCompletionAlertDelivery(completedDeadline)
            : 'none';
        if (
          !soundRef.current ||
          systemAlarmSounded ||
          presentation === 'background-system'
        ) {
          return;
        }
        audioEngine.playRing();
        // Native iOS owns its system notification. This legacy browser path
        // must never create an unfiltered duplicate inside WKWebView.
        if (!isIOSCompletionAlertPlatform()) {
          const notice = completionNotice(state.mode, holdsTinyOffer);
          notify(notice.title, notice.body);
        }
      })();
    }
    if (!holdsTinyOffer) {
      celRef.current = setTimeout(() => dispatch({ type: 'clearDone' }), 3600);
    }
    return () => {
      if (celRef.current) clearTimeout(celRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.justDone, state.mode, state.sessionRecords]);

  // Derived animal mood.
  const mood = useMemo<'idle' | 'work' | 'sleep' | 'celebrate'>(() => {
    if (state.justDone) return 'celebrate';
    if (!state.running) return 'idle';
    return state.mode === 'focus' || state.mode === 'flow' || state.mode === 'tiny'
      ? 'work'
      : 'sleep';
  }, [state.justDone, state.running, state.mode]);

  const statusLabel = state.justDone
    ? state.mode === 'short' || state.mode === 'long'
      ? 'break complete — ready when you are'
      : 'yay — session done!'
    : state.running
      ? state.mode === 'flow'
        ? 'in the flow…'
        : state.mode === 'tiny'
          ? 'one tiny start…'
          : state.mode === 'focus'
            ? 'focusing…'
            : 'resting…'
      : 'ready when you are';

  const palSprite: AnimalKind = friendByName(state.settings.pal).sprite;
  const activeTask = resolveActiveTask(state.tasks, state.activeTaskId);

  const actions = useMemo(
    () => ({
      toggle: (ifThenPlanId?: string, targetText?: string) => {
        // The first start press is the user gesture that unlocks the finish cue.
        if (soundRef.current) audioEngine.resume();
        if (!runningRef.current && modeRef.current !== 'flow') {
          // The timer starts regardless; this only opens a skippable primer if
          // iOS has never asked for completion-alert permission.
          maybeOfferCompletionAlertPermission();
        }
        const target = targetText?.trim().slice(0, SESSION_TARGET_MAX) || undefined;
        dispatch({ type: 'toggle', ifThenPlanId, targetText: target });
      },
      reset: () => dispatch({ type: 'reset' }),
      discardFalseStart: () => dispatch({ type: 'discardFalseStart' }),
      pick: (m: TimerMode) => dispatch({ type: 'pick', mode: m }),
      pickTiny: (minutes: TinyStartMinutes) =>
        dispatch({ type: 'pick', mode: 'tiny', tinyMinutes: minutes }),
      skip: () => dispatch({ type: 'skip' }),
      toggleTask: (id: number) => dispatch({ type: 'toggleTask', id }),
      setTaskGoal: (id: number, goalId?: number) =>
        dispatch({ type: 'setTaskGoal', id, goalId }),
      resolveGoalCredit: (
        source: 'task' | 'session',
        id: number | string,
        apply: boolean,
        amount?: number,
      ) => dispatch({ type: 'resolveGoalCredit', source, id, apply, amount }),
      addTask: (text: string, goal = 1, goalId?: number) =>
        dispatch({ type: 'addTask', text, goal, goalId }),
      removeTask: (id: number) => dispatch({ type: 'removeTask', id }),
      restoreTask: (task: Task, index: number, wasActive = false) =>
        dispatch({ type: 'restoreTask', task, index, wasActive }),
      setActiveTask: (id: number) => dispatch({ type: 'setActiveTask', id }),
      finishFlow: () => dispatch({ type: 'finishFlow' }),
      extendTiny: () => {
        if (soundRef.current) audioEngine.resume();
        dispatch({ type: 'extendTiny' });
      },
      declineTiny: () => dispatch({ type: 'declineTiny' }),
      addGoal: (title: string, due: string, target: number, unit?: string) =>
        dispatch({ type: 'addGoal', title, due, target, unit }),
      updateGoal: (id: number, patch: Partial<Pick<Goal, 'title' | 'due' | 'target' | 'unit'>>) =>
        dispatch({ type: 'updateGoal', id, patch }),
      removeGoal: (id: number) => dispatch({ type: 'removeGoal', id }),
      restoreGoal: (
        goal: Goal,
        index: number,
        linkedTaskIds: number[] = [],
        goalCredits: GoalCredit[] = [],
      ) => dispatch({ type: 'restoreGoal', goal, index, linkedTaskIds, goalCredits }),
      logGoal: (id: number, delta: number) => dispatch({ type: 'logGoal', id, delta }),
      addGoalDailyTarget: (goalId: number, plannedAmount: number, targetAt: number) =>
        dispatch({ type: 'addGoalDailyTarget', goalId, plannedAmount, targetAt }),
      addTaskDailyTarget: (taskId: number, plannedAmount: number, targetAt = Date.now()) =>
        dispatch({ type: 'addTaskDailyTarget', taskId, plannedAmount, targetAt }),
      editDailyTarget: (id: string, plannedAmount: number) =>
        dispatch({ type: 'editDailyTarget', id, plannedAmount }),
      dismissDailyTarget: (id: string) => dispatch({ type: 'dismissDailyTarget', id }),
      armGoal: (goalId: number | null) => dispatch({ type: 'armGoal', goalId }),
      markRolloverOffered: (dayKey: string) =>
        dispatch({ type: 'markRolloverOffered', dayKey }),
      resolveRollover: (id: string, choice: 'carry' | 'rest') =>
        dispatch({ type: 'resolveRollover', id, choice }),
      clearFocusData: () => {
        // The companion log has its own localStorage key. Keep the public
        // action cohesive: one user confirmation clears that key and one
        // reducer action clears every dependent main-store slice.
        clearEvents();
        dispatch({ type: 'clearFocusData' });
        // Settings only exposes this action with no open work session. End any
        // orphaned system presentation as part of the same confirmed cleanup.
        void reconcileIOSLiveActivity(null);
        // The one place a ringing alarm is silenced on Bloom's initiative: the
        // person explicitly asked for everything here to be cleared.
        void cancelIOSAlarm(true);
        // PLAN 13.18: pending intent for erased data is not intent worth
        // replaying into the fresh state.
        void clearIOSCommands();
      },
      linkDriftEvent: (eventId: string, sessionId: string) =>
        dispatch({ type: 'linkDrift', eventId, sessionId }),
      markWeeklyReview: (week: string) => dispatch({ type: 'markWeeklyReview', week }),
      addIfThenPlan: (cueType: CueType, cueText: string, actionText: string, taskId?: number) =>
        dispatch({ type: 'addIfThenPlan', cueType, cueText, actionText, taskId }),
      updateIfThenPlan: (
        id: string,
        patch: Partial<Pick<IfThenPlan, 'cueType' | 'cueText' | 'actionText' | 'taskId'>>,
      ) => dispatch({ type: 'updateIfThenPlan', id, patch }),
      removeIfThenPlan: (id: string) => dispatch({ type: 'removeIfThenPlan', id }),
      useIfThenPlan: (id: string) => dispatch({ type: 'useIfThenPlan', id }),
      patchRitual: (patch: Partial<Pick<RitualSettings, 'enabled' | 'suggestionSeen'>>) =>
        dispatch({ type: 'patchRitual', patch }),
      updateRitualItem: (id: string, text: string) =>
        dispatch({ type: 'updateRitualItem', id, text }),
      markWoopOffered: (at: number) => dispatch({ type: 'markWoopOffered', at }),
      recordPreSlump: (sessionId: string, at: number) =>
        dispatch({ type: 'recordPreSlump', sessionId, at }),
      silencePreSlumpForDay: (at: number) => dispatch({ type: 'silencePreSlump', at }),
      cachePersonalCadence: (recommendation: PersonalCadenceRecommendation) =>
        dispatch({ type: 'cachePersonalCadence', recommendation, at: Date.now() }),
      applyCadence: (pair: CadencePair) => dispatch({ type: 'applyCadence', pair }),
      setTargetOutcome: (sessionId: string, targetOutcome: TargetOutcome) =>
        dispatch({ type: 'setTargetOutcome', sessionId, targetOutcome }),
      repairSession: (proposal: SessionRepairProposal): SessionRecord => {
        const editedAt = Date.now();
        let driftEventId: string | undefined;
        if (proposal.retroactiveDrift) {
          const onsetMin = Math.max(
            0,
            (proposal.retroactiveDrift.onsetAt - proposal.record.startedAt) / 60_000,
          );
          const len = Math.max(
            1,
            proposal.record.plannedMin ?? proposal.record.actualMin,
            Math.ceil(onsetMin),
          );
          driftEventId = appendDriftEvent({
            sessionId: proposal.record.id,
            ts: Math.max(editedAt, proposal.retroactiveDrift.onsetAt),
            shownAt: proposal.retroactiveDrift.onsetAt,
            min: Math.min(len, onsetMin),
            estOnsetMin: Math.min(len, onsetMin),
            estDurationMin: Math.min(
              len,
              Math.max(1, proposal.retroactiveDrift.durationMin),
            ),
            len,
            src: 'repair',
          }).id;
        }
        const record: SessionRecord = {
          ...proposal.record,
          driftEventIds:
            driftEventId && !proposal.record.driftEventIds.includes(driftEventId)
              ? [...proposal.record.driftEventIds, driftEventId]
              : [...proposal.record.driftEventIds],
          edited: true,
          editedAt,
        };
        dispatch({ type: 'repairSession', record });
        return record;
      },
      parkThought: (text: string) => dispatch({ type: 'parkThought', text }),
      sendParkedToTasks: (id: string) => dispatch({ type: 'sendParkedToTasks', id }),
      dismissParked: (id: string) => dispatch({ type: 'dismissParked', id }),
      markGuideArticleRead: (id: GuideArticleId) =>
        dispatch({ type: 'markGuideArticleRead', id, at: Date.now() }),
      markGuideArticleSuggested: (id: GuideArticleId, momentKey: string) =>
        dispatch({ type: 'markGuideArticleSuggested', id, momentKey, at: Date.now() }),
      captureTabLeave: (at: number) => dispatch({ type: 'captureTabLeave', at }),
      markTabReturn: (at: number, thresholdSec: number) =>
        dispatch({ type: 'markTabReturn', at, thresholdSec }),
      resolveTabReturn: (resolution: ReturnResolution) =>
        dispatch({ type: 'resolveTabReturn', resolution }),
      setNextAction: (sessionId: string, text: string) =>
        dispatch({ type: 'setNextAction', sessionId, text }),
      resumeInterrupted: (sessionId: string) => {
        maybeOfferCompletionAlertPermission();
        dispatch({ type: 'resumeInterrupted', sessionId });
      },
      dismissResumeCue: (sessionId: string) =>
        dispatch({ type: 'dismissResumeCue', sessionId }),
      toggleFoundationDay: (instanceId: string, targetAt?: number) =>
        dispatch({ type: 'toggleFoundationDay', instanceId, at: Date.now(), targetAt }),
      setFoundationEnabled: (
        foundationType: ManualFoundationType,
        enabled: boolean,
        customName?: string,
      ) => dispatch({
        type: 'setFoundationEnabled',
        foundationType,
        enabled,
        customName,
        at: Date.now(),
      }),
      reorderFoundation: (instanceId: string, direction: -1 | 1) =>
        dispatch({ type: 'reorderFoundation', instanceId, direction }),
      renameCustomFoundation: (name: string) =>
        dispatch({ type: 'renameCustomFoundation', name }),
      setFoundationIfThen: (instanceId: string, ifThenId?: string) =>
        dispatch({ type: 'setFoundationIfThen', instanceId, ifThenId }),
      markFoundationRestartOffered: (instanceId: string, dayKey: string) =>
        dispatch({ type: 'markFoundationRestartOffered', instanceId, dayKey }),
      patchSettings: (patch: Partial<Settings>) =>
        dispatch({ type: 'patchSettings', patch, at: Date.now() }),
      reloadPersistedState: () => dispatch({ type: 'replaceState', state: loadState() }),
    }),
    [],
  );

  const retryStorage = useCallback(() => {
    const before = getStorageHealthSnapshot();
    if (before.failures.some((failure) => failure.area === 'bloom-state')) {
      const persisted = readPersisted();
      if (
        persisted &&
        !getStorageHealthSnapshot().failures.some(
          (failure) => failure.area === 'bloom-state',
        )
      ) {
        dispatch({ type: 'replaceState', state: loadState() });
      } else if (
        before.failures.every(
          (failure) =>
            failure.area !== 'bloom-state' || failure.kind === 'write',
        )
      ) {
        persist(state);
      }
    }
    if (before.failures.some((failure) => failure.area === 'companion-log')) {
      const events = loadEvents();
      if (!storageWritesBlocked('companion-log')) replaceCompanionLog(events);
    }
  }, [state]);

  const recoverStorage = useCallback(() => {
    const failures = getStorageHealthSnapshot().failures;
    if (failures.some((failure) => failure.area === 'bloom-state')) {
      persist(state, true);
    }
    if (failures.some((failure) => failure.area === 'companion-log')) {
      // loadEvents keeps every usable row in memory while preserving the raw
      // corrupt payload in the downloadable recovery bundle.
      replaceCompanionLog(loadEvents());
    }
  }, [state]);

  const mmss = useCallback((sec: number) => {
    const m = Math.floor(sec / 60);
    const x = sec % 60;
    return `${m}:${String(x).padStart(2, '0')}`;
  }, []);

  // Stopwatch display: mm:ss under an hour, h:mm:ss beyond it.
  const clock = useCallback(
    (sec: number) => {
      if (sec < 3600) return mmss(sec);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}:${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    },
    [mmss],
  );

  // Keep the tab title useful while the timer runs.
  useEffect(() => {
    if (state.justDone) {
      document.title = '🌸 session done! — Bloom';
    } else if (state.running) {
      const what =
        state.mode === 'flow'
          ? 'flow'
          : state.mode === 'tiny'
            ? 'tiny start'
            : state.mode === 'focus'
              ? 'focus'
              : 'break';
      const time = state.mode === 'flow' ? clock(state.remaining) : mmss(state.remaining);
      document.title = `${time} ${what} — Bloom`;
    } else {
      document.title = 'Bloom · a cozy pomodoro';
    }
  }, [state.remaining, state.running, state.mode, state.justDone, mmss, clock]);

  return {
    state,
    today: state.today,
    now: state.now,
    mood,
    statusLabel,
    palSprite,
    activeTask,
    actions,
    storageRecovery: {
      retry: retryStorage,
      recover: recoverStorage,
      recoveredBloom: persistedShapeFromState(state),
    },
    completionAlerts: {
      status: completionAlertStatus,
      primerOpen: completionAlertPrimerOpen,
      requestPermission: requestCompletionAlertPermission,
      dismissPrimer: () => setCompletionAlertPrimerOpen(false),
      refreshStatus: refreshCompletionAlertStatus,
    },
    liveActivity: {
      isIOS: liveActivityPlatform,
      status: liveActivityStatus,
      checking: liveActivityStatusChecking,
      refreshStatus: refreshLiveActivityStatus,
    },
    alarms: {
      isIOS: alarmPlatform,
      status: alarmStatus,
      owns: alarmOwnsCue === true,
      requestAuthorization: requestAlarmAuthorization,
      refreshStatus: refreshAlarmStatus,
    },
    mmss,
    clock,
  };
}
