/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_CADENCE,
  EMPTY_PERSONAL_CADENCE,
  cadencePreset,
} from '../insights/cadence';
import { EMPTY_GUIDE_READ_STATE } from '../store/guide';
import {
  foundationEntryId,
  foundationInstanceId,
  type FoundationsState,
} from '../store/foundations';
import type { SessionRecord } from '../store/sessions';
import type { DayPlanState } from '../store/dailyTarget';
import type { GoalCredit } from '../store/goalLedger';
import { WeeklyReview } from './WeeklyReview';

vi.mock('./PixelPal', () => ({
  PixelPal: () => <div data-testid="pixel-pal" />,
}));

function record(id: string, endedAt: number): SessionRecord {
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
  };
}

describe('WeeklyReview clock roles', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('includes a session completed after the last day-refresh signal', () => {
    vi.useFakeTimers();
    const currentTime = new Date('2026-07-16T18:00:00').getTime();
    const dayRefreshAt = new Date('2026-07-16T09:00:00').getTime();
    vi.setSystemTime(currentTime);

    const records = [
      record('s-1', new Date('2026-07-15T09:00:00').getTime()),
      record('s-2', new Date('2026-07-15T11:00:00').getTime()),
      record('s-3', new Date('2026-07-15T14:00:00').getTime()),
      record('s-4', new Date('2026-07-16T08:00:00').getTime()),
      record('s-after-refresh', new Date('2026-07-16T12:00:00').getTime()),
    ];

    render(
      <WeeklyReview
        records={records}
        now={dayRefreshAt}
        studyDay="2026-07-16"
        dayStartHour={0}
        palSprite="cat"
        onDismiss={vi.fn()}
        onApplyCadence={vi.fn()}
        onCacheCadence={vi.fn()}
        currentCadence={DEFAULT_CADENCE}
        personalCadence={EMPTY_PERSONAL_CADENCE}
        chronotype="notSure"
        guideRead={EMPTY_GUIDE_READ_STATE}
        onGuideSuggested={vi.fn()}
        onOpenGuideArticle={vi.fn()}
      />,
    );

    expect(screen.getByText(/our little week, in review/)).toBeTruthy();
    expect(screen.getByText(/what helped you start/)).toBeTruthy();
    expect(screen.getByText(/worth a try: one tiny 2-minute session/)).toBeTruthy();
  });

  it('keeps the computed cadence apply and one-tap revert available together', () => {
    vi.useFakeTimers();
    const currentTime = new Date('2026-07-16T18:00:00').getTime();
    vi.setSystemTime(currentTime);
    const onApplyCadence = vi.fn();
    const recommendation = {
      preset: cadencePreset(30, 6),
      kind: 'stretch' as const,
      text: 'your recent sessions can support a longer rung.',
      because: 'five recent finishes make this worth an experiment.',
      evidenceKey: 'breaks-are-fuel' as const,
      rungs: {
        shorter: cadencePreset(25, 5),
        current: cadencePreset(30, 6),
        longer: cadencePreset(35, 7),
      },
    };

    render(
      <WeeklyReview
        records={Array.from({ length: 5 }, (_, index) =>
          record(`s-${index}`, currentTime - index * 60_000))}
        now={currentTime}
        studyDay="2026-07-16"
        dayStartHour={0}
        palSprite="cat"
        onDismiss={vi.fn()}
        onApplyCadence={onApplyCadence}
        onCacheCadence={vi.fn()}
        currentCadence={{ focusMin: 25, breakMin: 5 }}
        personalCadence={{
          computedAt: currentTime,
          recommendation,
          history: [{ focusMin: 20, breakMin: 5 }],
        }}
        chronotype="notSure"
        guideRead={EMPTY_GUIDE_READ_STATE}
        onGuideSuggested={vi.fn()}
        onOpenGuideArticle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'try 30/6 ♡' }));
    fireEvent.click(screen.getByRole('button', { name: 'back to 20/5' }));
    expect(onApplyCadence).toHaveBeenNthCalledWith(1, recommendation.preset);
    expect(onApplyCadence).toHaveBeenNthCalledWith(2, { focusMin: 20, breakMin: 5 });
  });

  it('uses current sessions for guide suggestions after the day-refresh signal', () => {
    vi.useFakeTimers();
    const currentTime = new Date('2026-07-16T18:00:00').getTime();
    const dayRefreshAt = new Date('2026-07-16T09:00:00').getTime();
    vi.setSystemTime(currentTime);
    const onGuideSuggested = vi.fn();

    render(
      <WeeklyReview
        records={Array.from({ length: 3 }, (_, index) => ({
          ...record(`abandoned-${index}`, currentTime - (3 - index) * 60 * 60_000),
          outcome: 'abandoned' as const,
        }))}
        now={dayRefreshAt}
        studyDay="2026-07-16"
        dayStartHour={0}
        palSprite="cat"
        onDismiss={vi.fn()}
        onApplyCadence={vi.fn()}
        onCacheCadence={vi.fn()}
        currentCadence={DEFAULT_CADENCE}
        personalCadence={EMPTY_PERSONAL_CADENCE}
        chronotype="notSure"
        guideRead={EMPTY_GUIDE_READ_STATE}
        onGuideSuggested={onGuideSuggested}
        onOpenGuideArticle={vi.fn()}
      />,
    );

    expect(screen.getByText('A few starts ended early. Want one small next-step note?')).toBeTruthy();
    expect(onGuideSuggested).toHaveBeenCalledWith('first-pebble', 'weekly:2026-07-13');
  });

  it('adds at most one guarded foundations sentence to the weekly surface', () => {
    vi.useFakeTimers();
    const currentTime = new Date('2026-07-16T18:00:00').getTime();
    vi.setSystemTime(currentTime);
    const instance = {
      id: foundationInstanceId('phone-away'),
      type: 'phone-away' as const,
      enabled: true,
      order: 0,
      ranges: [{ from: '2026-07-01' }],
      createdAt: new Date('2026-07-01T12:00:00').getTime(),
    };
    const foundations: FoundationsState = {
      instances: [instance],
      entries: ['06', '07', '08', '13', '14', '15', '16'].map((day) => {
        const dayKey = `2026-07-${day}`;
        return {
          id: foundationEntryId(instance.id, dayKey),
          instanceId: instance.id,
          dayKey,
          recordedAt: currentTime,
        };
      }),
      archive: [],
    };

    render(
      <WeeklyReview
        records={Array.from({ length: 5 }, (_, index) =>
          record(`s-${index}`, currentTime - index * 60_000))}
        now={currentTime}
        studyDay="2026-07-16"
        dayStartHour={0}
        foundations={foundations}
        palSprite="cat"
        onDismiss={vi.fn()}
        onApplyCadence={vi.fn()}
        onCacheCadence={vi.fn()}
        currentCadence={DEFAULT_CADENCE}
        personalCadence={EMPTY_PERSONAL_CADENCE}
        chronotype="notSure"
        guideRead={EMPTY_GUIDE_READ_STATE}
        onGuideSuggested={vi.fn()}
        onOpenGuideArticle={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        '🌿 Phone away was recorded on 4 days this week (3 last week) — both count.',
      ),
    ).toBeTruthy();
    expect(document.querySelectorAll('.foundation-week-line')).toHaveLength(1);
  });

  it('mounts one guarded plan calibration line from prior-week targets and sessions', () => {
    vi.useFakeTimers();
    const currentTime = new Date('2026-07-30T12:00:00').getTime();
    vi.setSystemTime(currentTime);
    const days = [20, 21, 22];
    const records = days.map((day, index) =>
      record(`plan-session-${index}`, new Date(2026, 6, day, 12).getTime()),
    );
    const dayPlan: DayPlanState = {
      targets: days.map((day, index) => ({
        id: `target-${index}`,
        goalId: 1,
        dayKey: `2026-07-${day}`,
        plannedAmount: 4,
        snapshot: Object.freeze({ title: 'Lectures', unit: 'lectures' }),
        createdAt: currentTime,
        ...(index === 1 ? { carriedFromDayKey: '2026-07-20' } : {}),
      })),
      archive: [],
    };
    const goalLedger: GoalCredit[] = days.map((day, index) => ({
      id: `credit-${index}`,
      goalId: 1,
      delta: 3,
      source: 'session',
      sessionId: records[index].id,
      dayKey: `2026-07-${day}`,
      at: records[index].endedAt,
    }));

    render(
      <WeeklyReview
        records={records}
        now={currentTime}
        studyDay="2026-07-30"
        dayStartHour={0}
        dayPlan={dayPlan}
        goalLedger={goalLedger}
        palSprite="cat"
        onDismiss={vi.fn()}
        onApplyCadence={vi.fn()}
        onCacheCadence={vi.fn()}
        currentCadence={DEFAULT_CADENCE}
        personalCadence={EMPTY_PERSONAL_CADENCE}
        chronotype="notSure"
        guideRead={EMPTY_GUIDE_READ_STATE}
        onGuideSuggested={vi.fn()}
        onOpenGuideArticle={vi.fn()}
      />,
    );

    expect(screen.getByText(
      '🌱 You planned 12 and recorded 9 across 3 days — planning 9 might feel better. 4 of the planned parts were carried in.',
    )).toBeTruthy();
    expect(document.querySelectorAll('.plan-calibration-line')).toHaveLength(1);
  });
});
