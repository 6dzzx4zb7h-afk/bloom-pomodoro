/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFoundationInstance,
  foundationEntryId,
  type FoundationsState,
} from '../store/foundations';
import type { SessionRecord } from '../store/sessions';
import { dayKeyFor } from '../store/dayKey';
import { FoundationsCard } from './FoundationsCard';

const day = '2026-07-26';
const at = new Date('2026-07-26T12:00:00').getTime();

function manualState(): FoundationsState {
  const adoptedAt = new Date('2026-07-20T12:00:00').getTime();
  const instances = ['phone-away', 'desk-reset', 'tiny-start'].map((type, order) =>
    createFoundationInstance({
      type: type as 'phone-away' | 'desk-reset' | 'tiny-start',
      order,
      at: adoptedAt,
    })!,
  );
  return {
    instances,
    entries: [{
      id: foundationEntryId(instances[0].id, day),
      instanceId: instances[0].id,
      dayKey: day,
      recordedAt: at,
    }],
    archive: [],
  };
}

function completedRecord(): SessionRecord {
  return {
    id: 'session-today',
    startedAt: at - 25 * 60_000,
    endedAt: at,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome: 'completed',
    startHour: 11,
    driftEventIds: [],
  };
}

describe('FoundationsCard', () => {
  afterEach(cleanup);

  it('renders manual foundations as one-tap toggles and focused work as read-only text', () => {
    const onToggleDay = vi.fn();
    render(
      <FoundationsCard
        foundations={manualState()}
        records={[completedRecord()]}
        today={day}
        dayStartHour={0}
        onToggleDay={onToggleDay}
        onSetEnabled={vi.fn()}
        onReorder={vi.fn()}
        onRenameCustom={vi.fn()}
        plans={[]}
        onCreatePlan={vi.fn()}
        onRemovePlan={vi.fn()}
        onSetIfThen={vi.fn()}
        onMarkRestartOffered={vi.fn()}
      />,
    );

    const focused = screen.getByText('Focused work').closest('.foundation-chip')!;
    expect(focused.tagName).toBe('DIV');
    expect(within(focused as HTMLElement).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set aside Phone away for today' }));
    expect(onToggleDay).toHaveBeenCalledWith('fnd-phone-away');
    expect(screen.getByRole('status').textContent).toContain('set aside for today');
  });

  it('expands from the name and makes yesterday the only editable history dot', () => {
    const onToggleDay = vi.fn();
    render(
      <FoundationsCard
        foundations={manualState()}
        records={[]}
        today={day}
        dayStartHour={3}
        onToggleDay={onToggleDay}
        onSetEnabled={vi.fn()}
        onReorder={vi.fn()}
        onRenameCustom={vi.fn()}
        plans={[]}
        onCreatePlan={vi.fn()}
        onRemovePlan={vi.fn()}
        onSetIfThen={vi.fn()}
        onMarkRestartOffered={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Phone away' }));
    const editable = screen.getByRole('listitem', {
      name: /2026-07-25: no entry\. Add yesterday's entry/i,
    });
    expect(editable.tagName).toBe('BUTTON');
    expect(screen.getByRole('listitem', { name: /2026-07-26: recorded/i }).tagName)
      .toBe('SPAN');

    fireEvent.click(editable);
    expect(onToggleDay).toHaveBeenCalledTimes(1);
    const targetAt = onToggleDay.mock.calls[0][1] as number;
    expect(dayKeyFor(targetAt, 3)).toBe('2026-07-25');
    expect(screen.getByRole('status').textContent).toContain('added later for yesterday');
    expect(screen.getByRole('status').textContent).not.toContain('tended today');
  });

  it('calmly refuses a fourth active manual foundation in the picker', () => {
    const onSetEnabled = vi.fn();
    render(
      <FoundationsCard
        foundations={manualState()}
        records={[]}
        today={day}
        dayStartHour={0}
        onToggleDay={vi.fn()}
        onSetEnabled={onSetEnabled}
        onReorder={vi.fn()}
        onRenameCustom={vi.fn()}
        plans={[]}
        onCreatePlan={vi.fn()}
        onRemovePlan={vi.fn()}
        onSetIfThen={vi.fn()}
        onMarkRestartOffered={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'tend' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Turn on Tomorrow note' }));
    expect(onSetEnabled).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain(
      'Three at a time — small and steady beats a big dashboard.',
    );
  });

  it('reuses the if-then flow with the foundation action prefilled and cue focused', () => {
    const onCreatePlan = vi.fn();
    render(
      <FoundationsCard
        foundations={manualState()}
        records={[]}
        today={day}
        dayStartHour={0}
        onToggleDay={vi.fn()}
        onSetEnabled={vi.fn()}
        onReorder={vi.fn()}
        onRenameCustom={vi.fn()}
        plans={[]}
        onCreatePlan={onCreatePlan}
        onRemovePlan={vi.fn()}
        onSetIfThen={vi.fn()}
        onMarkRestartOffered={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'tend' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'anchor it' })[0]);
    const cue = screen.getByLabelText('If — the cue');
    expect(document.activeElement).toBe(cue);
    expect((screen.getByLabelText('Then — the first action') as HTMLInputElement).value)
      .toBe('phone in another room before the first session');
    fireEvent.change(cue, { target: { value: 'after coffee' } });
    fireEvent.click(screen.getByRole('button', { name: 'save & use ♡' }));
    expect(onCreatePlan).toHaveBeenCalledWith(
      'time',
      'after coffee',
      'phone in another room before the first session',
    );
  });

  it('marks one restart offer and the tiny action writes a normal today entry', async () => {
    const onToggleDay = vi.fn();
    const onMarkRestartOffered = vi.fn();
    const state = manualState();
    state.entries = [];
    render(
      <FoundationsCard
        foundations={state}
        records={[]}
        today={day}
        dayStartHour={0}
        onToggleDay={onToggleDay}
        onSetEnabled={vi.fn()}
        onReorder={vi.fn()}
        onRenameCustom={vi.fn()}
        plans={[]}
        onCreatePlan={vi.fn()}
        onRemovePlan={vi.fn()}
        onSetIfThen={vi.fn()}
        onMarkRestartOffered={onMarkRestartOffered}
      />,
    );

    await waitFor(() =>
      expect(onMarkRestartOffered).toHaveBeenCalledWith('fnd-phone-away', day),
    );
    fireEvent.click(screen.getByRole('button', { name: 'put the phone just out of reach' }));
    expect(onToggleDay).toHaveBeenCalledWith('fnd-phone-away');
    expect(screen.queryByText(/A gap is just weather/i)).toBeNull();
  });
});
