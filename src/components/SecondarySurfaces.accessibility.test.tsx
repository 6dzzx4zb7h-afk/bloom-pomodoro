/** @vitest-environment jsdom */

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_STATE } from '../store/useBloom';
import type { IfThenPlan } from '../store/ifThen';
import type { ParkedThought } from '../store/parking';
import { expectRenderedAccessibility } from '../testing/renderedAccessibility';
import { GuideScreen } from './GuideScreen';
import { GuideSuggestion } from './GuideSuggestion';
import { IfThenPlanner } from './IfThenPlanner';
import { KindRestart } from './KindRestart';
import { ParkingLot } from './ParkingLot';
import { RitualCard } from './RitualCard';
import { Sheet } from './Sheet';
import { TabBar, type ScreenName } from './TabBar';
import { WoopCard } from './WoopCard';

vi.mock('./PixelPal', () => ({
  PixelPal: () => <span aria-hidden="true" data-testid="pixel-pal" />,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function guideBloom(markGuideArticleRead = vi.fn()) {
  return {
    state: {
      ...DEFAULT_STATE,
      guideRead: { readAt: {}, suggestions: [] },
    },
    actions: { markGuideArticleRead },
  } as unknown as Parameters<typeof GuideScreen>[0]['bloom'];
}

describe('PLAN 8.21b direct secondary-surface evidence', () => {
  it('filters the Field Guide, opens an offline article, and restores focus on return', () => {
    const markRead = vi.fn();
    const { container } = render(<GuideScreen bloom={guideBloom(markRead)} />);

    const filters = screen.getByRole('group', { name: 'Browse guide by stage' });
    const all = within(filters).getByRole('button', { name: 'All' });
    const starting = within(filters).getByRole('button', { name: 'Starting' });
    expect(all.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(starting);
    expect(starting.getAttribute('aria-pressed')).toBe('true');
    expect(all.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: /Attention naturally fades/i })).toBeNull();

    const articleButton = screen.getByRole('button', { name: /Start with the first pebble/i });
    fireEvent.click(articleButton);
    expect(markRead).toHaveBeenCalledWith('first-pebble');
    const articleHeading = screen.getByRole('heading', { name: 'Start with the first pebble' });
    expect(document.activeElement).toBe(articleHeading);
    expectRenderedAccessibility(container);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Field Guide' }));
    const returnedButton = screen.getByRole('button', { name: /Start with the first pebble/i });
    expect(document.activeElement).toBe(returnedButton);
    expectRenderedAccessibility(container);
  });

  it('gives contextual Guide suggestions one precise activation target', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <GuideSuggestion
        articleId="first-pebble"
        reason="A small first action may fit this pause."
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Field Guide article: Start with the first pebble',
    }));
    expect(onOpen).toHaveBeenCalledWith('first-pebble');
    expectRenderedAccessibility(container);
  });

  it('creates, selects, clears, and removes an opening move through its rendered controls', () => {
    const onCreate = vi.fn();
    const onRemove = vi.fn();

    function Harness() {
      const [plans, setPlans] = useState<IfThenPlan[]>([]);
      const [selectedId, setSelectedId] = useState<string | null>(null);
      return (
        <IfThenPlanner
          plans={plans}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClear={() => setSelectedId(null)}
          onCreate={(cueType, cueText, actionText) => {
            onCreate(cueType, cueText, actionText);
            setPlans((current) => [...current, {
              id: 'plan-1',
              cueType,
              cueText,
              actionText,
              usageCount: 0,
              lastUsedAt: null,
              createdAt: 1,
            }]);
          }}
          onRemove={(id) => {
            onRemove(id);
            setPlans((current) => current.filter((plan) => plan.id !== id));
          }}
        />
      );
    }

    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /what’s our opening move/i }));
    const cue = screen.getByRole('textbox', { name: 'If — the cue' });
    const action = screen.getByRole('textbox', { name: 'Then — the first action' });
    expect(document.activeElement).toBe(cue);
    expect(screen.getByRole('button', { name: /save & use/i }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'a place' }));
    expect(screen.getByRole('button', { name: 'a place' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(cue, { target: { value: 'I sit at my desk' } });
    fireEvent.change(action, { target: { value: 'I open the outline' } });
    fireEvent.click(screen.getByRole('button', { name: /save & use/i }));

    expect(onCreate).toHaveBeenCalledWith('place', 'I sit at my desk', 'I open the outline');
    expect(screen.getByRole('button', {
      name: /if I sit at my desk, then I open the outline/i,
    })).toBeTruthy();
    expectRenderedAccessibility(container);

    fireEvent.click(screen.getByRole('button', { name: /if I sit at my desk/i }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Remove plan: if I sit at my desk, then I open the outline',
    }));
    expect(onRemove).toHaveBeenCalledWith('plan-1');
  });

  it('keeps the soft restart named, announces its breath stage, and focuses the next action', () => {
    const onBegin = vi.fn();
    const onContinue = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(
      <KindRestart kind="drift" onBegin={onBegin} onContinue={onContinue} onSkip={onSkip} />,
    );

    expect(screen.getByRole('region', { name: 'Soft restart' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'one slow breath' }));
    expect(onBegin).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Soft restart' }).getAttribute('aria-live')).toBe('polite');

    fireEvent.click(screen.getByRole('button', { name: 'next step now' }));
    const nextStep = screen.getByRole('textbox', { name: 'Noted. Next step is ___?' });
    expect(document.activeElement).toBe(nextStep);
    fireEvent.change(nextStep, { target: { value: 'Write the first heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'resume this step' }));
    expect(onContinue).toHaveBeenCalledWith('Write the first heading');
    expect(onSkip).not.toHaveBeenCalled();
    expectRenderedAccessibility(container);
  });

  it('parks a bounded thought, announces the save, and names every returned-thought action', () => {
    const returned: ParkedThought[] = [
      { id: 'one', text: 'Reply to Sam', parkedAt: 1, sessionId: 's1', revealedAt: 2 },
      { id: 'two', text: 'Order more tea', parkedAt: 1, sessionId: 's1', revealedAt: 2 },
    ];
    const onPark = vi.fn();
    const onSendToTasks = vi.fn();
    const onDismiss = vi.fn();
    const onSnoozeReturned = vi.fn();
    const { container } = render(
      <ParkingLot
        canPark
        showReturned
        returned={returned}
        palSprite="bunny"
        onPark={onPark}
        onSendToTasks={onSendToTasks}
        onDismiss={onDismiss}
        onSnoozeReturned={onSnoozeReturned}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /park it/i }));
    const input = screen.getByRole('textbox', { name: 'Thought to park until the next pause' });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'one two three four five six' } });
    fireEvent.click(screen.getByRole('button', { name: 'tuck away' }));
    expect(onPark).toHaveBeenCalledWith('one two three four five');
    expect(screen.getByRole('status').textContent).toContain('tucked away');

    fireEvent.click(screen.getByRole('button', { name: 'Make task from parked thought: Reply to Sam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Let parked thought go: Order more tea' }));
    expect(onSendToTasks).toHaveBeenCalledWith('one');
    expect(onDismiss).toHaveBeenCalledWith('two');
    expectRenderedAccessibility(container);

    fireEvent.click(screen.getByRole('button', { name: 'not now ♡' }));
    expect(screen.queryByRole('region', { name: 'Parked thoughts' })).toBeNull();
    expect(onSnoozeReturned).toHaveBeenCalledOnce();
  });

  it('exposes the ritual as a named checklist and starts only on the final tap', () => {
    const onStart = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(
      <RitualCard
        items={[
          { id: 'phone', text: 'phone away' },
          { id: 'task', text: 'task named' },
        ]}
        sprite="bunny"
        onStart={onStart}
        onSkip={onSkip}
      />,
    );

    const checklist = screen.getByRole('group', { name: 'Environment reset checklist' });
    const phone = within(checklist).getByRole('button', { name: 'phone away' });
    fireEvent.click(phone);
    expect(phone.getAttribute('aria-pressed')).toBe('true');
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(within(checklist).getByRole('button', { name: 'task named' }));
    expect(onStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'skip for now' }));
    expect(onSkip).toHaveBeenCalledOnce();
    expectRenderedAccessibility(container);
  });

  it('traps and restores focus for the Sheet close button, Escape, and backdrop', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div className="phone">
          <button type="button" onClick={() => setOpen(true)}>open preferences</button>
          {open && (
            <Sheet
              title="Preferences"
              description="Adjust this example."
              onRequestClose={() => setOpen(false)}
              closeLabel="Close preferences"
            >
              <button type="button">last action</button>
            </Sheet>
          )}
        </div>
      );
    }

    const { container } = render(<Harness />);
    const invoker = screen.getByRole('button', { name: 'open preferences' });
    invoker.focus();
    fireEvent.click(invoker);
    let dialog = screen.getByRole('dialog', { name: 'Preferences' });
    const close = screen.getByRole('button', { name: 'Close preferences' });
    const last = screen.getByRole('button', { name: 'last action' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    expectRenderedAccessibility(container);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Preferences' })).toBeNull();
    expect(document.activeElement).toBe(invoker);

    fireEvent.click(invoker);
    dialog = screen.getByRole('dialog', { name: 'Preferences' });
    const backdrop = container.querySelector('.sheet-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.mouseDown(backdrop!);
    expect(screen.queryByRole('dialog', { name: 'Preferences' })).toBeNull();
    expect(document.activeElement).toBe(invoker);
  });

  it('progresses through WOOP validation, announces each step, and opens the shared planner', () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <WoopCard
        plans={[]}
        selectedId={null}
        palSprite="bunny"
        onSelectPlan={vi.fn()}
        onClearPlan={vi.fn()}
        onCreatePlan={vi.fn()}
        onRemovePlan={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('status', { name: 'Step 1 of 4' })).toBeTruthy();
    const wish = screen.getByRole('textbox', { name: 'What would you like to begin?' });
    expect(document.activeElement).toBe(wish);
    expect(screen.getByRole('button', { name: 'next — outcome' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(wish, { target: { value: 'Draft the outline' } });
    fireEvent.click(screen.getByRole('button', { name: 'next — outcome' }));
    fireEvent.change(screen.getByRole('textbox', {
      name: 'What would feel lighter once it’s moving?',
    }), { target: { value: 'The opening will feel clearer' } });
    fireEvent.click(screen.getByRole('button', { name: 'next — obstacle' }));
    fireEvent.change(screen.getByRole('textbox', {
      name: 'What gets in the way right before starting?',
    }), { target: { value: 'I keep rearranging notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'next — plan' }));

    expect(screen.getByRole('status', { name: 'Step 4 of 4' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Opening move planner' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'If — the cue' }));
    expectRenderedAccessibility(container);
    fireEvent.click(screen.getByRole('button', { name: 'not now — skip anytime' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders native web-tab semantics for both planner configurations', () => {
    const onChange = vi.fn<(screen: ScreenName) => void>();
    const Targets = () => (
      <>
        <main id="focus-screen">Focus target</main>
        <main id="tasks-screen">Tasks target</main>
        <main id="history-screen">History target</main>
        <main id="goals-screen">Goals target</main>
        <main id="collection-screen">Friends target</main>
      </>
    );
    const { container, rerender } = render(
      <>
        <Targets />
        <TabBar active="focus" onChange={onChange} showGoals={false} />
      </>,
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('button', { name: 'Goals' })).toBeNull();
    expect(within(nav).getByRole('button', { name: 'Focus' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(nav).getByRole('button', { name: 'Tasks' }));
    expect(onChange).toHaveBeenCalledWith('tasks');
    expectRenderedAccessibility(container);

    rerender(
      <>
        <Targets />
        <TabBar active="goals" onChange={onChange} showGoals />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Goals' }).getAttribute('aria-current')).toBe('page');
    expectRenderedAccessibility(container);
  });
});
