import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { friendByName } from '../data/friends';
import type { AnimalKind } from '../engine/pixelpals';
import { audioEngine, notify, type BgSound } from '../engine/audio';

export type TimerMode = 'focus' | 'short' | 'long';

export interface Task {
  id: number;
  t: string;
  done: boolean;
  pomos: number;
  goal: number;
}

/** All values in seconds. */
export interface Durations {
  focus: number;
  short: number;
  long: number;
}

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
  };
  return {
    version: SCHEMA_VERSION,
    sessions: typeof b.sessions === 'number' && Number.isFinite(b.sessions) ? (b.sessions as number) : 0,
    streak: typeof b.streak === 'number' && Number.isFinite(b.streak) ? (b.streak as number) : 0,
    lastFocusDay: typeof b.lastFocusDay === 'string' ? (b.lastFocusDay as string) : null,
    tasks: Array.isArray(b.tasks) ? (b.tasks as Task[]) : DEFAULT_TASKS,
    activeTaskId: typeof b.activeTaskId === 'number' ? (b.activeTaskId as number) : null,
    palXp: b.palXp && typeof b.palXp === 'object' ? (b.palXp as Record<string, number>) : {},
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

function loadState(): BloomState {
  const p = readPersisted();
  if (!p) return DEFAULT_STATE;
  // A streak is only alive if the last focus session was today or yesterday.
  const alive =
    p.lastFocusDay === dayStr() || p.lastFocusDay === dayStr(new Date(Date.now() - 86400000));
  return {
    ...DEFAULT_STATE,
    settings: p.settings,
    remaining: p.settings.durations.focus,
    sessions: p.sessions,
    streak: alive ? p.streak : 0,
    lastFocusDay: p.lastFocusDay,
    tasks: p.tasks,
    activeTaskId: p.activeTaskId,
    palXp: p.palXp,
  };
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

type Action =
  | { type: 'tick' }
  | { type: 'toggle' }
  | { type: 'reset' }
  | { type: 'pick'; mode: TimerMode }
  | { type: 'skip' }
  | { type: 'complete' }
  | { type: 'clearDone' }
  | { type: 'toggleTask'; id: number }
  | { type: 'addTask'; text: string; goal: number }
  | { type: 'removeTask'; id: number }
  | { type: 'setActiveTask'; id: number }
  | { type: 'patchSettings'; patch: Partial<Settings> };

function reducer(s: BloomState, a: Action): BloomState {
  const dur = s.settings.durations;
  switch (a.type) {
    case 'tick': {
      if (!s.running || s.endsAt == null) return s;
      // ceil, not round: the session only completes once the full time elapsed.
      const remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
      if (remaining <= 0) return reducer(s, { type: 'complete' });
      if (remaining === s.remaining) return s;
      return { ...s, remaining };
    }
    case 'toggle': {
      if (s.running) {
        const remaining = s.endsAt
          ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000))
          : s.remaining;
        return { ...s, running: false, endsAt: null, remaining, justDone: false };
      }
      const rem = s.remaining > 0 ? s.remaining : dur[s.mode];
      return { ...s, running: true, endsAt: Date.now() + rem * 1000, remaining: rem, justDone: false };
    }
    case 'reset':
      return { ...s, running: false, endsAt: null, justDone: false, remaining: dur[s.mode] };
    case 'pick':
      return { ...s, mode: a.mode, running: false, endsAt: null, justDone: false, remaining: dur[a.mode] };
    case 'skip': {
      const next: TimerMode = s.mode === 'focus' ? 'short' : 'focus';
      return reducer(s, { type: 'pick', mode: next });
    }
    case 'complete': {
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
    case 'patchSettings': {
      const settings: Settings = {
        ...s.settings,
        ...a.patch,
        durations: { ...s.settings.durations, ...(a.patch.durations || {}) },
      };
      // Duration edits apply immediately to a stopped timer; a running one
      // keeps its end time and picks up the new length next session.
      const remaining = !s.running && !s.justDone ? settings.durations[s.mode] : s.remaining;
      return { ...s, settings, remaining };
    }
    default:
      return s;
  }
}

export function useBloom() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  // Persist durable fields whenever they change.
  useEffect(() => {
    persist(state);
  }, [state.sessions, state.streak, state.lastFocusDay, state.tasks, state.activeTaskId, state.palXp, state.settings]);

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
      notify('🌸 Session done!', 'Nice work — time for a little break.');
    }
    celRef.current = setTimeout(() => dispatch({ type: 'clearDone' }), 3600);
    return () => {
      if (celRef.current) clearTimeout(celRef.current);
    };
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
    return state.mode === 'focus' ? 'work' : 'sleep';
  }, [state.justDone, state.running, state.mode]);

  const statusLabel = state.justDone
    ? 'yay — session done!'
    : state.running
      ? state.mode === 'focus'
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
      patchSettings: (patch: Partial<Settings>) => dispatch({ type: 'patchSettings', patch }),
    }),
    [],
  );

  const mmss = useCallback((sec: number) => {
    const m = Math.floor(sec / 60);
    const x = sec % 60;
    return `${m}:${String(x).padStart(2, '0')}`;
  }, []);

  // Keep the tab title useful while the timer runs.
  useEffect(() => {
    if (state.justDone) {
      document.title = '🌸 session done! — Bloom';
    } else if (state.running) {
      const what = state.mode === 'focus' ? 'focus' : 'break';
      document.title = `${mmss(state.remaining)} ${what} — Bloom`;
    } else {
      document.title = 'Bloom · a cozy pomodoro';
    }
  }, [state.remaining, state.running, state.mode, state.justDone, mmss]);

  return { state, mood, statusLabel, palSprite, activeTask, actions, mmss };
}
