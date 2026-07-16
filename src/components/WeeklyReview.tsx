import { useEffect, useMemo } from 'react';
import { PixelPal } from './PixelPal';
import { loadEvents } from '../store/companion';
import type { SessionRecord } from '../store/sessions';
import type { AnimalKind } from '../engine/pixelpals';
import { computeWeeklyReview } from '../insights/weekly';
import {
  personalCadenceForSurface,
  shouldRecomputePersonalCadence,
  type CadencePair,
  type PersonalCadenceMemory,
  type PersonalCadenceRecommendation,
} from '../insights/cadence';
import type { Chronotype } from '../store/companion';

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
  onApplyCadence,
  onCacheCadence,
  currentCadence,
  personalCadence,
  chronotype,
}: {
  /** The full session log — the engine windows it to the last 7 days. */
  records: SessionRecord[];
  palSprite: AnimalKind;
  onDismiss: () => void;
  onApplyCadence: (preset: CadencePair) => void;
  onCacheCadence: (recommendation: PersonalCadenceRecommendation, at: number) => void;
  currentCadence: CadencePair;
  personalCadence: PersonalCadenceMemory;
  chronotype: Chronotype;
}) {
  const events = useMemo(() => loadEvents(), []);
  const review = useMemo(() => computeWeeklyReview(records, events), [records, events]);
  const cadence = useMemo(
    () => personalCadenceForSurface(
      personalCadence,
      records,
      events,
      chronotype,
      currentCadence,
    ),
    [chronotype, currentCadence, events, personalCadence, records],
  );
  const cadenceNeedsRefresh = shouldRecomputePersonalCadence(personalCadence);
  useEffect(() => {
    if (cadenceNeedsRefresh) onCacheCadence(cadence, Date.now());
  }, [cadence, cadenceNeedsRefresh, onCacheCadence]);
  const cadenceIsSet =
    currentCadence.focusMin === cadence.preset.focusMin &&
    currentCadence.breakMin === cadence.preset.breakMin;

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
          <div className="debrief-row cadence-because">
            cadence check: {cadence.text} {cadence.because}
          </div>
          <div className="cadence-ladder" aria-label="Personal cadence ladder">
            {(['shorter', 'current', 'longer'] as const).map((slot) => {
              const rung = cadence.rungs[slot];
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
        </div>
        <div className="pop-actions">
          <button
            className="pop-btn cadence-weekly-btn"
            onClick={() => onApplyCadence(cadence.preset)}
            disabled={cadenceIsSet}
          >
            {cadenceIsSet
              ? `${cadence.preset.focusMin}/${cadence.preset.breakMin} is set`
              : `try ${cadence.preset.focusMin}/${cadence.preset.breakMin} ♡`}
          </button>
          {personalCadence.history.length > 0 && (
            <button
              className="pop-btn"
              onClick={() => onApplyCadence(personalCadence.history[personalCadence.history.length - 1])}
            >
              back to {personalCadence.history[personalCadence.history.length - 1].focusMin}/
              {personalCadence.history[personalCadence.history.length - 1].breakMin}
            </button>
          )}
          <button className="pop-btn primary" onClick={onDismiss}>
            ok ♡
          </button>
        </div>
      </div>
    </div>
  );
}
