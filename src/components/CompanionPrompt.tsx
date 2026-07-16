import { useState } from 'react';
import { PixelPal } from './PixelPal';
import { TRIAGE } from '../store/companion';
import type { Companion } from '../store/useCompanion';
import type { AnimalKind } from '../engine/pixelpals';
import { limitParkingDraft } from '../store/parking';
import { KindRestart } from './KindRestart';

interface CompanionPromptProps {
  companion: Companion;
  palSprite: AnimalKind;
  /** What the check-in refers to: the session-owned target, else the active task. */
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
  const [customOnset, setCustomOnset] = useState<string | null>(null); // null = chips shown

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

  function answerOnset(minsAgo: number | null) {
    setCustomOnset(null);
    actions.estOnset(minsAgo);
  }

  return (
    <div className="companion-pop" role="region" aria-label="Companion check-in">
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

        {prompt.type === 'preSlump' && (
          <>
            <div className="pop-text">tiny breath or shoulder roll?</div>
            <div className="pop-tip">
              Your first drifts often start around minute{' '}
              {Math.round(prompt.typicalFirstDriftMin)}, so this is a soft little hello beforehand.
            </div>
            <div className="pop-actions">
              <button className="pop-btn primary" onClick={actions.close}>
                all good ♡
              </button>
              <button className="pop-btn" onClick={actions.silencePreSlumpForDay}>
                quiet for today
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

        {prompt.type === 'onset' && (
          <>
            {/* PLACEHOLDER_COPY — final wording lands in the copy pass.
                Onset is self-reported: keep it framed as a guess, never
                fake precision (PLAN 1.5c). */}
            <div className="pop-text">
              since when, roughly? <span className="pop-soft">a guess is fine</span>
            </div>
            {customOnset === null ? (
              <div className="pop-actions">
                <button className="pop-btn" onClick={() => answerOnset(0)}>
                  just now
                </button>
                <button className="pop-btn" onClick={() => answerOnset(5)}>
                  ~5 min
                </button>
                <button className="pop-btn" onClick={() => answerOnset(10)}>
                  ~10 min
                </button>
                <button className="pop-btn" onClick={() => setCustomOnset('')}>
                  custom
                </button>
              </div>
            ) : (
              <form
                className="pop-jot"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(customOnset);
                  if (Number.isFinite(n) && customOnset !== '') answerOnset(n);
                }}
              >
                <input
                  className="pop-jot-input"
                  type="number"
                  min={0}
                  max={999}
                  inputMode="numeric"
                  value={customOnset}
                  onChange={(e) => setCustomOnset(e.target.value)}
                  placeholder="minutes ago…"
                  aria-label="About how many minutes ago the drift started"
                />
                <button
                  type="submit"
                  className="pop-btn"
                  disabled={customOnset === '' || !Number.isFinite(Number(customOnset))}
                >
                  ok
                </button>
              </form>
            )}
            <button className="pop-dismiss" onClick={() => answerOnset(null)}>
              skip
            </button>
          </>
        )}

        {prompt.type === 'tip' && (
          <>
            <div className="pop-text">happens to everyone — the way back is still here ♡</div>
            {(prompt.kind === 'rabbit' || prompt.kind === 'urge') &&
              (jotted ? (
                <div className="pop-soft">tucked away until your next pause ♡</div>
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
                    onChange={(e) => setJotText(limitParkingDraft(e.target.value))}
                    placeholder="five words for later…"
                    aria-label="Park a thought for later"
                  />
                  <button type="submit" className="pop-btn" disabled={!jotText.trim()}>
                    park it
                  </button>
                </form>
              ))}
            <KindRestart
              kind="drift"
              initialNextStep={actions.nextAction()}
              tip={prompt.text}
              onBegin={actions.hold}
              onContinue={(nextStep) => {
                setJotText('');
                setJotted(false);
                actions.resumeWith(nextStep);
              }}
              onSkip={closeTip}
            />
          </>
        )}
      </div>
    </div>
  );
}
