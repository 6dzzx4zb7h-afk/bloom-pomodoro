/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  foundationEntryId,
  foundationInstanceId,
  type FoundationsState,
} from '../store/foundations';
import type { SessionRecord } from '../store/sessions';
import {
  appendCompletedTaskArchiveRow,
  archiveSessionRecords,
  completedTaskArchiveRow,
  emptyHistoryArchive,
} from '../store/historyArchive';
import type { CompanionEvent } from '../store/companion';
import {
  buildHistoryDays,
  historySessionDetails,
  HistoryScreen,
} from './HistoryScreen';

function localAt(year: number, month: number, day: number, hour: number, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function record(
  id: string,
  endedAt: number,
  patch: Partial<SessionRecord> = {},
): SessionRecord {
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

afterEach(cleanup);

describe('HistoryScreen', () => {
  it('adds archived summaries and task rows without duplicating a live completion', () => {
    const now = localAt(2026, 7, 27, 12);
    const endedAt = localAt(2026, 7, 26, 10);
    const liveTask = {
      id: 1,
      t: 'Live completion',
      done: true,
      completedAt: endedAt + 1_000,
    };
    let archive = archiveSessionRecords(emptyHistoryArchive(), [
      record('archived-session', endedAt, {
        actualMin: 15,
        driftEventIds: ['archived-wander'],
      }),
    ]);
    for (const row of [
      completedTaskArchiveRow({
        taskId: liveTask.id,
        title: liveTask.t,
        completedAt: liveTask.completedAt,
      })!,
      completedTaskArchiveRow({
        taskId: 2,
        title: 'Archived completion',
        completedAt: endedAt + 2_000,
      })!,
    ]) {
      archive = appendCompletedTaskArchiveRow(archive, row);
    }
    const liveRecord = record('live-session', endedAt + 3_000, {
      actualMin: 10,
    });

    const days = buildHistoryDays(
      [liveRecord],
      [liveTask],
      0,
      now,
      undefined,
      [],
      [],
      archive,
    );

    expect(days).toHaveLength(1);
    expect(days[0]?.archived).toMatchObject({
      focusMinutes: 15,
      sessionCount: 1,
    });
    expect(days[0]?.tasks.map((task) => task.t)).toEqual([
      'Live completion',
      'Archived completion',
    ]);

    render(
      <HistoryScreen
        records={[liveRecord]}
        tasks={[liveTask]}
        archive={archive}
        dayStartHour={0}
        now={now}
      />,
    );

    const totals = screen.getByRole('list', { name: '2026-07-26 totals' });
    expect(within(totals).getByText('25 focus min')).toBeTruthy();
    expect(within(totals).getByText('2 sessions')).toBeTruthy();
    expect(within(totals).getByText('2 tasks finished')).toBeTruthy();
    expect(screen.getAllByText('Live completion')).toHaveLength(1);
    expect(screen.getByText('Archived completion')).toBeTruthy();
    expect(
      screen.getByText('Earlier session details are included in this day’s totals.'),
    ).toBeTruthy();
  });

  it('groups retained sessions and timestamped task finishes by the study-day boundary', () => {
    const now = localAt(2026, 7, 27, 12);
    const lateNight = localAt(2026, 7, 26, 2, 30);
    const days = buildHistoryDays(
      [
        record('late', lateNight, {
          actualMin: 12.5,
          outcome: 'completed',
          targetText: 'Draft the opening',
          driftEventIds: ['wander-1'],
        }),
      ],
      [
        { id: 1, t: 'Draft outline', done: true, completedAt: lateNight + 10_000 },
        { id: 2, t: 'Carried task', done: false, completedAt: lateNight + 20_000 },
        { id: 3, t: 'Legacy completion', done: true },
      ],
      4,
      now,
    );

    expect(days).toHaveLength(1);
    expect(days[0]?.day).toBe('2026-07-25');
    expect(days[0]?.tasks.map((task) => task.t)).toEqual(['Draft outline']);

    render(
      <HistoryScreen
        records={days[0]!.sessions}
        tasks={[
          { id: 1, t: 'Draft outline', done: true, completedAt: lateNight + 10_000 },
          { id: 2, t: 'Carried task', done: false, completedAt: lateNight + 20_000 },
          { id: 3, t: 'Legacy completion', done: true },
        ]}
        dayStartHour={4}
        now={now}
      />,
    );

    expect(screen.getByRole('main', { name: 'History' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Jul 25');

    const totals = screen.getByRole('list', { name: '2026-07-25 totals' });
    expect(within(totals).getByText('12.5 focus min')).toBeTruthy();
    expect(within(totals).getByText('1 session')).toBeTruthy();
    expect(within(totals).getByText('1 wander')).toBeTruthy();
    expect(within(totals).getByText('1 recovery')).toBeTruthy();
    expect(within(totals).getByText('1 task finished')).toBeTruthy();

    expect(screen.getByText('Target: Draft the opening')).toBeTruthy();
    expect(screen.getByText('Draft outline')).toBeTruthy();
    expect(screen.queryByText('Carried task')).toBeNull();
    expect(screen.queryByText('Legacy completion')).toBeNull();
  });

  it('shows linked wander phases and a stable parked-thought count in session details', () => {
    const now = localAt(2026, 7, 27, 12);
    const endedAt = localAt(2026, 7, 26, 10);
    const session = record('session-details', endedAt, {
      driftEventIds: ['wander-early', 'wander-late'],
      parkedThoughtCount: 2,
      edited: true,
      editedAt: now,
    });
    const events: CompanionEvent[] = [
      {
        id: 'wander-early',
        sessionId: session.id,
        ts: endedAt - 20 * 60_000,
        shownAt: endedAt - 20 * 60_000,
        min: 2,
        len: 25,
        kind: 'wander',
        src: 'checkin',
      },
      {
        id: 'wander-late',
        sessionId: session.id,
        ts: endedAt - 2 * 60_000,
        shownAt: endedAt - 2 * 60_000,
        min: 22,
        len: 25,
        kind: 'rabbit',
        src: 'checkin',
      },
    ];

    expect(historySessionDetails(session, events, [], now)).toEqual({
      driftCount: 2,
      phaseCounts: { early: 1, mid: 0, late: 1 },
      parkedThoughtCount: 2,
    });
    expect(historySessionDetails(
      { ...session, parkedThoughtCount: undefined },
      events,
      [{
        id: 'legacy-linked-note',
        text: 'Retained note',
        parkedAt: endedAt - 10 * 60_000,
        sessionId: session.id,
        revealedAt: endedAt,
      }],
      now,
    ).parkedThoughtCount).toBe(1);

    const { container } = render(
      <HistoryScreen
        records={[session]}
        tasks={[]}
        events={events}
        parking={[]}
        dayStartHour={0}
        now={now}
      />,
    );
    fireEvent.click(container.querySelector('summary')!);

    const timing = screen.getByRole('list', { name: 'Wander timing' });
    expect(within(timing).getByText('early ×1')).toBeTruthy();
    expect(within(timing).getByText('late ×1')).toBeTruthy();
    expect(screen.getByText('2 parked thoughts')).toBeTruthy();
    expect(screen.getByText('Edited estimate')).toBeTruthy();
  });

  it('announces when a saved repair was clamped before the next session', () => {
    const now = localAt(2026, 7, 26, 12);
    const source = record('repair-source', localAt(2026, 7, 26, 9, 10), {
      actualMin: 10,
      outcome: 'interrupted',
      returnSnapshot: {
        capturedAt: localAt(2026, 7, 26, 9, 10),
        returnedAt: localAt(2026, 7, 26, 9, 40),
        elapsedSec: 600,
        remainingSec: 900,
        mode: 'focus',
        round: 1,
        sessionId: 'repair-source',
      },
    });
    const next = record('repair-next', localAt(2026, 7, 26, 9, 35), {
      startedAt: localAt(2026, 7, 26, 9, 18),
      actualMin: 17,
    });
    const onRepair = vi.fn();
    const { container } = render(
      <HistoryScreen
        records={[source, next]}
        tasks={[]}
        dayStartHour={0}
        now={now}
        onRepair={onRepair}
      />,
    );

    fireEvent.click(container.querySelector('summary')!);
    fireEvent.click(screen.getByRole('button', {
      name: /Repair Focus session ending 9:10 AM/i,
    }));
    fireEvent.change(screen.getByLabelText('Estimated end time'), {
      target: { value: '2026-07-26T09:35' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save repair' }));

    expect(onRepair).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ endedAt: localAt(2026, 7, 26, 9, 18) }),
      adjustments: ['next-session'],
    }));
    expect(screen.getByRole('status').textContent).toBe(
      'Repair saved as an estimate. Its end time stops at the next session.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pages dense history with a named native button and a polite count update', () => {
    const now = localAt(2026, 7, 30, 12);
    const records = Array.from({ length: 8 }, (_, index) =>
      record(
        `session-${index}`,
        localAt(2026, 7, 29 - index, 14),
        { actualMin: index + 1 },
      ),
    );
    const { container } = render(
      <HistoryScreen
        records={records}
        tasks={[]}
        dayStartHour={0}
        now={now}
        pageSize={3}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByText('Showing 3 of 8 study days.')).toBeTruthy();
    const more = screen.getByRole('button', { name: 'Show earlier days' });
    expect(more.getAttribute('type')).toBe('button');
    expect(more.getAttribute('aria-controls')).toBe('history-day-list');
    more.focus();
    expect(document.activeElement).toBe(more);

    const firstSummary = container.querySelector('summary');
    expect(firstSummary).toBeTruthy();
    firstSummary?.focus();
    expect(document.activeElement).toBe(firstSummary);

    fireEvent.click(more);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
    expect(screen.getByText('Showing 6 of 8 study days.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show earlier days' }));
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(8);
    expect(screen.getByText('Showing 8 of 8 study days.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show earlier days' })).toBeNull();
    expect(container.querySelector('.history-scroll')).toBeTruthy();
  });

  it('shows recorded foundations, derived focused work, and per-goal credit totals', () => {
    const now = localAt(2026, 7, 27, 12);
    const endedAt = localAt(2026, 7, 26, 2, 30);
    const dayKey = '2026-07-25';
    const phoneId = foundationInstanceId('phone-away');
    const foundations: FoundationsState = {
      instances: [
        {
          id: phoneId,
          type: 'phone-away',
          enabled: true,
          order: 0,
          ranges: [{ from: '2026-07-01' }],
          createdAt: localAt(2026, 7, 1, 12),
        },
        {
          id: foundationInstanceId('focused-work'),
          type: 'focused-work',
          enabled: true,
          order: 1,
          ranges: [{ from: '2026-07-01' }],
          createdAt: localAt(2026, 7, 1, 12),
        },
      ],
      entries: [{
        id: foundationEntryId(phoneId, dayKey),
        instanceId: phoneId,
        dayKey,
        recordedAt: endedAt,
      }],
      archive: [],
    };

    render(
      <HistoryScreen
        records={[record('late-session', endedAt)]}
        tasks={[]}
        foundations={foundations}
        goals={[{
          id: 9,
          title: 'Exam review',
          due: '2026-08-01',
          target: 12,
          done: 3,
          unit: 'lectures',
          createdAt: localAt(2026, 7, 1, 12),
        }]}
        goalLedger={[
          {
            id: 'credit-1',
            goalId: 9,
            delta: 1,
            source: 'manual',
            dayKey,
            at: endedAt,
          },
          {
            id: 'credit-2',
            goalId: 9,
            delta: 2,
            source: 'session',
            sessionId: 'late-session',
            dayKey,
            at: endedAt,
          },
        ]}
        dayStartHour={4}
        now={now}
      />,
    );

    const chips = screen.getByRole('list', {
      name: '2026-07-25 foundations and goal progress',
    });
    expect(within(chips).getByText('Phone away')).toBeTruthy();
    expect(within(chips).getByText('Focused work')).toBeTruthy();
    expect(within(chips).getByText('+3 lectures toward Exam review')).toBeTruthy();
  });

  it('shows a calm empty state when no trustworthy timestamps exist', () => {
    render(
      <HistoryScreen
        records={[]}
        tasks={[
          { id: 1, t: 'Open item', done: false },
          { id: 2, t: 'Undated old item', done: true },
        ]}
        dayStartHour={3}
        now={localAt(2026, 7, 26, 12)}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'A fresh page' })).toBeTruthy();
    expect(
      screen.getByText(
        'Recorded sessions, tasks, foundations, and goal progress will gather here.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: /totals/ })).toBeNull();
  });
});
