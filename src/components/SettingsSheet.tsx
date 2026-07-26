import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DurationMode, PersistedShape, Settings } from '../store/useBloom';
import { audioEngine, BG_SOUNDS, requestNotifyPermission, type BgSound } from '../engine/audio';
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
import { Dialog } from './Dialog';
import { Sheet } from './Sheet';
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

interface SettingsSheetProps {
  settings: Settings;
  records: SessionRecord[];
  personalCadence: PersonalCadenceMemory;
  /** Store-owned day signal; cadence computation captures its own instant. */
  now: number;
  /** Whether a session is currently running (previews only fire when idle). */
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

function clockHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function SettingSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
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
  onShowWeekly,
}: SettingsSheetProps) {
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
      // Staleness and recommendation share this exact computation instant.
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

  function commitName() {
    const next = nameDraft.trim().slice(0, 20);
    if (!next) {
      setNameDraft(settings.name);
      return;
    }
    setNameDraft(next);
    if (next !== settings.name) onPatch({ name: next });
  }

  async function toggleRing() {
    const next = !settings.sound;
    onPatch({ sound: next });
    if (next) {
      // Enabling the ring: unlock audio + ask for permission to also notify.
      audioEngine.resume();
      audioEngine.playRing();
      const ok = await requestNotifyPermission();
      setNotifyDenied(!ok && typeof Notification !== 'undefined' && Notification.permission === 'denied');
    }
  }

  function pickBg(kind: BgSound) {
    // The picker is an explicit user gesture. No effect or hydration path is
    // allowed to unlock audio on its own (PLAN 4.3).
    audioEngine.resume();
    onPatch({ bgSound: kind });
    // While a session runs the store live-switches ambience; when idle, play a
    // short taste so the choice can be heard.
    if (!running) audioEngine.previewAmbience(kind);
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

  function cancelImport() {
    importController.current?.abort();
    importController.current = null;
    setImportState({ kind: 'idle' });
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

  function closeSettings() {
    // Kill any lingering preview; a running session's ambience is owned by
    // the store and will be re-asserted, so only stop when idle.
    if (!running) audioEngine.stopAmbience();
    onClose();
  }

  return (
    <>
      <Sheet title="Settings" onRequestClose={closeSettings}>
        <SettingSection title="Identity" defaultOpen>
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

        <SettingSection title="Timer" defaultOpen>
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

        {DURATION_ROWS.map((row) => {
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
          <span className="set-label">Auto-start next</span>
          <button
            className={`switch${settings.autoStart ? ' on' : ''}`}
            onClick={() => onPatch({ autoStart: !settings.autoStart })}
            role="switch"
            aria-checked={settings.autoStart}
            aria-label="Auto-start next timer"
          >
            <span className="knob" />
          </button>
        </div>

        {/* Gentle streak (PLAN 5.4) — explains the rest-day rule where the
            user can read it; the streak is a mirror, never a chain to guard. */}
        <div className="set-block">
          <span className="set-label">
            Gentle streak
            <span className="set-sub">
              your streak counts days with a finished session. one rest day each week is free —
              a single quiet day keeps it growing. a longer pause just sets the count aside,
              and coming back always gets a warm welcome. consistency is a months game.
            </span>
          </span>
        </div>

        <div className="set-row">
          <span className="set-label">
            Environment reset
            <span className="set-sub">an optional 15–30 second tidy-up before a session</span>
          </span>
          <button
            className={`switch${ritual.enabled ? ' on' : ''}`}
            onClick={() => onPatchRitual({ enabled: !ritual.enabled })}
            role="switch"
            aria-checked={ritual.enabled}
            aria-label="Environment reset ritual"
          >
            <span className="knob" />
          </button>
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
            <span className="set-sub">
              a count-up stopwatch tab — ride the focus as long as it flows, no ticking deadline
            </span>
          </span>
          <button
            className={`switch${settings.flow ? ' on' : ''}`}
            onClick={() => onPatch({ flow: !settings.flow })}
            role="switch"
            aria-checked={settings.flow}
            aria-label="Flow timer"
          >
            <span className="knob" />
          </button>
        </div>
        </SettingSection>

        <SettingSection title="Sound">
        <div className="set-row">
          <span className="set-label">
            Ring when done
            <span className="set-sub">a gentle chime at session end</span>
          </span>
          <button
            className={`switch${settings.sound ? ' on' : ''}`}
            onClick={toggleRing}
            role="switch"
            aria-checked={settings.sound}
            aria-label="Ring when done"
          >
            <span className="knob" />
          </button>
        </div>

        {notifyDenied && (
          <div className="set-note">
            Notifications are blocked, so the ring will only sound while the app is open. Enable
            notifications in your browser/app settings to be alerted in the background.
          </div>
        )}

        <div className="set-block">
          <span className="set-label">
            Background sound
            <span className="set-sub">optional · starts only after you choose or begin a session</span>
          </span>
          <div className="bg-grid">
            {BG_SOUNDS.map((s) => (
              <button
                key={s.key}
                className={`bg-opt${settings.bgSound === s.key ? ' on' : ''}`}
                onClick={() => pickBg(s.key)}
                aria-pressed={settings.bgSound === s.key}
              >
                <span className="bg-opt-label">{s.label}</span>
                <span className="bg-opt-hint">{s.hint}</span>
              </button>
            ))}
          </div>
          <div className="set-note sound-focus-note">
            <strong>Sound &amp; focus</strong>
            <span>
              Sound works differently by task and person. Bloom’s sounds have no lyrics; lyrics in
              your own music can make reading and writing harder.
            </span>
            {/* Step 6.3 activates this as a deep-link to the bundled Field Guide article. */}
            <button className="sound-guide-link" type="button" disabled>
              music &amp; focus guide · coming with the Field Guide
            </button>
          </div>
        </div>
        </SettingSection>

        <SettingSection title="Theme">
        <div className="set-row">
          <span className="set-label">
            Night sky
            <span className="set-sub">cozy dark mode with stars &amp; meteors</span>
          </span>
          <button
            className={`switch${settings.night ? ' on' : ''}`}
            onClick={() => onPatch({ night: !settings.night })}
            role="switch"
            aria-checked={settings.night}
            aria-label="Night sky theme"
          >
            <span className="knob" />
          </button>
        </div>
        </SettingSection>

        <SettingSection title="Planner">
        <div className="set-row">
          <span className="set-label">
            Goals &amp; deadlines
            <span className="set-sub">
              plan an exam, a project or any goal with a date — log parts as you finish and see
              the pace that lands it
            </span>
          </span>
          <button
            className={`switch${settings.planner ? ' on' : ''}`}
            onClick={() => onPatch({ planner: !settings.planner })}
            role="switch"
            aria-checked={settings.planner}
            aria-label="Goals and deadlines"
          >
            <span className="knob" />
          </button>
        </div>
        </SettingSection>

        <SettingSection title="Companion">
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
          <button
            className={`switch${companion.on ? ' on' : ''}`}
            onClick={toggleCompanion}
            role="switch"
            aria-checked={companion.on}
            aria-label="Companion mode"
          >
            <span className="knob" />
          </button>
        </div>

        <div className="set-block">
          <div className="set-row">
            <span className="set-label">
              Gentle pre-slump check
              <span className="set-sub">an optional breath or stretch hello during focus</span>
            </span>
            <button
              className={`switch${settings.preSlumpCheck ? ' on' : ''}`}
              onClick={() => onPatch({ preSlumpCheck: !settings.preSlumpCheck })}
              role="switch"
              aria-checked={settings.preSlumpCheck}
              aria-label="Gentle pre-slump check"
            >
              <span className="knob" />
            </button>
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
                Notice tab switches
                <span className="set-sub">a soft hello when you come back</span>
              </span>
              <button
                className={`switch${companion.tabDetect ? ' on' : ''}`}
                onClick={() => onPatch({ companion: { ...companion, tabDetect: !companion.tabDetect } })}
                role="switch"
                aria-checked={companion.tabDetect}
                aria-label="Notice tab switches"
              >
                <span className="knob" />
              </button>
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
              <button
                className={`switch${companion.quiet ? ' on' : ''}`}
                onClick={() => onPatch({ companion: { ...companion, quiet: !companion.quiet } })}
                role="switch"
                aria-checked={companion.quiet}
                aria-label="Quiet mode"
              >
                <span className="knob" />
              </button>
            </div>

            <div className="set-row">
              <span className="set-label">
                Session intention
                <span className="set-sub">one small “what will you do?” before you start</span>
              </span>
              <button
                className={`switch${companion.intention ? ' on' : ''}`}
                onClick={() =>
                  onPatch({ companion: { ...companion, intention: !companion.intention } })
                }
                role="switch"
                aria-checked={companion.intention}
                aria-label="Session intention"
              >
                <span className="knob" />
              </button>
            </div>
          </div>
        )}
        </SettingSection>

        <SettingSection title="Data">
        <div className="set-block data-transfer">
          <span className="set-label">
            Your data
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
              Companion check-ins and tab-away moments; and the learned cadence suggestion built
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
          onClick={closeSettings}
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
