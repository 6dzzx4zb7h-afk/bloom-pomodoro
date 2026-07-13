import { useEffect, useRef, useState } from 'react';
import {
  CUE_TYPES,
  IF_THEN_PLAN_CAP,
  IF_THEN_TEMPLATES,
  type CueType,
  type IfThenPlan,
} from '../store/ifThen';

/**
 * Pre-session if–then planner (PLAN 3.2): one optional line above the start
 * button where the user can pick a saved plan or fill a template — the
 * "opening move" for the session. Pre-deciding the first concrete step is
 * the report's best starting lever (docs/science.md#starting — Gollwitzer &
 * Sheeran 2006, d = 0.61 for failures-to-get-started). Everything here is
 * skippable in one tap and never commented on when skipped (docs/voice.md).
 *
 * FocusScreen owns the selection and hands the chosen planId to the timer,
 * which stamps it on the session record and remembers it per task.
 */

const CUE_LABEL: Record<CueType, string> = {
  time: 'a time',
  place: 'a place',
  emotion: 'a feeling',
  obstacle: 'a detour',
};

export function IfThenPlanner({
  plans,
  selectedId,
  initialOpen = false,
  onSelect,
  onClear,
  onCreate,
  onRemove,
}: {
  plans: IfThenPlan[];
  /** The plan the next session will start with, if any. */
  selectedId: string | null;
  /** WOOP's Plan step opens the same planner immediately (PLAN 3.5). */
  initialOpen?: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
  onCreate: (cueType: CueType, cueText: string, actionText: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [cueType, setCueType] = useState<CueType>('time');
  const [cueText, setCueText] = useState('');
  const [actionText, setActionText] = useState('');
  // Creating a plan is a dispatch, so the new id arrives via the plans prop:
  // remember the length at save time and select whatever got appended.
  const wantSelect = useRef<number | null>(null);

  useEffect(() => {
    if (wantSelect.current == null) return;
    if (plans.length > wantSelect.current) {
      onSelect(plans[plans.length - 1].id);
      setCueText('');
      setActionText('');
      setOpen(false);
    }
    wantSelect.current = null;
  }, [plans, onSelect]);

  const selected = plans.find((p) => p.id === selectedId);
  const tpl = IF_THEN_TEMPLATES.find((t) => t.cueType === cueType) ?? IF_THEN_TEMPLATES[0];
  const full = plans.length >= IF_THEN_PLAN_CAP;
  const canSave = !full && cueText.trim().length > 0 && actionText.trim().length > 0;

  if (!open) {
    if (selected) {
      return (
        <div className="ifthen-bar">
          <button
            className="ifthen-current"
            onClick={() => setOpen(true)}
            title="change the opening move"
          >
            ✦ if {selected.cueText}, then {selected.actionText}
          </button>
          <button className="ifthen-clear" onClick={onClear} aria-label="Skip the opening move">
            ×
          </button>
        </div>
      );
    }
    return (
      <button className="ifthen-ask" onClick={() => setOpen(true)}>
        ✦ what’s our opening move? <span className="ifthen-opt">optional</span>
      </button>
    );
  }

  return (
    <div className="ifthen-panel" role="group" aria-label="Opening move planner">
      <div className="ifthen-head">
        <div className="ifthen-title">our opening move</div>
        <button className="ifthen-close" onClick={() => setOpen(false)} aria-label="Close planner">
          ×
        </button>
      </div>
      <div className="ifthen-sub">pre-deciding the first step makes starting lighter. skip anytime.</div>

      {plans.length > 0 && (
        <div className="ifthen-list">
          {plans.map((p) => (
            <div key={p.id} className="ifthen-row">
              <button
                className={`ifthen-plan ${p.id === selectedId ? 'on' : ''}`}
                onClick={() => {
                  if (p.id === selectedId) onClear();
                  else onSelect(p.id);
                  setOpen(false);
                }}
              >
                if {p.cueText}, then {p.actionText}
              </button>
              <button
                className="ifthen-del"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove plan: if ${p.cueText}, then ${p.actionText}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ifthen-new">
        <div className="ifthen-cues" role="group" aria-label="Cue type">
          {CUE_TYPES.map((c) => (
            <button
              key={c}
              className={`patterns-chip ${c === cueType ? 'on' : ''}`}
              aria-pressed={c === cueType}
              onClick={() => setCueType(c)}
            >
              {CUE_LABEL[c]}
            </button>
          ))}
        </div>
        <input
          className="pop-jot-input"
          value={cueText}
          maxLength={120}
          onChange={(e) => setCueText(e.target.value)}
          placeholder={`if ${tpl.cueHint}`}
          aria-label="If — the cue"
        />
        <input
          className="pop-jot-input"
          value={actionText}
          maxLength={120}
          onChange={(e) => setActionText(e.target.value)}
          placeholder={`then ${tpl.actionHint}`}
          aria-label="Then — the first action"
        />
        {full ? (
          <div className="ifthen-note">
            the plan shelf is full — removing one above makes room for a new one.
          </div>
        ) : (
          <button
            className="pop-btn primary ifthen-save"
            disabled={!canSave}
            onClick={() => {
              wantSelect.current = plans.length;
              onCreate(cueType, cueText, actionText);
            }}
          >
            save & use ♡
          </button>
        )}
      </div>
    </div>
  );
}
