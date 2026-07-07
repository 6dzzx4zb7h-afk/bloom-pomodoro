import { useEffect, useRef, useState } from 'react';
import type { DurationMode, Settings } from '../store/useBloom';
import { audioEngine, BG_SOUNDS, requestNotifyPermission, type BgSound } from '../engine/audio';
import { AWAY_CHOICES, CHECKIN_CHOICES, clearEvents, loadEvents } from '../store/companion';
import { friendByName } from '../data/friends';
import { PixelPal } from './PixelPal';

interface SettingsSheetProps {
  settings: Settings;
  /** Whether a session is currently running (previews only fire when idle). */
  running: boolean;
  onPatch: (patch: Partial<Settings>) => void;
  onClose: () => void;
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

export function SettingsSheet({ settings, running, onPatch, onClose }: SettingsSheetProps) {
  // 'unknown' until asked; used to nudge the user if they blocked notifications.
  const [notifyDenied, setNotifyDenied] = useState(false);
  const companion = settings.companion;
  // The pal gives a happy little wave when Companion Mode turns on.
  const [waving, setWaving] = useState(false);
  const waveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [eventCount, setEventCount] = useState(() => loadEvents().length);
  const [clearedNote, setClearedNote] = useState(false);
  useEffect(
    () => () => {
      if (waveTimer.current) clearTimeout(waveTimer.current);
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
    onPatch({ bgSound: kind });
    // While a session runs the store live-switches ambience; when idle, play a
    // short taste so the choice can be heard.
    if (!running) audioEngine.previewAmbience(kind);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="sheet-grip" />
        <div className="sheet-title">Settings</div>

        <div className="set-row">
          <span className="set-label">Your name</span>
          <input
            className="name-input"
            value={settings.name}
            onChange={(e) => onPatch({ name: e.target.value.slice(0, 20) })}
            placeholder="your name"
            aria-label="Your name"
          />
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
            <span className="set-sub">plays while a session runs</span>
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
        </div>

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

        <div className="set-row">
          <span className="set-label">
            Goals &amp; deadlines
            <span className="set-sub">
              plan a semester, exam or any deadline — log parts as you finish and see the pace
              that lands it
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

        {(eventCount > 0 || clearedNote) && (
          <div className="set-row">
            <span className="set-label">
              Focus data
              <span className="set-sub">
                {clearedNote
                  ? 'cleared ♡'
                  : `${eventCount} moment${eventCount === 1 ? '' : 's'} · stays on this device`}
              </span>
            </span>
            {!clearedNote && (
              <button
                className="mini-btn"
                onClick={() => {
                  clearEvents();
                  setEventCount(0);
                  setClearedNote(true);
                }}
              >
                clear my focus data
              </button>
            )}
          </div>
        )}

        <button
          className="sheet-done"
          onClick={() => {
            // Kill any lingering preview; a running session's ambience is owned
            // by the store and will be re-asserted, so only stop when idle.
            if (!running) audioEngine.stopAmbience();
            onClose();
          }}
        >
          done
        </button>
      </div>
    </div>
  );
}
