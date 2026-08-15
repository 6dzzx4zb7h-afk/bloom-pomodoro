/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '../store/sessions';
import { SessionRepairEditor } from './SessionRepairEditor';

function at(hour: number, minute: number): number {
  return new Date(2026, 6, 26, hour, minute).getTime();
}

function record(id: string, startedAt: number, endedAt: number): SessionRecord {
  return {
    id,
    startedAt,
    endedAt,
    mode: 'focus',
    plannedMin: 25,
    actualMin: (endedAt - startedAt) / 60_000,
    outcome: 'interrupted',
    startHour: new Date(startedAt).getHours(),
    driftEventIds: [],
    resumeCuePending: true,
  };
}

afterEach(cleanup);

describe('SessionRepairEditor', () => {
  it('is labeled, clamps overlap, and emits only a repair proposal', () => {
    const source = record('target', at(9, 0), at(9, 10));
    const next = record('next', at(9, 18), at(9, 35));
    const onSave = vi.fn();
    render(
      <div className="phone">
        <SessionRepairEditor
          record={source}
          records={[source, next]}
          wallClockEndAt={at(9, 40)}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </div>,
    );

    expect(screen.getByRole('dialog', { name: 'Repair session record' })).toBeTruthy();
    expect(
      screen.getByText(
        'This changes the record only. It never awards XP, celebrations, or streak credit.',
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Estimated end time'), {
      target: { value: '2026-07-26T09:35' },
    });
    fireEvent.change(screen.getByLabelText('How the session ended'), {
      target: { value: 'completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save repair' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      record: {
        id: 'target',
        endedAt: at(9, 18),
        actualMin: 18,
        outcome: 'completed',
        resumeCuePending: undefined,
      },
      adjustments: ['next-session'],
    });
    expect(Object.keys(onSave.mock.calls[0][0]).sort()).toEqual(['adjustments', 'record']);
  });

  it('cancels without submitting', () => {
    const source = record('target', at(9, 0), at(9, 10));
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <div className="phone">
        <SessionRepairEditor
          record={source}
          records={[source]}
          wallClockEndAt={at(9, 30)}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'keep original' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('announces an overlap error and preserves the original', () => {
    const prior = record('prior', at(8, 55), at(9, 5));
    const source = record('target', at(9, 0), at(9, 10));
    const onSave = vi.fn();
    render(
      <div className="phone">
        <SessionRepairEditor
          record={source}
          records={[prior, source]}
          wallClockEndAt={at(9, 30)}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'save repair' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Another session already overlaps this record. Nothing changed.',
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the dialog and original record available when storage rejects the save', () => {
    const source = record('target', at(9, 0), at(9, 10));
    const onSave = vi.fn(() => false);
    const onCancel = vi.fn();
    render(
      <div className="phone">
        <SessionRepairEditor
          record={source}
          records={[source]}
          wallClockEndAt={at(9, 30)}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'save repair' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe(
      'Bloom kept the original record. Use the storage recovery card, then try again.',
    );
    expect(screen.getByRole('dialog', { name: 'Repair session record' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'keep original' })).toBeTruthy();
    expect(source).toMatchObject({ endedAt: at(9, 10), outcome: 'interrupted' });
  });
});
