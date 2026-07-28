/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '../store/sessions';
import { ResumeCue } from './ResumeCue';

vi.mock('./PixelPal', () => ({ PixelPal: () => <div aria-hidden="true" /> }));

const session: Pick<SessionRecord, 'id' | 'targetText' | 'nextActionText'> = {
  id: 'interrupted-1',
  targetText: 'Read the methods',
  nextActionText: 'Open page 4',
};

afterEach(cleanup);

describe('ResumeCue actions', () => {
  it.each([
    ['resume from here', 'resume'],
    ['not now', 'dismiss'],
  ])('saves the edited next action before %s', (buttonName, actionKind) => {
    const calls: string[] = [];
    render(
      <div className="phone">
        <ResumeCue
          palSprite="bunny"
          session={session}
          onSaveNextAction={(text) => calls.push(`save:${text}`)}
          onResumeInterrupted={() => calls.push('resume')}
          onDismissInterrupted={() => calls.push('dismiss')}
        />
      </div>,
    );

    fireEvent.change(screen.getByLabelText('next concrete action'), {
      target: { value: 'Underline the first result' },
    });
    fireEvent.click(screen.getByRole('button', { name: buttonName }));

    expect(calls).toEqual([
      'save:Underline the first result',
      actionKind,
    ]);
  });

  it('makes return truth modal, named, focused, and impossible to Escape past', () => {
    render(
      <div className="phone">
        <button type="button">timer control</button>
        <ResumeCue
          palSprite="bunny"
          session={session}
          snapshot={{
            capturedAt: 10,
            returnedAt: 70_000,
            elapsedSec: 300,
            remainingSec: 1_200,
            mode: 'focus',
            round: 1,
            sessionId: session.id,
          }}
          onSaveNextAction={vi.fn()}
          onKeptWorking={vi.fn()}
          onDrifted={vi.fn()}
          onPauseBack={vi.fn()}
        />
      </div>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Return to your session' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Return to your session' }),
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Return to your session' })).toBeTruthy();
  });
});
