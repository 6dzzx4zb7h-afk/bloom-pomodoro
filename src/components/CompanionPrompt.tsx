import { useState } from 'react';
import { PixelPal } from './PixelPal';
import { TRIAGE } from '../store/companion';
import type { Companion } from '../store/useCompanion';
import type { AnimalKind } from '../engine/pixelpals';

interface CompanionPromptProps {
  companion: Companion;
  palSprite: AnimalKind;
  /** What the check-in refers to: the intention if set, else the active task. */
  focusLabel: string | null;
}

/**
 * The pet's speech bubble: gentle check-ins, the welcome-back question, the
 * two-tap drift triage, and the follow-up tip. One overlay, four moods —
 * always dismissible, never guilt-y. The pet stays idle or celebrates; it
 * never looks sad about a drift.
 */
export function CompanionPrompt({ companion, palSprite, focusLabel }: CompanionPromptProps) {
  const { prompt, actions } = companion;
  const [jotText, setJotText] = useState('');
  const [jotted, setJotted] = useState(false);

  if (!prompt) return null;

  const short = focusLabel && focusLabel.length > 26 ? `${focusLabel.slice(0, 24)}…` : focusLabel;

  function saveJot() {
    const t = jotText.trim();
    if (!t) return;
    actions.jot(t);
    setJotText('');
    setJotted(true);
  }

  function closeTip() {
    setJotText('');
    setJotted(false);
    actions.close();
  }

  return (
    <div className="companion-pop" role="dialog" aria-label="Companion check-in">
      <PixelPal
        sprite={palSprite}
        mode={prompt.type === 'tip' ? 'celebrate' : 'idle'}
        scale={3}
        size={64}
        className="pop-pal"
      />
      <div className="pop-body">
        {prompt.type === 'checkin' && (
          <>
            <div className="pop-text">{short ? <>still on “{short}”?</> : 'still with me?'}</div>
            <div className="pop-actions">
              <button className="pop-btn primary" onClick={actions.focused}>
                yes, focused
              </button>
              <button className="pop-btn" onClick={actions.drifted}>
                i drifted
              </button>
            </div>
          </>
        )}

        {prompt.type === 'away' && (
          <>
            <div className="pop-text">welcome back — was that on purpose?</div>
            <div className="pop-actions">
              <button className="pop-btn primary" onClick={actions.onPurpose}>
                yep, on purpose
              </button>
              <button className="pop-btn" onClick={actions.drifted}>
                i drifted
              </button>
            </div>
          </>
        )}

        {prompt.type === 'triage' && (
          <>
            <div className="pop-text">
              what pulled you away? <span className="pop-soft">no wrong answers</span>
            </div>
            <div className="pop-list">
              {TRIAGE.map((t) => (
                <button key={t.kind} className="pop-opt" onClick={() => actions.pick(t.kind)}>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="pop-dismiss" onClick={actions.close}>
              skip
            </button>
          </>
        )}

        {prompt.type === 'tip' && (
          <>
            <div className="pop-text">happens to everyone — back to it?</div>
            <div className="pop-tip">{prompt.text}</div>
            {(prompt.kind === 'rabbit' || prompt.kind === 'urge') &&
              (jotted ? (
                <div className="pop-soft">parked on your list ♡</div>
              ) : (
                <form
                  className="pop-jot"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveJot();
                  }}
                >
                  <input
                    className="pop-jot-input"
                    value={jotText}
                    onChange={(e) => setJotText(e.target.value.slice(0, 60))}
                    placeholder="park the thing for later…"
                    aria-label="Park a thought for later"
                  />
                  <button type="submit" className="pop-btn" disabled={!jotText.trim()}>
                    park it
                  </button>
                </form>
              ))}
            <div className="pop-actions">
              <button className="pop-btn primary" onClick={closeTip}>
                back to it ♡
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
