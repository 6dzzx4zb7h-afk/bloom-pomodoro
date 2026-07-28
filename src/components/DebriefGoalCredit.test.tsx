/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebriefGoalCredit } from './DebriefGoalCredit';

function renderControl(
  overrides: Partial<ComponentProps<typeof DebriefGoalCredit>> = {},
) {
  const onCredit = vi.fn();
  const onSkip = vi.fn();
  render(
    <DebriefGoalCredit
      goalTitle="Read the course"
      unit="chapters"
      remaining={7}
      pacePerDay={2.2}
      onCredit={onCredit}
      onSkip={onSkip}
      {...overrides}
    />,
  );
  return { onCredit, onSkip };
}

describe('DebriefGoalCredit', () => {
  afterEach(cleanup);

  it('prefills from rounded-up pace, clamped to remaining, with unit-aware copy', () => {
    renderControl();
    expect((screen.getByLabelText('chapters to credit') as HTMLInputElement).value).toBe('3');
    expect(screen.getByText('🌼 Move Read the course?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'credit 3 chapters' })).toBeTruthy();
  });

  it('uses one as the neutral fallback and never singularizes the stored unit', () => {
    renderControl({ unit: 'study blocks', pacePerDay: 0 });
    expect((screen.getByLabelText('study blocks to credit') as HTMLInputElement).value).toBe('1');
    expect(screen.getByRole('button', { name: 'credit 1 study blocks' })).toBeTruthy();
  });

  it('offers an accessible stepper', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Increase chapters to credit' }));
    expect((screen.getByLabelText('chapters to credit') as HTMLInputElement).value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease chapters to credit' }));
    expect((screen.getByLabelText('chapters to credit') as HTMLInputElement).value).toBe('3');
  });

  it('soft-clamps over-entry and credits the remainder in one action', () => {
    const { onCredit, onSkip } = renderControl({ remaining: 4 });
    fireEvent.change(screen.getByLabelText('chapters to credit'), {
      target: { value: '9' },
    });
    expect(screen.getByRole('status').textContent).toContain(
      'Bloom can count the 4 chapters left',
    );

    fireEvent.click(screen.getByRole('button', { name: 'credit 4 chapters' }));
    expect(onCredit).toHaveBeenCalledOnce();
    expect(onCredit).toHaveBeenCalledWith(4);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('skips in one action without crediting', () => {
    const { onCredit, onSkip } = renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'not this time' }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onCredit).not.toHaveBeenCalled();
  });

  it('reserves the effort line without inventing it and hides completed goals', () => {
    const { rerender } = render(
      <DebriefGoalCredit
        goalTitle="Draft"
        remaining={2}
        pacePerDay={1}
        effortLine="Recorded from the session’s guarded evidence."
        onCredit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText('Recorded from the session’s guarded evidence.')).toBeTruthy();

    rerender(
      <DebriefGoalCredit
        goalTitle="Draft"
        remaining={0}
        pacePerDay={1}
        onCredit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Goal credit for Draft')).toBeNull();
  });
});
