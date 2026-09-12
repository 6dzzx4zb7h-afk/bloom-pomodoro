/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANION } from '../store/companion';
import type { Companion } from '../store/useCompanion';
import { CompanionPrompt } from './CompanionPrompt';

vi.mock('./PixelPal', () => ({ PixelPal: () => <div aria-hidden="true" /> }));

afterEach(cleanup);

describe('CompanionPrompt check-in', () => {
  it('lets a user decline a check-in without reporting focus or drift', () => {
    const skipCheckin = vi.fn();
    const focused = vi.fn();
    const drifted = vi.fn();
    const close = vi.fn();
    const companion: Companion = {
      enabled: true,
      conf: { ...DEFAULT_COMPANION, on: true },
      summary: null,
      prompt: { type: 'checkin', min: 10, shownAt: 1_000, sessionId: 'focus-1' },
      actions: {
        skipCheckin, focused, drifted, close,
        onPurpose: vi.fn(), returnDrifted: vi.fn(), pick: vi.fn(), estOnset: vi.fn(),
        jot: vi.fn(), hold: vi.fn(), nextAction: () => '', resumeWith: vi.fn(),
        silencePreSlumpForDay: vi.fn(),
      },
    };

    render(<CompanionPrompt companion={companion} palSprite="bunny" focusLabel="Read page 4" />);
    fireEvent.click(screen.getByRole('button', { name: 'not now' }));

    expect(skipCheckin).toHaveBeenCalledTimes(1);
    expect(focused).not.toHaveBeenCalled();
    expect(drifted).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
