import { useMemo } from 'react';
import { PixelPal } from './PixelPal';
import { loadEvents } from '../store/companion';
import type { SessionRecord } from '../store/sessions';
import type { AnimalKind } from '../engine/pixelpals';
import { computeWeeklyReview } from '../insights/weekly';

/**
 * Weekly review card (PLAN 2.3): once per calendar week — or on demand from
 * Settings — the pet answers exactly two questions from the user's own data:
 * "what helped you start?" and "what helped you recover?", plus one suggested
 * experiment for next week. Small numbers, no judgment words, no red/failure
 * styling (docs/science.md#measurement — review with only those two
 * questions, skip judgment; feedback stays simple and low-frequency).
 * FocusScreen only renders it while no timer runs.
 */

export function WeeklyReview({
  records,
  palSprite,
  onDismiss,
}: {
  /** The full session log — the engine windows it to the last 7 days. */
  records: SessionRecord[];
  palSprite: AnimalKind;
  onDismiss: () => void;
}) {
  const events = useMemo(() => loadEvents(), []);
  const review = useMemo(() => computeWeeklyReview(records, events), [records, events]);

  return (
    <div className="companion-pop debrief-card" role="status" aria-label="Weekly review">
      <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
      <div className="pop-body">
        <div className="pop-text">
          {review.kind === 'ready' ? 'our little week, in review ♡' : 'peeking at the week ♡'}
        </div>
        <div className="debrief-rows">
          {review.kind === 'ready' ? (
            <>
              <div className="debrief-row">
                🌱 <span className="weekly-q">what helped you start?</span> {review.start}
              </div>
              <div className="debrief-row">
                🪴 <span className="weekly-q">what helped you recover?</span> {review.recover}
              </div>
              <div className="debrief-row debrief-why">✦ {review.experiment}</div>
            </>
          ) : (
            <div className="debrief-row">🌱 {review.text}</div>
          )}
        </div>
        <div className="pop-actions">
          <button className="pop-btn primary" onClick={onDismiss}>
            ok ♡
          </button>
        </div>
      </div>
    </div>
  );
}
