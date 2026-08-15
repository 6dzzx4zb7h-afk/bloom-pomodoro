import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DurationMode, PersistedShape, Settings } from '../store/useBloom';
import { audioEngine, requestNotifyPermission } from '../engine/audio';
import {
  AWAY_CHOICES,
  CHECKIN_CHOICES,
  loadEvents,
  type Chronotype,
} from '../store/companion';
import { friendByName } from '../data/friends';
import type { RitualSettings } from '../store/ritual';
import { PixelPal } from './PixelPal';
import {
  CADENCE_PRESETS,
  personalCadenceForSurface,
  shouldRecomputePersonalCadence,
  type CadencePair,
  type CadencePreset,
  type PersonalCadenceMemory,
  type PersonalCadenceRecommendation,
} from '../insights/cadence';
import type { SessionRecord } from '../store/sessions';
import type { IOSCompletionAlertStatus } from '../native/iosCompletionAlerts';
import type { IOSLiveActivityStatus } from '../native/iosLiveActivity';
import { Dialog } from './Dialog';
import { Sheet } from './Sheet';
import { SystemSwitch } from './SystemSwitch';
import { platformWords } from '../content/platformWords';
import {
  dismissNativeIOSSettings,
  isNativeIOSSettingsPlatform,
  listenForNativeIOSSettingsAction,
  listenForNativeIOSSettingsDismissal,
  openNativeIOSAppSettings,
  pickNativeIOSBackupFile,
  presentNativeIOSDestructiveConfirmation,
  presentNativeIOSExportFile,
  presentNativeIOSSettings,
  type NativeSettingsAction,
  type NativeSettingsRow,
  type NativeSettingsSection,
} from '../native/iosSettings';
import {
  BackupError,
  IMPORT_RECOVERY_KEY,
  commitPreparedImport,
  createBackupEnvelope,
  parseBackup,
  prepareImport,
  readBackupFile,
  serializeBackup,
  sessionRecordsCsv,
  type PreparedImport,
} from '../store/exportImport';
import { isAppearanceMode, type AppearanceMode } from '../store/appearance';

interface SettingsSheetProps {
  settings: Settings;
  records: SessionRecord[];
  personalCadence: PersonalCadenceMemory;
  /** Store-owned day signal; cadence computation captures its own instant. */
  now: number;
  /** Whether a session is currently running (data import waits until it ends). */
  running: boolean;
  /** Includes paused work records whose history still belongs to the timer. */
  hasOpenSession: boolean;
  persistedState: PersistedShape;
  onPatch: (patch: Partial<Settings>) => void;
  onCacheCadence: (recommendation: PersonalCadenceRecommendation) => void;
  onApplyCadence: (pair: CadencePair) => void;
  ritual: RitualSettings;
  onPatchRitual: (patch: Partial<Pick<RitualSettings, 'enabled' | 'suggestionSeen'>>) => void;
  onUpdateRitualItem: (id: string, text: string) => void;
  onClearFocusData: () => void;
  onDataImported: () => void;
  onClose: () => void;
  completionAlertStatus: IOSCompletionAlertStatus;
  onRequestCompletionAlertPermission: () => Promise<IOSCompletionAlertStatus>;
  /** Present only in the native iOS wrapper; this setting remains system-owned. */
  liveActivityStatus?: IOSLiveActivityStatus;
  liveActivityChecking?: boolean;
  /** Open the weekly review card on demand (PLAN 2.3); closes the sheet. */
  onShowWeekly?: () => void;
}

interface DurationRowSpec {
  key: DurationMode;
  label: string;
  step: number; // minutes
  min: number;
  max: number;
}

const DURATION_ROWS: DurationRowSpec[] = [
  { key: 'focus', label: 'Focus', step: 5, min: 5, max: 90 },
  { key: 'short', label: 'Short break', step: 1, min: 1, max: 15 },
  { key: 'long', label: 'Long break', step: 5, min: 5, max: 45 },
];

const CHRONOTYPE_CHOICES: { value: Chronotype; label: string }[] = [
  { value: 'betterEarlier', label: 'better earlier' },
  { value: 'betterLater', label: 'better later' },
  { value: 'notSure', label: 'not sure' },
];

const DAY_BOUNDARY_PRESETS = [0, 3, 5] as const;

const GOAL_CREDIT_CHOICES: { value: Settings['goalCredit']; label: string }[] = [
  { value: 'off', label: 'keep manual' },
  { value: 'ask', label: 'ask each time' },
  { value: 'auto', label: 'add automatically' },
];

const APPEARANCE_CHOICES: {
  value: AppearanceMode;
  label: string;
  description: string;
}[] = [
  { value: 'day', label: 'Day sky', description: 'keep the light sky' },
  { value: 'night', label: 'Night sky', description: 'keep stars & meteors' },
  { value: 'system', label: 'Follow system', description: 'match this device' },
];

/**
 * PLAN 13.4b / 8.26 — sections the native form opens as scoped web details. Each is a
 * disclosure row that opens this same web sheet scoped to that one section, so
 * nothing is unreachable while keeping the native top level concise.
 */
type SettingsDetail = 'cadence' | 'data';

/** Native option ids must start with a letter; these values do not. */
const HOUR_OPTION_PREFIX = 'h';
const CADENCE_PRESET_PREFIX = 'p';
const CADENCE_PAIR_PREFIX = 'r';

function clockHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function SettingSection({
  title,
  defaultOpen = false,
  hidden = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** PLAN 13.4b: a scoped web sheet shows one section and drops the rest. */
  hidden?: boolean;
  children: ReactNode;
}) {
  if (hidden) return null;
  return (
    <details className="settings-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="settings-section-body">{children}</div>
    </details>
  );
}

function RitualItemEditor({
  id,
  text,
  onCommit,
}: {
  id: string;
  text: string;
  onCommit: (id: string, text: string) => void;
}) {
  const [draft, setDraft] = useState(text);

  useEffect(() => setDraft(text), [text]);

  function commit() {
    const next = draft.trim();
    if (!next) {
      setDraft(text);
      return;
    }
    setDraft(next);
    if (next !== text) onCommit(id, next);
  }

  return (
    <label className="ritual-edit-row">
      <span className="ritual-edit-dot">•</span>
      <input
        className="ritual-edit-input"
        value={draft}
        maxLength={60}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(text);
          }
        }}
        aria-label={`Ritual item: ${text}`}
      />
    </label>
  );
}

export function SettingsSheet({
  settings,
  records,
  personalCadence,
  now,
  ritual,
  running,
  hasOpenSession,
  persistedState,
  onPatch,
  onCacheCadence,
  onApplyCadence,
  onPatchRitual,
  onUpdateRitualItem,
  onClearFocusData,
  onDataImported,
  onClose,
  completionAlertStatus,
  onRequestCompletionAlertPermission,
  liveActivityStatus,
  liveActivityChecking = false,
  onShowWeekly,
}: SettingsSheetProps) {
  // PLAN 13.15: iPhone and iPad have no tabs; the same leave-and-return event
  // is leaving the app, and every label that names it says so.
  const words = platformWords();
  // 'unknown' until asked; used to nudge the user if they blocked notifications.
  const [notifyDenied, setNotifyDenied] = useState(false);
  const [nameDraft, setNameDraft] = useState(settings.name);
  const companion = settings.companion;
  // The pal gives a happy little wave when Companion Mode turns on.
  const [waving, setWaving] = useState(false);
  const waveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [eventCount, setEventCount] = useState(() => loadEvents().length);
  const [cadenceEvents, setCadenceEvents] = useState(() => loadEvents());
  const [clearedNote, setClearedNote] = useState(false);
  const [showClearScope, setShowClearScope] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [dataTransferNotice, setDataTransferNotice] = useState<string | null>(null);
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [importState, setImportState] = useState<
    | { kind: 'idle' }
    | { kind: 'reading'; percent: number; fileName: string }
    | { kind: 'ready'; prepared: PreparedImport; fileName: string }
    | { kind: 'saving'; prepared: PreparedImport; fileName: string }
    | { kind: 'success'; safetyBackup: string | null }
    | {
        kind: 'error';
        message: string;
        recoveryRequired: boolean;
        recoveryBackup: string | null;
      }
  >({ kind: 'idle' });
  const importController = useRef<AbortController | null>(null);
  const currentCadence = useMemo(
    () => ({
      focusMin: Math.round(settings.durations.focus / 60),
      breakMin: Math.round(settings.durations.short / 60),
    }),
    [settings.durations.focus, settings.durations.short],
  );
  const cadenceDecision = useMemo(
    () => {
      // `now` is the store-owned refresh signal; staleness and recommendation
      // share the actual instant when this memo recomputes.
      void now;
      const computedAt = Date.now();
      return {
        cadence: personalCadenceForSurface(
          personalCadence,
          records,
          cadenceEvents,
          settings.chronotype,
          currentCadence,
          computedAt,
        ),
        needsRefresh: shouldRecomputePersonalCadence(personalCadence, computedAt),
      };
    },
    [cadenceEvents, currentCadence, now, personalCadence, records, settings.chronotype],
  );
  const { cadence: learnedCadence, needsRefresh: cadenceNeedsRefresh } = cadenceDecision;
  useEffect(() => {
    if (!clearedNote && cadenceNeedsRefresh) onCacheCadence(learnedCadence);
  }, [cadenceNeedsRefresh, clearedNote, learnedCadence, onCacheCadence]);
  useEffect(() => setNameDraft(settings.name), [settings.name]);
  useEffect(
    () => () => {
      if (waveTimer.current) clearTimeout(waveTimer.current);
      importController.current?.abort();
    },
    [],
  );

  function toggleCompanion() {
    const next = !companion.on;
    onPatch({ companion: { ...companion, on: next } });
    if (next) {
      setWaving(true);
      if (waveTimer.current) clearTimeout(waveTimer.current);
      waveTimer.current = setTimeout(() => setWaving(false), 2200);
    }
  }

  /** Step through a fixed list of choices (check-in minutes, away seconds). */
  function stepChoice(choices: number[], cur: number, dir: 1 | -1): number {
    const i = Math.max(0, choices.indexOf(cur));
    return choices[Math.max(0, Math.min(choices.length - 1, i + dir))];
  }

  function bump(key: DurationMode, dir: 1 | -1, spec: DurationRowSpec) {
    const mins = Math.round(settings.durations[key] / 60) + dir * spec.step;
    const clamped = Math.max(spec.min, Math.min(spec.max, mins));
    onPatch({ durations: { ...settings.durations, [key]: clamped * 60 } });
  }

  function applyCadence(preset: CadencePreset) {
    onApplyCadence(preset);
  }

  function commitNameValue(raw: string) {
    const next = raw.trim().slice(0, 20);
    if (!next) {
      setNameDraft(settings.name);
      return;
    }
    setNameDraft(next);
    if (next !== settings.name) onPatch({ name: next });
  }

  function commitName() {
    commitNameValue(nameDraft);
  }

  async function toggleRing() {
    const next = !settings.sound;
    onPatch({ sound: next });
    if (next) {
      // Turning it on is also the user gesture that unlocks and previews the
      // completion cue. Native notification permission remains a separate,
      // explained choice.
      audioEngine.resume();
      audioEngine.playRing();
      if (completionAlertStatus.permission === 'unsupported') {
        const ok = await requestNotifyPermission();
        setNotifyDenied(
          !ok && typeof Notification !== 'undefined' && Notification.permission === 'denied',
        );
      } else {
        // Native iOS permission follows the explicit explanation below. The
        // Ring switch itself only enables and previews the foreground cue.
        setNotifyDenied(false);
      }
    }
  }

  function clearFocusData() {
    onClearFocusData();
    setCadenceEvents([]);
    setEventCount(0);
    setShowClearScope(false);
    setClearConfirmOpen(false);
    setClearedNote(true);
  }

  function downloadText(contents: string, fileName: string, mime: string) {
    if (nativeIOS) {
      setDataTransferNotice(null);
      void presentNativeIOSExportFile({
        contents,
        fileName,
        mimeType: mime.startsWith('text/csv') ? 'text/csv' : 'application/json',
      }).catch(() => {
        setDataTransferNotice(
          'That file could not be prepared. Your data is still safe in Bloom.',
        );
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function currentBackup() {
    return createBackupEnvelope(persistedState, loadEvents());
  }

  function exportJson() {
    const day = new Date().toISOString().slice(0, 10);
    downloadText(
      serializeBackup(currentBackup()),
      `bloom-backup-${day}.json`,
      'application/json',
    );
  }

  function exportCsv() {
    const day = new Date().toISOString().slice(0, 10);
    downloadText(
      sessionRecordsCsv(records),
      `bloom-sessions-${day}.csv`,
      'text/csv;charset=utf-8',
    );
  }

  async function chooseImport(file: File | undefined) {
    if (!file) return;
    importController.current?.abort();
    const controller = new AbortController();
    importController.current = controller;
    setImportState({ kind: 'reading', percent: 0, fileName: file.name });
    try {
      const text = await readBackupFile(file, controller.signal, (percent) => {
        setImportState((state) =>
          state.kind === 'reading' ? { ...state, percent } : state,
        );
      });
      const incoming = parseBackup(text, controller.signal);
      const prepared = prepareImport(incoming, currentBackup());
      setImportState({ kind: 'ready', prepared, fileName: file.name });
    } catch (error) {
      if (error instanceof BackupError && error.code === 'canceled') {
        setImportState({ kind: 'idle' });
      } else {
        setImportState({
          kind: 'error',
          message:
            error instanceof BackupError
              ? error.message
              : 'That file could not be read. Your current data is unchanged.',
          recoveryRequired: false,
          recoveryBackup: null,
        });
      }
    } finally {
      if (importController.current === controller) importController.current = null;
    }
  }

  async function chooseNativeImport() {
    if (running || hasOpenSession) return;
    setDataTransferNotice(null);
    setImportState({ kind: 'reading', percent: 0, fileName: 'your backup' });
    try {
      const selected = await pickNativeIOSBackupFile();
      if (selected.canceled) {
        setImportState({ kind: 'idle' });
        return;
      }
      setImportState({ kind: 'reading', percent: 100, fileName: selected.fileName });
      const incoming = parseBackup(selected.contents);
      const prepared = prepareImport(incoming, currentBackup());
      setImportState({ kind: 'ready', prepared, fileName: selected.fileName });
    } catch (error) {
      setImportState({
        kind: 'error',
        message:
          error instanceof BackupError
            ? error.message
            : 'That file could not be read. Your current data is unchanged.',
        recoveryRequired: false,
        recoveryBackup: null,
      });
    }
  }

  function cancelImport() {
    importController.current?.abort();
    importController.current = null;
    setImportState({ kind: 'idle' });
  }

  async function confirmNativeClearFocusData() {
    if (running || hasOpenSession) return;
    try {
      const { confirmed } = await presentNativeIOSDestructiveConfirmation({
        title: 'Clear reflection history?',
        message: `${records.length} session record${records.length === 1 ? '' : 's'} and ${eventCount} Companion moment${eventCount === 1 ? '' : 's'} will be removed from this device. Your bloom total, streak, friend XP, task cherries, and goal progress stay.`,
        confirmTitle: 'clear reflection history',
        cancelTitle: 'keep it',
      });
      if (confirmed) clearFocusData();
    } catch {
      setDataTransferNotice('Nothing was cleared. You can try again whenever you like.');
    }
  }

  function saveImport(prepared: PreparedImport, fileName: string) {
    setImportState({ kind: 'saving', prepared, fileName });
    try {
      commitPreparedImport(prepared, localStorage);
      const safetyBackup = prepared.safetyBackup
        ? serializeBackup(prepared.safetyBackup)
        : null;
      onDataImported();
      const nextEvents = prepared.merged.companion.events;
      setCadenceEvents(nextEvents);
      setEventCount(nextEvents.length);
      setClearedNote(false);
      setImportState({ kind: 'success', safetyBackup });
    } catch (error) {
      setImportState({
        kind: 'error',
        message:
          error instanceof BackupError
            ? error.message
            : 'The import could not be saved. Your current data is unchanged.',
        recoveryRequired: error instanceof BackupError && error.recoveryRequired,
        recoveryBackup:
          error instanceof BackupError && error.code === 'storage'
            ? localStorage.getItem(IMPORT_RECOVERY_KEY)
            : null,
      });
    }
  }

  // ---------- PLAN 13.4b: the native iOS form ----------
  // React keeps every string and every decision about which rows exist; the
  // native layer renders what it is handed and reports which row the user
  // touched. Nothing here writes state — each action goes back through the
  // same handler the web control uses, so the reducer stays the only writer.

  const nativeIOS = isNativeIOSSettingsPlatform();
  const [detail, setDetail] = useState<SettingsDetail | null>(null);
  // null until the bridge answers; false means this iOS version (or a failed
  // presentation) keeps the complete web sheet.
  const [nativeActive, setNativeActive] = useState<boolean | null>(
    nativeIOS ? null : false,
  );

  function sessionsRows(): NativeSettingsRow[] {
    const rows: NativeSettingsRow[] = [
      {
        kind: 'switch',
        id: 'settings.autoStart',
        title: 'Auto-start next',
        value: settings.autoStart,
      },
      {
        kind: 'switch',
        id: 'ritual.enabled',
        title: 'Environment reset',
        subtitle: 'an optional 15–30 second tidy-up before a session',
        value: ritual.enabled,
      },
    ];
    if (ritual.enabled) {
      rows.push({
        kind: 'note',
        id: 'note.ritualEdit',
        body: 'Edit the little checks to fit your space. You can skip the reset whenever you like.',
      });
      ritual.items.forEach((item, index) => {
        rows.push({
          kind: 'text',
          id: `ritual.item.${index}`,
          title: `Check ${index + 1}`,
          value: item.text,
          maxLength: 60,
        });
      });
    }
    rows.push(
      {
        kind: 'switch',
        id: 'settings.flow',
        title: 'Flow timer',
        subtitle: words.flowSubtitle,
        value: settings.flow,
      },
      {
        kind: 'switch',
        id: 'settings.sound',
        title: 'Ring when done',
        subtitle: 'a gentle chime at session end',
        value: settings.sound,
      },
    );

    if (liveActivityStatus) {
      rows.push({
        kind: 'note',
        id: 'note.liveActivity',
        title: 'Live Activity',
        body: liveActivityChecking
          ? 'Checking your iOS Live Activity setting…'
          : !liveActivityStatus.supported
            ? 'Live Activities aren’t available on this iOS version. Your timer still works normally.'
            : !liveActivityStatus.enabled
              ? 'Live Activities are off in iOS Settings. Your timer still works normally.'
              : 'Focus and Tiny can show their mode and time remaining on the Lock Screen and, on supported iPhones, the Dynamic Island. Task text never appears, and no Bloom server is involved.',
        status: liveActivityChecking || !liveActivityStatus.enabled,
      });
      if (
        !liveActivityChecking &&
        liveActivityStatus.supported &&
        !liveActivityStatus.enabled
      ) {
        rows.push({
          kind: 'button',
          id: 'action.openIOSSettings.liveActivity',
          title: 'open iOS Settings for Live Activities',
        });
      }
    }
    if (notifyDenied) {
      rows.push({
        kind: 'note',
        id: 'note.notifyDenied',
        body: 'Notifications are blocked for Bloom right now, so the end-of-session notice can’t appear. You can allow them in your browser or app settings whenever you like.',
        status: true,
      });
    }
    if (settings.sound && completionAlertStatus.permission === 'prompt') {
      rows.push(
        {
          kind: 'note',
          id: 'note.completionAlertPrompt',
          body: 'Bloom can chime while it’s open. Allow notifications so iOS can deliver a timer alert while Bloom is in the background or your device is locked. Silent Mode, Focus, and your notification settings still apply.',
        },
        {
          kind: 'button',
          id: 'action.allowNotifications',
          title: 'allow notifications',
        },
      );
    }
    if (settings.sound && completionAlertStatus.permission === 'denied') {
      rows.push(
        {
          kind: 'note',
          id: 'note.completionAlertDenied',
          body: 'Timer alerts are off in iOS Settings. Bloom can still chime while it’s open.',
          status: true,
        },
        {
          kind: 'button',
          id: 'action.openIOSSettings.notificationsDenied',
          title: 'open iOS Settings for timer alerts',
        },
      );
    }
    if (settings.sound && completionAlertStatus.permission === 'unavailable') {
      rows.push({
        kind: 'note',
        id: 'note.completionAlertUnavailable',
        body: 'Background timer alerts aren’t available right now. Bloom can still chime while it’s open.',
        status: true,
      });
    }
    if (
      settings.sound &&
      completionAlertStatus.permission === 'granted' &&
      (!completionAlertStatus.alertsEnabled ||
        !completionAlertStatus.soundsEnabled ||
        !completionAlertStatus.lockScreenEnabled)
    ) {
      rows.push(
        {
          kind: 'note',
          id: 'note.completionAlertPartial',
          body: 'One or more iOS notification options are off. Bloom can still chime while it’s open; you can adjust banners, sound, and Lock Screen alerts in iOS Settings.',
          status: true,
        },
        {
          kind: 'button',
          id: 'action.openIOSSettings.notificationsPartial',
          title: 'open iOS Settings for timer alerts',
        },
      );
    }
    return rows;
  }

  /** PLAN 8.26 — direct lengths lead; optional learned detail is one disclosure. */
  function durationRows(): NativeSettingsRow[] {
    const rows: NativeSettingsRow[] = [];
    DURATION_ROWS.forEach((row) => {
      const mins = Math.round(settings.durations[row.key] / 60);
      rows.push({
        kind: 'stepper',
        id: `duration.${row.key}`,
        title: row.label,
        valueLabel: `${mins} min`,
        canDecrease: mins > row.min,
        canIncrease: mins < row.max,
      });
    });
    rows.push({
      kind: 'disclosure',
      id: 'detail.cadence',
      title: 'Cadence suggestions',
      subtitle: 'optional ideas from your local focus history',
    });
    return rows;
  }

  function companionRows(): NativeSettingsRow[] {
    const rows: NativeSettingsRow[] = [
      {
        kind: 'switch',
        id: 'settings.companion',
        title: 'Companion mode',
        subtitle:
          'your pet gently checks in and helps you understand your focus patterns',
        value: companion.on,
      },
      {
        kind: 'switch',
        id: 'settings.preSlumpCheck',
        title: 'Gentle pre-slump check',
        subtitle: 'an optional breath or stretch hello during focus',
        value: settings.preSlumpCheck,
      },
      {
        kind: 'note',
        id: 'note.preSlump',
        body: 'Based on when your drifts usually start. Once Bloom has enough of your focus history, your pet may offer one soft cue shortly beforehand — never more than once a session or twice a day. You can silence it for the day from the cue.',
      },
    ];
    if (!companion.on) return rows;

    rows.push({
      kind: 'stepper',
      id: 'companion.checkinMins',
      title: 'Check in every',
      valueLabel: `${companion.checkinMins} min`,
      canDecrease: companion.checkinMins > CHECKIN_CHOICES[0],
      canIncrease: companion.checkinMins < CHECKIN_CHOICES[CHECKIN_CHOICES.length - 1],
    });
    rows.push({
      kind: 'switch',
      id: 'settings.companion.tabDetect',
      title: words.awayToggleTitle,
      subtitle: 'a soft hello when you come back',
      value: companion.tabDetect,
    });
    if (companion.tabDetect) {
      rows.push({
        kind: 'stepper',
        id: 'companion.awaySecs',
        title: 'Away counts after',
        valueLabel: `${companion.awaySecs} s`,
        canDecrease: companion.awaySecs > AWAY_CHOICES[0],
        canIncrease: companion.awaySecs < AWAY_CHOICES[AWAY_CHOICES.length - 1],
      });
    }
    rows.push(
      {
        kind: 'switch',
        id: 'settings.companion.quiet',
        title: 'Quiet mode',
        subtitle: 'log patterns silently, never ask',
        value: companion.quiet,
      },
      {
        kind: 'switch',
        id: 'settings.companion.intention',
        title: 'Session intention',
        subtitle: 'one small “what will you do?” before you start',
        value: companion.intention,
      },
    );
    return rows;
  }

  function dayRows(): NativeSettingsRow[] {
    const rows: NativeSettingsRow[] = [
      {
        kind: 'picker',
        id: 'settings.dayStartHour',
        title: 'When does your day roll over?',
        subtitle:
          'Sessions finished before this time belong to the previous study day. Their timestamps stay unchanged.',
        options: Array.from({ length: 24 }, (_, hour) => ({
          id: `${HOUR_OPTION_PREFIX}${hour}`,
          title: clockHourLabel(hour),
        })),
        selected: `${HOUR_OPTION_PREFIX}${settings.dayStartHour}`,
      },
      {
        kind: 'switch',
        id: 'settings.foundations',
        title: 'Daily foundations',
        subtitle:
          'keep up to three tiny daily actions beside your finished-session marker',
        value: settings.foundations,
      },
      {
        kind: 'switch',
        id: 'settings.planner',
        title: 'Goals & deadlines',
        subtitle:
          'plan an exam, a project or any goal with a date — log parts as you finish and see the pace that lands it',
        value: settings.planner,
      },
    ];
    if (settings.planner) {
      rows.push({
        kind: 'picker',
        id: 'settings.goalCredit',
        title: 'Credit linked work',
        subtitle:
          'choose whether a finished linked task or session can log one goal part',
        options: GOAL_CREDIT_CHOICES.map((choice) => ({
          id: choice.value,
          title: choice.label,
        })),
        selected: settings.goalCredit,
      });
    }
    rows.push({
      kind: 'note',
      id: 'note.gentleStreak',
      title: 'Gentle streak',
      body: 'Your streak counts days with a finished session. One rest day each week is free — a single quiet day keeps it growing. A longer pause just sets the count aside, and coming back always gets a warm welcome. Consistency is a months game.',
    });
    return rows;
  }

  /** PLAN 13.4d — native presentation, React-owned bytes and state machine. */
  function dataRows(): NativeSettingsRow[] {
    const rows: NativeSettingsRow[] = [
      {
        kind: 'note',
        id: 'note.dataTransfer',
        title: 'Backup & transfer',
        body: 'Share a complete local backup, or a spreadsheet of session records. Nothing leaves this device until you choose where to send or save it.',
      },
      {
        kind: 'button',
        id: 'action.exportJSON',
        title: 'export JSON backup',
      },
      {
        kind: 'button',
        id: 'action.exportCSV',
        title: 'export sessions CSV',
      },
      {
        kind: 'button',
        id: 'action.importJSON',
        title: 'choose a JSON backup to import',
        subtitle:
          running || hasOpenSession
            ? 'finish or reset the open timer before importing'
            : undefined,
        enabled:
          !running &&
          !hasOpenSession &&
          importState.kind !== 'reading' &&
          importState.kind !== 'saving',
      },
    ];

    if (dataTransferNotice) {
      rows.push({
        kind: 'note',
        id: 'note.dataTransferStatus',
        body: dataTransferNotice,
        status: true,
      });
    }

    if (importState.kind === 'reading') {
      rows.push({
        kind: 'note',
        id: 'note.importReading',
        title: 'Reading backup',
        body: `${importState.fileName} · ${importState.percent}%`,
        status: true,
      });
    } else if (importState.kind === 'ready') {
      rows.push(
        {
          kind: 'note',
          id: 'note.importReady',
          title: 'Ready to review',
          body: `This backup has ${importState.prepared.preview.sessions} sessions, ${importState.prepared.preview.tasks} tasks, ${importState.prepared.preview.goals} goals, and ${importState.prepared.preview.companionMoments} Companion moments. Bloom will merge stable records, keep current device preferences, and save a safety backup first.`,
          status: true,
        },
        {
          kind: 'button',
          id: 'action.commitImport',
          title: 'merge this backup',
        },
        {
          kind: 'button',
          id: 'action.cancelImport',
          title: 'keep current data',
        },
      );
    } else if (importState.kind === 'saving') {
      rows.push({
        kind: 'note',
        id: 'note.importSaving',
        body: 'Saving the safety backup and imported records…',
        status: true,
      });
    } else if (importState.kind === 'success') {
      rows.push({
        kind: 'note',
        id: 'note.importSuccess',
        title: 'Backup merged ♡',
        body: 'Your sessions, tasks, goals, and Companion moments are ready.',
        status: true,
      });
      if (importState.safetyBackup) {
        rows.push({
          kind: 'button',
          id: 'action.exportSafetyBackup',
          title: 'export safety backup',
        });
      }
    } else if (importState.kind === 'error') {
      rows.push(
        {
          kind: 'note',
          id: 'note.importError',
          title: importState.recoveryRequired ? 'Recovery backup ready' : 'Nothing changed',
          body: importState.message,
          status: true,
        },
        importState.recoveryBackup
          ? {
              kind: 'button',
              id: 'action.exportRecoveryBackup',
              title: 'export recovery backup',
            }
          : {
              kind: 'button',
              id: 'action.exportCurrentData',
              title: 'export current data',
            },
        {
          kind: 'button',
          id: 'action.cancelImport',
          title: 'choose another file',
        },
      );
    }

    if (onShowWeekly) {
      rows.push({
        kind: 'button',
        id: 'action.weeklyReview',
        title: 'see this week',
        subtitle: running
          ? 'available when the current timer stops'
          : 'weekly review · opens here anytime',
        enabled: !running,
      });
    }

    rows.push({
      kind: 'note',
      id: 'note.focusHistory',
      title: 'Focus history',
      body: clearedNote
        ? 'Reflection history cleared ♡'
        : `${records.length} session${records.length === 1 ? '' : 's'} · ${eventCount} Companion moment${eventCount === 1 ? '' : 's'} · on this device`,
      status: clearedNote,
    });

    if (!clearedNote && !showClearScope) {
      rows.push({
        kind: 'button',
        id: 'action.reviewClearScope',
        title: 'review clear scope',
        subtitle:
          running || hasOpenSession
            ? 'finish or reset the current timer before clearing its history'
            : undefined,
        enabled: !running && !hasOpenSession,
      });
    } else if (!clearedNote) {
      rows.push(
        {
          kind: 'note',
          id: 'note.clearRemoves',
          title: 'Removes',
          body: `Completed, interrupted, and stopped session records; Companion check-ins and ${words.awayMomentsScope}; and the learned cadence suggestion built from them.`,
        },
        {
          kind: 'note',
          id: 'note.clearKeeps',
          title: 'Keeps',
          body: 'Your bloom total, streak, friend XP, task completions and cherries, goal progress, current cadence settings, saved plans, parking lot, and Field Guide reads.',
        },
        {
          kind: 'button',
          id: 'action.clearFocusHistory',
          title: 'clear reflection history',
          role: 'destructive',
        },
        {
          kind: 'button',
          id: 'action.keepFocusHistory',
          title: 'keep it',
        },
      );
    }
    return rows;
  }

  const nativeSections: NativeSettingsSection[] = [
    {
      id: 'you',
      title: 'You',
      rows: [
        {
          kind: 'text',
          id: 'settings.name',
          title: 'Your name',
          value: settings.name,
          placeholder: 'your name',
          maxLength: 20,
        },
        {
          kind: 'segmented',
          id: 'settings.chronotype',
          title: 'When are you usually sharpest?',
          subtitle: 'a gentle first guess — your finished sessions help refine it',
          options: CHRONOTYPE_CHOICES.map((choice) => ({
            id: choice.value,
            title: choice.label,
          })),
          selected: settings.chronotype,
        },
      ],
    },
    {
      id: 'durations',
      title: 'Timer lengths',
      footer: 'choose your timer lengths directly · cadence suggestions are optional',
      rows: durationRows(),
    },
    { id: 'sessions', title: 'Sessions', rows: sessionsRows() },
    { id: 'day', title: 'Your day', rows: dayRows() },
    { id: 'companion', title: 'Companion', rows: companionRows() },
    {
      id: 'appearance',
      title: 'Appearance',
      rows: [
        {
          kind: 'segmented',
          id: 'settings.appearance',
          title: 'Sky',
          subtitle: 'choose a sky or match this device',
          options: APPEARANCE_CHOICES.map((choice) => ({
            id: choice.value,
            title: choice.value === 'system' ? 'System' : choice.label.replace(' sky', ''),
          })),
          selected: settings.appearance,
        },
      ],
    },
    {
      id: 'data',
      title: 'Your data',
      rows: dataRows(),
    },
  ];

  const snapshot = {
    title: 'Settings',
    doneTitle: 'done',
    appearance: settings.appearance,
    sections: nativeSections,
  };
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const snapshotKey = nativeIOS ? JSON.stringify(snapshot) : '';

  const nativeActionRef = useRef<(action: NativeSettingsAction) => void>(() => undefined);
  nativeActionRef.current = ({ id, value, direction }) => {
    const flag = typeof value === 'boolean' ? value : undefined;
    const text = typeof value === 'string' ? value : undefined;
    const step = direction === 'increase' ? 1 : direction === 'decrease' ? -1 : undefined;

    if (id.startsWith('ritual.item.')) {
      const index = Number(id.slice('ritual.item.'.length));
      const item = ritual.items[index];
      if (item && text !== undefined && text.trim()) onUpdateRitualItem(item.id, text.trim());
      return;
    }

    switch (id) {
      case 'settings.name':
        if (text !== undefined) commitNameValue(text);
        return;
      case 'settings.chronotype':
        if (CHRONOTYPE_CHOICES.some((choice) => choice.value === text)) {
          onPatch({ chronotype: text as Chronotype });
        }
        return;
      case 'settings.autoStart':
        if (flag !== undefined) onPatch({ autoStart: flag });
        return;
      case 'ritual.enabled':
        if (flag !== undefined) onPatchRitual({ enabled: flag });
        return;
      case 'settings.flow':
        if (flag !== undefined) onPatch({ flow: flag });
        return;
      case 'settings.sound':
        if (flag !== undefined && flag !== settings.sound) void toggleRing();
        return;
      case 'action.allowNotifications':
        void onRequestCompletionAlertPermission();
        return;
      case 'action.openIOSSettings.liveActivity':
      case 'action.openIOSSettings.notificationsDenied':
      case 'action.openIOSSettings.notificationsPartial':
        void openNativeIOSAppSettings();
        return;
      case 'settings.dayStartHour': {
        if (text === undefined || !text.startsWith(HOUR_OPTION_PREFIX)) return;
        const hour = Number(text.slice(HOUR_OPTION_PREFIX.length));
        if (Number.isInteger(hour) && hour >= 0 && hour <= 23) onPatch({ dayStartHour: hour });
        return;
      }
      case 'action.applyCadence':
        applyCadence(learnedCadence.preset);
        return;
      case 'cadence.history': {
        if (text === undefined || !text.startsWith(CADENCE_PAIR_PREFIX)) return;
        const pair = personalCadence.history.find(
          (entry) => `${CADENCE_PAIR_PREFIX}${entry.focusMin}-${entry.breakMin}` === text,
        );
        if (pair) onApplyCadence(pair);
        return;
      }
      case 'cadence.preset': {
        if (text === undefined || !text.startsWith(CADENCE_PRESET_PREFIX)) return;
        const chosen = CADENCE_PRESETS.find(
          (option) => `${CADENCE_PRESET_PREFIX}${option.id}` === text,
        );
        if (chosen) applyCadence(chosen);
        return;
      }
      case 'duration.focus':
      case 'duration.short':
      case 'duration.long': {
        const key = id.slice('duration.'.length) as DurationMode;
        const spec = DURATION_ROWS.find((row) => row.key === key);
        if (spec && step) bump(key, step, spec);
        return;
      }
      case 'settings.foundations':
        if (flag !== undefined) onPatch({ foundations: flag });
        return;
      case 'settings.planner':
        if (flag !== undefined) onPatch({ planner: flag });
        return;
      case 'settings.goalCredit':
        if (GOAL_CREDIT_CHOICES.some((choice) => choice.value === text)) {
          onPatch({ goalCredit: text as Settings['goalCredit'] });
        }
        return;
      case 'settings.companion':
        if (flag !== undefined && flag !== companion.on) toggleCompanion();
        return;
      case 'settings.preSlumpCheck':
        if (flag !== undefined) onPatch({ preSlumpCheck: flag });
        return;
      case 'companion.checkinMins':
        if (step) {
          onPatch({
            companion: {
              ...companion,
              checkinMins: stepChoice(CHECKIN_CHOICES, companion.checkinMins, step),
            },
          });
        }
        return;
      case 'settings.companion.tabDetect':
        if (flag !== undefined) onPatch({ companion: { ...companion, tabDetect: flag } });
        return;
      case 'companion.awaySecs':
        if (step) {
          onPatch({
            companion: {
              ...companion,
              awaySecs: stepChoice(AWAY_CHOICES, companion.awaySecs, step),
            },
          });
        }
        return;
      case 'settings.companion.quiet':
        if (flag !== undefined) onPatch({ companion: { ...companion, quiet: flag } });
        return;
      case 'settings.companion.intention':
        if (flag !== undefined) onPatch({ companion: { ...companion, intention: flag } });
        return;
      case 'settings.appearance':
        if (isAppearanceMode(text)) onPatch({ appearance: text });
        return;
      case 'action.exportJSON':
      case 'action.exportCurrentData':
        exportJson();
        return;
      case 'action.exportCSV':
        exportCsv();
        return;
      case 'action.importJSON':
        void chooseNativeImport();
        return;
      case 'action.commitImport':
        if (importState.kind === 'ready') {
          saveImport(importState.prepared, importState.fileName);
        }
        return;
      case 'action.cancelImport':
        cancelImport();
        return;
      case 'action.exportSafetyBackup':
        if (importState.kind === 'success' && importState.safetyBackup) {
          downloadText(
            importState.safetyBackup,
            'bloom-before-import.json',
            'application/json',
          );
        }
        return;
      case 'action.exportRecoveryBackup':
        if (importState.kind === 'error' && importState.recoveryBackup) {
          downloadText(
            importState.recoveryBackup,
            'bloom-import-recovery.json',
            'application/json',
          );
        }
        return;
      case 'action.weeklyReview':
        if (!running) onShowWeekly?.();
        return;
      case 'action.reviewClearScope':
        if (!running && !hasOpenSession) setShowClearScope(true);
        return;
      case 'action.keepFocusHistory':
        setShowClearScope(false);
        return;
      case 'action.clearFocusHistory':
        void confirmNativeClearFocusData();
        return;
      case 'detail.cadence':
        setDetail('cadence');
        return;
      default:
        // An unknown identifier is a stale sheet or a malformed event; a
        // Settings screen must never guess which value it was meant to change.
        return;
    }
  };

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!nativeIOS) return;
    let disposed = false;
    const handles: { remove: () => Promise<void> }[] = [];
    const track = (handle: { remove: () => Promise<void> }) => {
      if (disposed) void handle.remove();
      else handles.push(handle);
    };

    void listenForNativeIOSSettingsAction((action) => nativeActionRef.current(action))
      .then(track)
      .catch(() => undefined);
    void listenForNativeIOSSettingsDismissal(() => onCloseRef.current())
      .then(track)
      .catch(() => undefined);

    return () => {
      disposed = true;
      handles.forEach((handle) => void handle.remove());
      void dismissNativeIOSSettings();
    };
  }, [nativeIOS]);

  useEffect(() => {
    if (!nativeIOS) return;
    if (detail !== null) {
      // One sheet at a time: the web detail owns the screen while it is open.
      void dismissNativeIOSSettings();
      return;
    }
    let disposed = false;
    void presentNativeIOSSettings(snapshotRef.current)
      .then(({ active }) => {
        if (!disposed) setNativeActive(active);
      })
      .catch(() => {
        if (!disposed) setNativeActive(false);
      });
    return () => {
      disposed = true;
    };
  }, [detail, nativeIOS, snapshotKey]);

  const detailTitle = detail === 'data'
    ? 'Your data'
    : detail === 'cadence'
      ? 'Cadence suggestions'
      : 'Settings';
  const closeSheet = detail === null ? onClose : () => setDetail(null);
  const showSection = (id: string) =>
    detail === null || detail === id || (detail === 'cadence' && id === 'durations');

  const cadenceControls = (
    <div className="set-block cadence-presets">
      <span className="set-label">
        Your cadence ladder
        <span className="set-sub">
          learned from your local focus history · refreshed no more than weekly
        </span>
      </span>
      <div className="cadence-learned-card">
        <strong>{learnedCadence.text}</strong>
        <span>{learnedCadence.because}</span>
        <div className="cadence-ladder" aria-label="Personal cadence ladder">
          {(['shorter', 'current', 'longer'] as const).map((slot) => {
            const rung = learnedCadence.rungs[slot];
            return (
              <span
                key={slot}
                aria-label={`${slot}: ${rung.focusMin} minutes focus, ${rung.breakMin} minutes break`}
              >
                {rung.focusMin}/{rung.breakMin}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          className="cadence-apply"
          onClick={() => applyCadence(learnedCadence.preset)}
          disabled={
            currentCadence.focusMin === learnedCadence.preset.focusMin &&
            currentCadence.breakMin === learnedCadence.preset.breakMin
          }
        >
          {currentCadence.focusMin === learnedCadence.preset.focusMin &&
          currentCadence.breakMin === learnedCadence.preset.breakMin
            ? `${learnedCadence.preset.focusMin}/${learnedCadence.preset.breakMin} is set ♡`
            : `try ${learnedCadence.preset.focusMin}/${learnedCadence.preset.breakMin} ♡`}
        </button>
      </div>
      {personalCadence.history.length > 0 && (
        <div className="cadence-history">
          <span className="set-sub">previous rungs · one tap back</span>
          <div className="cadence-history-list">
            {[...personalCadence.history].reverse().map((pair) => (
              <button
                type="button"
                key={`${pair.focusMin}-${pair.breakMin}`}
                onClick={() => onApplyCadence(pair)}
                aria-label={`Return to ${pair.focusMin} minutes focus and ${pair.breakMin} minutes break`}
              >
                {pair.focusMin}/{pair.breakMin}
              </button>
            ))}
          </div>
        </div>
      )}
      <span className="set-sub cadence-manual-label">or choose a starting pair yourself</span>
      <div className="cadence-preset-grid" aria-label="Timer cadence presets">
        {CADENCE_PRESETS.map((preset) => {
          const active =
            settings.durations.focus === preset.focusMin * 60 &&
            settings.durations.short === preset.breakMin * 60;
          return (
            <button
              key={preset.id}
              className={`cadence-preset${active ? ' on' : ''}`}
              onClick={() => applyCadence(preset)}
              aria-pressed={active}
              aria-label={`${preset.focusMin} minutes focus, ${preset.breakMin} minutes break${active ? ', currently set' : ''}`}
            >
              <span>{preset.label}</span>
              <small>work / break</small>
            </button>
          );
        })}
      </div>
    </div>
  );

  // The native sheet is the whole Settings UI while it is up; rendering the web
  // one behind it would duplicate every control and every VoiceOver target.
  if (nativeIOS && nativeActive !== false && detail === null) return null;

  return (
    <>
      <Sheet title={detailTitle} onRequestClose={closeSheet}>
        <SettingSection title="You" defaultOpen hidden={!showSection('you')}>
        <div className="set-row">
          <span className="set-label">Your name</span>
          <input
            className="name-input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value.slice(0, 20))}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setNameDraft(settings.name);
              }
            }}
            placeholder="your name"
            aria-label="Your name"
          />
        </div>

        <div className="set-block chronotype-setting">
          <span className="set-label">
            When are you usually sharpest?
            <span className="set-sub">a gentle first guess — your finished sessions help refine it</span>
          </span>
          <div className="chronotype-options" aria-label="When are you usually sharpest?">
            {CHRONOTYPE_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={`chronotype-choice${settings.chronotype === choice.value ? ' on' : ''}`}
                aria-pressed={settings.chronotype === choice.value}
                onClick={() => onPatch({ chronotype: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        </SettingSection>

        <SettingSection
          title={detail === 'cadence' ? 'Cadence suggestions' : 'Timer lengths'}
          defaultOpen
          hidden={!showSection('durations')}
        >
        {detail !== 'cadence' && DURATION_ROWS.map((row) => {
          const mins = Math.round(settings.durations[row.key] / 60);
          return (
            <div className="set-row" key={row.key}>
              <span className="set-label">{row.label}</span>
              <div className="stepper">
                <button
                  className="step-btn"
                  onClick={() => bump(row.key, -1, row)}
                  disabled={mins <= row.min}
                  aria-label={`Decrease ${row.label}`}
                >
                  &minus;
                </button>
                <span className="step-val">{mins} min</span>
                <button
                  className="step-btn"
                  onClick={() => bump(row.key, 1, row)}
                  disabled={mins >= row.max}
                  aria-label={`Increase ${row.label}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        {detail === 'cadence' ? cadenceControls : (
          <>
            <button
              type="button"
              className="cadence-disclosure"
              aria-expanded={cadenceOpen}
              aria-controls="cadence-settings-detail"
              onClick={() => setCadenceOpen((open) => !open)}
            >
              <span>
                <strong>Cadence suggestions</strong>
                <small>optional ideas from your local focus history</small>
              </span>
            </button>
            {cadenceOpen && (
              <div id="cadence-settings-detail" className="cadence-detail-panel">
                {cadenceControls}
              </div>
            )}
          </>
        )}

        </SettingSection>

        <SettingSection title="Sessions" hidden={!showSection('sessions')}>
        <div className="set-row">
          <span className="set-label">Auto-start next</span>
          <SystemSwitch
            nativeId="settings.autoStart"
            checked={settings.autoStart}
            label="Auto-start next timer"
            onChange={(checked) => onPatch({ autoStart: checked })}
          />
        </div>

        <div className="set-row">
          <span className="set-label">
            Environment reset
            <span className="set-sub">an optional 15–30 second tidy-up before a session</span>
          </span>
          <SystemSwitch
            nativeId="ritual.enabled"
            checked={ritual.enabled}
            label="Environment reset ritual"
            onChange={(enabled) => onPatchRitual({ enabled })}
          />
        </div>

        {ritual.enabled && (
          <div className="ritual-subs">
            <div className="ritual-edit-note">Edit the little checks to fit your space.</div>
            {ritual.items.map((item) => (
              <RitualItemEditor
                key={item.id}
                id={item.id}
                text={item.text}
                onCommit={onUpdateRitualItem}
              />
            ))}
            <div className="ritual-edit-note">You can skip the reset whenever you like.</div>
          </div>
        )}

        <div className="set-row">
          <span className="set-label">
            Flow timer
            <span className="set-sub">{words.flowSubtitle}</span>
          </span>
          <SystemSwitch
            nativeId="settings.flow"
            checked={settings.flow}
            label="Flow timer"
            onChange={(flow) => onPatch({ flow })}
          />
        </div>
        {/* Ambient sounds were removed in PLAN 12.1. The disclosed completion
            cue remains with the other session behavior instead of keeping a
            one-row Sound section. */}
        <div className="set-row">
          <span className="set-label">
            Ring when done
            <span className="set-sub">a gentle chime at session end</span>
          </span>
          <SystemSwitch
            nativeId="settings.sound"
            checked={settings.sound}
            label="Ring when done"
            onChange={(sound) => {
              if (sound !== settings.sound) void toggleRing();
            }}
          />
        </div>

        {liveActivityStatus && (
          <div className="set-note live-activity-note">
            <strong>Live Activity</strong>
            <span>
              Focus and Tiny can show their mode and time remaining on the Lock Screen and, on
              supported iPhones, the Dynamic Island. Task text never appears, and no Bloom server
              is involved.
            </span>
            {liveActivityChecking ? (
              <span role="status">Checking your iOS Live Activity setting…</span>
            ) : !liveActivityStatus.supported ? (
              <span role="status">
                Live Activities aren’t available on this iOS version. Your timer still works
                normally.
              </span>
            ) : !liveActivityStatus.enabled ? (
              <span role="status">
                Live Activities are off in iOS Settings. Your timer still works normally.
              </span>
            ) : (
              <span>Live Activities follow your iOS Settings and work without internet access.</span>
            )}
            {!liveActivityChecking &&
              liveActivityStatus.supported &&
              !liveActivityStatus.enabled && (
                <button
                  className="mini-btn"
                  type="button"
                  onClick={() => void openNativeIOSAppSettings()}
                >
                  open iOS Settings for Live Activities
                </button>
              )}
          </div>
        )}

        {notifyDenied && (
          <div className="set-note">
            Notifications are blocked for Bloom right now, so the end-of-session notice can’t
            appear. You can allow them in your browser or app settings whenever you like.
          </div>
        )}
        {settings.sound && completionAlertStatus.permission === 'prompt' && (
          <div className="set-note">
            <span>
              Bloom can chime while it’s open. Allow notifications so iOS can deliver a timer alert
              while Bloom is in the background or your device is locked. Silent Mode, Focus, and
              your notification settings still apply.
            </span>
            <button
              className="mini-btn completion-alert-permission"
              type="button"
              onClick={() => void onRequestCompletionAlertPermission()}
            >
              allow notifications
            </button>
          </div>
        )}
        {settings.sound && completionAlertStatus.permission === 'denied' && (
          <div className="set-note">
            <span role="status">
              Timer alerts are off in iOS Settings. Bloom can still chime while it’s open.
            </span>
            <button
              className="mini-btn"
              type="button"
              onClick={() => void openNativeIOSAppSettings()}
            >
              open iOS Settings for timer alerts
            </button>
          </div>
        )}
        {settings.sound && completionAlertStatus.permission === 'unavailable' && (
          <div className="set-note" role="status">
            Background timer alerts aren’t available right now. Bloom can still chime while it’s
            open.
          </div>
        )}
        {settings.sound &&
          completionAlertStatus.permission === 'granted' &&
          (!completionAlertStatus.alertsEnabled ||
            !completionAlertStatus.soundsEnabled ||
            !completionAlertStatus.lockScreenEnabled) && (
            <div className="set-note">
              <span role="status">
                One or more iOS notification options are off. Bloom can still chime while it’s
                open; you can adjust banners, sound, and Lock Screen alerts in iOS Settings.
              </span>
              <button
                className="mini-btn"
                type="button"
                onClick={() => void openNativeIOSAppSettings()}
              >
                open iOS Settings for timer alerts
              </button>
            </div>
          )}
        </SettingSection>

        <SettingSection title="Your day" hidden={!showSection('day')}>
        <fieldset className="set-block day-boundary-setting">
          <legend className="set-label">When does your day roll over?</legend>
          <span className="set-sub">
            Sessions finished before this time belong to the previous study day. Their timestamps
            stay unchanged.
          </span>
          <div className="day-boundary-presets" aria-label="Study day rollover presets">
            {DAY_BOUNDARY_PRESETS.map((hour) => (
              <button
                type="button"
                key={hour}
                className={settings.dayStartHour === hour ? 'on' : ''}
                aria-pressed={settings.dayStartHour === hour}
                onClick={() => onPatch({ dayStartHour: hour })}
              >
                {clockHourLabel(hour)}
              </button>
            ))}
          </div>
          <label className="day-boundary-custom">
            <span>Custom hour</span>
            <select
              value={settings.dayStartHour}
              onChange={(event) => onPatch({ dayStartHour: Number(event.target.value) })}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {clockHourLabel(hour)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <div className="set-row">
          <span className="set-label">
            Daily foundations
            <span className="set-sub">
              keep up to three tiny daily actions beside your finished-session marker
            </span>
          </span>
          <SystemSwitch
            nativeId="settings.foundations"
            checked={settings.foundations}
            label="Daily foundations"
            onChange={(foundations) => onPatch({ foundations })}
          />
        </div>

        <div className="set-row">
          <span className="set-label">
            Goals &amp; deadlines
            <span className="set-sub">
              plan an exam, a project or any goal with a date — log parts as you finish and see
              the pace that lands it
            </span>
          </span>
          <SystemSwitch
            nativeId="settings.planner"
            checked={settings.planner}
            label="Goals and deadlines"
            onChange={(planner) => onPatch({ planner })}
          />
        </div>
        {settings.planner && (
          <label className="set-row goal-credit-setting">
            <span className="set-label">
              Credit linked work
              <span className="set-sub">
                choose whether a finished linked task or session can log one goal part
              </span>
            </span>
            <select
              className="set-select"
              value={settings.goalCredit}
              onChange={(event) =>
                onPatch({ goalCredit: event.target.value as Settings['goalCredit'] })
              }
              aria-label="Goal credit after linked work"
            >
              <option value="off">keep manual</option>
              <option value="ask">ask each time</option>
              <option value="auto">add automatically</option>
            </select>
          </label>
        )}

        {/* Gentle streak (PLAN 5.4) — explains the rest-day rule where the
            user can read it; the streak is a mirror, never a chain to guard. */}
        <div className="set-note">
          <strong>Gentle streak</strong>
          <span>
            Your streak counts days with a finished session. One rest day each week is free — a
            single quiet day keeps it growing. A longer pause just sets the count aside, and coming
            back always gets a warm welcome. Consistency is a months game.
          </span>
        </div>
        </SettingSection>

        <SettingSection title="Companion" hidden={!showSection('companion')}>
        <div className="set-row">
          <span className="set-label">
            <span className="companion-label">
              Companion mode
              {waving && (
                <PixelPal
                  sprite={friendByName(settings.pal).sprite}
                  mode="celebrate"
                  scale={2}
                  size={44}
                  className="companion-wave"
                />
              )}
            </span>
            <span className="set-sub">
              your pet gently checks in and helps you understand your focus patterns
            </span>
          </span>
          <SystemSwitch
            nativeId="settings.companion"
            checked={companion.on}
            label="Companion mode"
            onChange={(enabled) => {
              if (enabled !== companion.on) toggleCompanion();
            }}
          />
        </div>

        <div className="set-block">
          <div className="set-row">
            <span className="set-label">
              Gentle pre-slump check
              <span className="set-sub">an optional breath or stretch hello during focus</span>
            </span>
            <SystemSwitch
              nativeId="settings.preSlumpCheck"
              checked={settings.preSlumpCheck}
              label="Gentle pre-slump check"
              onChange={(preSlumpCheck) => onPatch({ preSlumpCheck })}
            />
          </div>
          <div className="set-note">
            Based on when your drifts usually start. Once Bloom has enough of your focus history,
            your pet may offer one soft cue shortly beforehand — never more than once a session or
            twice a day. You can silence it for the day from the cue.
          </div>
        </div>

        {companion.on && (
          <div className="companion-subs">
            <div className="set-row">
              <span className="set-label">Check in every</span>
              <div className="stepper">
                <button
                  className="step-btn"
                  onClick={() =>
                    onPatch({
                      companion: {
                        ...companion,
                        checkinMins: stepChoice(CHECKIN_CHOICES, companion.checkinMins, -1),
                      },
                    })
                  }
                  disabled={companion.checkinMins <= CHECKIN_CHOICES[0]}
                  aria-label="Decrease check-in interval"
                >
                  &minus;
                </button>
                <span className="step-val">{companion.checkinMins} min</span>
                <button
                  className="step-btn"
                  onClick={() =>
                    onPatch({
                      companion: {
                        ...companion,
                        checkinMins: stepChoice(CHECKIN_CHOICES, companion.checkinMins, 1),
                      },
                    })
                  }
                  disabled={companion.checkinMins >= CHECKIN_CHOICES[CHECKIN_CHOICES.length - 1]}
                  aria-label="Increase check-in interval"
                >
                  +
                </button>
              </div>
            </div>

            <div className="set-row">
              <span className="set-label">
                {words.awayToggleTitle}
                <span className="set-sub">a soft hello when you come back</span>
              </span>
              <SystemSwitch
                nativeId="settings.companion.tabDetect"
                checked={companion.tabDetect}
                label={words.awayToggleTitle}
                onChange={(tabDetect) => onPatch({ companion: { ...companion, tabDetect } })}
              />
            </div>

            {companion.tabDetect && (
              <div className="set-row">
                <span className="set-label">Away counts after</span>
                <div className="stepper">
                  <button
                    className="step-btn"
                    onClick={() =>
                      onPatch({
                        companion: {
                          ...companion,
                          awaySecs: stepChoice(AWAY_CHOICES, companion.awaySecs, -1),
                        },
                      })
                    }
                    disabled={companion.awaySecs <= AWAY_CHOICES[0]}
                    aria-label="Decrease away threshold"
                  >
                    &minus;
                  </button>
                  <span className="step-val">{companion.awaySecs} s</span>
                  <button
                    className="step-btn"
                    onClick={() =>
                      onPatch({
                        companion: {
                          ...companion,
                          awaySecs: stepChoice(AWAY_CHOICES, companion.awaySecs, 1),
                        },
                      })
                    }
                    disabled={companion.awaySecs >= AWAY_CHOICES[AWAY_CHOICES.length - 1]}
                    aria-label="Increase away threshold"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <div className="set-row">
              <span className="set-label">
                Quiet mode
                <span className="set-sub">log patterns silently, never ask</span>
              </span>
              <SystemSwitch
                nativeId="settings.companion.quiet"
                checked={companion.quiet}
                label="Quiet mode"
                onChange={(quiet) => onPatch({ companion: { ...companion, quiet } })}
              />
            </div>

            <div className="set-row">
              <span className="set-label">
                Session intention
                <span className="set-sub">one small “what will you do?” before you start</span>
              </span>
              <SystemSwitch
                nativeId="settings.companion.intention"
                checked={companion.intention}
                label="Session intention"
                onChange={(intention) =>
                  onPatch({ companion: { ...companion, intention } })
                }
              />
            </div>
          </div>
        )}
        </SettingSection>

        <SettingSection title="Appearance" hidden={!showSection('appearance')}>
        <div className="set-block appearance-setting">
          <span className="set-label">
            Sky
            <span className="set-sub">choose a sky or match this device</span>
          </span>
          <div className="appearance-options" aria-label="Sky appearance">
            {APPEARANCE_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={`appearance-choice${settings.appearance === choice.value ? ' on' : ''}`}
                aria-pressed={settings.appearance === choice.value}
                onClick={() => onPatch({ appearance: choice.value })}
              >
                <span>{choice.label}</span>
                <small>{choice.description}</small>
              </button>
            ))}
          </div>
        </div>
        </SettingSection>

        <SettingSection title="Your data" defaultOpen={detail === 'data'} hidden={!showSection('data')}>
        <div className="set-block data-transfer">
          <span className="set-label">
            Backup &amp; transfer
            <span className="set-sub">
              download a complete local backup, or a spreadsheet of session records
            </span>
          </span>
          <div className="data-export-actions">
            <button className="mini-btn" type="button" onClick={exportJson}>
              export JSON backup
            </button>
            <button className="mini-btn" type="button" onClick={exportCsv}>
              export sessions CSV
            </button>
          </div>
          <label className={`data-import-picker${running || hasOpenSession ? ' disabled' : ''}`}>
            <span>choose a JSON backup to import</span>
            <input
              type="file"
              accept="application/json,.json"
              disabled={
                running ||
                hasOpenSession ||
                importState.kind === 'reading' ||
                importState.kind === 'saving'
              }
              onChange={(event) => {
                void chooseImport(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {(running || hasOpenSession) && (
            <span className="set-sub">finish or reset the open timer before importing</span>
          )}

          <div className="data-import-status" role="status" aria-live="polite">
            {importState.kind === 'reading' && (
              <>
                <span>
                  reading {importState.fileName} · {importState.percent}%
                </span>
                <progress value={importState.percent} max={100}>
                  {importState.percent}%
                </progress>
                <button className="mini-btn" type="button" onClick={cancelImport}>
                  cancel
                </button>
              </>
            )}
            {importState.kind === 'ready' && (
              <>
                <strong>Ready to review</strong>
                <span>
                  This backup has {importState.prepared.preview.sessions} sessions,{' '}
                  {importState.prepared.preview.tasks} tasks,{' '}
                  {importState.prepared.preview.goals} goals, and{' '}
                  {importState.prepared.preview.companionMoments} Companion moments.
                </span>
                <span className="set-sub">
                  Bloom will merge stable records, keep current device preferences, and save a
                  safety backup first.
                </span>
                <div className="data-import-actions">
                  <button
                    className="mini-btn"
                    type="button"
                    onClick={() => saveImport(importState.prepared, importState.fileName)}
                  >
                    merge this backup
                  </button>
                  <button className="mini-btn focus-clear-keep" type="button" onClick={cancelImport}>
                    keep current data
                  </button>
                </div>
              </>
            )}
            {importState.kind === 'saving' && (
              <span>saving the safety backup and imported records…</span>
            )}
            {importState.kind === 'success' && (
              <>
                <strong>Backup merged ♡</strong>
                <span>Your sessions, tasks, goals, and Companion moments are ready.</span>
                {importState.safetyBackup && (
                  <button
                    className="mini-btn"
                    type="button"
                    onClick={() =>
                      downloadText(
                        importState.safetyBackup!,
                        'bloom-before-import.json',
                        'application/json',
                      )
                    }
                  >
                    download safety backup
                  </button>
                )}
              </>
            )}
            {importState.kind === 'error' && (
              <>
                <strong>
                  {importState.recoveryRequired ? 'Recovery backup ready' : 'Nothing changed'}
                </strong>
                <span>{importState.message}</span>
                <div className="data-import-actions">
                  {importState.recoveryBackup ? (
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() =>
                        downloadText(
                          importState.recoveryBackup!,
                          'bloom-import-recovery.json',
                          'application/json',
                        )
                      }
                    >
                      download recovery backup
                    </button>
                  ) : (
                    <button className="mini-btn" type="button" onClick={exportJson}>
                      export current data
                    </button>
                  )}
                  <button className="mini-btn focus-clear-keep" type="button" onClick={cancelImport}>
                    choose another file
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {onShowWeekly && (
          <div className="set-row">
            <span className="set-label">
              Weekly review
              <span className="set-sub">
                {running
                  ? 'available when the current timer stops'
                  : 'appears once a week, or opens here anytime'}
              </span>
            </span>
            <button
              className="mini-btn"
              onClick={onShowWeekly}
              disabled={running}
              title={running ? 'Stop or pause the timer to open the weekly review' : undefined}
            >
              see this week
            </button>
          </div>
        )}

        <div className="set-row">
          <span className="set-label">
            Focus history
            <span className="set-sub">
              {clearedNote
                ? 'reflection history cleared ♡'
                : `${records.length} session${records.length === 1 ? '' : 's'} · ${eventCount} Companion moment${eventCount === 1 ? '' : 's'} · on this device`}
            </span>
          </span>
          {!clearedNote && (
            <button
              className="mini-btn"
              onClick={() => setShowClearScope((open) => !open)}
              disabled={running || hasOpenSession}
              aria-expanded={showClearScope}
              aria-controls="focus-clear-scope"
              title={
                running || hasOpenSession
                  ? 'Finish or reset the current timer before clearing its history'
                  : undefined
              }
            >
              review clear scope
            </button>
          )}
        </div>

        {showClearScope && !clearedNote && (
          <div className="focus-clear-scope" id="focus-clear-scope" role="region" aria-label="Focus history clear scope">
            <p>
              <strong>Removes:</strong> completed, interrupted, and stopped session records;
              Companion check-ins and {words.awayMomentsScope}; and the learned cadence suggestion built
              from them.
            </p>
            <p>
              <strong>Keeps:</strong> your bloom total, streak, friend XP, task completions and
              cherries, goal progress, current cadence settings, saved plans, parking lot, and
              Field Guide reads.
            </p>
            <div className="focus-clear-actions">
              <button className="mini-btn" type="button" onClick={() => setClearConfirmOpen(true)}>
                clear reflection history
              </button>
              <button className="mini-btn focus-clear-keep" type="button" onClick={() => setShowClearScope(false)}>
                keep it
              </button>
            </div>
          </div>
        )}
        </SettingSection>

        <button
          className="sheet-done"
          onClick={closeSheet}
        >
          done
        </button>
      </Sheet>
      {clearConfirmOpen && (
        <Dialog
          title="Clear reflection history?"
          description={`${records.length} session record${records.length === 1 ? '' : 's'} and ${eventCount} Companion moment${eventCount === 1 ? '' : 's'} will be removed from this device. Your bloom total, streak, friend XP, task cherries, and goal progress stay.`}
          onRequestClose={() => setClearConfirmOpen(false)}
        >
          <div className="dialog-actions">
            <button type="button" className="dialog-danger" onClick={clearFocusData}>
              clear reflection history
            </button>
            <button type="button" className="dialog-keep" onClick={() => setClearConfirmOpen(false)}>
              keep it
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
