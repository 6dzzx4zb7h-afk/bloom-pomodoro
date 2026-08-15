import { useEffect, useId, useRef, useState } from 'react';
import { SESSION_TARGET_MAX } from '../store/useBloom';

/** How long the visual breath pacer runs before the next-step prompt. */
const BREATH_CYCLE_MS = 10_000;

type RestartKind = 'drift' | 'abandon';
type RestartStage = 'offer' | 'breath' | 'next';

interface KindRestartProps {
  kind: RestartKind;
  initialNextStep?: string;
  /** The existing drift-specific suggestion remains visible beside the offer. */
  tip?: string;
  onBegin?: () => void;
  onContinue: (nextStep: string) => void;
  onSkip: () => void;
}

/**
 * Optional 5.3 recovery flow: one user-started breath, one concrete next
 * action, then resume (during a drift) or a two-minute tiny start (after an
 * abandon). The only timed part is ten seconds, so the guided path stays well
 * inside the plan's 60-second ceiling without growing into a meditation mode.
 * The breath is paced entirely by the visual orb (PLAN 12.1); the timer-finish
 * chime is Bloom's only remaining audio path.
 */
export function KindRestart({
  kind,
  initialNextStep = '',
  tip,
  onBegin,
  onContinue,
  onSkip,
}: KindRestartProps) {
  const [stage, setStage] = useState<RestartStage>('offer');
  const [nextStep, setNextStep] = useState(initialNextStep);
  const inputId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearBreath() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => clearBreath, []);

  function beginBreath() {
    onBegin?.();
    clearBreath();
    setStage('breath');
    timer.current = setTimeout(() => {
      timer.current = null;
      setStage('next');
    }, BREATH_CYCLE_MS);
  }

  function finishBreathEarly() {
    clearBreath();
    setStage('next');
  }

  function skip() {
    clearBreath();
    onSkip();
  }

  if (stage === 'offer') {
    return (
      <div className="kind-restart" role="region" aria-label="Soft restart">
        <div className="kind-restart-title">
          {kind === 'abandon'
            ? 'Want one soft reset before a tiny next step?'
            : 'Want one soft reset before you step back in?'}
        </div>
        {tip && <div className="pop-tip kind-restart-tip">{tip}</div>}
        <div className="pop-actions">
          <button className="pop-btn primary" onClick={beginBreath}>
            one slow breath
          </button>
          <button className="pop-btn" onClick={skip}>
            skip
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'breath') {
    return (
      <div
        className="kind-restart kind-restart-breath"
        role="region"
        aria-label="Soft restart"
        aria-live="polite"
      >
        <div className="breath-orb" aria-hidden="true">
          <span />
        </div>
        <div className="kind-restart-title">breathe in… and let it soften out ♡</div>
        <div className="pop-soft">follow the circle · about 10 seconds</div>
        <button className="pop-dismiss" onClick={finishBreathEarly}>
          next step now
        </button>
      </div>
    );
  }

  const trimmed = nextStep.trim();
  return (
    <form
      className="kind-restart"
      aria-label="Soft restart"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onContinue(trimmed);
      }}
    >
      <label className="kind-restart-title" htmlFor={inputId}>
        Noted. Next step is ___?
      </label>
      <input
        id={inputId}
        className="resume-next-input kind-restart-input"
        autoFocus
        value={nextStep}
        maxLength={SESSION_TARGET_MAX}
        onChange={(event) => setNextStep(event.target.value)}
        placeholder="one small physical step…"
      />
      <div className="pop-actions">
        <button type="submit" className="pop-btn primary" disabled={!trimmed}>
          {kind === 'abandon' ? 'tiny-start this step' : 'resume this step'}
        </button>
        <button type="button" className="pop-btn" onClick={skip}>
          skip
        </button>
      </div>
    </form>
  );
}
