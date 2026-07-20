/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CADENCE, EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { EMPTY_GUIDE_READ_STATE } from '../store/guide';
import type { SessionRecord } from '../store/sessions';
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
  });
});
