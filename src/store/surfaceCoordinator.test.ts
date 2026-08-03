import { describe, expect, it } from 'vitest';

import {
  companionPromptForSurface,
  FOCUS_SURFACE_PRIORITY,
  resolveFocusSurface,
} from './surfaceCoordinator';

describe('focus surface coordinator', () => {
  it('publishes one stable, duplicate-free priority table', () => {
    const owners = FOCUS_SURFACE_PRIORITY.map((rule) => rule.owner);
    expect(new Set(owners).size).toBe(owners.length);
    expect(owners.slice(0, 8)).toEqual([
      'returnTruth',
      'transitionConfirm',
      'settings',
      'completionAlert',
      'resumeInterrupted',
      'tinyComplete',
      'returnedParking',
      'debrief',
    ]);
  });

  it('keeps the completion-alert explainer behind an already-open Settings sheet', () => {
    expect(
      resolveFocusSurface({ settings: true, completionAlert: true }).owner,
    ).toBe('settings');
    expect(resolveFocusSurface({ completionAlert: true }).owner).toBe('completionAlert');
  });

  it('gives honest return sole control and navigation ownership', () => {
    expect(resolveFocusSurface({
      returnTruth: true,
      returnedParking: true,
      debrief: true,
      companionPrompt: { type: 'checkin', min: 4, shownAt: 10 },
    })).toEqual({
      owner: 'returnTruth',
      blocksNavigation: true,
      blocksTimerControls: true,
      showCompanionPrompt: false,
    });
  });

  it('releases parking to the existing debrief after snooze', () => {
    expect(resolveFocusSurface({ returnedParking: true, debrief: true }).owner)
      .toBe('returnedParking');
    expect(resolveFocusSurface({ returnedParking: false, debrief: true }).owner)
      .toBe('debrief');
  });

  it('keeps ordinary and recovery Companion prompts below pause surfaces', () => {
    expect(resolveFocusSurface({
      debrief: true,
      companionPrompt: { type: 'tip', kind: 'wander', phase: 'mid', text: 'return' },
    }).showCompanionPrompt).toBe(false);
    expect(resolveFocusSurface({
      companionPrompt: { type: 'checkin', min: 4, shownAt: 10 },
    })).toMatchObject({ owner: 'companionCheckin', showCompanionPrompt: true });
    expect(resolveFocusSurface({
      companionPrompt: {
        type: 'triage',
        min: 4,
        shownAt: 10,
        src: 'return',
        eventId: 'drift-1',
      },
    })).toMatchObject({ owner: 'companionRecovery', showCompanionPrompt: true });
  });

  it('withdraws ordinary prompts in off or Quiet without discarding recovery triage', () => {
    const checkin = { type: 'checkin', min: 4, shownAt: 10 } as const;
    const triage = {
      type: 'triage',
      min: 4,
      shownAt: 10,
      src: 'return',
      eventId: 'drift-1',
    } as const;
    expect(companionPromptForSurface(checkin, false, false)).toBeNull();
    expect(companionPromptForSurface(checkin, true, true)).toBeNull();
    expect(companionPromptForSurface(checkin, true, false)).toBe(checkin);
    expect(companionPromptForSurface(triage, false, true)).toBe(triage);
  });
});
