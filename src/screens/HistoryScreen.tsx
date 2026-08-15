import { useMemo, useState } from 'react';

import { SessionRepairEditor } from '../components/SessionRepairEditor';
import { driftsForRecord } from '../insights/why';
import {
  driftOnsetMin,
  phaseOf,
  type CompanionEvent,
  type Phase,
} from '../store/companion';
import { dayKeyFor } from '../store/dayKey';
import {
  derivedFoundationDone,
  foundationName,
  isManualFoundationType,
  type FoundationsState,
} from '../store/foundations';
import { goalUnit, type Goal } from '../store/goals';
import type { GoalCredit } from '../store/goalLedger';
import {
  emptyHistoryArchive,
  historyArchiveDaySummaries,
  type HistoryArchive,
  type HistoryArchiveDaySummary,
} from '../store/historyArchive';
import { groupSessionsByStudyDay } from '../store/sessionStats';
import type { SessionRecord } from '../store/sessions';
import type { ParkedThought } from '../store/parking';
import {
  isSessionRepairEligible,
  sessionRepairSavedMessage,
  sessionRepairWallClockEndAt,
  type SessionRepairProposal,
} from '../store/sessionRepair';

export const HISTORY_PAGE_SIZE = 7;

export interface HistoryTask {
  id: number;
  t: string;
  done: boolean;
  completedAt?: number;
}

interface HistoryDay {
  day: string;
  sessions: SessionRecord[];
  tasks: Array<HistoryTask & { completedAt: number; rowKey: string }>;
  archived: HistoryArchiveDaySummary | null;
  foundationChips: string[];
  goalCreditChips: string[];
}

interface HistoryScreenProps {
  records: SessionRecord[];
  tasks: HistoryTask[];
  dayStartHour: number;
  now: number;
  foundations?: FoundationsState;
  goalLedger?: GoalCredit[];
  goals?: Goal[];
  archive?: HistoryArchive;
  events?: CompanionEvent[];
  parking?: ParkedThought[];
  onRepair?: (proposal: SessionRepairProposal) => boolean | void;
  /** Kept injectable so the paging contract has a small, deterministic test. */
  pageSize?: number;
}

function isTimestampedCompletion(
  task: HistoryTask,
  now: number,
): task is HistoryTask & { completedAt: number } {
  return (
    task.done &&
    typeof task.completedAt === 'number' &&
    Number.isFinite(task.completedAt) &&
    task.completedAt >= 0 &&
    task.completedAt <= now &&
    task.t.trim().length > 0
  );
}

/** Build the retained, timestamp-backed ledger without inventing old task dates. */
export function buildHistoryDays(
  records: SessionRecord[],
  tasks: HistoryTask[],
  dayStartHour: number,
  now: number,
  foundations?: FoundationsState,
  goalLedger: readonly GoalCredit[] = [],
  goals: readonly Goal[] = [],
  archive: HistoryArchive = emptyHistoryArchive(),
): HistoryDay[] {
  const byDay = new Map<string, HistoryDay>();
  const blankDay = (day: string): HistoryDay => ({
    day,
    sessions: [],
    tasks: [],
    archived: null,
    foundationChips: [],
    goalCreditChips: [],
  });
  const today = dayKeyFor(now, dayStartHour);

  for (const summary of historyArchiveDaySummaries(archive, dayStartHour)) {
    if (summary.dayKey > today) continue;
    const entry = byDay.get(summary.dayKey) ?? blankDay(summary.dayKey);
    entry.archived = summary;
    byDay.set(summary.dayKey, entry);
  }

  for (const group of groupSessionsByStudyDay(records, dayStartHour, now)) {
    const entry = byDay.get(group.day) ?? blankDay(group.day);
    entry.sessions = group.records;
    byDay.set(group.day, entry);
  }

  const completionIds = new Set<string>();
  for (const task of tasks) {
    if (!isTimestampedCompletion(task, now)) continue;
    const completionId = `task-${task.id}:${task.completedAt}`;
    completionIds.add(completionId);
    const day = dayKeyFor(task.completedAt, dayStartHour);
    const entry = byDay.get(day) ?? blankDay(day);
    entry.tasks.push({ ...task, rowKey: `live-${completionId}` });
    byDay.set(day, entry);
  }
  for (const task of archive.completedTasks) {
    if (
      completionIds.has(task.id) ||
      task.completedAt > now ||
      task.title.trim().length === 0
    ) {
      continue;
    }
    const day = dayKeyFor(task.completedAt, dayStartHour);
    const entry = byDay.get(day) ?? blankDay(day);
    entry.tasks.push({
      id: task.taskId,
      t: task.title,
      done: true,
      completedAt: task.completedAt,
      rowKey: `archive-${task.id}`,
    });
    byDay.set(day, entry);
  }

  if (foundations) {
    const ordered = [...foundations.instances].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );
    for (const instance of ordered) {
      if (isManualFoundationType(instance.type)) {
        for (const foundationEntry of foundations.entries) {
          if (foundationEntry.instanceId !== instance.id || foundationEntry.dayKey > today) continue;
          const day = byDay.get(foundationEntry.dayKey) ?? blankDay(foundationEntry.dayKey);
          day.foundationChips.push(foundationName(instance));
          byDay.set(foundationEntry.dayKey, day);
        }
      } else if (instance.type === 'focused-work') {
        for (const day of byDay.values()) {
          if (
            derivedFoundationDone(records, day.day, dayStartHour) ||
            (day.archived?.completedSessionCount ?? 0) > 0
          ) {
            day.foundationChips.push(foundationName(instance));
          }
        }
      }
    }
  }

  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const creditsByDay = new Map<string, Map<number, number>>();
  for (const credit of goalLedger) {
    if (
      credit.source === 'carryover' ||
      credit.dayKey > today ||
      !Number.isFinite(credit.at) ||
      credit.at > now ||
      !goalsById.has(credit.goalId)
    ) continue;
    const byGoal = creditsByDay.get(credit.dayKey) ?? new Map<number, number>();
    byGoal.set(credit.goalId, (byGoal.get(credit.goalId) ?? 0) + credit.delta);
    creditsByDay.set(credit.dayKey, byGoal);
  }
  for (const [dayKey, totals] of creditsByDay) {
    const day = byDay.get(dayKey) ?? blankDay(dayKey);
    for (const [goalId, total] of [...totals].sort(([a], [b]) => a - b)) {
      if (total === 0) continue;
      const goal = goalsById.get(goalId)!;
      day.goalCreditChips.push(
        total > 0
          ? `+${total} ${goalUnit(goal)} toward ${goal.title}`
          : `−${Math.abs(total)} ${goalUnit(goal)} adjustment for ${goal.title}`,
      );
    }
    byDay.set(dayKey, day);
  }

  return [...byDay.values()]
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((entry) => ({
      ...entry,
      tasks: [...entry.tasks].sort(
        (a, b) =>
          a.completedAt - b.completedAt ||
          a.id - b.id ||
          a.rowKey.localeCompare(b.rowKey),
      ),
    }));
}

function studyDayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return day;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function clockLabel(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

function minuteLabel(value: number): string {
  const safe = Math.max(0, value);
  const rounded = Math.round(safe * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function modeLabel(mode: SessionRecord['mode']): string {
  if (mode === 'tiny') return 'Tiny start';
  if (mode === 'flow') return 'Flow';
  return 'Focus';
}

function outcomeLabel(outcome: SessionRecord['outcome']): string {
  if (outcome === 'completed') return 'Finished';
  if (outcome === 'abandoned') return 'Ended early';
  return 'Paused when Bloom closed';
}

const HISTORY_PHASES: Phase[] = ['early', 'mid', 'late'];

export function historySessionDetails(
  record: SessionRecord,
  events: CompanionEvent[],
  parking: ParkedThought[],
  now: number,
) {
  const linkedDrifts = driftsForRecord(record, events, now);
  const driftIds = new Set(record.driftEventIds);
  for (const event of linkedDrifts) {
    if (event.id) driftIds.add(event.id);
  }
  const phaseCounts: Record<Phase, number> = { early: 0, mid: 0, late: 0 };
  for (const event of linkedDrifts) {
    phaseCounts[phaseOf(driftOnsetMin(event), event.len)] += 1;
  }
  const retainedParkingCount = parking.filter(
    (thought) => thought.sessionId === record.id,
  ).length;

  return {
    driftCount: Math.max(driftIds.size, linkedDrifts.length),
    phaseCounts,
    parkedThoughtCount: record.parkedThoughtCount ?? retainedParkingCount,
  };
}

function SessionCard({
  record,
  events,
  parking,
  now,
  canRepair,
  onRepair,
}: {
  record: SessionRecord;
  events: CompanionEvent[];
  parking: ParkedThought[];
  now: number;
  canRepair: boolean;
  onRepair: () => void;
}) {
  const timing =
    record.plannedMin == null
      ? `${minuteLabel(record.actualMin)} min`
      : `${minuteLabel(record.actualMin)} of ${minuteLabel(record.plannedMin)} min`;
  const details = historySessionDetails(record, events, parking, now);
  const phases = HISTORY_PHASES.filter(
    (phase) => details.phaseCounts[phase] > 0,
  );

  return (
    <li className="history-session-card">
      <div className="history-card-title">
        <strong>{modeLabel(record.mode)}</strong>
        <time dateTime={new Date(record.endedAt).toISOString()}>
          {clockLabel(record.endedAt)}
        </time>
      </div>
      {record.edited && <p className="history-estimate-label">Edited estimate</p>}
      <p>{timing} · {outcomeLabel(record.outcome)}</p>
      {record.targetText?.trim() && <p>Target: {record.targetText.trim()}</p>}
      {details.driftCount > 0 && (
        <div className="history-drift-row">
          <p>
            {details.driftCount} {details.driftCount === 1 ? 'wander' : 'wanders'} noted
          </p>
          {phases.length > 0 && (
            <ul className="history-phase-chips" aria-label="Wander timing">
              {phases.map((phase) => (
                <li key={phase}>
                  {phase} ×{details.phaseCounts[phase]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {details.parkedThoughtCount > 0 && (
        <p>
          {details.parkedThoughtCount} parked{' '}
          {details.parkedThoughtCount === 1 ? 'thought' : 'thoughts'}
        </p>
      )}
      {canRepair && (
        <button
          type="button"
          className="history-repair-btn"
          onClick={onRepair}
          aria-label={`Repair ${modeLabel(record.mode)} session ending ${clockLabel(record.endedAt)}`}
        >
          repair record
        </button>
      )}
    </li>
  );
}

function HistoryDayRow({
  entry,
  now,
  events,
  parking,
  repairEnabled,
  onRepair,
}: {
  entry: HistoryDay;
  now: number;
  events: CompanionEvent[];
  parking: ParkedThought[];
  repairEnabled: boolean;
  onRepair: (record: SessionRecord) => void;
}) {
  const focusMinutes = entry.sessions.reduce(
    (total, record) => total + Math.max(0, record.actualMin),
    0,
  ) + (entry.archived?.focusMinutes ?? 0);
  const sessionCount = entry.sessions.length + (entry.archived?.sessionCount ?? 0);
  const driftCount =
    new Set(entry.sessions.flatMap((record) => record.driftEventIds)).size +
    (entry.archived?.driftCount ?? 0);
  const recoveryCount = entry.sessions.filter(
    (record) => record.outcome === 'completed' && record.driftEventIds.length > 0,
  ).length + (entry.archived?.recoveryCount ?? 0);

  return (
    <li className="history-day">
      <details>
        <summary>
          <span className="history-day-heading" role="heading" aria-level={2}>
            <time dateTime={entry.day}>{studyDayLabel(entry.day)}</time>
          </span>
          {(sessionCount > 0 || entry.tasks.length > 0) && (
            <ul className="history-day-totals" aria-label={`${entry.day} totals`}>
              {sessionCount > 0 && (
                <>
                  <li>{minuteLabel(focusMinutes)} focus min</li>
                  <li>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</li>
                  <li>{driftCount} {driftCount === 1 ? 'wander' : 'wanders'}</li>
                  <li>{recoveryCount} {recoveryCount === 1 ? 'recovery' : 'recoveries'}</li>
                </>
              )}
              {entry.tasks.length > 0 && (
                <li>{entry.tasks.length} {entry.tasks.length === 1 ? 'task' : 'tasks'} finished</li>
              )}
            </ul>
          )}
          {(entry.foundationChips.length > 0 || entry.goalCreditChips.length > 0) && (
            <ul
              className="history-reflection-chips"
              aria-label={`${entry.day} foundations and goal progress`}
            >
              {entry.foundationChips.map((label) => <li key={`foundation-${label}`}>{label}</li>)}
              {entry.goalCreditChips.map((label) => <li key={`credit-${label}`}>{label}</li>)}
            </ul>
          )}
          <span className="history-expand-hint" aria-hidden="true">Details</span>
        </summary>

        <div className="history-day-details">
          {entry.sessions.length > 0 && (
            <section aria-labelledby={`history-sessions-${entry.day}`}>
              <h3 id={`history-sessions-${entry.day}`}>Sessions</h3>
              <ul className="history-session-list">
                {entry.sessions.map((record) => (
                  <SessionCard
                    key={record.id}
                    record={record}
                    events={events}
                    parking={parking}
                    now={now}
                    canRepair={repairEnabled && isSessionRepairEligible(record, now)}
                    onRepair={() => onRepair(record)}
                  />
                ))}
              </ul>
            </section>
          )}
          {(entry.archived?.sessionCount ?? 0) > 0 && (
            <p className="history-archive-note">
              Earlier session details are included in this day’s totals.
            </p>
          )}

          {entry.tasks.length > 0 && (
            <section aria-labelledby={`history-tasks-${entry.day}`}>
              <h3 id={`history-tasks-${entry.day}`}>Completed tasks</h3>
              <ul className="history-task-list">
                {entry.tasks.map((task) => (
                  <li key={task.rowKey}>
                    <span>{task.t.trim()}</span>
                    <time dateTime={new Date(task.completedAt).toISOString()}>
                      {clockLabel(task.completedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </details>
    </li>
  );
}

export function HistoryScreen({
  records,
  tasks,
  dayStartHour,
  now,
  foundations,
  goalLedger,
  goals,
  archive = emptyHistoryArchive(),
  events = [],
  parking = [],
  onRepair,
  pageSize = HISTORY_PAGE_SIZE,
}: HistoryScreenProps) {
  const [repairing, setRepairing] = useState<SessionRecord | null>(null);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);
  const days = useMemo(
    () => buildHistoryDays(records, tasks, dayStartHour, now, foundations, goalLedger, goals, archive),
    [records, tasks, dayStartHour, now, foundations, goalLedger, goals, archive],
  );
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const [visibleCount, setVisibleCount] = useState(safePageSize);
  const shownDays = days.slice(0, visibleCount);
  const canShowMore = visibleCount < days.length;

  return (
    <main
      id="history-screen"
      className="screen history-screen"
      aria-labelledby="history-title"
    >
      <header className="history-head">
        <p className="history-eyebrow">Your local ledger</p>
        <h1 id="history-title">History</h1>
        <p>Sessions, timestamped task finishes, foundations, and goal progress by study day.</p>
      </header>

      {repairStatus && (
        <p className="history-repair-status" role="status">
          {repairStatus}
        </p>
      )}

      {days.length === 0 ? (
        <section className="history-empty" aria-labelledby="history-empty-title">
          <h2 id="history-empty-title">A fresh page</h2>
          <p>Recorded sessions, tasks, foundations, and goal progress will gather here.</p>
        </section>
      ) : (
        <div className="history-scroll">
          <p className="sr-only" aria-live="polite">
            Showing {shownDays.length} of {days.length} study days.
          </p>
          <ol id="history-day-list" className="history-days">
            {shownDays.map((entry) => (
              <HistoryDayRow
                key={entry.day}
                entry={entry}
                now={now}
                events={events}
                parking={parking}
                repairEnabled={Boolean(onRepair)}
                onRepair={setRepairing}
              />
            ))}
          </ol>
          {canShowMore && (
            <button
              type="button"
              className="history-more-btn"
              aria-controls="history-day-list"
              onClick={() => setVisibleCount((count) => count + safePageSize)}
            >
              Show earlier days
            </button>
          )}
        </div>
      )}
      {repairing && onRepair && (
        <SessionRepairEditor
          record={repairing}
          records={records}
          wallClockEndAt={sessionRepairWallClockEndAt(repairing)}
          onSave={(proposal) => {
            if (onRepair(proposal) === false) return false;
            setRepairStatus(sessionRepairSavedMessage(proposal.adjustments));
            setRepairing(null);
            return true;
          }}
          onCancel={() => setRepairing(null)}
        />
      )}
    </main>
  );
}
