import { useEffect, useState } from 'react';
import type { AnimalKind } from '../engine/pixelpals';
import type { SessionRecord, TimerSnapshot } from '../store/sessions';
import { SESSION_TARGET_MAX } from '../store/useBloom';
import { PixelPal } from './PixelPal';
import { Dialog } from './Dialog';

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

  const content = (
    <>
      <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
      <div className="pop-body">
        <div className="pop-text">
          {isReturnQuestion ? 'welcome back to your session 🌱' : 'your last session was interrupted 🌱'}
        </div>
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
          next step (optional)
        </label>
        <input
          id={`resume-next-${session.id}`}
          className="resume-next-input"
          value={nextAction}
          maxLength={SESSION_TARGET_MAX}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="e.g. open page 4 and read the first paragraph"
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
            <div className="pop-soft resume-soft">
              resume the remaining time, or keep the interrupted record and dismiss this reminder.
            </div>
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
    </>
  );

  if (isReturnQuestion) {
    return (
      <Dialog
        title="Return to your session"
        description="Should the time away count as focus, or go back on the timer?"
        closeOnEscape={false}
        className="resume-cue resume-dialog"
      >
        <div className="resume-dialog-content">{content}</div>
      </Dialog>
    );
  }

  return (
    <div className="companion-pop resume-cue" role="region" aria-label="Resume interrupted session">
      {content}
    </div>
  );
}
