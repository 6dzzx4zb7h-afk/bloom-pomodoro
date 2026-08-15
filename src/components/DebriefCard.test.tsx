/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_GUIDE_READ_STATE } from '../store/guide';
import type { SessionRecord } from '../store/sessions';
import { DebriefCard } from './DebriefCard';

vi.mock('./PixelPal', () => ({ PixelPal: () => <div aria-hidden="true" /> }));

afterEach(cleanup);

describe('DebriefCard repaired record', () => {
  it('shows the estimate label and keeps repair at a natural pause', () => {
    const endedAt = new Date(2026, 6, 26, 9, 25).getTime();
    const record: SessionRecord = {
      id: 'edited-debrief',
      startedAt: endedAt - 25 * 60_000,
      endedAt,
      mode: 'focus',
      plannedMin: 25,
      actualMin: 25,
      outcome: 'completed',
      startHour: 9,
      driftEventIds: [],
      edited: true,
      editedAt: endedAt + 60_000,
    };

    render(
      <div className="phone">
        <DebriefCard
          record={record}
          records={[record]}
          palSprite="bunny"
          onTargetOutcome={vi.fn()}
          onResolveGoalCredit={vi.fn()}
          onTinyRestart={vi.fn()}
          guideRead={EMPTY_GUIDE_READ_STATE}
          now={endedAt + 2 * 60_000}
          dayStartHour={0}
          onGuideSuggested={vi.fn()}
          onOpenGuideArticle={vi.fn()}
          onRepair={vi.fn()}
          onDismiss={vi.fn()}
        />
      </div>,
    );

    expect(screen.getByRole('status', { name: 'Session debrief' })).toBeTruthy();
    expect(screen.getByText('Edited estimate')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'repair record' })).toBeTruthy();
  });

  it('echoes every daily target touched by the session, up to the caller-owned cap', () => {
    const endedAt = new Date(2026, 6, 26, 9, 25).getTime();
    const record: SessionRecord = {
      id: 'target-debrief',
      startedAt: endedAt - 25 * 60_000,
      endedAt,
      mode: 'focus',
      plannedMin: 25,
      actualMin: 25,
      outcome: 'completed',
      startHour: 9,
      taskId: 7,
      goalId: 3,
      driftEventIds: [],
    };

    render(
      <DebriefCard
        record={record}
        records={[record]}
        palSprite="bunny"
        onTargetOutcome={vi.fn()}
        onResolveGoalCredit={vi.fn()}
        dailyTargetEchoes={[
          { id: 'goal', title: 'Biology', actual: 2, planned: 3, unit: 'lectures' },
          { id: 'task', title: 'Read notes', actual: 1, planned: 2, unit: 'sessions' },
        ]}
        onTinyRestart={vi.fn()}
        guideRead={EMPTY_GUIDE_READ_STATE}
        now={endedAt}
        dayStartHour={0}
        onGuideSuggested={vi.fn()}
        onOpenGuideArticle={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('🌱 Biology · today 2/3 lectures')).toBeTruthy();
    expect(screen.getByText('🌱 Read notes · today 1/2 sessions')).toBeTruthy();
  });
});
