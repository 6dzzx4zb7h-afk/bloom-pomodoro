import type { Settings, TimerMode } from '../store/useBloom';

interface SettingsSheetProps {
  settings: Settings;
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

export function SettingsSheet({ settings, onPatch, onClose }: SettingsSheetProps) {
  function bump(key: TimerMode, dir: 1 | -1, spec: DurationRowSpec) {
    const mins = Math.round(settings.durations[key] / 60) + dir * spec.step;
    const clamped = Math.max(spec.min, Math.min(spec.max, mins));
    onPatch({ durations: { ...settings.durations, [key]: clamped * 60 } });
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
          <span className="set-label">Sound</span>
          <button
            className={`switch${settings.sound ? ' on' : ''}`}
            onClick={() => onPatch({ sound: !settings.sound })}
            role="switch"
            aria-checked={settings.sound}
            aria-label="Sound"
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

        <button className="sheet-done" onClick={onClose}>
          done
        </button>
      </div>
    </div>
  );
}
