import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { friendByName } from '../data/friends';
import type { AnimalKind } from '../engine/pixelpals';
import { audioEngine, notify, type BgSound } from '../engine/audio';
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
  clearEvents,
  DEFAULT_COMPANION,
  type Chronotype,
  type CompanionSettings,
} from './companion';
import { dayKeyFor, nextDayBoundaryAt, normalizeDayStartHour } from './dayKey';
import { GOAL_TARGET_MAX, type Goal } from './goals';
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
  appendSessionRecord,
  captureTimerSnapshot,
  finalizeSession,
  markTimerReturn,
  newOpenSession,
  resolveTimerReturn,
  sanitizeOpenSession,
  sanitizeSessionRecords,
  setSessionTargetOutcome,
  sweepStaleOpenSession,
  type OpenSession,
  type ReturnResolution,
  type SessionRecord,
  type TargetOutcome,
} from './sessions';
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

/** 'flow' is the opt-in count-up stopwatch; the rest count down. */
export type TimerMode = 'focus' | 'tiny' | 'short' | 'long' | 'flow';
/** The countdown modes — the only ones with a configured length. */
export type DurationMode = 'focus' | 'short' | 'long';

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
  /** Epoch ms when the task was last marked done; cleared on un-check (v19). */
  completedAt?: number;
}

/** All values in seconds. */
export type Durations = Record<DurationMode, number>;

export interface Settings {
  /** What the app calls the user (chosen on first run, editable in settings). */
  name: string;
  durations: Durations;
  /** Play the end-of-session ring (chime + notification). */
  sound: boolean;
  /** Ambience played while a session runs. */
  bgSound: BgSound;
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
  /** Flow stopwatch: epoch ms the current run started at; null when paused. */
  flowStart: number | null;
  /** Flow stopwatch: seconds banked across pauses. */
  flowAcc: number;
  /** Per-session log (capped ring buffer) — the raw data behind insights. */
  sessionRecords: SessionRecord[];
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
  bgSound: 'off',
  autoStart: false,
  night: false,
  pal: 'Mochi',
  companion: DEFAULT_COMPANION,
  flow: false,
  planner: false,
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
  flowStart: null,
  flowAcc: 0,
  sessionRecords: [],
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
export const SCHEMA_VERSION = 23;

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
  /** Flow stopwatch survives reloads — a stopwatch keeps counting while away. */
  flow: { startedAt: number | null; acc: number; running: boolean };
  /** Per-session records, newest last, capped in sessions.ts. */
  sessionRecords: SessionRecord[];
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
];

function withDefaults(blob: Record<string, unknown>): PersistedShape {
  const b = blob ?? {};
  const bSettings = (b.settings as Partial<Settings> | undefined) ?? {};
  // Legacy v1 stored durations at the top level, not under `settings`.
  const legacyDurations = (b.durations as Partial<Durations> | undefined) ?? {};
  const validBg: BgSound[] = ['off', 'calm', 'coffee', 'white'];
  const validChronotypes: Chronotype[] = ['betterEarlier', 'betterLater', 'notSure'];
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...bSettings,
    name: typeof bSettings.name === 'string' ? bSettings.name : DEFAULT_SETTINGS.name,
    bgSound: validBg.includes(bSettings.bgSound as BgSound)
      ? (bSettings.bgSound as BgSound)
      : DEFAULT_SETTINGS.bgSound,
    chronotype: validChronotypes.includes(bSettings.chronotype as Chronotype)
      ? (bSettings.chronotype as Chronotype)
      : DEFAULT_SETTINGS.chronotype,
    preSlumpCheck:
      typeof bSettings.preSlumpCheck === 'boolean'
        ? bSettings.preSlumpCheck
        : DEFAULT_SETTINGS.preSlumpCheck,
    dayStartHour: normalizeDayStartHour(bSettings.dayStartHour),
    durations: {
      ...DEFAULT_SETTINGS.durations,
      ...legacyDurations,
      ...(bSettings.durations ?? {}),
    },
    companion: { ...DEFAULT_COMPANION, ...(bSettings.companion ?? {}) },
  };
  const goals = (Array.isArray(b.goals) ? (b.goals as Goal[]) : []).filter(
    (g) =>
      g &&
      typeof g.id === 'number' &&
      typeof g.title === 'string' &&
      typeof g.due === 'string' &&
      typeof g.target === 'number' &&
      typeof g.done === 'number',
  );
  const rawFlow = (b.flow as Partial<PersistedShape['flow']> | undefined) ?? {};
  const flow = {
    startedAt: typeof rawFlow.startedAt === 'number' ? rawFlow.startedAt : null,
    acc: typeof rawFlow.acc === 'number' && Number.isFinite(rawFlow.acc) ? Math.max(0, rawFlow.acc) : 0,
    running: rawFlow.running === true,
  };
  return {
    version: SCHEMA_VERSION,
    sessions: typeof b.sessions === 'number' && Number.isFinite(b.sessions) ? (b.sessions as number) : 0,
    streak: typeof b.streak === 'number' && Number.isFinite(b.streak) ? (b.streak as number) : 0,
    lastFocusDay: typeof b.lastFocusDay === 'string' ? (b.lastFocusDay as string) : null,
    restDayUsedOn: typeof b.restDayUsedOn === 'string' ? (b.restDayUsedOn as string) : null,
    comeBack: b.comeBack === true,
    tasks: Array.isArray(b.tasks) ? (b.tasks as Task[]) : DEFAULT_TASKS,
    activeTaskId: typeof b.activeTaskId === 'number' ? (b.activeTaskId as number) : null,
    palXp: b.palXp && typeof b.palXp === 'object' ? (b.palXp as Record<string, number>) : {},
    goals,
    flow,
    sessionRecords: sanitizeSessionRecords(b.sessionRecords),
    openFocus: keepOpenSession(b.openFocus, 'focus'),
    openFlow: keepOpenSession(b.openFlow, 'flow'),
    lastWeeklyReviewWeek:
      typeof b.lastWeeklyReviewWeek === 'string' ? (b.lastWeeklyReviewWeek as string) : null,
    ifThenPlans: sanitizeIfThenPlans(b.ifThenPlans),
    ritual: sanitizeRitual(b.ritual),
    lastWoopOfferAt:
      typeof b.lastWoopOfferAt === 'number' && Number.isFinite(b.lastWoopOfferAt)
        ? b.lastWoopOfferAt
        : null,
    preSlump: sanitizePreSlumpCaps(b.preSlump),
    personalCadence: sanitizePersonalCadenceMemory(b.personalCadence),
    parking: sanitizeParkedThoughts(b.parking),
    guideRead: sanitizeGuideReadState(b.guideRead),
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

export function migratePersistedBlob(blob: Record<string, unknown>): PersistedShape {
  let cur = blob && typeof blob === 'object' ? { ...blob } : {};
  let v = typeof cur.version === 'number' ? cur.version : 0;
  for (; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) cur = step(cur);
  }
  return withDefaults(cur);
}

export function readPersisted(): PersistedShape | null {
  // A corrupt newest blob must not hide a valid legacy backup. Parse each
  // candidate independently and keep walking when one is unreadable.
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return migratePersistedBlob(JSON.parse(raw));
    } catch {
      /* try the next compatible key */
    }
  }
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
  const sessionRecords = swept ? appendSessionRecord(p.sessionRecords, swept) : p.sessionRecords;
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
    flowAcc: p.flow.acc,
    sessionRecords,
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
  return {
    ...s,
    today,
    now,
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
    flow: { startedAt: s.flowStart, acc: s.flowAcc, running: s.running && s.mode === 'flow' },
    sessionRecords: s.sessionRecords,
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

function persist(s: BloomState) {
  const data = persistedShapeFromState(s);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — run in-memory */
  }
}

/** Count a finished work session into the configured study day (PLAN 5.4/9.2). */
function bumpStreak(
  s: BloomState,
  at = Date.now(),
): Pick<BloomState, 'streak' | 'lastFocusDay' | 'restDayUsedOn' | 'comeBack'> {
  const bumped = bumpStreakGentle(
    { streak: s.streak, lastFocusDay: s.lastFocusDay, restDayUsedOn: s.restDayUsedOn },
    dayKeyFor(at, s.settings.dayStartHour),
  );
  // Any finished work session settles the welcome-back state: the user is
  // simply here again, and the count is growing.
  return { ...bumped, comeBack: false };
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
  | { type: 'toggle'; ifThenPlanId?: string; targetText?: string }
  | { type: 'reset' }
  | { type: 'pick'; mode: TimerMode; tinyMinutes?: TinyStartMinutes }
  | { type: 'skip' }
  | { type: 'complete' }
  | { type: 'extendTiny' }
  | { type: 'declineTiny' }
  | { type: 'finishFlow' }
  | { type: 'clearDone' }
  | { type: 'toggleTask'; id: number }
  | { type: 'addTask'; text: string; goal: number; goalId?: number }
  | { type: 'removeTask'; id: number }
  | { type: 'restoreTask'; task: Task; index: number; wasActive: boolean }
  | { type: 'setActiveTask'; id: number }
  | { type: 'addGoal'; title: string; due: string; target: number }
  | { type: 'updateGoal'; id: number; patch: Partial<Pick<Goal, 'title' | 'due' | 'target'>> }
  | { type: 'removeGoal'; id: number }
  | { type: 'restoreGoal'; goal: Goal; index: number; linkedTaskIds: number[] }
  | { type: 'logGoal'; id: number; delta: number }
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
      if (s.mode === 'flow') {
        if (s.running) {
          const acc = flowElapsed(s);
          return { ...s, running: false, flowStart: null, flowAcc: acc, remaining: Math.floor(acc), justDone: false };
        }
        // First press of a fresh stopwatch opens its session record; a
        // resume just keeps the existing one.
        const flowTask = resolveActiveTask(s.tasks, s.activeTaskId);
        const openFlow =
          s.openFlow ?? {
            ...newOpenSession('flow', null, flowTask?.id, undefined, undefined, flowTask?.goalId),
            targetText: a.targetText,
          };
        return { ...s, running: true, flowStart: Date.now(), remaining: Math.floor(s.flowAcc), justDone: false, openFlow };
      }
      if (s.running) {
        const remaining = s.endsAt
          ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000))
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
      const endsAt = Date.now() + rem * 1000;
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
          // The plan picked in the pre-session planner (PLAN 3.2): stamp it on
          // the fresh record, bump its usage, and remember it for the active
          // task so the planner preselects it next time.
          const plan = s.mode === 'focus' && a.ifThenPlanId
            ? ifThenPlans.find((p) => p.id === a.ifThenPlanId)
            : undefined;
          const plannedMin = s.mode === 'tiny' ? rem / 60 : dur.focus / 60;
          openFocus = {
            ...newOpenSession(s.mode, plannedMin, taskId, plan?.id, undefined, task?.goalId),
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
    case 'reset': {
      if (s.mode === 'flow') {
        // Zeroing a started stopwatch abandons its session record.
        const sessionRecords = s.openFlow
          ? appendSessionRecord(
              s.sessionRecords,
              finalizeSession(s.openFlow, 'abandoned', flowElapsed(s) / 60),
            )
          : s.sessionRecords;
        const parking = revealParkedThoughts(s.parking, s.openFlow?.id);
        return { ...s, running: false, flowStart: null, flowAcc: 0, remaining: 0, justDone: false, sessionRecords, openFlow: null, parking };
      }
      // Resetting a started focus/tiny countdown abandons its session record.
      const tinyResetMin = tinyResetMinutes(s.openFocus?.plannedMin, s.remaining);
      const resetSec =
        s.mode === 'tiny'
          ? tinyResetMin * 60
          : dur[s.mode];
      const sessionRecords = s.openFocus
        ? appendSessionRecord(
            s.sessionRecords,
            finalizeSession(s.openFocus, 'abandoned', focusElapsedMin(s)),
          )
        : s.sessionRecords;
      const parking = revealParkedThoughts(s.parking, s.openFocus?.id);
      return { ...s, running: false, endsAt: null, justDone: false, remaining: resetSec, sessionRecords, openFocus: null, parking };
    }
    case 'pick': {
      // Never wipe a live stopwatch by re-tapping its tab.
      if (a.mode === 'flow' && s.mode === 'flow') return s;
      // Walking away from a started focus/tiny countdown abandons that session
      // (re-picking its tab resets it, which is the same thing for the record).
      let sessionRecords = s.sessionRecords;
      let openFocus = s.openFocus;
      let parking = s.parking;
      if ((s.mode === 'focus' || s.mode === 'tiny') && openFocus) {
        const endedSessionId = openFocus.id;
        sessionRecords = appendSessionRecord(
          sessionRecords,
          finalizeSession(openFocus, 'abandoned', focusElapsedMin(s)),
        );
        openFocus = null;
        parking = revealParkedThoughts(parking, endedSessionId);
      }
      // A break is the promised natural pause even if another work mode
      // (notably Flow) is merely banked in the background rather than ended.
      if (a.mode === 'short' || a.mode === 'long') {
        parking = revealAllParkedThoughts(parking);
      }
      if (a.mode === 'flow') {
        return { ...s, sessionRecords, openFocus, parking, mode: 'flow', running: false, endsAt: null, justDone: false, remaining: Math.floor(s.flowAcc) };
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
      return { ...base, sessionRecords, openFocus, parking, mode: a.mode, running: false, endsAt: null, justDone: false, remaining };
    }
    case 'skip': {
      if (s.mode === 'flow') return s; // flow has finish, not skip
      const next: TimerMode = s.mode === 'focus' ? 'short' : 'focus';
      return reducer(s, { type: 'pick', mode: next });
    }
    case 'finishFlow': {
      if (s.mode !== 'flow' || !s.openFlow) return s;
      const elapsed = flowElapsed(s);
      // The user chose to end it, so the record is 'completed' either way —
      // even a stretch too short to bank XP is a real session that happened.
      const sessionRecords = appendSessionRecord(
        s.sessionRecords,
        finalizeSession(s.openFlow, 'completed', elapsed / 60),
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
          ...bumpStreak(s),
          sessionRecords,
          openFlow: null,
          parking,
        };
      }
      const streakPatch = bumpStreak(s);
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
        palXp: { ...s.palXp, [s.settings.pal]: (s.palXp[s.settings.pal] ?? 0) + credited },
        sessionRecords,
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
        ...newOpenSession('tiny', TINY_EXTENSION_MIN, task?.id, undefined, undefined, task?.goalId),
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
      const streakPatch = wasWork
        ? bumpStreak(s)
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
      const sessionRecords =
        wasWork && s.openFocus
          ? appendSessionRecord(
              s.sessionRecords,
              finalizeSession(s.openFocus, 'completed', s.openFocus.plannedMin ?? dur.focus / 60),
            )
          : s.sessionRecords;
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
        palXp,
        sessionRecords,
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
        ? { ...newOpenSession('focus', rem / 60, task?.id, undefined, now, task?.goalId), endsAt }
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
      const tasks = s.tasks.map((t) =>
        t.id === a.id
          ? { ...t, done: !t.done, completedAt: t.done ? undefined : Date.now() }
          : t,
      );
      // If the active task was just checked off, hand focus to the next open one.
      const activeTaskId = resolveActiveTask(tasks, s.activeTaskId)?.id ?? null;
      return { ...s, tasks, activeTaskId };
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
      const tasks = s.tasks.filter((t) => t.id !== a.id);
      const activeTaskId =
        s.activeTaskId === a.id ? (tasks.find((t) => !t.done)?.id ?? null) : s.activeTaskId;
      return { ...s, tasks, activeTaskId };
    }
    case 'restoreTask': {
      if (s.tasks.some((task) => task.id === a.task.id)) return s;
      const tasks = [...s.tasks];
      tasks.splice(Math.max(0, Math.min(a.index, tasks.length)), 0, { ...a.task });
      return {
        ...s,
        tasks,
        activeTaskId: a.wasActive && !a.task.done ? a.task.id : s.activeTaskId,
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
        goals: [...s.goals, { id, title, due: a.due, target, done: 0, createdAt: Date.now() }],
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
        tasks: s.tasks.map((t) => (t.goalId === a.id ? { ...t, goalId: undefined } : t)),
      };
    case 'restoreGoal': {
      if (s.goals.some((goal) => goal.id === a.goal.id)) return s;
      const goals = [...s.goals];
      goals.splice(Math.max(0, Math.min(a.index, goals.length)), 0, { ...a.goal });
      const linkedTaskIds = new Set(a.linkedTaskIds);
      return {
        ...s,
        goals,
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
      return { ...s, ifThenPlans: removeIfThenPlan(s.ifThenPlans, a.id) };
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
      const goals = s.goals.map((g) => {
        if (g.id !== a.id) return g;
        const done = Math.max(0, Math.min(g.target, g.done + a.delta));
        // Stamp the moment the last part lands; un-logging one clears it.
        const completedAt = done >= g.target ? (g.completedAt ?? Date.now()) : undefined;
        return { ...g, done, completedAt };
      });
      return { ...s, goals };
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
      const dayBoundaryChanged = nextDayStartHour !== s.settings.dayStartHour;
      const current = dayBoundaryChanged
        ? initializeDay(
            {
              ...s,
              settings,
              ...rederiveStreakForBoundary(s, nextDayStartHour),
            },
            a.at ?? Date.now(),
          )
        : { ...s, settings };
      // Switching the flow timer off while standing in it: land back on a
      // fresh focus timer instead of a tab that no longer exists. The zeroed
      // stopwatch's session record is finalized as abandoned.
      if (a.patch.flow === false && current.mode === 'flow') {
        const sessionRecords = current.openFlow
          ? appendSessionRecord(
              current.sessionRecords,
              finalizeSession(current.openFlow, 'abandoned', flowElapsed(current) / 60),
            )
          : current.sessionRecords;
        return {
          ...current,
          settings,
          mode: 'focus',
          running: false,
          endsAt: null,
          justDone: false,
          remaining: settings.durations.focus,
          flowStart: null,
          flowAcc: 0,
          sessionRecords,
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
  }, [state.sessions, state.streak, state.lastFocusDay, state.restDayUsedOn, state.comeBack, state.tasks, state.activeTaskId, state.palXp, state.goals, state.flowStart, state.flowAcc, state.running, state.mode, state.sessionRecords, state.openFocus, state.openFlow, state.lastWeeklyReviewWeek, state.ifThenPlans, state.ritual, state.lastWoopOfferAt, state.preSlump, state.personalCadence, state.parking, state.guideRead, state.settings]);

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

  // When a session completes: chime, hold the celebrate state, then advance.
  // A finished first tiny rung stays put until the user freely chooses the
  // 10-minute extension or says this was enough.
  const celRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  useEffect(() => {
    if (!state.justDone) return;
    const lastRecord = state.sessionRecords[state.sessionRecords.length - 1];
    const holdsTinyOffer = state.mode === 'tiny' && isTinyFirstRung(lastRecord);
    if (soundRef.current) {
      audioEngine.playRing();
      const notice = completionNotice(state.mode, holdsTinyOffer);
      notify(notice.title, notice.body);
    }
    if (!holdsTinyOffer) {
      celRef.current = setTimeout(() => dispatch({ type: 'clearDone' }), 3600);
    }
    return () => {
      if (celRef.current) clearTimeout(celRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.justDone, state.mode, state.sessionRecords]);

  // Background ambience is owned here so it can never fight a settings preview.
  const runningRef = useRef(state.running);
  runningRef.current = state.running;

  // Start ambience when a session starts, stop it when it ends/pauses.
  useEffect(() => {
    if (state.running && state.settings.bgSound !== 'off') {
      audioEngine.setAmbience(state.settings.bgSound);
    } else if (!state.running) {
      audioEngine.stopAmbience();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.running]);

  // Live-switch the ambience if the choice changes mid-session. When not
  // running, previews (fired from the settings sheet) are left untouched.
  useEffect(() => {
    if (!runningRef.current) return;
    if (state.settings.bgSound === 'off') audioEngine.stopAmbience();
    else audioEngine.setAmbience(state.settings.bgSound);
  }, [state.settings.bgSound]);

  // Silence everything if the app unmounts.
  useEffect(() => () => audioEngine.stopAmbience(), []);

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
        // First press is a user gesture — unlock audio for ambience + ring.
        audioEngine.resume();
        const target = targetText?.trim().slice(0, SESSION_TARGET_MAX) || undefined;
        dispatch({ type: 'toggle', ifThenPlanId, targetText: target });
      },
      reset: () => dispatch({ type: 'reset' }),
      pick: (m: TimerMode) => dispatch({ type: 'pick', mode: m }),
      pickTiny: (minutes: TinyStartMinutes) =>
        dispatch({ type: 'pick', mode: 'tiny', tinyMinutes: minutes }),
      skip: () => dispatch({ type: 'skip' }),
      toggleTask: (id: number) => dispatch({ type: 'toggleTask', id }),
      addTask: (text: string, goal = 1, goalId?: number) =>
        dispatch({ type: 'addTask', text, goal, goalId }),
      removeTask: (id: number) => dispatch({ type: 'removeTask', id }),
      restoreTask: (task: Task, index: number, wasActive = false) =>
        dispatch({ type: 'restoreTask', task, index, wasActive }),
      setActiveTask: (id: number) => dispatch({ type: 'setActiveTask', id }),
      finishFlow: () => dispatch({ type: 'finishFlow' }),
      extendTiny: () => {
        audioEngine.resume();
        dispatch({ type: 'extendTiny' });
      },
      declineTiny: () => dispatch({ type: 'declineTiny' }),
      addGoal: (title: string, due: string, target: number) =>
        dispatch({ type: 'addGoal', title, due, target }),
      updateGoal: (id: number, patch: Partial<Pick<Goal, 'title' | 'due' | 'target'>>) =>
        dispatch({ type: 'updateGoal', id, patch }),
      removeGoal: (id: number) => dispatch({ type: 'removeGoal', id }),
      restoreGoal: (goal: Goal, index: number, linkedTaskIds: number[] = []) =>
        dispatch({ type: 'restoreGoal', goal, index, linkedTaskIds }),
      logGoal: (id: number, delta: number) => dispatch({ type: 'logGoal', id, delta }),
      clearFocusData: () => {
        // The companion log has its own localStorage key. Keep the public
        // action cohesive: one user confirmation clears that key and one
        // reducer action clears every dependent main-store slice.
        clearEvents();
        dispatch({ type: 'clearFocusData' });
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
      resumeInterrupted: (sessionId: string) =>
        dispatch({ type: 'resumeInterrupted', sessionId }),
      dismissResumeCue: (sessionId: string) =>
        dispatch({ type: 'dismissResumeCue', sessionId }),
      patchSettings: (patch: Partial<Settings>) =>
        dispatch({ type: 'patchSettings', patch, at: Date.now() }),
      reloadPersistedState: () => dispatch({ type: 'replaceState', state: loadState() }),
    }),
    [],
  );

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
    mmss,
    clock,
  };
}
