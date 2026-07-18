import { useEffect, useMemo } from 'react';
import { PixelPal } from './PixelPal';
import { driftOnsetMin, loadEvents, phaseOf, type Phase } from '../store/companion';
import type { SessionRecord, TargetOutcome } from '../store/sessions';
import type { AnimalKind } from '../engine/pixelpals';
import { driftsForRecord, whyFor } from '../insights/why';
import { KindRestart } from './KindRestart';
import { GuideSuggestion } from './GuideSuggestion';
import { guideSuggestionFor } from '../insights/surfacing';
import type { GuideReadState } from '../store/guide';
import type { GuideArticleId } from '../content/guide';

/**
 * Post-session debrief (PLAN 2.1): after a session ends — completed or
 * abandoned — the pet reflects the session back in one small dismissible
 * card: planned vs. actual, drift count with early/mid/late chips, and one
 * "why" sentence from the rule engine (PLAN 2.2). Visible recording,
 * never a grade (docs/science.md#measurement — Harkin et al. 2016; reflect
 * clearly, don't moralize). FocusScreen only renders it while no timer runs.
 */

const PHASE_LABEL: Record<Phase, string> = { early: 'early', mid: 'mid', late: 'late' };
const PHASES: Phase[] = ['early', 'mid', 'late'];

function fmtMin(min: number): string {
  if (min < 1) return 'under a minute';
  const n = Math.round(min);
  return `${n} min`;
}

export function DebriefCard({
  record,
  records,
  palSprite,
  onTargetOutcome,
  onTinyRestart,
  guideRead,
  onGuideSuggested,
  onOpenGuideArticle,
  onDismiss,
}: {
  record: SessionRecord;
  /** The full session log — the why-engine reads aggregate patterns from it. */
  records: SessionRecord[];
  palSprite: AnimalKind;
  onTargetOutcome: (outcome: TargetOutcome) => void;
  onTinyRestart: (nextStep: string) => void;
  guideRead: GuideReadState;
  onGuideSuggested: (id: GuideArticleId, momentKey: string) => void;
  onOpenGuideArticle: (id: GuideArticleId) => void;
  onDismiss: () => void;
}) {
  const events = useMemo(() => loadEvents(), [record]);
  const drifts = useMemo(() => driftsForRecord(record, events), [record, events]);
  const why = useMemo(() => whyFor(record, records, events), [record, records, events]);
  const guideSuggestion = useMemo(
    () => guideSuggestionFor({
      kind: 'debrief',
      momentKey: `debrief:${record.id}`,
      record,
      records,
      events,
      workSessionRunning: false,
    }, guideRead, Date.now()),
    [events, guideRead, record, records],
  );
  useEffect(() => {
    if (guideSuggestion) {
      onGuideSuggested(guideSuggestion.articleId, guideSuggestion.momentKey);
    }
  }, [guideSuggestion, onGuideSuggested]);
  const phaseCounts = useMemo(() => {
    const counts: Record<Phase, number> = { early: 0, mid: 0, late: 0 };
    for (const e of drifts) counts[phaseOf(driftOnsetMin(e), e.len)]++;
    return counts;
  }, [drifts]);

  const title =
    record.outcome === 'completed'
      ? 'session done — here’s its shape ♡'
      : 'that one ended early. that happened ♡';

  const planLine =
    record.plannedMin == null
      ? `flowed for ${fmtMin(record.actualMin)} — the stopwatch had no plan`
      : `planned ${fmtMin(record.plannedMin)} · did ${fmtMin(record.actualMin)}`;

  const driftLine =
    drifts.length === 0
      ? 'no drifts logged'
      : `${drifts.length} drift${drifts.length === 1 ? '' : 's'}`;

  return (
    <div className="companion-pop debrief-card" role="status" aria-label="Session debrief">
      <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
      <div className="pop-body">
        <div className="pop-text">{title}</div>
        <div className="debrief-rows">
          <div className="debrief-row">⏱️ {planLine}</div>
          <div className="debrief-row">
            🌱 {driftLine}
            {drifts.length > 0 && (
              <span className="debrief-chips">
                {PHASES.filter((p) => phaseCounts[p] > 0).map((p) => (
                  <span key={p} className="debrief-chip">
                    {PHASE_LABEL[p]} ×{phaseCounts[p]}
                  </span>
                ))}
              </span>
            )}
          </div>
          {record.targetText && (
            <div className="debrief-row debrief-target">
              <div>🎯 target: {record.targetText} — done?</div>
              <div className="debrief-target-actions" role="group" aria-label="Target result">
                {([
                  ['done', 'done'],
                  ['partly', 'partly'],
                  ['no', 'not yet'],
                ] as const).map(([outcome, label]) => (
                  <button
                    key={outcome}
                    className={`debrief-target-btn${record.targetOutcome === outcome ? ' on' : ''}`}
                    aria-pressed={record.targetOutcome === outcome}
                    onClick={() => onTargetOutcome(outcome)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Exactly one insight per debrief (PLAN 2.2). data-evidence keeps
              the science.md link addressable for the 2.4/6.3 "why?" links. */}
          <div className="debrief-row debrief-why" data-evidence={why.evidenceKey}>
            ✦ {why.text}
          </div>
          {guideSuggestion && (
            <GuideSuggestion
              articleId={guideSuggestion.articleId}
              reason={guideSuggestion.reason}
              onOpen={onOpenGuideArticle}
            />
          )}
        </div>
        {record.outcome === 'abandoned' ? (
          <KindRestart
            kind="abandon"
            initialNextStep={record.nextActionText ?? record.targetText ?? ''}
            onContinue={onTinyRestart}
            onSkip={onDismiss}
          />
        ) : (
          <div className="pop-actions">
            <button className="pop-btn primary" onClick={onDismiss}>
              ok ♡
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
