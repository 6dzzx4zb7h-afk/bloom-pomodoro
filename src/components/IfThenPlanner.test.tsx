/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IfThenPlan } from '../store/ifThen';
import { IfThenPlanner } from './IfThenPlanner';

afterEach(cleanup);

function handlers() {
  return {
    onSelect: vi.fn(), onClear: vi.fn(), onCreate: vi.fn(), onRemove: vi.fn(),
    onOpenChange: vi.fn(),
  };
}

describe('IfThenPlanner context and expansion', () => {
  it('opens directly under its context label and reports opening and closing', () => {
    const actions = handlers();
    render(<IfThenPlanner plans={[]} selectedId={null} {...actions}
      title="Plan for distractions" triggerLabel="Plan for distractions" initialCueType="obstacle" />);

    expect(actions.onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Plan for distractions optional' }));
    expect(screen.getByRole('group', { name: 'Plan for distractions' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Plan for distractions' }));
    expect(document.activeElement).not.toBe(screen.getByLabelText('If — the cue'));
    expect(screen.getByText(/if I check my phone, then I return to this paragraph/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a detour' }).getAttribute('aria-pressed')).toBe('true');
    expect(actions.onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close planner' }));
    expect(actions.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('group', { name: 'Plan for distractions' })).toBeNull();
    expect(actions.onCreate).not.toHaveBeenCalled();
  });

  it('selects the saved response and reports collapsed state when the new plan arrives', () => {
    const actions = handlers();
    const props = { plans: [] as IfThenPlan[], selectedId: null, initialOpen: true,
      initialCueType: 'obstacle' as const, ...actions };
    const view = render(<IfThenPlanner {...props} />);
    fireEvent.change(screen.getByLabelText('If — the cue'), { target: { value: 'I check my phone' } });
    fireEvent.change(screen.getByLabelText('Then — the first action'), { target: { value: 'return to this paragraph' } });
    fireEvent.click(screen.getByRole('button', { name: 'save & use ♡' }));
    expect(actions.onCreate).toHaveBeenCalledExactlyOnceWith('obstacle', 'I check my phone', 'return to this paragraph');

    const saved: IfThenPlan = { id: 'plan-1', cueType: 'obstacle', cueText: 'I check my phone',
      actionText: 'return to this paragraph', usageCount: 0, lastUsedAt: null, createdAt: 1 };
    view.rerender(<IfThenPlanner {...props} plans={[saved]} selectedId={saved.id} />);

    expect(actions.onSelect).toHaveBeenCalledExactlyOnceWith(saved.id);
    expect(actions.onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Skip this plan' }));
    expect(actions.onClear).toHaveBeenCalledOnce();
    expect(actions.onRemove).not.toHaveBeenCalled();
  });

  it('keeps Foundation and other callers generic and preserves their supplied action', () => {
    const actions = handlers();
    render(<IfThenPlanner plans={[]} selectedId={null} {...actions} initialOpen
      initialActionText="drink a glass of water" />);

    expect(screen.getByRole('group', { name: 'If–then plan' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'If–then plan' }));
    expect(screen.queryByText('Plan for distractions')).toBeNull();
    expect((screen.getByLabelText('Then — the first action') as HTMLInputElement).value).toBe('drink a glass of water');
    expect(actions.onOpenChange).toHaveBeenLastCalledWith(true);
  });
});
