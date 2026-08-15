// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { DEFAULT_RITUAL } from '../store/ritual';
import { DEFAULT_STATE, persistedShapeFromState } from '../store/useBloom';
import { SettingsSheet } from './SettingsSheet';

afterEach(cleanup);

function renderSettings() {
  const state = {
    ...DEFAULT_STATE,
    settings: { ...DEFAULT_STATE.settings, name: 'Mira' },
  };
  render(
    <SettingsSheet
      settings={state.settings}
      records={[]}
      personalCadence={EMPTY_PERSONAL_CADENCE}
      now={state.now}
      running={false}
      hasOpenSession={false}
      persistedState={persistedShapeFromState(state)}
      onPatch={vi.fn()}
      onCacheCadence={vi.fn()}
      onApplyCadence={vi.fn()}
      ritual={DEFAULT_RITUAL}
      onPatchRitual={vi.fn()}
      onUpdateRitualItem={vi.fn()}
      onClearFocusData={vi.fn()}
      onDataImported={vi.fn()}
      onClose={vi.fn()}
      completionAlertStatus={{
        permission: 'unsupported',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      }}
      onRequestCompletionAlertPermission={vi.fn(async () => ({
        permission: 'unsupported' as const,
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      }))}
    />,
  );
}

describe('Settings progressive disclosure (PLAN 8.26)', () => {
  it('leads with direct timer controls and keeps learned cadence optional', () => {
    renderSettings();

    const timerSummary = screen.getByText('Timer lengths', { selector: 'summary' });
    const timerSection = timerSummary.closest('details');
    expect(timerSection?.hasAttribute('open')).toBe(true);
    if (!timerSection) throw new Error('Timer lengths section is missing');

    const timer = within(timerSection);
    expect(timer.getByRole('button', { name: 'Decrease Focus' })).toBeTruthy();
    expect(timer.getByRole('button', { name: 'Increase Short break' })).toBeTruthy();

    const cadenceDisclosure = timer.getByRole('button', { name: /Cadence suggestions/ });
    expect(cadenceDisclosure.getAttribute('aria-expanded')).toBe('false');
    expect(
      timer.queryByRole('button', { name: '40 minutes focus, 8 minutes break' }),
    ).toBeNull();
    expect(
      timerSummary.compareDocumentPosition(cadenceDisclosure) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(cadenceDisclosure);
    expect(cadenceDisclosure.getAttribute('aria-expanded')).toBe('true');
    expect(
      timer.getByRole('button', { name: '40 minutes focus, 8 minutes break' }),
    ).toBeTruthy();
  });

  it('leaves the Sessions group immediately reachable from the compact top level', () => {
    renderSettings();

    const sessions = screen.getByText('Sessions', { selector: 'summary' });
    fireEvent.click(sessions);
    expect(screen.getByRole('switch', { name: 'Auto-start next timer' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Ring when done' })).toBeTruthy();
  });
});
