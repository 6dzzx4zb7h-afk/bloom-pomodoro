/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolloverTriageCard } from './RolloverTriageCard';
import type { RolloverOffer } from '../store/dailyTarget';

const offer: RolloverOffer = {
  target: {
    id: 'yesterday-goal',
    goalId: 4,
    dayKey: '2026-07-25',
    plannedAmount: 3,
    snapshot: Object.freeze({ title: 'Biology review', unit: 'lectures' }),
    createdAt: 1,
  },
  actual: 1,
  remainder: 2,
};

afterEach(cleanup);

describe('RolloverTriageCard', () => {
  it('states its basis and cap without a modal or judgment state', () => {
    render(
      <RolloverTriageCard
        offer={offer}
        onCarry={vi.fn()}
        onSpread={vi.fn()}
        onRest={vi.fn()}
      />,
    );

    const card = screen.getByRole('region', { name: 'Yesterday’s plan' });
    expect(within(card).getByText(
      'Yesterday’s plan still has 2 lectures open for Biology review. Today can start fresh: carry them, spread them, or let them rest?',
    )).toBeTruthy();
    expect(within(card).getByText('Shows at most once a day.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes the three choices as native buttons', () => {
    const onCarry = vi.fn();
    const onSpread = vi.fn();
    const onRest = vi.fn();
    render(
      <RolloverTriageCard
        offer={offer}
        onCarry={onCarry}
        onSpread={onSpread}
        onRest={onRest}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Carry to today' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spread it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Let it rest' }));

    expect(onCarry).toHaveBeenCalledOnce();
    expect(onSpread).toHaveBeenCalledOnce();
    expect(onRest).toHaveBeenCalledOnce();
  });
});
