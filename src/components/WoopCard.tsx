import { useState } from 'react';
import type { AnimalKind } from '../engine/pixelpals';
import type { CueType, IfThenPlan } from '../store/ifThen';
import { IfThenPlanner } from './IfThenPlanner';
import { PixelPal } from './PixelPal';

/**
 * Guided mental contrasting + implementation intention card (PLAN 3.5).
 *
 * The prompt is conditional and frequency-capped in insights/triggers.ts.
 * This component stays entirely optional and stepwise because guided delivery
 * has the stronger evidence in docs/science.md#starting (Wang et al. 2021).
 * Its final Plan step embeds the existing 3.2 if–then planner rather than
 * inventing a second plan model or leaving the plan as throwaway text.
 */

const STEPS = ['Wish', 'Outcome', 'Obstacle', 'Plan'] as const;
type WoopStep = (typeof STEPS)[number];

const STEP_PROMPT: Record<Exclude<WoopStep, 'Plan'>, { title: string; placeholder: string }> = {
  Wish: {
    title: 'What would you like to begin?',
    placeholder: 'one small thing you want to move',
  },
  Outcome: {
    title: 'What would feel lighter once it’s moving?',
    placeholder: 'the useful or cozy result',
  },
  Obstacle: {
    title: 'What gets in the way right before starting?',
    placeholder: 'the main inner snag',
  },
};

export function WoopCard({
  plans,
  selectedId,
  palSprite,
  onSelectPlan,
  onClearPlan,
  onCreatePlan,
  onRemovePlan,
  onDismiss,
}: {
  plans: IfThenPlan[];
  selectedId: string | null;
  palSprite: AnimalKind;
  onSelectPlan: (id: string) => void;
  onClearPlan: () => void;
  onCreatePlan: (cueType: CueType, cueText: string, actionText: string) => void;
  onRemovePlan: (id: string) => void;
  onDismiss: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({ Wish: '', Outcome: '', Obstacle: '' });
  const step = STEPS[stepIndex];
  const currentAnswer = step === 'Plan' ? '' : answers[step];

  return (
    <div className="companion-pop woop-card" role="region" aria-label="Optional WOOP reset">
      <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
      <div className="pop-body">
        <div className="pop-text">three recent starts ended early. that happened ♡</div>
        <div className="woop-note">
          want a 60-second reset? optional, and quiet for seven days.
        </div>
        <div className="woop-steps" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <span key={label} className={`woop-step${i <= stepIndex ? ' on' : ''}`}>
              <span className="woop-step-dot">{i + 1}</span>
              {label}
            </span>
          ))}
        </div>

        {step === 'Plan' ? (
          <div className="woop-plan">
            <div className="woop-question">What tiny move could meet that obstacle?</div>
            <div className="woop-echo">“{answers.Obstacle}”</div>
            <IfThenPlanner
              plans={plans}
              selectedId={selectedId}
              initialOpen
              onSelect={onSelectPlan}
              onClear={onClearPlan}
              onCreate={onCreatePlan}
              onRemove={onRemovePlan}
            />
            <div className="woop-nav">
              <button className="pop-btn" onClick={() => setStepIndex(2)}>
                back
              </button>
              {selectedId && (
                <button className="pop-btn primary" onClick={onDismiss}>
                  opening move ready ♡
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="woop-entry">
            <label className="woop-question" htmlFor={`woop-${step.toLowerCase()}`}>
              {STEP_PROMPT[step].title}
            </label>
            <input
              id={`woop-${step.toLowerCase()}`}
              className="pop-jot-input woop-input"
              value={currentAnswer}
              maxLength={120}
              autoFocus
              onChange={(e) => setAnswers((prev) => ({ ...prev, [step]: e.target.value }))}
              placeholder={STEP_PROMPT[step].placeholder}
            />
            <div className="woop-nav">
              {stepIndex > 0 && (
                <button className="pop-btn" onClick={() => setStepIndex((i) => i - 1)}>
                  back
                </button>
              )}
              <button
                className="pop-btn primary"
                disabled={currentAnswer.trim().length === 0}
                onClick={() => setStepIndex((i) => i + 1)}
              >
                next — {STEPS[stepIndex + 1].toLowerCase()}
              </button>
            </div>
          </div>
        )}

        <button className="pop-dismiss woop-dismiss" onClick={onDismiss}>
          not now — skip anytime
        </button>
      </div>
    </div>
  );
}
