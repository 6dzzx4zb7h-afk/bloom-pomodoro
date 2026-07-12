import { useEffect, useRef, useState } from 'react';
import { DebriefCard } from '../components/DebriefCard';
import { PixelPal } from '../components/PixelPal';
import { SettingsSheet } from '../components/SettingsSheet';
import { WeeklyReview } from '../components/WeeklyReview';
import { WEEKLY_WINDOW_DAYS, weekKey } from '../insights/weekly';
import type { SessionRecord } from '../store/sessions';
import type { useBloom } from '../store/useBloom';
import type { TimerMode } from '../store/useBloom';
import type { Companion } from '../store/useCompanion';

const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;
const MODE_LABEL: Record<TimerMode, string> = {
  focus: 'Focus',
  flow: 'Flow',
  short: 'Short',
  long: 'Long',
};

export function FocusScreen({
  bloom,
  companion,
}: {
  bloom: ReturnType<typeof useBloom>;
  companion: Companion;
}) {
  const { state, mood, statusLabel, palSprite, activeTask, actions, mmss, clock } = bloom;
  const [showSettings, setShowSettings] = useState(false);

  // Post-session debrief (PLAN 2.1): watch the session log for a record
  // finalized while this screen is up. Seeding the ref with the log's current
  // tail means boot-time 'interrupted' sweeps never trigger a card — only a
  // session the user just ended (completed or abandoned) does.
  const [debrief, setDebrief] = useState<SessionRecord | null>(null);
  const records = state.sessionRecords;
  const lastSeenId = useRef<string | null>(
    records.length ? records[records.length - 1].id : null,
  );
  useEffect(() => {
    const last = records.length ? records[records.length - 1] : null;
    if (!last || last.id === lastSeenId.current) return;
    lastSeenId.current = last.id;
    if (last.outcome === 'completed' || last.outcome === 'abandoned') setDebrief(last);
  }, [records]);
  // Weekly review (PLAN 2.3): auto-surface at most once per calendar week,
  // only while idle, only when the week actually has sessions to reflect on.
  // Settings can open it on demand any time (via onShowWeekly below).
  const [weekly, setWeekly] = useState(false);

  // Never mid-session: a new run sweeps the cards away even without a dismiss.
  useEffect(() => {
    if (state.running) {
      setDebrief(null);
      setWeekly(false);
    }
  }, [state.running]);

  useEffect(() => {
    if (state.running || state.justDone || debrief || weekly || showSettings) return;
    const week = weekKey();
    if (state.lastWeeklyReviewWeek === week) return;
    const cutoff = Date.now() - WEEKLY_WINDOW_DAYS * 86400000;
    if (!records.some((r) => r.endedAt >= cutoff)) return;
    setWeekly(true);
    actions.markWeeklyReview(week);
  }, [state.running, state.justDone, debrief, weekly, showSettings, records, state.lastWeeklyReviewWeek, actions]);

  // Pre-session intention: optional, skippable, only in Companion Mode.
  const wantsIntention =
    companion.enabled && companion.conf.intention && state.mode === 'focus' && !state.justDone;

  const isFlow = state.mode === 'flow';
  const focusLen = state.settings.durations.focus || 1;
  // Flow: `remaining` holds elapsed seconds and the ring fills once per
  // focus-length, lap after lap — the stopwatch's quiet nod to the pomodoro.
  const total = state.mode === 'flow' ? focusLen : state.settings.durations[state.mode] || 1;
  const ringFrac = isFlow ? (state.remaining % focusLen) / focusLen : state.remaining / total;
  const ringOffset = RING_C * (1 - ringFrac);
  // Whole focus-lengths already on the clock — what "finish" would bank.
  const laps = isFlow ? Math.floor(state.remaining / focusLen) : 0;

  const modes: TimerMode[] = state.settings.flow
    ? ['focus', 'flow', 'short', 'long']
    : ['focus', 'short', 'long'];
  const idx = Math.max(0, modes.indexOf(state.mode));
  const pillW = `calc((100% - 8px) / ${modes.length})`;

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
        <div
          className="tabs-pill"
          style={{ width: pillW, transform: `translateX(${idx * 100}%)` }}
        />
        <div className="tabs-inner">
          {modes.map((m) => (
            <button
              key={m}
              className="tab-btn"
              aria-pressed={state.mode === m}
              onClick={() => actions.pick(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
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
        <div className="readout-time">{isFlow ? clock(state.remaining) : mmss(state.remaining)}</div>
        {isFlow && !state.justDone && (
          <div className="intention-line">
            {laps > 0
              ? `${laps} bloom${laps === 1 ? '' : 's'} on the clock — finish to bank ${laps === 1 ? 'it' : 'them'}`
              : state.running
                ? 'counting up — stop whenever it stops flowing'
                : 'a stopwatch instead of a countdown — just press play'}
          </div>
        )}
        {wantsIntention && state.running && companion.intention && (
          <div className="intention-line">✦ {companion.intention}</div>
        )}
        {companion.summary && !(state.running && state.mode === 'focus') && (
          <div className="intention-line">{companion.summary}</div>
        )}
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
        {isFlow ? (
          <button
            className="ctrl-round ctrl-finish"
            onClick={actions.finishFlow}
            disabled={state.remaining < 1 && !state.running}
            aria-label="Finish flow session"
            title="finish & bank this session"
          >
            &#10003;
          </button>
        ) : (
          <button className="ctrl-round ctrl-skip" onClick={actions.skip} aria-label="Skip">
            &#187;
          </button>
        )}
      </div>

      {wantsIntention && !state.running && (
        <input
          className="intention-input"
          value={companion.intention}
          onChange={(e) => companion.setIntention(e.target.value.slice(0, 60))}
          placeholder="what will you do this session? (optional)"
          aria-label="Session intention"
        />
      )}

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

      {debrief && !state.running && !state.justDone && (
        <DebriefCard
          record={debrief}
          records={records}
          palSprite={palSprite}
          onDismiss={() => setDebrief(null)}
        />
      )}

      {/* The debrief takes precedence — one card at a time, never mid-session. */}
      {weekly && !debrief && !state.running && !state.justDone && (
        <WeeklyReview records={records} palSprite={palSprite} onDismiss={() => setWeekly(false)} />
      )}

      {showSettings && (
        <SettingsSheet
          settings={state.settings}
          running={state.running}
          onPatch={actions.patchSettings}
          onClose={() => setShowSettings(false)}
          onShowWeekly={() => {
            setShowSettings(false);
            setWeekly(true);
          }}
        />
      )}
    </div>
  );
}
