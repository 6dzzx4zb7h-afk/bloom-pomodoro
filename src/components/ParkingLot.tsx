import { useEffect, useRef, useState } from 'react';
import type { AnimalKind } from '../engine/pixelpals';
import {
  PARKING_TEXT_MAX,
  PARKING_WORD_LIMIT,
  limitParkingDraft,
  normalizeParkingText,
  type ParkedThought,
} from '../store/parking';
import { PixelPal } from './PixelPal';

interface ParkingLotProps {
  canPark: boolean;
  showReturned: boolean;
  returned: ParkedThought[];
  palSprite: AnimalKind;
  /** A break is selected but not started — offer to start it from the card. */
  breakIdle?: boolean;
  onStartBreak?: () => void;
  onPark: (text: string) => void;
  onSendToTasks: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Releases other pause cards while thoughts remain saved for later. */
  onSnoozeReturned?: () => void;
}

export function ParkingLot({
  canPark,
  showReturned,
  returned,
  palSprite,
  breakIdle,
  onStartBreak,
  onPark,
  onSendToTasks,
  onDismiss,
  onSnoozeReturned,
}: ParkingLotProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [parkedNote, setParkedNote] = useState(false);
  // "not now ♡" tucks the returned card away for this pause; it comes back at
  // the next natural pause (or when fresh thoughts are revealed).
  const [snoozed, setSnoozed] = useState(false);
  const prevReturnedCount = useRef(returned.length);

  useEffect(() => {
    if (canPark) setSnoozed(false);
  }, [canPark]);

  useEffect(() => {
    if (returned.length > prevReturnedCount.current) setSnoozed(false);
    prevReturnedCount.current = returned.length;
  }, [returned.length]);

  useEffect(() => {
    if (!canPark) {
      setOpen(false);
      setDraft('');
      setParkedNote(false);
    }
  }, [canPark]);

  useEffect(() => {
    if (!parkedNote) return;
    const timer = setTimeout(() => setParkedNote(false), 2400);
    return () => clearTimeout(timer);
  }, [parkedNote]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = normalizeParkingText(draft);
    if (!text) return;
    onPark(text);
    setDraft('');
    setOpen(false);
    setParkedNote(true);
  }

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <>
      {canPark && (
        <div className="parking-capture">
          {open ? (
            <form className="parking-form" onSubmit={submit}>
              <input
                autoFocus
                className="parking-input"
                value={draft}
                maxLength={PARKING_TEXT_MAX}
                onChange={(e) => setDraft(limitParkingDraft(e.target.value))}
                placeholder="five words is plenty…"
                aria-label="Thought to park until the next pause"
              />
              <span className="parking-count" aria-hidden="true">
                {wordCount}/{PARKING_WORD_LIMIT}
              </span>
              <button className="parking-save" type="submit" disabled={!draft.trim()}>
                tuck away
              </button>
              <button
                className="parking-cancel"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDraft('');
                }}
                aria-label="Close parking lot input"
              >
                ×
              </button>
            </form>
          ) : (
            <button className="parking-open" onClick={() => setOpen(true)}>
              park it 🌱
            </button>
          )}
          {parkedNote && (
            <span className="parking-saved" role="status">
              tucked away until your next pause ♡
            </span>
          )}
        </div>
      )}

      {showReturned && !snoozed && returned.length > 0 && (
        <div className="companion-pop parking-return" role="region" aria-label="Parked thoughts">
          <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
          <div className="pop-body">
            {/* PLACEHOLDER_COPY — final recovery wording lands in the designated copy pass. */}
            <div className="pop-text">
              tiny experiment: did setting {returned.length === 1 ? 'this' : 'these'} down make a
              little room?
            </div>
            <div className="pop-soft parking-return-note">here for your pause, just as promised ♡</div>
            <div className="parking-items">
              {returned.map((item) => (
                <div className="parking-item" key={item.id}>
                  <div className="parking-item-text">{item.text}</div>
                  <div className="parking-item-actions">
                    <button
                      className="pop-btn primary"
                      onClick={() => onDismiss(item.id)}
                      aria-label={`Mark parked thought done: ${item.text}`}
                    >
                      did it ✓
                    </button>
                    <button
                      className="pop-btn"
                      onClick={() => onSendToTasks(item.id)}
                      aria-label={`Make task from parked thought: ${item.text}`}
                    >
                      make a task
                    </button>
                    <button
                      className="pop-btn"
                      onClick={() => onDismiss(item.id)}
                      aria-label={`Let parked thought go: ${item.text}`}
                    >
                      let it go
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="parking-return-footer">
              {breakIdle && onStartBreak && (
                <button className="pop-btn primary" onClick={onStartBreak}>
                  start my break ▸
                </button>
              )}
              <button
                className="pop-btn"
                onClick={() => {
                  setSnoozed(true);
                  onSnoozeReturned?.();
                }}
              >
                not now ♡
              </button>
            </div>
            <span className="pop-soft parking-return-carry">
              anything left just waits for your next break ♡
            </span>
          </div>
        </div>
      )}
    </>
  );
}
