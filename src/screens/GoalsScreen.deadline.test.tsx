/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Goal } from '../store/goals';
import { GoalsScreen } from './GoalsScreen';

vi.mock('../components/PixelPal', () => ({
  PixelPal: () => <div aria-hidden="true" />,
}));

function at(year: number, month: number, day: number, hour = 12): number {
  return new Date(year, month - 1, day, hour).getTime();
}

function finishedGoal(
  id: number,
  title: string,
  completedAt?: number,
): Goal {
  return {
    id,
    title,
    due: '2026-07-19',
    target: 4,
    done: 4,
    createdAt: at(2026, 7, 1),
    completedAt,
  };
}

afterEach(cleanup);

it('renders deadline outcomes from known timestamps and neutral legacy copy', () => {
  const goals = [
    finishedGoal(1, 'Before', at(2026, 7, 18, 12)),
    finishedGoal(2, 'On boundary', at(2026, 7, 20, 3)),
    finishedGoal(3, 'After boundary', at(2026, 7, 20, 4)),
    finishedGoal(4, 'Legacy unknown'),
  ];
  const bloom = {
    state: {
      goals,
      tasks: [],
      goalLedger: [],
      settings: { dayStartHour: 4 },
    },
    now: at(2026, 7, 21),
    today: '2026-07-21',
    palSprite: 'sprout',
    actions: {
      updateGoal: vi.fn(),
      removeGoal: vi.fn(),
      restoreGoal: vi.fn(),
      addGoal: vi.fn(),
      logGoal: vi.fn(),
    },
  } as unknown as Parameters<typeof GoalsScreen>[0]['bloom'];

  render(<GoalsScreen bloom={bloom} />);

  expect(screen.getByText('Finished before the due date ♡')).toBeTruthy();
  expect(screen.getByText('Finished on the due date ♡')).toBeTruthy();
  expect(screen.getByText('Finished after the due date — the work still counts')).toBeTruthy();
  expect(screen.getByText('Finished — the completion date wasn’t recorded')).toBeTruthy();
});
