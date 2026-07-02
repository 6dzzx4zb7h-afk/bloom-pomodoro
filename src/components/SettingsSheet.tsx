import { useState } from 'react';
import type { Settings, TimerMode } from '../store/useBloom';
import { audioEngine, BG_SOUNDS, requestNotifyPermission, type BgSound } from '../engine/audio';

interface SettingsSheetProps {
  settings: Settings;
  /** Whether a session is currently running (previews only fire when idle). */
  running: boolean;
  onPatch: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

interface DurationRowSpec {
  key: TimerMode;
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

  function bump(key: TimerMode, dir: 1 | -1, spec: DurationRowSpec) {
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
