import { createRoot } from 'react-dom/client';

import { TabBar } from '../components/TabBar';
import type { CompanionEvent } from '../store/companion';
import {
  archiveSessionRecords,
  emptyHistoryArchive,
} from '../store/historyArchive';
import type { SessionRecord } from '../store/sessions';
import { HistoryScreen } from './HistoryScreen';
import '../styles.css';

const NOW = new Date(2026, 6, 30, 12).getTime();
const DAY_MS = 86_400_000;

function historyRecord(
  id: string,
  dayOffset: number,
  patch: Partial<SessionRecord> = {},
): SessionRecord {
  const endedAt = NOW - dayOffset * DAY_MS - 2 * 60 * 60_000;
  return {
    id,
    startedAt: endedAt - 25 * 60_000,
    endedAt,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome: 'completed',
    startHour: new Date(endedAt - 25 * 60_000).getHours(),
    driftEventIds: [],
    ...patch,
  };
}

const detailedRecord = historyRecord('fixture-detailed', 1, {
  actualMin: 22.5,
  targetText: 'Shape the opening paragraph',
  driftEventIds: ['fixture-early', 'fixture-late'],
  parkedThoughtCount: 2,
});

const records: SessionRecord[] = [
  detailedRecord,
  historyRecord('fixture-two', 2, { mode: 'tiny', plannedMin: 5, actualMin: 5 }),
  historyRecord('fixture-three', 3, { outcome: 'interrupted', actualMin: 14 }),
  historyRecord('fixture-four', 4, { mode: 'flow', plannedMin: null, actualMin: 38 }),
  historyRecord('fixture-five', 5, { actualMin: 18 }),
  historyRecord('fixture-six', 6),
  historyRecord('fixture-seven', 7, { actualMin: 12 }),
  historyRecord('fixture-eight', 8, { outcome: 'abandoned', actualMin: 9 }),
];

const events: CompanionEvent[] = [
  {
    id: 'fixture-early',
    sessionId: detailedRecord.id,
    ts: detailedRecord.startedAt + 3 * 60_000,
    shownAt: detailedRecord.startedAt + 3 * 60_000,
    min: 3,
    len: 25,
    kind: 'wander',
    src: 'checkin',
  },
  {
    id: 'fixture-late',
    sessionId: detailedRecord.id,
    ts: detailedRecord.startedAt + 21 * 60_000,
    shownAt: detailedRecord.startedAt + 21 * 60_000,
    min: 21,
    len: 25,
    kind: 'rabbit',
    src: 'checkin',
  },
];

const archive = archiveSessionRecords(
  emptyHistoryArchive(),
  [historyRecord('fixture-archived', 10, { actualMin: 15 })],
);
const night = new URLSearchParams(window.location.search).get('theme') === 'night';
document.body.classList.toggle('night', night);

createRoot(document.getElementById('root')!).render(
  <div className="bezel">
    <div className={`phone mode-focus${night ? ' night' : ''}`}>
      <div className="sky-mood" aria-hidden="true">
        <div className="sky-layer sky-focus" />
      </div>
      <HistoryScreen
        records={records}
        archive={archive}
        tasks={[
          {
            id: 1,
            t: 'Draft the outline',
            done: true,
            completedAt: detailedRecord.endedAt + 5 * 60_000,
          },
          {
            id: 2,
            t: 'Open task stays elsewhere',
            done: false,
          },
        ]}
        events={events}
        parking={[]}
        dayStartHour={4}
        now={NOW}
      />
      <TabBar active="history" onChange={() => undefined} showGoals={false} />
    </div>
  </div>,
);
