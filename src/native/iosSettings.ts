import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

/**
 * PLAN 13.4b — the typed seam between React's Settings and a native form.
 *
 * The native layer is a *generic renderer*: it knows about rows, not about
 * Bloom. Every label, every unit, every explanatory note, and every decision
 * about which rows exist is built here, from the same state the web sheet
 * renders, so `docs/voice.md` keeps exactly one set of strings to govern and a
 * new setting needs no Swift change. Actions come back as an identifier plus a
 * typed value and are dispatched through the same handlers the web controls
 * use, which keeps the reducer the only writer.
 */

export type NativeSettingsRow =
  | {
      kind: 'switch';
      id: string;
      title: string;
      subtitle?: string;
      value: boolean;
      enabled?: boolean;
    }
  | {
      kind: 'stepper';
      id: string;
      title: string;
      subtitle?: string;
      /** Rendered value, including its unit: the native side never formats. */
      valueLabel: string;
      canDecrease: boolean;
      canIncrease: boolean;
    }
  | {
      kind: 'segmented';
      id: string;
      title: string;
      subtitle?: string;
      options: { id: string; title: string }[];
      selected: string;
    }
  | {
      kind: 'picker';
      id: string;
      title: string;
      subtitle?: string;
      options: { id: string; title: string }[];
      selected: string;
    }
  | {
      kind: 'text';
      id: string;
      title: string;
      subtitle?: string;
      value: string;
      placeholder?: string;
      maxLength?: number;
    }
  | {
      kind: 'button';
      id: string;
      title: string;
      subtitle?: string;
      role?: 'default' | 'destructive';
      enabled?: boolean;
    }
  | {
      kind: 'disclosure';
      id: string;
      title: string;
      subtitle?: string;
    }
  | {
      /**
       * PLAN 13.4c — read-only figures shown side by side, like the cadence
       * ladder's shorter / current / longer rungs. Each item carries its own
       * spoken label so VoiceOver announces a rung the way the web rail does,
       * rather than reading "20 slash 4" out of a run-together sentence.
       */
      kind: 'values';
      id: string;
      title?: string;
      items: { id: string; label: string; caption: string; spoken: string }[];
    }
  | {
      kind: 'note';
      id: string;
      title?: string;
      body: string;
      /** Announced by VoiceOver as a live status, matching `role="status"`. */
      status?: boolean;
    };

export interface NativeSettingsSection {
  id: string;
  title: string;
  footer?: string;
  rows: NativeSettingsRow[];
}

export interface NativeSettingsSnapshot {
  title: string;
  doneTitle: string;
  /**
   * Bloom's own day/night choice, not the system's. The sheet must not inherit
   * a dark system appearance while the app it came from is rendering its day
   * sky, and toggling Night sky inside the sheet has to restyle it live.
   */
  appearance: 'light' | 'dark';
  sections: NativeSettingsSection[];
}

export interface NativeSettingsAction {
  id: string;
  /** Present for switch/segmented/picker/text; a stepper sends its direction. */
  value?: boolean | string;
  direction?: 'increase' | 'decrease';
}

/**
 * What actually arrives from the plugin. Booleans cross as the string-encoded
 * `checked` key: a Swift `Bool` written into a `JSObject` did not reach
 * JavaScript as a boolean, which made every native switch a no-op while string
 * values worked. Normalising here keeps that detail out of the callers.
 */
interface RawNativeSettingsAction {
  id?: unknown;
  value?: unknown;
  checked?: unknown;
  direction?: unknown;
}

export function normalizeNativeSettingsAction(
  raw: RawNativeSettingsAction,
): NativeSettingsAction | null {
  if (!raw || typeof raw.id !== 'string' || !ROW_ID.test(raw.id)) return null;
  const action: NativeSettingsAction = { id: raw.id };
  if (typeof raw.checked === 'boolean') action.value = raw.checked;
  else if (raw.checked === 'true') action.value = true;
  else if (raw.checked === 'false') action.value = false;
  else if (typeof raw.value === 'string') action.value = raw.value;
  else if (typeof raw.value === 'boolean') action.value = raw.value;
  if (raw.direction === 'increase' || raw.direction === 'decrease') {
    action.direction = raw.direction;
  }
  return action;
}

interface BloomSettingsPlugin {
  /** Presents the sheet, or re-renders the live one with a newer snapshot. */
  present(options: NativeSettingsSnapshot): Promise<{ active: boolean }>;
  dismiss(): Promise<void>;
  addListener(
    eventName: 'settingsAction',
    listener: (event: RawNativeSettingsAction) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'settingsDismissed',
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}

const bloomSettings = registerPlugin<BloomSettingsPlugin>('BloomSettings');

const ROW_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/;
const MAX_TITLE = 120;
const MAX_BODY = 600;
const MAX_ROWS_PER_SECTION = 40;
const MAX_SECTIONS = 12;
const MAX_OPTIONS = 32;

export function isNativeIOSSettingsPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isFilledText(value: unknown, max: number): boolean {
  return isText(value, max) && value.trim().length > 0;
}

function areValidOptions(options: unknown, selected: unknown): boolean {
  if (!Array.isArray(options) || options.length === 0) return false;
  if (options.length > MAX_OPTIONS) return false;
  const ids = new Set<string>();
  for (const option of options) {
    if (typeof option !== 'object' || option === null) return false;
    const { id, title } = option as { id?: unknown; title?: unknown };
    if (typeof id !== 'string' || !ROW_ID.test(id)) return false;
    if (!isFilledText(title, MAX_TITLE)) return false;
    if (ids.has(id)) return false;
    ids.add(id);
  }
  if (typeof selected !== 'string') return false;
  // An empty selection is legitimate: the cadence presets show none active
  // when the user's own durations do not match any of them, and the history
  // list is an action menu rather than a current value.
  return selected === '' || ids.has(selected);
}

function areValidValueItems(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  if (items.length > MAX_OPTIONS) return false;
  const ids = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'object' || item === null) return false;
    const { id, label, caption, spoken } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !ROW_ID.test(id)) return false;
    if (!isFilledText(label, MAX_TITLE)) return false;
    if (!isFilledText(caption, MAX_TITLE)) return false;
    if (!isFilledText(spoken, MAX_TITLE)) return false;
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return true;
}

/**
 * A malformed snapshot must never reach the native form: a half-rendered
 * Settings screen is worse than the web sheet it replaced, and the row
 * identifiers are what later dispatch reducer writes.
 */
export function isValidNativeSettingsRow(row: NativeSettingsRow): boolean {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.id !== 'string' || !ROW_ID.test(row.id)) return false;
  if ('subtitle' in row && row.subtitle !== undefined && !isText(row.subtitle, MAX_BODY)) {
    return false;
  }

  switch (row.kind) {
    case 'switch':
      return isFilledText(row.title, MAX_TITLE) && typeof row.value === 'boolean';
    case 'stepper':
      return (
        isFilledText(row.title, MAX_TITLE) &&
        isFilledText(row.valueLabel, MAX_TITLE) &&
        typeof row.canDecrease === 'boolean' &&
        typeof row.canIncrease === 'boolean'
      );
    case 'segmented':
    case 'picker':
      return isFilledText(row.title, MAX_TITLE) && areValidOptions(row.options, row.selected);
    case 'text':
      return (
        isFilledText(row.title, MAX_TITLE) &&
        isText(row.value, MAX_BODY) &&
        (row.placeholder === undefined || isText(row.placeholder, MAX_TITLE))
      );
    case 'button':
    case 'disclosure':
      return isFilledText(row.title, MAX_TITLE);
    case 'values':
      return (
        (row.title === undefined || isFilledText(row.title, MAX_TITLE)) &&
        areValidValueItems(row.items)
      );
    case 'note':
      return (
        (row.title === undefined || isFilledText(row.title, MAX_TITLE)) &&
        isFilledText(row.body, MAX_BODY)
      );
    default:
      return false;
  }
}

export function isValidNativeSettingsSnapshot(
  snapshot: NativeSettingsSnapshot,
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (!isFilledText(snapshot.title, MAX_TITLE)) return false;
  if (!isFilledText(snapshot.doneTitle, MAX_TITLE)) return false;
  if (snapshot.appearance !== 'light' && snapshot.appearance !== 'dark') return false;
  if (!Array.isArray(snapshot.sections) || snapshot.sections.length === 0) return false;
  if (snapshot.sections.length > MAX_SECTIONS) return false;

  const rowIDs = new Set<string>();
  const sectionIDs = new Set<string>();
  for (const section of snapshot.sections) {
    if (!section || typeof section !== 'object') return false;
    if (typeof section.id !== 'string' || !ROW_ID.test(section.id)) return false;
    if (sectionIDs.has(section.id)) return false;
    sectionIDs.add(section.id);
    if (!isFilledText(section.title, MAX_TITLE)) return false;
    if (section.footer !== undefined && !isText(section.footer, MAX_BODY)) return false;
    if (!Array.isArray(section.rows) || section.rows.length === 0) return false;
    if (section.rows.length > MAX_ROWS_PER_SECTION) return false;
    for (const row of section.rows) {
      if (!isValidNativeSettingsRow(row)) return false;
      // Actions are addressed by row id, so a duplicate would make a tap
      // ambiguous about which setting it meant.
      if (rowIDs.has(row.id)) return false;
      rowIDs.add(row.id);
    }
  }
  return true;
}

export function presentNativeIOSSettings(
  snapshot: NativeSettingsSnapshot,
): Promise<{ active: boolean }> {
  if (!isValidNativeSettingsSnapshot(snapshot)) {
    return Promise.resolve({ active: false });
  }
  return bloomSettings.present(snapshot);
}

export function dismissNativeIOSSettings(): Promise<void> {
  return bloomSettings.dismiss();
}

export function listenForNativeIOSSettingsAction(
  listener: (action: NativeSettingsAction) => void,
): Promise<PluginListenerHandle> {
  return bloomSettings.addListener('settingsAction', (raw) => {
    const action = normalizeNativeSettingsAction(raw);
    if (action) listener(action);
  });
}

export function listenForNativeIOSSettingsDismissal(
  listener: () => void,
): Promise<PluginListenerHandle> {
  return bloomSettings.addListener('settingsDismissed', listener);
}
