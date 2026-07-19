import { useMemo, useState } from 'react';
import type { AnimalKind } from '../engine/pixelpals';
import type { RitualItem } from '../store/ritual';
import { PixelPal } from './PixelPal';

/**
 * The optional pre-session environment reset (PLAN 3.4). Each tap is a small
 * physical cue; the final tap starts the chosen timer immediately. Skipping
 * keeps the timer one tap away and never comments on the choice.
 */
export function RitualCard({
  items,
  sprite,
  onStart,
  onSkip,
}: {
  items: RitualItem[];
  sprite: AnimalKind;
  onStart: () => void;
  onSkip: () => void;
}) {
  const visibleItems = useMemo(() => items.filter((item) => item.text.trim()).slice(0, 6), [items]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  function tapItem(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    if (visibleItems.length > 0 && visibleItems.every((item) => next.has(item.id))) onStart();
  }

  return (
    <div className="ritual-card" role="dialog" aria-label="Environment reset">
      <div className="ritual-head">
        <PixelPal sprite={sprite} mode="idle" scale={3} size={54} className="ritual-pal" />
        <div>
          <div className="ritual-title">a tiny reset</div>
          <div className="ritual-sub">a few gentle taps, then straight into your session</div>
        </div>
      </div>

      <div className="ritual-list" role="group" aria-label="Environment reset checklist">
        {visibleItems.map((item) => {
          const done = checked.has(item.id);
          return (
            <button
              key={item.id}
              className={`ritual-item${done ? ' done' : ''}`}
              aria-pressed={done}
              onClick={() => tapItem(item.id)}
            >
              <span className="ritual-check" aria-hidden="true">{done ? '✓' : ''}</span>
              <span>{item.text}</span>
            </button>
          );
        })}
      </div>

      <div className="ritual-note">the last little tap starts the timer · skip anytime</div>
      <button className="ritual-skip" onClick={onSkip}>skip for now</button>
    </div>
  );
}

/** One-time, low-pressure discovery prompt for the optional ritual. */
export function RitualSuggestion({
  sprite,
  onEnable,
  onDismiss,
}: {
  sprite: AnimalKind;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="companion-pop ritual-suggestion" role="status">
      <PixelPal sprite={sprite} mode="idle" scale={3} size={54} className="pop-pal" />
      <div className="pop-body">
        <div className="pop-text">want to try a tiny reset before a session?</div>
        <div className="pop-tip">A one-time hello about four tiny taps. Totally optional.</div>
        <div className="pop-actions">
          <button className="pop-btn primary" onClick={onEnable}>try it next time</button>
          <button className="pop-btn" onClick={onDismiss}>maybe later</button>
        </div>
      </div>
    </div>
  );
}
