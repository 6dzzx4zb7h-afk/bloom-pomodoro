import { useEffect, useMemo } from 'react';
import { PixelPal } from './PixelPal';
import { loadEvents } from '../store/companion';
import type { SessionRecord } from '../store/sessions';
import type { AnimalKind } from '../engine/pixelpals';
import { computeWeeklyReview, weekKeyForStudyDay } from '../insights/weekly';
import {
  personalCadenceForSurface,
  shouldRecomputePersonalCadence,
  type CadencePair,
  type PersonalCadenceMemory,
  type PersonalCadenceRecommendation,
} from '../insights/cadence';
import type { Chronotype } from '../store/companion';
import { GuideSuggestion } from './GuideSuggestion';
import { guideSuggestionFor } from '../insights/surfacing';
import type { GuideReadState } from '../store/guide';
import type { GuideArticleId } from '../content/guide';
import {
  EMPTY_FOUNDATIONS,
  foundationsWeekLine,
  type FoundationsState,
} from '../store/foundations';
import { EMPTY_DAY_PLAN, type DayPlanState } from '../store/dailyTarget';
import type { GoalCredit } from '../store/goalLedger';
import {
  weeklyPlanCalibration,
  weeklyPlanCalibrationLine,
} from '../insights/paceActual';

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
  now,
  studyDay,
  dayStartHour,
  palSprite,
  onDismiss,
  onApplyCadence,
  onCacheCadence,
  currentCadence,
  personalCadence,
  chronotype,
  guideRead,
  foundations = EMPTY_FOUNDATIONS,
  dayPlan = EMPTY_DAY_PLAN,
  goalLedger = [],
  onGuideSuggested,
  onOpenGuideArticle,
}: {
  /** The full session log — the engine windows it to the last 7 days. */
  records: SessionRecord[];
  /** Day-refresh signal. Instant-based analysis takes its own fresh clock. */
  now: number;
  /** Store-resolved current study day; all daily surfaces share this key. */
  studyDay: string;
  dayStartHour: number;
  palSprite: AnimalKind;
  onDismiss: () => void;
  onApplyCadence: (preset: CadencePair) => void;
  onCacheCadence: (recommendation: PersonalCadenceRecommendation) => void;
  currentCadence: CadencePair;
  personalCadence: PersonalCadenceMemory;
  chronotype: Chronotype;
  guideRead: GuideReadState;
  foundations?: FoundationsState;
  dayPlan?: DayPlanState;
  goalLedger?: GoalCredit[];
  onGuideSuggested: (id: GuideArticleId, momentKey: string) => void;
  onOpenGuideArticle: (id: GuideArticleId) => void;
}) {
  const events = useMemo(() => loadEvents(), []);
  const review = useMemo(
    () => {
      // `now` is the store-owned refresh signal; the rolling window captures
      // the actual instant when this memo recomputes.
      void now;
      return computeWeeklyReview(records, events, Date.now(), undefined, dayStartHour);
    },
    [records, events, now, dayStartHour],
  );
  const guideSuggestion = useMemo(
    () => guideSuggestionFor({
      kind: 'weekly',
      momentKey: `weekly:${weekKeyForStudyDay(studyDay)}`,
      records,
      events,
      workSessionRunning: false,
    }, guideRead, now, dayStartHour),
    [dayStartHour, events, guideRead, now, records, studyDay],
  );
  const foundationLine = useMemo(
    () =>
      foundationsWeekLine(
        foundations.instances,
        foundations.entries,
        weekKeyForStudyDay(studyDay),
      ),
    [foundations.entries, foundations.instances, studyDay],
  );
  const planCalibrationLine = useMemo(() => {
    const calibration = weeklyPlanCalibration(
      dayPlan,
      goalLedger,
      records,
      studyDay,
      dayStartHour,
    );
    return calibration ? weeklyPlanCalibrationLine(calibration) : null;
  }, [dayPlan, dayStartHour, goalLedger, records, studyDay]);
  const cadenceDecision = useMemo(
    () => {
      // `now` is the store-owned refresh signal; staleness and recommendation
      // share the actual instant when this memo recomputes.
      void now;
      const computedAt = Date.now();
      return {
        cadence: personalCadenceForSurface(
          personalCadence,
          records,
          events,
          chronotype,
          currentCadence,
          computedAt,
        ),
        needsRefresh: shouldRecomputePersonalCadence(personalCadence, computedAt),
      };
    },
    [chronotype, currentCadence, events, now, personalCadence, records],
  );
  const { cadence, needsRefresh: cadenceNeedsRefresh } = cadenceDecision;
  useEffect(() => {
    if (cadenceNeedsRefresh) onCacheCadence(cadence);
  }, [cadence, cadenceNeedsRefresh, onCacheCadence]);
  useEffect(() => {
    if (guideSuggestion) {
      onGuideSuggested(guideSuggestion.articleId, guideSuggestion.momentKey);
    }
  }, [guideSuggestion, onGuideSuggested]);
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
          {foundationLine && (
            <div className="debrief-row foundation-week-line">🌿 {foundationLine}</div>
          )}
          {planCalibrationLine && (
            <div className="debrief-row plan-calibration-line">
              🌱 {planCalibrationLine}
            </div>
          )}
          <div className="debrief-row cadence-because">
            cadence check: {cadence.text} {cadence.because}
          </div>
          {guideSuggestion && (
            <GuideSuggestion
              articleId={guideSuggestion.articleId}
              reason={guideSuggestion.reason}
              onOpen={onOpenGuideArticle}
            />
          )}
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
