/**
 * Daily foundations data model (PLAN 10.7).
 *
 * This module is deliberately React- and storage-free. Manual foundations are
 * binary: one natural-key entry means "done"; absence is unknown, never a
 * scored miss. The integrated focused-work row is derived elsewhere and can
 * never acquire a stored entry here.
 */

import { dayKeyFor } from './dayKey';
import { sessionCountsTowardDay, type SessionRecord } from './sessions';

export const FOUNDATION_ACTIVE_CAP = 3;
export const FOUNDATION_ENTRY_CAP = 1200;
export const FOUNDATION_CUSTOM_NAME_MAX = 24;

export const MANUAL_FOUNDATION_TYPES = [
  'phone-away',
  'desk-reset',
  'tiny-start',
  'tomorrow-note',
  'custom',
] as const;

export type ManualFoundationType = (typeof MANUAL_FOUNDATION_TYPES)[number];
export type IntegratedFoundationType = 'focused-work';
export type FoundationType = ManualFoundationType | IntegratedFoundationType;

export interface FoundationTemplate {
  type: Exclude<ManualFoundationType, 'custom'>;
  name: string;
  description: string;
  tinyVersion: string;
  evidenceNote: string;
}

export const FOUNDATION_CATALOG: readonly Readonly<FoundationTemplate>[] = Object.freeze([
  Object.freeze({
    type: 'phone-away',
    name: 'Phone away',
    description: 'phone in another room before the first session',
    tinyVersion: 'put the phone just out of reach',
    evidenceNote: 'worth an experiment when visible phones keep pulling attention',
  }),
  Object.freeze({
    type: 'desk-reset',
    name: 'Desk reset',
    description: 'clear the desk before starting',
    tinyVersion: 'clear one hand-sized patch',
    evidenceNote: 'worth an experiment when visual clutter makes starting feel noisy',
  }),
  Object.freeze({
    type: 'tiny-start',
    name: 'Tiny start',
    description: 'one two-minute start on the hardest thing',
    tinyVersion: 'open it and do two minutes',
    evidenceNote: 'worth an experiment when the first step feels heavy',
  }),
  Object.freeze({
    type: 'tomorrow-note',
    name: 'Tomorrow note',
    description: "write tomorrow's first move before stopping",
    tinyVersion: 'leave one next-action sentence',
    evidenceNote: 'worth an experiment when returning takes time',
  }),
]);

export interface FoundationRange {
  from: string;
  to?: string;
}

export interface FoundationInstance {
  id: `fnd-${FoundationType}`;
  type: FoundationType;
  customName?: string;
  enabled: boolean;
  order: number;
  ranges: FoundationRange[];
  ifThenId?: string;
  lastRestartOfferDayKey?: string;
  createdAt: number;
}

export interface FoundationEntry {
  id: string;
  instanceId: FoundationInstance['id'];
  dayKey: string;
  recordedAt: number;
  late?: boolean;
}

export interface FoundationMonthSummary {
  instanceId: FoundationInstance['id'];
  monthKey: string;
  doneDays: number;
}

export interface FoundationsState {
  instances: FoundationInstance[];
  entries: FoundationEntry[];
  archive: FoundationMonthSummary[];
}

export const EMPTY_FOUNDATIONS: FoundationsState = {
  instances: [],
  entries: [],
  archive: [],
};

export interface SanitizeFoundationsOptions {
  /** Existing plan ids. Omitting this clears every unverified dangling link. */
  validIfThenIds?: Iterable<string>;
  /** Store-resolved study day, supplied by callers with controlled clocks. */
  todayKey?: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const ALL_TYPES: readonly FoundationType[] = [...MANUAL_FOUNDATION_TYPES, 'focused-work'];

export function isFoundationDayKey(value: unknown): value is string {
  return typeof value === 'string' && DAY_KEY.test(value);
}

export function isManualFoundationType(type: FoundationType): type is ManualFoundationType {
  return (MANUAL_FOUNDATION_TYPES as readonly string[]).includes(type);
}

export function foundationInstanceId(type: FoundationType): FoundationInstance['id'] {
  return `fnd-${type}`;
}

export function foundationEntryId(instanceId: string, dayKey: string): string {
  return `${instanceId}:${dayKey}`;
}

/** One shared display name for cards, History, and weekly reflection. */
export function foundationName(
  instance: Pick<FoundationInstance, 'type' | 'customName'>,
): string {
  if (instance.type === 'focused-work') return 'Focused work';
  if (instance.type === 'custom') return instance.customName || 'My foundation';
  return FOUNDATION_CATALOG.find((item) => item.type === instance.type)?.name ?? instance.type;
}

function normalizeCustomName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, FOUNDATION_CUSTOM_NAME_MAX);
  return name || undefined;
}

function shiftDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dayKeyFor(date.getTime());
}

function sanitizeRanges(raw: unknown): FoundationRange[] {
  if (!Array.isArray(raw)) return [];
  const ranges = raw
    .flatMap((item): FoundationRange[] => {
      if (!item || typeof item !== 'object') return [];
      const range = item as Partial<FoundationRange>;
      if (!isFoundationDayKey(range.from)) return [];
      if (range.to !== undefined && !isFoundationDayKey(range.to)) return [];
      if (range.to !== undefined && range.to < range.from) return [];
      return [{ from: range.from, ...(range.to === undefined ? {} : { to: range.to }) }];
    })
    .sort((a, b) => a.from.localeCompare(b.from));

  const normalized: FoundationRange[] = [];
  for (const range of ranges) {
    const previous = normalized[normalized.length - 1];
    if (!previous) {
      normalized.push(range);
      continue;
    }
    if (previous.to === undefined) continue;
    if (range.from <= previous.to) {
      previous.to =
        range.to === undefined || range.to > previous.to ? range.to : previous.to;
      continue;
    }
    normalized.push(range);
  }
  return normalized;
}

function closeOpenRange(ranges: FoundationRange[], dayKey: string): FoundationRange[] {
  return ranges.map((range) =>
    range.to === undefined ? { ...range, to: dayKey < range.from ? range.from : dayKey } : range,
  );
}

export function isFoundationActiveOn(
  instance: Pick<FoundationInstance, 'ranges'>,
  dayKey: string,
): boolean {
  if (!isFoundationDayKey(dayKey)) return false;
  return instance.ranges.some(
    (range) => range.from <= dayKey && (range.to === undefined || dayKey <= range.to),
  );
}

export function createFoundationInstance(input: {
  type: FoundationType;
  order: number;
  at?: number;
  dayStartHour?: number;
  enabled?: boolean;
  customName?: string;
}): FoundationInstance | null {
  if (!ALL_TYPES.includes(input.type)) return null;
  const customName =
    input.type === 'custom' ? normalizeCustomName(input.customName) : undefined;
  if (input.type === 'custom' && !customName) return null;
  const createdAt = input.at ?? Date.now();
  if (!Number.isFinite(createdAt)) return null;
  const enabled = input.enabled ?? true;
  const from = dayKeyFor(createdAt, input.dayStartHour);
  return {
    id: foundationInstanceId(input.type),
    type: input.type,
    ...(customName ? { customName } : {}),
    enabled,
    order: Math.max(0, Math.round(input.order) || 0),
    ranges: enabled ? [{ from }] : [],
    createdAt,
  };
}

function sanitizeInstances(
  raw: unknown,
  validIfThenIds: Set<string>,
  todayKey: string,
): FoundationInstance[] {
  if (!Array.isArray(raw)) return [];
  const byType = new Map<FoundationType, FoundationInstance>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Partial<FoundationInstance>;
    if (
      typeof value.type !== 'string' ||
      !ALL_TYPES.includes(value.type as FoundationType)
    ) continue;
    const type = value.type as FoundationType;
    if (value.id !== foundationInstanceId(type)) continue;
    if (
      typeof value.enabled !== 'boolean' ||
      typeof value.order !== 'number' ||
      !Number.isFinite(value.order) ||
      value.order < 0 ||
      typeof value.createdAt !== 'number' ||
      !Number.isFinite(value.createdAt)
    ) continue;

    const customName = type === 'custom' ? normalizeCustomName(value.customName) : undefined;
    if (type === 'custom' && !customName) continue;
    let ranges = sanitizeRanges(value.ranges);
    let enabled = value.enabled;
    const hasOpenRange = ranges.some((range) => range.to === undefined);
    // Never invent a historical active period from malformed storage.
    if (enabled && !hasOpenRange) enabled = false;
    if (!enabled && hasOpenRange) ranges = closeOpenRange(ranges, todayKey);

    const instance: FoundationInstance = {
      id: foundationInstanceId(type),
      type,
      ...(customName ? { customName } : {}),
      enabled,
      order: Math.max(0, Math.round(value.order)),
      ranges,
      ...(typeof value.ifThenId === 'string' && validIfThenIds.has(value.ifThenId)
        ? { ifThenId: value.ifThenId }
        : {}),
      ...(isFoundationDayKey(value.lastRestartOfferDayKey)
        ? { lastRestartOfferDayKey: value.lastRestartOfferDayKey }
        : {}),
      createdAt: value.createdAt,
    };

    const current = byType.get(type);
    if (
      !current ||
      instance.createdAt > current.createdAt ||
      (instance.createdAt === current.createdAt && instance.order < current.order)
    ) {
      byType.set(type, instance);
    }
  }

  const instances = [...byType.values()].sort(
    (a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const enabledManual = instances.filter(
    (instance) => isManualFoundationType(instance.type) && instance.enabled,
  );
  const keepEnabled = new Set(
    enabledManual.slice(0, FOUNDATION_ACTIVE_CAP).map((instance) => instance.id),
  );
  return instances.map((instance) => {
    if (
      !isManualFoundationType(instance.type) ||
      !instance.enabled ||
      keepEnabled.has(instance.id)
    ) return instance;
    return {
      ...instance,
      enabled: false,
      ranges: closeOpenRange(instance.ranges, todayKey),
    };
  });
}

function sanitizeArchive(
  raw: unknown,
  instances: FoundationInstance[],
): FoundationMonthSummary[] {
  if (!Array.isArray(raw)) return [];
  const manualIds = new Set(
    instances
      .filter((instance) => isManualFoundationType(instance.type))
      .map((instance) => instance.id),
  );
  const byKey = new Map<string, FoundationMonthSummary>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Partial<FoundationMonthSummary>;
    if (
      typeof value.instanceId !== 'string' ||
      !manualIds.has(value.instanceId as FoundationInstance['id']) ||
      typeof value.monthKey !== 'string' ||
      !MONTH_KEY.test(value.monthKey) ||
      typeof value.doneDays !== 'number' ||
      !Number.isFinite(value.doneDays) ||
      value.doneDays < 0
    ) continue;
    const summary: FoundationMonthSummary = {
      instanceId: value.instanceId as FoundationInstance['id'],
      monthKey: value.monthKey,
      doneDays: Math.round(value.doneDays),
    };
    const key = `${summary.instanceId}:${summary.monthKey}`;
    const current = byKey.get(key);
    if (!current || summary.doneDays > current.doneDays) byKey.set(key, summary);
  }
  return [...byKey.values()].sort(
    (a, b) => a.monthKey.localeCompare(b.monthKey) || a.instanceId.localeCompare(b.instanceId),
  );
}

function sanitizeEntries(
  raw: unknown,
  instances: FoundationInstance[],
  archivedKeys: Set<string>,
): FoundationEntry[] {
  if (!Array.isArray(raw)) return [];
  const manualById = new Map(
    instances
      .filter((instance) => isManualFoundationType(instance.type))
      .map((instance) => [instance.id, instance] as const),
  );
  const byId = new Map<string, FoundationEntry>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Partial<FoundationEntry>;
    if (
      typeof value.instanceId !== 'string' ||
      !isFoundationDayKey(value.dayKey) ||
      value.id !== foundationEntryId(value.instanceId, value.dayKey) ||
      typeof value.recordedAt !== 'number' ||
      !Number.isFinite(value.recordedAt)
    ) continue;
    const instance = manualById.get(value.instanceId as FoundationInstance['id']);
    if (!instance || !isFoundationActiveOn(instance, value.dayKey)) continue;
    if (archivedKeys.has(`${value.instanceId}:${value.dayKey.slice(0, 7)}`)) continue;
    const entry: FoundationEntry = {
      id: value.id,
      instanceId: value.instanceId as FoundationInstance['id'],
      dayKey: value.dayKey,
      recordedAt: value.recordedAt,
      ...(value.late === true ? { late: true } : {}),
    };
    const current = byId.get(entry.id);
    if (!current || entry.recordedAt > current.recordedAt) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort(
    (a, b) => a.dayKey.localeCompare(b.dayKey) || a.instanceId.localeCompare(b.instanceId),
  );
}

export function compactFoundationEntries(
  state: FoundationsState,
  todayKey: string,
  cap = FOUNDATION_ENTRY_CAP,
): FoundationsState {
  if (state.entries.length <= cap || !isFoundationDayKey(todayKey)) return state;
  let entries = [...state.entries];
  const archive = [...state.archive];
  const currentMonth = todayKey.slice(0, 7);
  const months = [...new Set(entries.map((entry) => entry.dayKey.slice(0, 7)))]
    .filter((month) => month < currentMonth)
    .sort();

  for (const month of months) {
    if (entries.length <= cap) break;
    const compacting = entries.filter((entry) => entry.dayKey.startsWith(`${month}-`));
    if (compacting.length === 0) continue;
    const counts = new Map<FoundationInstance['id'], number>();
    for (const entry of compacting) {
      counts.set(entry.instanceId, (counts.get(entry.instanceId) ?? 0) + 1);
    }
    for (const [instanceId, doneDays] of counts) {
      archive.push({ instanceId, monthKey: month, doneDays });
    }
    entries = entries.filter((entry) => !entry.dayKey.startsWith(`${month}-`));
  }

  return entries.length === state.entries.length
    ? state
    : { ...state, entries, archive };
}

export function sanitizeFoundations(
  raw: unknown,
  options: SanitizeFoundationsOptions = {},
): FoundationsState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_FOUNDATIONS };
  const value = raw as Partial<FoundationsState>;
  const todayKey = isFoundationDayKey(options.todayKey)
    ? options.todayKey
    : dayKeyFor(Date.now());
  const validIfThenIds = new Set(options.validIfThenIds ?? []);
  const instances = sanitizeInstances(value.instances, validIfThenIds, todayKey);
  const archive = sanitizeArchive(value.archive, instances);
  const archivedKeys = new Set(
    archive.map((summary) => `${summary.instanceId}:${summary.monthKey}`),
  );
  const entries = sanitizeEntries(value.entries, instances, archivedKeys);
  return compactFoundationEntries({ instances, entries, archive }, todayKey);
}

export function setFoundationEnabled(
  state: FoundationsState,
  instanceId: string,
  enabled: boolean,
  at = Date.now(),
  dayStartHour = 0,
): FoundationsState {
  const instance = state.instances.find((item) => item.id === instanceId);
  if (!instance || !isManualFoundationType(instance.type) || instance.enabled === enabled) {
    return state;
  }
  if (
    enabled &&
    state.instances.filter(
      (item) => isManualFoundationType(item.type) && item.enabled,
    ).length >= FOUNDATION_ACTIVE_CAP
  ) return state;

  const dayKey = dayKeyFor(at, dayStartHour);
  const instances = state.instances.map((item) => {
    if (item.id !== instanceId) return item;
    if (!enabled) {
      return { ...item, enabled: false, ranges: closeOpenRange(item.ranges, dayKey) };
    }
    const last = item.ranges[item.ranges.length - 1];
    const ranges =
      last?.to === dayKey
        ? [...item.ranges.slice(0, -1), { from: last.from }]
        : [...item.ranges, { from: dayKey }];
    return { ...item, enabled: true, ranges };
  });
  return { ...state, instances };
}

function canEditDay(targetDayKey: string, todayKey: string): boolean {
  return targetDayKey === todayKey || targetDayKey === shiftDayKey(todayKey, -1);
}

export function setFoundationDayDone(
  state: FoundationsState,
  instanceId: string,
  done: boolean,
  targetAt = Date.now(),
  now = Date.now(),
  dayStartHour = 0,
): FoundationsState {
  const instance = state.instances.find((item) => item.id === instanceId);
  if (!instance || !isManualFoundationType(instance.type)) return state;
  const targetDayKey = dayKeyFor(targetAt, dayStartHour);
  const todayKey = dayKeyFor(now, dayStartHour);
  if (!canEditDay(targetDayKey, todayKey) || !isFoundationActiveOn(instance, targetDayKey)) {
    return state;
  }
  const id = foundationEntryId(instance.id, targetDayKey);
  const existing = state.entries.find((entry) => entry.id === id);
  if (done) {
    if (existing) return state;
    const entry: FoundationEntry = {
      id,
      instanceId: instance.id,
      dayKey: targetDayKey,
      recordedAt: now,
      ...(targetDayKey !== todayKey ? { late: true } : {}),
    };
    return compactFoundationEntries(
      { ...state, entries: [...state.entries, entry] },
      todayKey,
    );
  }
  if (!existing) return state;
  return { ...state, entries: state.entries.filter((entry) => entry.id !== id) };
}

export function toggleFoundationDay(
  state: FoundationsState,
  instanceId: string,
  targetAt = Date.now(),
  now = Date.now(),
  dayStartHour = 0,
): FoundationsState {
  const dayKey = dayKeyFor(targetAt, dayStartHour);
  const id = foundationEntryId(instanceId, dayKey);
  return setFoundationDayDone(
    state,
    instanceId,
    !state.entries.some((entry) => entry.id === id),
    targetAt,
    now,
    dayStartHour,
  );
}

export function reorderFoundation(
  state: FoundationsState,
  instanceId: string,
  direction: -1 | 1,
): FoundationsState {
  const ordered = [...state.instances].sort(
    (a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const index = ordered.findIndex((item) => item.id === instanceId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return state;
  const current = ordered[index];
  const other = ordered[target];
  const instances = state.instances.map((item) => {
    if (item.id === current.id) return { ...item, order: other.order };
    if (item.id === other.id) return { ...item, order: current.order };
    return item;
  });
  return { ...state, instances };
}

export function renameCustomFoundation(
  state: FoundationsState,
  name: string,
): FoundationsState {
  const customName = normalizeCustomName(name);
  if (!customName) return state;
  let changed = false;
  const instances = state.instances.map((instance) => {
    if (instance.type !== 'custom' || instance.customName === customName) return instance;
    changed = true;
    return { ...instance, customName };
  });
  return changed ? { ...state, instances } : state;
}

export function derivedFoundationDone(
  records: SessionRecord[],
  dayKey: string,
  dayStartHour = 0,
): boolean {
  return records.some(
    (record) =>
      sessionCountsTowardDay(record) &&
      dayKeyFor(record.endedAt, dayStartHour) === dayKey,
  );
}

export interface FoundationDensity {
  doneDays: number;
  activeDays: number;
  windowDays: number;
}

export interface FoundationDayMarker {
  dayKey: string;
  state: 'done' | 'open' | 'outside';
  late: boolean;
}

export interface FoundationGapRestartOffer {
  gapDays: number;
  lastEntryDayKey: string | null;
}

/**
 * A single, self-explaining restart invitation for the current active gap.
 * The persisted offer marker suppresses the gap until a newer entry exists;
 * that newer entry is what permits a later, genuinely new gap to surface.
 */
export function gapRestartOffer(
  entries: FoundationEntry[],
  instance: FoundationInstance,
  todayKey: string,
): FoundationGapRestartOffer | null {
  if (
    !isManualFoundationType(instance.type) ||
    !instance.enabled ||
    !isFoundationDayKey(todayKey) ||
    !isFoundationActiveOn(instance, todayKey)
  ) return null;
  const instanceEntries = entries
    .filter((entry) => entry.instanceId === instance.id && entry.dayKey <= todayKey)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  if (instanceEntries.some((entry) => entry.dayKey === todayKey)) return null;
  const lastEntryDayKey =
    instanceEntries.length > 0 ? instanceEntries[instanceEntries.length - 1].dayKey : null;
  if (
    instance.lastRestartOfferDayKey &&
    (lastEntryDayKey === null || instance.lastRestartOfferDayKey > lastEntryDayKey)
  ) return null;

  const adoptionDayKey =
    instance.ranges.reduce<string | null>(
      (earliest, range) => (earliest === null || range.from < earliest ? range.from : earliest),
      null,
    ) ?? dayKeyFor(instance.createdAt);
  const recorded = new Set(instanceEntries.map((entry) => entry.dayKey));
  let cursor = shiftDayKey(todayKey, -1);
  let gapDays = 0;
  while (
    cursor >= adoptionDayKey &&
    isFoundationActiveOn(instance, cursor) &&
    !recorded.has(cursor)
  ) {
    gapDays += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return gapDays >= 3 ? { gapDays, lastEntryDayKey } : null;
}

/**
 * The bounded detail row behind PLAN 10.9. It begins on adoption day, never
 * invents pre-tracking history, and represents disabled ranges as neutral
 * outside days rather than unrecorded active days.
 */
export function foundationDayMarkers(
  instance: FoundationInstance,
  entries: FoundationEntry[],
  todayKey: string,
  maxDays = 14,
): FoundationDayMarker[] {
  if (!isFoundationDayKey(todayKey) || maxDays <= 0) return [];
  const adoptionDayKey =
    instance.ranges.reduce<string | null>(
      (earliest, range) => (earliest === null || range.from < earliest ? range.from : earliest),
      null,
    ) ?? dayKeyFor(instance.createdAt);
  const byDay = new Map(
    entries
      .filter((entry) => entry.instanceId === instance.id)
      .map((entry) => [entry.dayKey, entry] as const),
  );
  const markers: FoundationDayMarker[] = [];
  for (let offset = Math.max(0, Math.floor(maxDays)) - 1; offset >= 0; offset--) {
    const dayKey = shiftDayKey(todayKey, -offset);
    if (dayKey < adoptionDayKey) continue;
    const entry = byDay.get(dayKey);
    markers.push({
      dayKey,
      state: entry
        ? 'done'
        : isFoundationActiveOn(instance, dayKey)
          ? 'open'
          : 'outside',
      late: entry?.late === true,
    });
  }
  return markers;
}

export function foundationDensity(
  instance: FoundationInstance,
  entries: FoundationEntry[],
  todayKey: string,
  maxDays = 14,
): FoundationDensity {
  if (!isFoundationDayKey(todayKey) || maxDays <= 0) {
    return { doneDays: 0, activeDays: 0, windowDays: 0 };
  }
  const recorded = new Set(
    entries
      .filter((entry) => entry.instanceId === instance.id)
      .map((entry) => entry.dayKey),
  );
  let activeDays = 0;
  let doneDays = 0;
  let windowDays = 0;
  // `ranges.from` was written through dayKeyFor with the user's configured
  // boundary, so it is the authoritative adoption day for key-based views.
  const adoptionDayKey =
    instance.ranges.reduce<string | null>(
      (earliest, range) => (earliest === null || range.from < earliest ? range.from : earliest),
      null,
    ) ?? dayKeyFor(instance.createdAt);
  for (let offset = Math.max(0, Math.floor(maxDays)) - 1; offset >= 0; offset--) {
    const dayKey = shiftDayKey(todayKey, -offset);
    if (dayKey < adoptionDayKey) continue;
    windowDays += 1;
    if (!isFoundationActiveOn(instance, dayKey)) continue;
    activeDays += 1;
    if (recorded.has(dayKey)) doneDays += 1;
  }
  return { doneDays, activeDays, windowDays };
}

export const FOUNDATIONS_WEEK_MIN_DAYS = 3;

function foundationDaysInWeek(
  instanceId: FoundationInstance['id'],
  entries: readonly FoundationEntry[],
  weekKey: string,
): number {
  const through = shiftDayKey(weekKey, 6);
  return new Set(
    entries
      .filter(
        (entry) =>
          entry.instanceId === instanceId &&
          entry.dayKey >= weekKey &&
          entry.dayKey <= through,
      )
      .map((entry) => entry.dayKey),
  ).size;
}

/**
 * One guarded weekly foundations mirror. Absence stays silent, and the same
 * sentence shape is used whether this week's count rose or fell.
 */
export function foundationsWeekLine(
  instances: readonly FoundationInstance[],
  entries: readonly FoundationEntry[],
  weekKey: string,
): string | null {
  if (!isFoundationDayKey(weekKey)) return null;
  const candidates = instances
    .filter(isManualFoundationInstance)
    .map((instance) => ({
      instance,
      current: foundationDaysInWeek(instance.id, entries, weekKey),
    }))
    .filter((candidate) => candidate.current >= FOUNDATIONS_WEEK_MIN_DAYS)
    .sort(
      (a, b) =>
        b.current - a.current ||
        a.instance.order - b.instance.order ||
        a.instance.id.localeCompare(b.instance.id),
    );
  const chosen = candidates[0];
  if (!chosen) return null;

  const previousWeek = shiftDayKey(weekKey, -7);
  const previous = foundationDaysInWeek(chosen.instance.id, entries, previousWeek);
  const base =
    `${foundationName(chosen.instance)} was recorded on ${chosen.current} days this week`;
  return previous >= FOUNDATIONS_WEEK_MIN_DAYS
    ? `${base} (${previous} last week) — both count.`
    : `${base}.`;
}

function isManualFoundationInstance(
  instance: FoundationInstance,
): instance is FoundationInstance & { type: ManualFoundationType } {
  return isManualFoundationType(instance.type);
}
