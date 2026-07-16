import { useEffect, useState } from 'react';
import type { AnimalKind } from '../engine/pixelpals';
import type { SessionRecord, TimerSnapshot } from '../store/sessions';
import { SESSION_TARGET_MAX } from '../store/useBloom';
import { PixelPal } from './PixelPal';

interface ResumeCueProps {
  palSprite: AnimalKind;
  session: Pick<SessionRecord, 'id' | 'targetText' | 'nextActionText'>;
  snapshot?: TimerSnapshot;
  parkedText?: string;
  onSaveNextAction: (text: string) => void;
  onKeptWorking?: () => void;
  onDrifted?: () => void;
  onPauseBack?: () => void;
  onResumeInterrupted?: () => void;
  onDismissInterrupted?: () => void;
}

/**
 * A small, persisted thread-restorer for tab returns and interrupted reloads.
 * PLACEHOLDER_COPY — final recovery wording lands in the designated copy pass.
 */
export function ResumeCue({
  palSprite,
  session,
  snapshot,
  parkedText,
  onSaveNextAction,
  onKeptWorking,
  onDrifted,
  onPauseBack,
  onResumeInterrupted,
  onDismissInterrupted,
}: ResumeCueProps) {
  const [nextAction, setNextAction] = useState(session.nextActionText ?? '');
  const isReturnQuestion = Boolean(snapshot?.returnedAt);

  useEffect(() => setNextAction(session.nextActionText ?? ''), [session.id, session.nextActionText]);

  function saveThen(action?: () => void) {
    onSaveNextAction(nextAction);
    action?.();
  }

  return (
    <div className="companion-pop resume-cue" role="dialog" aria-label="Return to your session">
      <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
      <div className="pop-body">
        <div className="pop-text">welcome back — here’s the thread 🌱</div>
        <div className="resume-context">
          {parkedText && (
            <div className="resume-context-row">
              <span>parked</span>
              <strong>{parkedText}</strong>
            </div>
          )}
          {session.targetText && (
            <div className="resume-context-row">
              <span>target</span>
              <strong>{session.targetText}</strong>
            </div>
          )}
        </div>
        <label className="resume-next-label" htmlFor={`resume-next-${session.id}`}>
          next concrete action
        </label>
        <input
          id={`resume-next-${session.id}`}
          className="resume-next-input"
          value={nextAction}
          maxLength={SESSION_TARGET_MAX}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="one small physical step…"
        />

        {isReturnQuestion ? (
          <>
            <div className="resume-question">what happened while you were away?</div>
            <div className="pop-actions resume-actions">
              <button className="pop-btn primary" onClick={() => saveThen(onKeptWorking)}>
                I kept working
              </button>
              <button className="pop-btn" onClick={() => saveThen(onDrifted)}>
                I drifted
              </button>
              <button className="pop-btn" onClick={() => saveThen(onPauseBack)}>
                pause it back
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pop-soft resume-soft">that session paused here — want to step back in?</div>
            <div className="pop-actions resume-actions">
              <button className="pop-btn primary" onClick={() => saveThen(onResumeInterrupted)}>
                resume from here
              </button>
              <button className="pop-btn" onClick={() => saveThen(onDismissInterrupted)}>
                not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
