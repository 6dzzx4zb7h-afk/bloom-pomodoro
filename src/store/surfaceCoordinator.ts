import type { CompanionPromptState } from './useCompanion';

export type FocusSurface =
  | 'returnTruth'
  | 'transitionConfirm'
  | 'settings'
  | 'completionAlert'
  | 'resumeInterrupted'
  | 'tinyComplete'
  | 'returnedParking'
  | 'debrief'
  | 'weekly'
  | 'ritual'
  | 'woop'
  | 'companionRecovery'
  | 'companionCheckin'
  | 'none';

export interface FocusSurfaceState {
  returnTruth?: boolean;
  transitionConfirm?: boolean;
  settings?: boolean;
  completionAlert?: boolean;
  resumeInterrupted?: boolean;
  tinyComplete?: boolean;
  returnedParking?: boolean;
  debrief?: boolean;
  weekly?: boolean;
  ritual?: boolean;
  woop?: boolean;
  companionPrompt?: CompanionPromptState;
}

export interface FocusSurfaceDecision {
  owner: FocusSurface;
  /** Only the unresolved wall-clock truth question may trap the user on Focus. */
  blocksNavigation: boolean;
  /** Timer identity cannot change while its wall-clock truth is unresolved. */
  blocksTimerControls: boolean;
  /** Ordinary/recovery Companion UI renders only when it owns the surface. */
  showCompanionPrompt: boolean;
}

type SurfaceRule = {
  owner: Exclude<FocusSurface, 'none'>;
  when: (state: FocusSurfaceState) => boolean;
};

function isCompanionRecovery(prompt: CompanionPromptState): boolean {
  return (
    prompt?.type === 'away' ||
    prompt?.type === 'triage' ||
    prompt?.type === 'onset' ||
    prompt?.type === 'tip'
  );
}

function isOrdinaryCompanionPrompt(prompt: CompanionPromptState): boolean {
  return prompt?.type === 'checkin' || prompt?.type === 'preSlump';
}

export function companionPromptForSurface(
  prompt: CompanionPromptState,
  enabled: boolean,
  quiet: boolean,
): CompanionPromptState {
  return isOrdinaryCompanionPrompt(prompt) && (!enabled || quiet) ? null : prompt;
}

/**
 * PLAN 8.17 state-transition table. The first matching row owns the pause
 * surface; lower rows remain in state and can reappear when the owner settles.
 */
export const FOCUS_SURFACE_PRIORITY: readonly SurfaceRule[] = [
  { owner: 'returnTruth', when: (state) => Boolean(state.returnTruth) },
  { owner: 'transitionConfirm', when: (state) => Boolean(state.transitionConfirm) },
  { owner: 'settings', when: (state) => Boolean(state.settings) },
  { owner: 'completionAlert', when: (state) => Boolean(state.completionAlert) },
  { owner: 'resumeInterrupted', when: (state) => Boolean(state.resumeInterrupted) },
  { owner: 'tinyComplete', when: (state) => Boolean(state.tinyComplete) },
  { owner: 'returnedParking', when: (state) => Boolean(state.returnedParking) },
  { owner: 'debrief', when: (state) => Boolean(state.debrief) },
  { owner: 'weekly', when: (state) => Boolean(state.weekly) },
  { owner: 'ritual', when: (state) => Boolean(state.ritual) },
  { owner: 'woop', when: (state) => Boolean(state.woop) },
  { owner: 'companionRecovery', when: (state) => isCompanionRecovery(state.companionPrompt ?? null) },
  { owner: 'companionCheckin', when: (state) => isOrdinaryCompanionPrompt(state.companionPrompt ?? null) },
] as const;

export function resolveFocusSurface(state: FocusSurfaceState): FocusSurfaceDecision {
  const owner = FOCUS_SURFACE_PRIORITY.find((rule) => rule.when(state))?.owner ?? 'none';
  const returnTruthOwns = owner === 'returnTruth';
  return {
    owner,
    blocksNavigation: returnTruthOwns,
    blocksTimerControls: returnTruthOwns,
    showCompanionPrompt: owner === 'companionRecovery' || owner === 'companionCheckin',
  };
}
