import { useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import { SettingsSheet } from '../components/SettingsSheet';
import type { useBloom } from '../store/useBloom';
import type { TimerMode } from '../store/useBloom';

const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;
const MODE_IDX: Record<TimerMode, number> = { focus: 0, short: 1, long: 2 };

export function FocusScreen({ bloom }: { bloom: ReturnType<typeof useBloom> }) {
  const { state, mood, statusLabel, palSprite, activeTask, actions, mmss } = bloom;
  const [showSettings, setShowSettings] = useState(false);

  const total = state.settings.durations[state.mode] || 1;
  const ringOffset = RING_C * (1 - state.remaining / total);
  const idx = MODE_IDX[state.mode];

  // Session dots: progress through the current cycle of 4. All four stay lit
  // through the celebrate + long-break stretch, then reset for the next cycle.
  const cyc = state.sessions % 4;
  const filled =
    cyc === 0 && state.sessions > 0 && (state.justDone || state.mode !== 'focus') ? 4 : cyc;

  return (
    <div className="screen focus-bg">
      <div className="greeting-row">
        <div>
          <div className="greeting">Hi, {state.settings.name}</div>
          <div className="status-label">{statusLabel}</div>
        </div>
        <div className="greeting-side">
          <div className="streak-chip">
            <span className="streak-dot" />
            <span className="streak-num">{state.streak}</span>
            <span className="streak-unit">days</span>
          </div>
          <button className="gear-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
            &#9881;
          </button>
        </div>
      </div>

      <div className="tabs">
        <div className="tabs-pill" style={{ transform: `translateX(${idx * 100}%)` }} />
        <div className="tabs-inner">
          <button className="tab-btn" aria-pressed={state.mode === 'focus'} onClick={() => actions.pick('focus')}>
            Focus
          </button>
          <button className="tab-btn" aria-pressed={state.mode === 'short'} onClick={() => actions.pick('short')}>
            Short
          </button>
          <button className="tab-btn" aria-pressed={state.mode === 'long'} onClick={() => actions.pick('long')}>
            Long
          </button>
        </div>
      </div>

      <div className="ring-wrap">
        <svg className="ring-svg" width="236" height="236" viewBox="0 0 236 236">
          <defs>
            <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffb0d4" />
              <stop offset="1" stopColor="#c79fe6" />
            </linearGradient>
          </defs>
          <circle cx="118" cy="118" r={RING_R} fill="none" stroke="rgba(183,159,227,.18)" strokeWidth="15" />
          <circle
            cx="118"
            cy="118"
            r={RING_R}
            fill="none"
            stroke="url(#ringgrad)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 118 118)"
            style={{ transition: 'stroke-dashoffset 0.4s linear' }}
          />
        </svg>
        <div className="ring-disc" />
        <div className="ring-shadow" />
        <PixelPal sprite={palSprite} mode={mood} scale={6} size={130} className="ring-animal" />
      </div>

      <div className="readout">
        <div className="readout-time">{mmss(state.remaining)}</div>
      </div>

      <div className="controls">
        <button className="ctrl-round ctrl-reset" onClick={actions.reset} aria-label="Reset">
          &#8634;
        </button>
        <button className="ctrl-play" onClick={actions.toggle} aria-label={state.running ? 'Pause' : 'Start'}>
          {state.running ? (
            <span className="pause-bars">
              <span />
              <span />
            </span>
          ) : (
            <span className="play-tri" />
          )}
        </button>
        <button className="ctrl-round ctrl-skip" onClick={actions.skip} aria-label="Skip">
          &#187;
        </button>
      </div>

      <div className="now-chip">
        <span className="now-badge">&#10003;</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="now-label">Now focusing on</div>
          <div className="now-task">{activeTask ? activeTask.t : 'all done — go play!'}</div>
        </div>
        <div className="session-dots">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className={`sdot ${i < filled ? 'on' : 'off'}`} />
          ))}
        </div>
      </div>

      {showSettings && (
        <SettingsSheet
          settings={state.settings}
          onPatch={actions.patchSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
