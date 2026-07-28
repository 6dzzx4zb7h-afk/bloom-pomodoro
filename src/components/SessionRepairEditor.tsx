import { useState, type FormEvent } from 'react';

import {
  proposeSessionRepair,
  sessionRepairBounds,
  type SessionRepairError,
  type SessionRepairProposal,
} from '../store/sessionRepair';
import type { SessionOutcome, SessionRecord } from '../store/sessions';
import { Dialog } from './Dialog';

function localInputValue(at: number): string {
  const date = new Date(at);
  const local = new Date(at - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const ERROR_COPY: Record<SessionRepairError, string> = {
  'invalid-window': 'This record does not have a safe editable time window.',
  'invalid-end': 'Choose a valid end time.',
  'existing-overlap': 'Another session already overlaps this record. Nothing changed.',
  'invalid-drift': 'Keep the estimated wander inside the repaired session.',
};

export function SessionRepairEditor({
  record,
  records,
  wallClockEndAt,
  onSave,
  onCancel,
}: {
  record: SessionRecord;
  records: readonly SessionRecord[];
  wallClockEndAt: number;
  onSave: (proposal: SessionRepairProposal) => void;
  onCancel: () => void;
}) {
  const bounds = sessionRepairBounds(record, records, wallClockEndAt);
  const [endedAt, setEndedAt] = useState(localInputValue(record.endedAt));
  const [outcome, setOutcome] = useState<SessionOutcome>(record.outcome);
  const [includeDrift, setIncludeDrift] = useState(false);
  const [driftAt, setDriftAt] = useState(localInputValue(record.startedAt));
  const [driftMinutes, setDriftMinutes] = useState('5');
  const [error, setError] = useState<SessionRepairError | null>(
    bounds ? null : 'invalid-window',
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = proposeSessionRepair({
      record,
      records,
      wallClockEndAt,
      endedAt: new Date(endedAt).getTime(),
      outcome,
      ...(includeDrift
        ? {
            retroactiveDrift: {
              onsetAt: new Date(driftAt).getTime(),
              durationMin: Number(driftMinutes),
            },
          }
        : {}),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onSave(result.proposal);
  }

  return (
    <Dialog
      title="Repair session record"
      description="Adjust the record while it’s fresh. Saved repairs are labeled estimates."
      onRequestClose={onCancel}
      closeLabel="Cancel session repair"
      className="session-repair-dialog"
    >
      <form className="session-repair-form" onSubmit={submit} noValidate>
        <p className="session-repair-scope">
          This changes the record only. It never awards XP, celebrations, or streak credit.
        </p>
        <label>
          <span>Estimated end time</span>
          <input
            type="datetime-local"
            value={endedAt}
            min={bounds ? localInputValue(bounds.earliestEndAt) : undefined}
            max={bounds ? localInputValue(bounds.latestEndAt) : undefined}
            onChange={(event) => setEndedAt(event.target.value)}
            aria-invalid={error === 'invalid-end' || error === 'invalid-window'}
          />
        </label>
        <label>
          <span>How the session ended</span>
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as SessionOutcome)}
          >
            <option value="completed">Finished</option>
            <option value="abandoned">Ended early</option>
            <option value="interrupted">Interrupted</option>
          </select>
        </label>
        <label className="session-repair-check">
          <input
            type="checkbox"
            checked={includeDrift}
            onChange={(event) => setIncludeDrift(event.target.checked)}
          />
          Add an estimated wander
        </label>
        {includeDrift && (
          <fieldset>
            <legend>Estimated wander</legend>
            <label>
              <span>Started around</span>
              <input
                type="datetime-local"
                value={driftAt}
                onChange={(event) => setDriftAt(event.target.value)}
                aria-invalid={error === 'invalid-drift'}
              />
            </label>
            <label>
              <span>About how many minutes?</span>
              <input
                type="number"
                min={1}
                step={1}
                value={driftMinutes}
                onChange={(event) => setDriftMinutes(event.target.value)}
                aria-invalid={error === 'invalid-drift'}
              />
            </label>
          </fieldset>
        )}
        {error && <p className="field-error session-repair-error" role="alert">{ERROR_COPY[error]}</p>}
        <div className="dialog-actions">
          <button type="submit" className="dialog-primary" disabled={!bounds}>
            save repair
          </button>
          <button type="button" onClick={onCancel}>
            keep original
          </button>
        </div>
      </form>
    </Dialog>
  );
}
