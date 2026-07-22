/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Companion } from '../store/useCompanion';
import { CompanionPrompt } from './CompanionPrompt';
import { Dialog } from './Dialog';

vi.mock('./PixelPal', () => ({ PixelPal: () => <div aria-hidden="true" /> }));

afterEach(() => cleanup());

function DialogHarness({ closeOnEscape = true }: { closeOnEscape?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="phone">
      <button type="button" onClick={() => setOpen(true)}>
        open dialog
      </button>
      {open && (
        <Dialog
          title="A careful choice"
          description="A short description of what changes."
          onRequestClose={() => setOpen(false)}
          closeOnEscape={closeOnEscape}
        >
          <label>
            Note
            <input />
          </label>
          <button type="button">confirm choice</button>
        </Dialog>
      )}
    </div>
  );
}

describe('accessible Dialog', () => {
  it('announces its name and description, makes the app inert, and places focus inside', () => {
    render(<DialogHarness />);
    const invoker = screen.getByRole('button', { name: 'open dialog' });
    invoker.focus();
    fireEvent.click(invoker);

    const dialog = screen.getByRole('dialog', { name: 'A careful choice' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const descriptionId = dialog.getAttribute('aria-describedby');
    expect(descriptionId && document.getElementById(descriptionId)?.textContent).toBe(
      'A short description of what changes.',
    );
    expect(invoker.inert).toBe(true);
    expect(invoker.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('contains forward and reverse Tab movement', () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'open dialog' }));
    const close = screen.getByRole('button', { name: 'Close' });
    const confirm = screen.getByRole('button', { name: 'confirm choice' });

    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('closes on safe Escape and restores the invoker', () => {
    render(<DialogHarness />);
    const invoker = screen.getByRole('button', { name: 'open dialog' });
    invoker.focus();
    fireEvent.click(invoker);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(Boolean(invoker.inert)).toBe(false);
    expect(invoker.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });

  it('keeps an unresolved decision open when Escape is unsafe', () => {
    render(<DialogHarness closeOnEscape={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'open dialog' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).not.toBeNull();
  });
});

describe('routine Companion prompt', () => {
  it('stays a non-modal region and does not steal focus or inert the app', () => {
    const companion = {
      prompt: { type: 'checkin', min: 2, shownAt: 1, sessionId: 's-1' },
      actions: { focused: vi.fn(), drifted: vi.fn() },
    } as unknown as Companion;

    render(
      <div className="phone">
        <button type="button">keep typing here</button>
        <CompanionPrompt companion={companion} palSprite="bunny" focusLabel="Read notes" />
      </div>,
    );
    const typingTarget = screen.getByRole('button', { name: 'keep typing here' });
    typingTarget.focus();

    expect(screen.getByRole('region', { name: 'Companion check-in' })).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(Boolean(typingTarget.inert)).toBe(false);
    expect(document.activeElement).toBe(typingTarget);
  });
});
