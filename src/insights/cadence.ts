/**
 * Personal cadence experiments (PLAN 4.1).
 *
 * Breaks are useful, but docs/science.md#staying explicitly rejects one
 * universal work/break ratio. This pure engine therefore treats 25/5 as a
 * friendly default and suggests a one-week experiment only from the user's
 * own linked drift timing or repeated long-session completion history.
 */

import type { CompanionEvent } from '../store/companion';
import { isDriftEvent } from '../store/companion';
import {
  completionRateByPlannedLength,
  driftPhaseDistribution,
  medianMinutesToFirstDrift,
} from '../store/sessionStats';
import type { SessionRecord } from '../store/sessions';
import type { Chronotype } from '../store/companion';

export interface CadencePreset {
  id: string;
  focusMin: number;
  breakMin: number;
  label: string;
}

export const CADENCE_PRESETS: readonly CadencePreset[] = [
  { id: '20-5', focusMin: 20, breakMin: 5, label: '20 / 5' },
  { id: '25-5', focusMin: 25, breakMin: 5, label: '25 / 5' },
  { id: '40-8', focusMin: 40, breakMin: 8, label: '40 / 8' },
  { id: '50-10', focusMin: 50, breakMin: 10, label: '50 / 10' },
] as const;

export const DEFAULT_CADENCE = CADENCE_PRESETS[1];
export const CADENCE_WINDOW_DAYS = 28;
export const CADENCE_MIN_DRIFTED_SESSIONS = 3;
export const CADENCE_MIN_LONG_SESSIONS = 3;
export const CADENCE_LONG_COMPLETION_RATE = 0.75;

export interface CadenceSuggestion {
  preset: CadencePreset;
  kind: 'first-drift' | 'long-session' | 'learning';
  text: string;
  because: string;
  evidenceKey: 'breaks-are-fuel';
}

/** A persisted work/break pair. Labels and ids stay derived, not stored. */
export interface CadencePair {
  focusMin: number;
  breakMin: number;
}

export type PersonalCadenceKind =
  | 'learning'
  | 'drift-fit'
  | 'steady-fit'
  | 'stretch'
  | 'shrink';

export interface PersonalCadenceRecommendation {
  preset: CadencePreset;
  kind: PersonalCadenceKind;
  text: string;
  because: string;
  evidenceKey: 'breaks-are-fuel';
  /** The neighbouring choices are always visible and never auto-applied. */
  rungs: {
    shorter: CadencePreset;
    current: CadencePreset;
    longer: CadencePreset;
  };
}

/** Persisted weekly cache + reversible applied-rung history (PLAN 4.6). */
export interface PersonalCadenceMemory {
  computedAt: number | null;
  recommendation: PersonalCadenceRecommendation | null;
  history: CadencePair[];
}

export const EMPTY_PERSONAL_CADENCE: PersonalCadenceMemory = {
  computedAt: null,
  recommendation: null,
  history: [],
};

export const PERSONAL_CADENCE_RECOMPUTE_MS = 7 * 86400000;
export const PERSONAL_CADENCE_WINDOW_DAYS = 28;
export const PERSONAL_CADENCE_ROLLING_SESSIONS = 10;
export const PERSONAL_CADENCE_MIN_SESSIONS = 5;
export const PERSONAL_CADENCE_STRETCH_RATE = 0.8;
export const PERSONAL_CADENCE_SHRINK_RATE = 0.4;
export const PERSONAL_CADENCE_HISTORY_CAP = 8;
export const CADENCE_FOCUS_MIN = 5;
export const CADENCE_FOCUS_MAX = 90;
export const CADENCE_BREAK_MIN = 1;
export const CADENCE_BREAK_MAX = 15;

function clampFocus(minutes: number): number {
  return Math.max(
    CADENCE_FOCUS_MIN,
    Math.min(CADENCE_FOCUS_MAX, Math.round(minutes / 5) * 5),
  );
}

/** Roughly one break minute per five focus minutes, with a soft 4-min floor. */
export function breakForFocus(focusMin: number): number {
  return Math.max(4, Math.min(CADENCE_BREAK_MAX, Math.round(focusMin / 5)));
}

export function cadencePreset(focusMin: number, breakMin = breakForFocus(focusMin)): CadencePreset {
  const focus = clampFocus(focusMin);
  const rest = Math.max(CADENCE_BREAK_MIN, Math.min(CADENCE_BREAK_MAX, Math.round(breakMin)));
  return {
    id: `${focus}-${rest}`,
    focusMin: focus,
    breakMin: rest,
    label: `${focus} / ${rest}`,
  };
}

function samePair(a: CadencePair, b: CadencePair): boolean {
  return a.focusMin === b.focusMin && a.breakMin === b.breakMin;
}

function validPair(raw: unknown): CadencePair | null {
  if (!raw || typeof raw !== 'object') return null;
  const pair = raw as Partial<CadencePair>;
  if (
    typeof pair.focusMin !== 'number' ||
    !Number.isFinite(pair.focusMin) ||
    typeof pair.breakMin !== 'number' ||
    !Number.isFinite(pair.breakMin)
  ) return null;
  return {
    focusMin: Math.max(CADENCE_FOCUS_MIN, Math.min(CADENCE_FOCUS_MAX, Math.round(pair.focusMin))),
    breakMin: Math.max(CADENCE_BREAK_MIN, Math.min(CADENCE_BREAK_MAX, Math.round(pair.breakMin))),
  };
}

function validRecommendation(raw: unknown): PersonalCadenceRecommendation | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<PersonalCadenceRecommendation>;
  const pair = validPair(value.preset);
  const current = validPair(value.rungs?.current);
  const shorter = validPair(value.rungs?.shorter);
  const longer = validPair(value.rungs?.longer);
  const kinds: PersonalCadenceKind[] = ['learning', 'drift-fit', 'steady-fit', 'stretch', 'shrink'];
  if (
    !pair || !current || !shorter || !longer ||
    !kinds.includes(value.kind as PersonalCadenceKind) ||
    typeof value.text !== 'string' ||
    typeof value.because !== 'string'
  ) return null;
  return {
    preset: cadencePreset(pair.focusMin, pair.breakMin),
    kind: value.kind as PersonalCadenceKind,
    text: value.text,
    because: value.because,
    evidenceKey: 'breaks-are-fuel',
    rungs: {
      current: cadencePreset(current.focusMin, current.breakMin),
      shorter: cadencePreset(shorter.focusMin, shorter.breakMin),
      longer: cadencePreset(longer.focusMin, longer.breakMin),
    },
  };
}

export function sanitizePersonalCadenceMemory(raw: unknown): PersonalCadenceMemory {
  if (!raw || typeof raw !== 'object') return EMPTY_PERSONAL_CADENCE;
  const value = raw as Partial<PersonalCadenceMemory>;
  const history = Array.isArray(value.history)
    ? value.history.map(validPair).filter((pair): pair is CadencePair => pair != null)
    : [];
  return {
    computedAt:
      typeof value.computedAt === 'number' && Number.isFinite(value.computedAt)
        ? value.computedAt
        : null,
    recommendation: validRecommendation(value.recommendation),
    history: history.slice(-PERSONAL_CADENCE_HISTORY_CAP),
  };
}

export function rememberPreviousCadence(
  history: CadencePair[],
  current: CadencePair,
  next: CadencePair,
): CadencePair[] {
  if (samePair(current, next)) return history;
  return [
    ...history.filter((pair) => !samePair(pair, current) && !samePair(pair, next)),
    current,
  ].slice(-PERSONAL_CADENCE_HISTORY_CAP);
}

export function shouldRecomputePersonalCadence(
  memory: PersonalCadenceMemory,
  now: number = Date.now(),
): boolean {
  return (
    memory.recommendation == null ||
    memory.computedAt == null ||
    now - memory.computedAt >= PERSONAL_CADENCE_RECOMPUTE_MS
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function presetForDriftMinute(minute: number): CadencePreset {
  if (minute <= 22) return CADENCE_PRESETS[0];
  if (minute <= 32) return CADENCE_PRESETS[1];
  if (minute <= 45) return CADENCE_PRESETS[2];
  return CADENCE_PRESETS[3];
}

function hasLinkedDrift(record: SessionRecord, events: CompanionEvent[]): boolean {
  const linkedIds = new Set(record.driftEventIds);
  return events.some(
    (event) =>
      isDriftEvent(event) &&
      (event.sessionId === record.id || (event.id != null && linkedIds.has(event.id))),
  );
}

/**
 * Suggest one cadence experiment. The user's own first-drift timing wins;
 * otherwise repeated success with long blocks can support a longer option.
 * With thin signal, 25/5 remains the explicitly non-prescriptive baseline.
 */
export function computeCadenceSuggestion(
  records: SessionRecord[],
  events: CompanionEvent[],
  now: number = Date.now(),
  windowDays: number = CADENCE_WINDOW_DAYS,
): CadenceSuggestion {
  const cutoff = now - windowDays * 86400000;
  const focusRecords = records.filter(
    (record) =>
      record.mode === 'focus' && record.endedAt >= cutoff && record.endedAt <= now,
  );
  const driftedSessions = focusRecords.filter((record) => hasLinkedDrift(record, events));
  const median = medianMinutesToFirstDrift(focusRecords, events);

  if (driftedSessions.length >= CADENCE_MIN_DRIFTED_SESSIONS && median != null) {
    const preset = presetForDriftMinute(median);
    return {
      preset,
      kind: 'first-drift',
      text: `Want to try a ${preset.focusMin}/${preset.breakMin} week? Compare distraction tags and finish rates, not vibes alone.`,
      because: `Across ${plural(driftedSessions.length, 'session')}, your first drift landed around minute ${Math.round(median)}.`,
      evidenceKey: 'breaks-are-fuel',
    };
  }

  const long = completionRateByPlannedLength(focusRecords)
    .filter(
      (bucket) =>
        bucket.plannedMin >= 40 &&
        bucket.total >= CADENCE_MIN_LONG_SESSIONS &&
        bucket.rate >= CADENCE_LONG_COMPLETION_RATE,
    )
    .sort((a, b) => b.plannedMin - a.plannedMin)[0];

  if (long) {
    const preset = long.plannedMin >= 50 ? CADENCE_PRESETS[3] : CADENCE_PRESETS[2];
    return {
      preset,
      kind: 'long-session',
      text: `Your longer blocks look steady — want to compare a ${preset.focusMin}/${preset.breakMin} week?`,
      because: `${long.completed} of your ${plural(long.total, `${long.plannedMin}-minute session`)} finished in the last ${windowDays} days.`,
      evidenceKey: 'breaks-are-fuel',
    };
  }

  return {
    preset: DEFAULT_CADENCE,
    kind: 'learning',
    text: 'I’m still learning your rhythm — 25/5 can stay our friendly baseline for now.',
    because: `${plural(focusRecords.length, 'focus session')} logged recently; a few linked first drifts or steady long blocks will make this experiment more personal.`,
    evidenceKey: 'breaks-are-fuel',
  };
}

function linkedDriftSessionCount(records: SessionRecord[], events: CompanionEvent[]): number {
  return records.filter((record) => hasLinkedDrift(record, events)).length;
}

function chronotypeFitNote(chronotype: Chronotype, records: SessionRecord[]): {
  adjustment: number;
  text: string;
} {
  if (chronotype === 'notSure') {
    return { adjustment: 0, text: 'Your sharpest-time tag is “not sure”, so your sessions lead this fit.' };
  }
  const inPreferredWindow = records.filter((record) =>
    chronotype === 'betterEarlier'
      ? record.startHour >= 5 && record.startHour < 13
      : record.startHour >= 15 || record.startHour < 1,
  ).length;
  const outside = records.length - inPreferredWindow;
  const label = chronotype === 'betterEarlier' ? 'better earlier' : 'better later';
  if (records.length >= PERSONAL_CADENCE_MIN_SESSIONS && outside / records.length >= 0.6) {
    return {
      adjustment: -5,
      text: `You tagged “${label}”, and ${outside} of ${records.length} recent sessions began outside that window, so this starts one rung gentler.`,
    };
  }
  return {
    adjustment: 0,
    text: `You tagged “${label}”; your recent session timing does not call for a gentler rung.`,
  };
}

function phaseSummary(distribution: ReturnType<typeof driftPhaseDistribution>): string {
  const entries = (Object.entries(distribution) as [keyof typeof distribution, number][])
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 'No linked drift phase is steering the fit yet.';
  const [phase, count] = entries[0];
  const label = { early: 'early', mid: 'mid-session', late: 'late' }[phase];
  return `${count} of ${total} linked drifts clustered ${label}.`;
}

function currentRollingWindow(records: SessionRecord[], currentFocusMin: number): SessionRecord[] {
  return records
    .filter((record) => record.plannedMin === currentFocusMin)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, PERSONAL_CADENCE_ROLLING_SESSIONS);
}

function completedCount(records: SessionRecord[]): number {
  return records.filter((record) => record.outcome === 'completed').length;
}

function makeRungs(current: CadencePair): PersonalCadenceRecommendation['rungs'] {
  return {
    shorter: cadencePreset(current.focusMin - 5),
    current: cadencePreset(current.focusMin, current.breakMin),
    longer: cadencePreset(current.focusMin + 5),
  };
}

/**
 * Learn one transparent starting cadence from the person's recent local data.
 *
 * The rolling current-length completion rate controls stretch/shrink offers.
 * Otherwise first-drift timing sets the upper edge, completion by length
 * supplies a demonstrated rung, drift phase shapes the direction, and the
 * chronotype self-tag acts only as a gentle prior. Nothing auto-applies.
 */
export function suggestPersonalCadence(
  records: SessionRecord[],
  events: CompanionEvent[],
  chronotype: Chronotype,
  current: CadencePair,
  now: number = Date.now(),
  windowDays: number = PERSONAL_CADENCE_WINDOW_DAYS,
): PersonalCadenceRecommendation {
  const cutoff = now - windowDays * 86400000;
  const focusRecords = records.filter(
    (record) =>
      record.mode === 'focus' &&
      record.endedAt >= cutoff &&
      record.endedAt <= now &&
      record.plannedMin != null,
  );
  const rungs = makeRungs(current);
  const rolling = currentRollingWindow(focusRecords, current.focusMin);
  const rollingCompleted = completedCount(rolling);
  const rollingRate = rolling.length ? rollingCompleted / rolling.length : 0;
  const distribution = driftPhaseDistribution(focusRecords, events);
  const phaseText = phaseSummary(distribution);
  const chrono = chronotypeFitNote(chronotype, focusRecords);

  if (focusRecords.length < PERSONAL_CADENCE_MIN_SESSIONS) {
    return {
      preset: DEFAULT_CADENCE,
      kind: 'learning',
      // PLACEHOLDER_COPY — final wording lands in the designated copy pass.
      text: '25/5 is a lovely starting point while I learn your rhythm.',
      because: `${plural(focusRecords.length, 'focus session')} logged in the last ${windowDays} days; five gives this little experiment enough footing.`,
      evidenceKey: 'breaks-are-fuel',
      rungs,
    };
  }

  // A rough patch gets first say. It is a quiet fit adjustment, never a loss.
  if (
    rolling.length >= PERSONAL_CADENCE_MIN_SESSIONS &&
    rollingRate <= PERSONAL_CADENCE_SHRINK_RATE
  ) {
    if (current.focusMin <= CADENCE_FOCUS_MIN) {
      const preset = cadencePreset(current.focusMin, current.breakMin);
      return {
        preset,
        kind: 'steady-fit',
        text: `${preset.focusMin}/${preset.breakMin} is already the gentlest timer rung — staying here is a valid experiment too.`,
        because: `${rollingCompleted} of your last ${rolling.length} ${current.focusMin}-minute sessions finished. ${phaseText} ${chrono.text}`,
        evidenceKey: 'breaks-are-fuel',
        rungs,
      };
    }
    const preset = cadencePreset(current.focusMin - 5);
    return {
      preset,
      kind: 'shrink',
      text: `A ${preset.focusMin}/${preset.breakMin} rung may fit more softly for you right now — it’s an experiment, and you can hop back anytime.`,
      because: `${rollingCompleted} of your last ${rolling.length} ${current.focusMin}-minute sessions finished. ${phaseText} ${chrono.text}`,
      evidenceKey: 'breaks-are-fuel',
      rungs,
    };
  }

  // Stretch only from repeated current-rung completions. The next rung is
  // offered, never silently applied, and remains reversible from history.
  if (
    rolling.length >= PERSONAL_CADENCE_MIN_SESSIONS &&
    rollingRate >= PERSONAL_CADENCE_STRETCH_RATE
  ) {
    if (current.focusMin >= CADENCE_FOCUS_MAX) {
      const preset = cadencePreset(current.focusMin, current.breakMin);
      return {
        preset,
        kind: 'steady-fit',
        text: `${preset.focusMin}/${preset.breakMin} is already the longest timer rung — there’s nothing you need to stretch.`,
        because: `${rollingCompleted} of your last ${rolling.length} ${current.focusMin}-minute sessions finished (${Math.round(rollingRate * 100)}%). ${phaseText} ${chrono.text}`,
        evidenceKey: 'breaks-are-fuel',
        rungs,
      };
    }
    const preset = cadencePreset(current.focusMin + 5);
    return {
      preset,
      kind: 'stretch',
      text: `Your current rung looks steady — want to try ${preset.focusMin}/${preset.breakMin} as a small experiment?`,
      because: `${rollingCompleted} of your last ${rolling.length} ${current.focusMin}-minute sessions finished (${Math.round(rollingRate * 100)}%). ${phaseText} ${chrono.text}`,
      evidenceKey: 'breaks-are-fuel',
      rungs,
    };
  }

  const driftedSessions = linkedDriftSessionCount(focusRecords, events);
  const median = medianMinutesToFirstDrift(focusRecords, events);
  const rates = completionRateByPlannedLength(focusRecords);
  const supported = rates
    .filter((bucket) => bucket.total >= 3 && bucket.rate >= 0.75)
    .sort((a, b) => b.plannedMin - a.plannedMin)[0];

  if (driftedSessions >= 3 && median != null) {
    const totalDrifts = distribution.early + distribution.mid + distribution.late;
    let focus = Math.max(10, Math.floor(median / 5) * 5);
    if (totalDrifts > 0 && distribution.early > totalDrifts / 2) focus -= 5;
    if (supported) focus = Math.min(focus, supported.plannedMin);
    focus += chrono.adjustment;
    const preset = cadencePreset(focus);
    const completionText = supported
      ? `${supported.completed} of ${supported.total} ${supported.plannedMin}-minute sessions finished.`
      : 'No longer rung has enough steady finishes yet.';
    return {
      preset,
      kind: 'drift-fit',
      text: `${preset.focusMin}/${preset.breakMin} looks worth trying right now — a small experiment, not a forever rule.`,
      because: `Across ${driftedSessions} sessions, your first drift was around minute ${Math.round(median)}. ${completionText} ${phaseText} ${chrono.text}`,
      evidenceKey: 'breaks-are-fuel',
      rungs,
    };
  }

  if (supported) {
    const preset = cadencePreset(supported.plannedMin + chrono.adjustment);
    return {
      preset,
      kind: 'steady-fit',
      text: `${preset.focusMin}/${preset.breakMin} could be a cozy starting experiment for your next week.`,
      because: `${supported.completed} of your ${supported.total} ${supported.plannedMin}-minute sessions finished (${Math.round(supported.rate * 100)}%). ${phaseText} ${chrono.text}`,
      evidenceKey: 'breaks-are-fuel',
      rungs,
    };
  }

  return {
    preset: DEFAULT_CADENCE,
    kind: 'learning',
    // PLACEHOLDER_COPY — final wording lands in the designated copy pass.
    text: '25/5 is a lovely starting point while I learn your rhythm.',
    because: `${plural(focusRecords.length, 'focus session')} logged recently, but no length or drift-timing pattern has repeated enough yet.`,
    evidenceKey: 'breaks-are-fuel',
    rungs,
  };
}

/** Use the cached weekly answer unless a full week has elapsed. */
export function personalCadenceForSurface(
  memory: PersonalCadenceMemory,
  records: SessionRecord[],
  events: CompanionEvent[],
  chronotype: Chronotype,
  current: CadencePair,
  now: number = Date.now(),
): PersonalCadenceRecommendation {
  if (!shouldRecomputePersonalCadence(memory, now) && memory.recommendation) {
    return memory.recommendation;
  }
  return suggestPersonalCadence(records, events, chronotype, current, now);
}
