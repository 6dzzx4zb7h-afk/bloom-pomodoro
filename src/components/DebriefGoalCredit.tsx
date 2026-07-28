import { useEffect, useId, useState, type ReactNode } from 'react';

const REQUEST_MAX = 999;

function initialAmount(pacePerDay: number, remaining: number): number {
  const pace = Number.isFinite(pacePerDay) && pacePerDay > 0
    ? Math.ceil(pacePerDay)
    : 1;
  return Math.min(Math.max(1, pace), remaining);
}

/**
 * Prop-driven PLAN 10.2 debrief control.
 *
 * The parent owns whether this row exists and removes it after either action.
 * This component only chooses a clamped amount; the ledger remains the sole
 * write path in the store integration.
 */
export function DebriefGoalCredit({
  goalTitle,
  unit,
  remaining,
  pacePerDay,
  effortLine,
  onCredit,
  onSkip,
}: {
  goalTitle: string;
  /** Already-normalized goal unit; blank still degrades safely to "parts". */
  unit?: string;
  /** Positive parts left on the still-existing goal. */
  remaining: number;
  /** goalPace(goal).perDay; rounded up, then clamped to remaining. */
  pacePerDay: number;
  /** Reserved for the separately guarded effort-evidence line. */
  effortLine?: ReactNode;
  onCredit: (amount: number) => void;
  onSkip: () => void;
}) {
  const normalizedRemaining = Math.max(0, Math.floor(remaining));
  const normalizedUnit = unit?.trim() || 'parts';
  const [draft, setDraft] = useState(() =>
    String(initialAmount(pacePerDay, normalizedRemaining)),
  );
  const clampNoteId = useId();

  useEffect(() => {
    setDraft(String(initialAmount(pacePerDay, normalizedRemaining)));
  }, [goalTitle, normalizedRemaining, pacePerDay]);

  if (normalizedRemaining < 1) return null;

  const parsed = Number(draft);
  const requested =
    Number.isFinite(parsed) && parsed >= 1
      ? Math.min(REQUEST_MAX, Math.floor(parsed))
      : 1;
  const credited = Math.min(requested, normalizedRemaining);
  const clamped = requested > normalizedRemaining;

  function step(direction: -1 | 1) {
    setDraft(String(Math.max(1, Math.min(REQUEST_MAX, requested + direction))));
  }

  return (
    <section
      className="debrief-goal-credit"
      aria-label={`Goal credit for ${goalTitle}`}
    >
      <div className="debrief-goal-credit-title">🌼 Move {goalTitle}?</div>
      <div className="debrief-goal-credit-stepper">
        <button
          type="button"
          aria-label={`Decrease ${normalizedUnit} to credit`}
          disabled={requested <= 1}
          onClick={() => step(-1)}
        >
          −
        </button>
        <label>
          <span className="sr-only">{normalizedUnit} to credit</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={normalizedRemaining}
            value={draft}
            aria-describedby={clamped ? clampNoteId : undefined}
            aria-label={`${normalizedUnit} to credit`}
            onChange={(event) => setDraft(event.target.value.slice(0, 3))}
            onBlur={() => setDraft(String(requested))}
          />
        </label>
        <button
          type="button"
          aria-label={`Increase ${normalizedUnit} to credit`}
          disabled={requested >= REQUEST_MAX}
          onClick={() => step(1)}
        >
          +
        </button>
        <span className="debrief-goal-credit-unit">{normalizedUnit}</span>
      </div>
      {clamped && (
        <div className="debrief-goal-credit-note" id={clampNoteId} role="status">
          Bloom can count the {normalizedRemaining} {normalizedUnit} left
        </div>
      )}
      {effortLine && (
        <div className="debrief-goal-credit-effort">{effortLine}</div>
      )}
      <div className="debrief-goal-credit-actions">
        <button type="button" onClick={() => onCredit(credited)}>
          credit {credited} {normalizedUnit}
        </button>
        <button type="button" onClick={onSkip}>
          not this time
        </button>
      </div>
    </section>
  );
}
