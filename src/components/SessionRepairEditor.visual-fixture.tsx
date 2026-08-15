import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  sessionRepairSavedMessage,
  type SessionRepairProposal,
} from '../store/sessionRepair';
import type { SessionRecord } from '../store/sessions';
import { SessionRepairEditor } from './SessionRepairEditor';
import '../styles.css';

const at = (hour: number, minute: number) =>
  new Date(2026, 6, 26, hour, minute).getTime();

const source: SessionRecord = {
  id: 'fixture-repair',
  startedAt: at(9, 0),
  endedAt: at(9, 10),
  mode: 'focus',
  plannedMin: 25,
  actualMin: 10,
  outcome: 'interrupted',
  startHour: 9,
  driftEventIds: [],
  resumeCuePending: true,
};
const next: SessionRecord = {
  ...source,
  id: 'fixture-next',
  startedAt: at(9, 18),
  endedAt: at(9, 35),
  actualMin: 17,
};

function Fixture() {
  // Open through the real invoker so the dialog portals into the already
  // mounted phone, matching History and debrief behavior.
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const save = (proposal: SessionRepairProposal) => {
    setStatus(sessionRepairSavedMessage(proposal.adjustments));
    setOpen(false);
  };

  return (
    <div className="bezel">
      <div className={`phone mode-focus${night ? ' night' : ''}`}>
        <main className="screen history-screen" aria-labelledby="fixture-title">
          <header className="history-head">
            <p className="history-eyebrow">Deterministic repair fixture</p>
            <h1 id="fixture-title">History</h1>
          </header>
          <button type="button" className="history-more-btn" onClick={() => setOpen(true)}>
            repair record
          </button>
          {status && <p className="history-repair-status" role="status">{status}</p>}
        </main>
        {open && (
          <SessionRepairEditor
            record={source}
            records={[source, next]}
            wallClockEndAt={at(9, 40)}
            onSave={save}
            onCancel={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

const night = new URLSearchParams(window.location.search).get('theme') === 'night';
document.body.classList.toggle('night', night);

createRoot(document.getElementById('root')!).render(<Fixture />);
