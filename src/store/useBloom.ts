import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { friendByName } from '../data/friends';
import type { AnimalKind } from '../engine/pixelpals';
import { audioEngine, notify, type BgSound } from '../engine/audio';
import { DEFAULT_COMPANION, type CompanionSettings } from './companion';
import { GOAL_TARGET_MAX, type Goal } from './goals';

/** 'flow' is the opt-in count-up stopwatch; the rest count down. */
export type TimerMode = 'focus' | 'short' | 'long' | 'flow';
/** The countdown modes — the only ones with a configured length. */
export type DurationMode = 'focus' | 'short' | 'long';

export interface Task {
  id: number;
  t: string;
  done: boolean;
  pomos: number;
  goal: number;
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
  /** Goals & deadlines: the opt-in semester/exam planner tab. */
  planner: boolean;
}

interface BloomState {
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
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = {
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
};

const DEFAULT_TASKS: Task[] = [
  { id: 1, t: 'Finish history essay', done: false, pomos: 0, goal: 4 },
  { id: 2, t: 'Water the plants', done: false, pomos: 0, goal: 1 },
  { id: 3, t: 'Sketch in journal', done: false, pomos: 0, goal: 2 },
];

const DEFAULT_STATE: BloomState = {
  mode: 'focus',
  running: false,
  endsAt: null,
  remaining: DEFAULT_SETTINGS.durations.focus,
  sessions: 0,
  streak: 0,
  lastFocusDay: null,
  justDone: false,
  tasks: DEFAULT_TASKS,
  activeTaskId: 1,
  palXp: {},
  goals: [],
  flowStart: null,
  flowAcc: 0,
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

const STORAGE_KEY = 'bloom-state';
/** Older keys we still read from once, newest first. */
const LEGACY_KEYS = ['bloom-state-v2', 'bloom-state-v1'];
const SCHEMA_VERSION = 1;

interface PersistedShape {
  version: number;
  sessions: number;
  streak: number;
  lastFocusDay: string | null;
  tasks: Task[];
  activeTaskId: number | null;
  palXp: Record<string, number>;
  goals: Goal[];
  /** Flow stopwatch survives reloads — a stopwatch keeps counting while away. */
  flow: { startedAt: number | null; acc: number; running: boolean };
  settings: Settings;
}

/**
 * MIGRATIONS[i] upgrades a blob from schema version i to i+1.
 * Append here (never rewrite past entries) when the shape changes.
 */
const MIGRATIONS: Array<(blob: Record<string, unknown>) => Record<string, unknown>> = [
  // Reserved: v0 (pre-versioned / legacy keys) -> v1 is handled by withDefaults,
  // which tolerates both the old top-level `durations` layout and the v2 shape.
];

function dayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function withDefaults(blob: Record<string, unknown>): PersistedShape {
  const b = blob ?? {};
  const bSettings = (b.settings as Partial<Settings> | undefined) ?? {};
  // Legacy v1 stored durations at the top level, not under `settings`.
  const legacyDurations = (b.durations as Partial<Durations> | undefined) ?? {};
  const validBg: BgSound[] = ['off', 'calm', 'coffee', 'white'];
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...bSettings,
    name: typeof bSettings.name === 'string' ? bSettings.name : DEFAULT_SETTINGS.name,
    bgSound: validBg.includes(bSettings.bgSound as BgSound)
      ? (bSettings.bgSound as BgSound)
      : DEFAULT_SETTINGS.bgSound,
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
    tasks: Array.isArray(b.tasks) ? (b.tasks as Task[]) : DEFAULT_TASKS,
    activeTaskId: typeof b.activeTaskId === 'number' ? (b.activeTaskId as number) : null,
    palXp: b.palXp && typeof b.palXp === 'object' ? (b.palXp as Record<string, number>) : {},
    goals,
    flow,
    settings,
  };
}

function migrate(blob: Record<string, unknown>): PersistedShape {
  let cur = blob && typeof blob === 'object' ? { ...blob } : {};
  let v = typeof cur.version === 'number' ? cur.version : 0;
  for (; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) cur = step(cur);
  }
  return withDefaults(cur);
}

function readPersisted(): PersistedShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
    // First run under the new key: adopt data from an older key if present.
    for (const k of LEGACY_KEYS) {
      const legacy = localStorage.getItem(k);
      if (legacy) return migrate(JSON.parse(legacy));
    }
  } catch {
    /* corrupt storage — fall through to defaults */
  }
  return null;
}

/** A flow run restored past this is treated as forgotten, not still going. */
const FLOW_RESTORE_CAP_S = 4 * 3600;

function loadState(): BloomState {
  const p = readPersisted();
  if (!p) return DEFAULT_STATE;
  // A streak is only alive if the last focus session was today or yesterday.
  const alive =
    p.lastFocusDay === dayStr() || p.lastFocusDay === dayStr(new Date(Date.now() - 86400000));
  const base: BloomState = {
    ...DEFAULT_STATE,
    settings: p.settings,
    remaining: p.settings.durations.focus,
    sessions: p.sessions,
    streak: alive ? p.streak : 0,
    lastFocusDay: p.lastFocusDay,
    tasks: p.tasks,
    activeTaskId: p.activeTaskId,
    palXp: p.palXp,
    goals: p.goals,
    flowAcc: p.flow.acc,
  };
  // A flow run that was live when the app closed keeps counting (that's what
  // a stopwatch does) — unless it's been so long it was clearly abandoned, in
  // which case it comes back paused, banked at the cap.
  if (p.settings.flow && p.flow.running && p.flow.startedAt != null) {
    const elapsed = p.flow.acc + (Date.now() - p.flow.startedAt) / 1000;
    if (elapsed < FLOW_RESTORE_CAP_S) {
      return {
        ...base,
        mode: 'flow',
        running: true,
        flowStart: p.flow.startedAt,
        remaining: Math.floor(elapsed),
      };
    }
    return {
      ...base,
      mode: 'flow',
      flowAcc: FLOW_RESTORE_CAP_S,
      remaining: FLOW_RESTORE_CAP_S,
    };
  }
  return base;
}

function persist(s: BloomState) {
  const data: PersistedShape = {
    version: SCHEMA_VERSION,
    sessions: s.sessions,
    streak: s.streak,
    lastFocusDay: s.lastFocusDay,
    tasks: s.tasks,
    activeTaskId: s.activeTaskId,
    palXp: s.palXp,
    goals: s.goals,
    flow: { startedAt: s.flowStart, acc: s.flowAcc, running: s.running && s.mode === 'flow' },
    settings: s.settings,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — run in-memory */
  }
}

function bumpStreak(prevStreak: number, lastFocusDay: string | null): number {
  const today = dayStr();
  if (lastFocusDay === today) return prevStreak; // already counted today
  const yesterday = dayStr(new Date(Date.now() - 86400000));
  if (lastFocusDay === yesterday) return prevStreak + 1;
  return 1; // streak broken (or first ever)
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

type Action =
  | { type: 'tick' }
  | { type: 'toggle' }
  | { type: 'reset' }
  | { type: 'pick'; mode: TimerMode }
  | { type: 'skip' }
  | { type: 'complete' }
  | { type: 'finishFlow' }
  | { type: 'clearDone' }
  | { type: 'toggleTask'; id: number }
  | { type: 'addTask'; text: string; goal: number }
  | { type: 'removeTask'; id: number }
  | { type: 'setActiveTask'; id: number }
  | { type: 'addGoal'; title: string; due: string; target: number }
  | { type: 'removeGoal'; id: number }
  | { type: 'logGoal'; id: number; delta: number }
  | { type: 'patchSettings'; patch: Partial<Settings> };

function reducer(s: BloomState, a: Action): BloomState {
  const dur = s.settings.durations;
  switch (a.type) {
    case 'tick': {
      if (!s.running) return s;
      // Flow counts up: `remaining` holds elapsed seconds, and there is no
      // completion — the session ends when the user says so.
      if (s.mode === 'flow') {
        const elapsed = Math.floor(flowElapsed(s));
        return elapsed === s.remaining ? s : { ...s, remaining: elapsed };
      }
      if (s.endsAt == null) return s;
      // ceil, not round: the session only completes once the full time elapsed.
      const remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
      if (remaining <= 0) return reducer(s, { type: 'complete' });
      if (remaining === s.remaining) return s;
      return { ...s, remaining };
    }
    case 'toggle': {
      if (s.mode === 'flow') {
        if (s.running) {
          const acc = flowElapsed(s);
          return { ...s, running: false, flowStart: null, flowAcc: acc, remaining: Math.floor(acc), justDone: false };
        }
        return { ...s, running: true, flowStart: Date.now(), remaining: Math.floor(s.flowAcc), justDone: false };
      }
      if (s.running) {
        const remaining = s.endsAt
          ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000))
          : s.remaining;
        return { ...s, running: false, endsAt: null, remaining, justDone: false };
      }
      const rem = s.remaining > 0 ? s.remaining : dur[s.mode];
      return { ...s, running: true, endsAt: Date.now() + rem * 1000, remaining: rem, justDone: false };
    }
    case 'reset': {
      if (s.mode === 'flow') {
        return { ...s, running: false, flowStart: null, flowAcc: 0, remaining: 0, justDone: false };
      }
      return { ...s, running: false, endsAt: null, justDone: false, remaining: dur[s.mode] };
    }
    case 'pick': {
      if (a.mode === 'flow') {
        // Never wipe a live stopwatch by re-tapping its tab.
        if (s.mode === 'flow') return s;
        return { ...s, mode: 'flow', running: false, endsAt: null, justDone: false, remaining: Math.floor(s.flowAcc) };
      }
      // Leaving flow banks the elapsed time; the stopwatch waits, paused.
      const base =
        s.mode === 'flow' && s.running
          ? { ...s, running: false, flowStart: null, flowAcc: flowElapsed(s) }
          : s;
      return { ...base, mode: a.mode, running: false, endsAt: null, justDone: false, remaining: dur[a.mode] };
    }
    case 'skip': {
      if (s.mode === 'flow') return s; // flow has finish, not skip
      const next: TimerMode = s.mode === 'focus' ? 'short' : 'focus';
      return reducer(s, { type: 'pick', mode: next });
    }
    case 'finishFlow': {
      if (s.mode !== 'flow') return s;
      const elapsed = flowElapsed(s);
      const focusLen = Math.max(60, dur.focus);
      // Nearest focus-length wins: half a session or more banks the first
      // bloom. Capped so a stopwatch left running can't mint a day of XP.
      const credited = Math.min(FLOW_CREDIT_CAP, Math.round(elapsed / focusLen));
      if (credited < 1) {
        // Too short to bank — zero out quietly, no celebration.
        return { ...s, running: false, flowStart: null, flowAcc: 0, remaining: 0, justDone: false };
      }
      const streak = bumpStreak(s.streak, s.lastFocusDay);
      // Credit pomodoros one by one so they cascade across tasks exactly like
      // finished focus sessions do.
      let tasks = s.tasks;
      let activeTaskId = s.activeTaskId;
      for (let i = 0; i < credited; i++) {
        const cur = resolveActiveTask(tasks, activeTaskId);
        if (!cur) break;
        const nowDone = cur.pomos + 1 >= cur.goal;
        tasks = tasks.map((t) =>
          t.id === cur.id
            ? { ...t, pomos: Math.min(t.pomos + 1, t.goal), done: nowDone }
            : t,
        );
        activeTaskId = nowDone ? (tasks.find((t) => !t.done)?.id ?? null) : cur.id;
      }
      return {
        ...s,
        running: false,
        flowStart: null,
        flowAcc: 0,
        remaining: 0,
        justDone: true,
        sessions: s.sessions + credited,
        streak,
        lastFocusDay: dayStr(),
        tasks,
        activeTaskId,
        palXp: { ...s.palXp, [s.settings.pal]: (s.palXp[s.settings.pal] ?? 0) + credited },
      };
    }
    case 'complete': {
      if (s.mode === 'flow') return s; // flow ends via finishFlow only
      const wasFocus = s.mode === 'focus';
      const sessions = s.sessions + (wasFocus ? 1 : 0);
      const streak = wasFocus ? bumpStreak(s.streak, s.lastFocusDay) : s.streak;
      const lastFocusDay = wasFocus ? dayStr() : s.lastFocusDay;
      // Credit the finished pomodoro to the active task; auto-check it once
      // its goal is reached and move focus to the next open task.
      let tasks = s.tasks;
      let activeTaskId = s.activeTaskId;
      if (wasFocus) {
        const cur = resolveActiveTask(s.tasks, s.activeTaskId);
        if (cur) {
          tasks = s.tasks.map((t) =>
            t.id === cur.id
              ? { ...t, pomos: Math.min(t.pomos + 1, t.goal), done: t.pomos + 1 >= t.goal }
              : t,
          );
          const nowDone = cur.pomos + 1 >= cur.goal;
          activeTaskId = nowDone ? (tasks.find((t) => !t.done)?.id ?? null) : cur.id;
        }
      }
      // Credit XP toward the on-duty friend's level.
      const palXp = wasFocus
        ? { ...s.palXp, [s.settings.pal]: (s.palXp[s.settings.pal] ?? 0) + 1 }
        : s.palXp;
      return {
        ...s,
        running: false,
        endsAt: null,
        remaining: 0,
        justDone: true,
        sessions,
        streak,
        lastFocusDay,
        tasks,
        activeTaskId,
        palXp,
      };
    }
    case 'clearDone': {
      // A finished flow session just settles back to an idle stopwatch —
      // whether to break (and for how long) stays the user's call.
      if (s.mode === 'flow') {
        return { ...s, justDone: false, running: false, endsAt: null, remaining: 0 };
      }
      // After the celebrate animation: advance to the next mode, and keep the
      // flow going automatically if auto-start is on.
      const wasFocus = s.mode === 'focus';
      const next: TimerMode = wasFocus ? (s.sessions % 4 === 0 ? 'long' : 'short') : 'focus';
      const rem = dur[next];
      const run = s.settings.autoStart;
      return {
        ...s,
        justDone: false,
        mode: next,
        remaining: rem,
        running: run,
        endsAt: run ? Date.now() + rem * 1000 : null,
      };
    }
    case 'toggleTask': {
      const tasks = s.tasks.map((t) => (t.id === a.id ? { ...t, done: !t.done } : t));
      // If the active task was just checked off, hand focus to the next open one.
      const activeTaskId = resolveActiveTask(tasks, s.activeTaskId)?.id ?? null;
      return { ...s, tasks, activeTaskId };
    }
    case 'addTask': {
      const text = a.text.trim();
      if (!text) return s;
      const id = s.tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      const goal = Math.max(1, Math.min(6, a.goal));
      const tasks = [...s.tasks, { id, t: text, done: false, pomos: 0, goal }];
      return { ...s, tasks, activeTaskId: s.activeTaskId ?? id };
    }
    case 'removeTask': {
      const tasks = s.tasks.filter((t) => t.id !== a.id);
      const activeTaskId =
        s.activeTaskId === a.id ? (tasks.find((t) => !t.done)?.id ?? null) : s.activeTaskId;
      return { ...s, tasks, activeTaskId };
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
    case 'removeGoal':
      return { ...s, goals: s.goals.filter((g) => g.id !== a.id) };
    case 'logGoal': {
      const goals = s.goals.map((g) =>
        g.id === a.id ? { ...g, done: Math.max(0, Math.min(g.target, g.done + a.delta)) } : g,
      );
      return { ...s, goals };
    }
    case 'patchSettings': {
      const settings: Settings = {
        ...s.settings,
        ...a.patch,
        durations: { ...s.settings.durations, ...(a.patch.durations || {}) },
        companion: { ...s.settings.companion, ...(a.patch.companion || {}) },
      };
      // Switching the flow timer off while standing in it: land back on a
      // fresh focus timer instead of a tab that no longer exists.
      if (a.patch.flow === false && s.mode === 'flow') {
        return {
          ...s,
          settings,
          mode: 'focus',
          running: false,
          endsAt: null,
          justDone: false,
          remaining: settings.durations.focus,
          flowStart: null,
          flowAcc: 0,
        };
      }
      // Duration edits apply immediately to a stopped timer; a running one
      // keeps its end time and picks up the new length next session.
      const remaining =
        s.mode !== 'flow' && !s.running && !s.justDone ? settings.durations[s.mode] : s.remaining;
      return { ...s, settings, remaining };
    }
    default:
      return s;
  }
}

export function useBloom() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  // Persist durable fields whenever they change. Flow start/pause lands here
  // too (running/mode/flowStart), so a live stopwatch survives a reload; the
  // per-second tick only touches `remaining`, which is not persisted.
  useEffect(() => {
    persist(state);
  }, [state.sessions, state.streak, state.lastFocusDay, state.tasks, state.activeTaskId, state.palXp, state.goals, state.flowStart, state.flowAcc, state.running, state.mode, state.settings]);

  // Wall-clock tick: recompute remaining ~4x/sec. Reads Date.now(), so it
  // stays accurate even when the tab is throttled in the background.
  useEffect(() => {
    if (!state.running) return;
    const iv = setInterval(() => dispatch({ type: 'tick' }), 250);
    return () => clearInterval(iv);
  }, [state.running]);

  // Background tabs throttle intervals: catch up the moment the tab is
  // visible again so a session that ended while hidden completes immediately.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') dispatch({ type: 'tick' });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // When a session completes: chime, hold the celebrate state, then advance.
  const celRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  useEffect(() => {
    if (!state.justDone) return;
    if (soundRef.current) {
      audioEngine.playRing();
      if (state.mode === 'flow') {
        notify('🌸 Flow banked!', 'Lovely stretch of focus — treat yourself to a real break.');
      } else {
        notify('🌸 Session done!', 'Nice work — time for a little break.');
      }
    }
    celRef.current = setTimeout(() => dispatch({ type: 'clearDone' }), 3600);
    return () => {
      if (celRef.current) clearTimeout(celRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.justDone]);

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
    return state.mode === 'focus' || state.mode === 'flow' ? 'work' : 'sleep';
  }, [state.justDone, state.running, state.mode]);

  const statusLabel = state.justDone
    ? 'yay — session done!'
    : state.running
      ? state.mode === 'flow'
        ? 'in the flow…'
        : state.mode === 'focus'
          ? 'focusing…'
          : 'resting…'
      : 'ready when you are';

  const palSprite: AnimalKind = friendByName(state.settings.pal).sprite;
  const activeTask = resolveActiveTask(state.tasks, state.activeTaskId);

  const actions = useMemo(
    () => ({
      toggle: () => {
        // First press is a user gesture — unlock audio for ambience + ring.
        audioEngine.resume();
        dispatch({ type: 'toggle' });
      },
      reset: () => dispatch({ type: 'reset' }),
      pick: (m: TimerMode) => dispatch({ type: 'pick', mode: m }),
      skip: () => dispatch({ type: 'skip' }),
      toggleTask: (id: number) => dispatch({ type: 'toggleTask', id }),
      addTask: (text: string, goal = 1) => dispatch({ type: 'addTask', text, goal }),
      removeTask: (id: number) => dispatch({ type: 'removeTask', id }),
      setActiveTask: (id: number) => dispatch({ type: 'setActiveTask', id }),
      finishFlow: () => dispatch({ type: 'finishFlow' }),
      addGoal: (title: string, due: string, target: number) =>
        dispatch({ type: 'addGoal', title, due, target }),
      removeGoal: (id: number) => dispatch({ type: 'removeGoal', id }),
      logGoal: (id: number, delta: number) => dispatch({ type: 'logGoal', id, delta }),
      patchSettings: (patch: Partial<Settings>) => dispatch({ type: 'patchSettings', patch }),
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
      const what = state.mode === 'flow' ? 'flow' : state.mode === 'focus' ? 'focus' : 'break';
      const time = state.mode === 'flow' ? clock(state.remaining) : mmss(state.remaining);
      document.title = `${time} ${what} — Bloom`;
    } else {
      document.title = 'Bloom · a cozy pomodoro';
    }
  }, [state.remaining, state.running, state.mode, state.justDone, mmss, clock]);

  return { state, mood, statusLabel, palSprite, activeTask, actions, mmss, clock };
}
