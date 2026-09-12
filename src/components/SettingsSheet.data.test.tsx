/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { DEFAULT_RITUAL } from '../store/ritual';
import { DEFAULT_STATE } from '../store/useBloom';
import { SettingsSheet } from './SettingsSheet';

vi.mock('./PixelPal', () => ({ PixelPal: () => <div aria-hidden="true" /> }));

function renderSettings(overrides: Partial<Parameters<typeof SettingsSheet>[0]> = {}) {
  const onClearFocusData = vi.fn();
  render(
    <SettingsSheet
      settings={{ ...DEFAULT_STATE.settings, name: 'Mira' }}
      records={[]}
      personalCadence={EMPTY_PERSONAL_CADENCE}
      now={DEFAULT_STATE.now}
      running={false}
      hasOpenSession={false}
      onPatch={vi.fn()}
      onCacheCadence={vi.fn()}
      onApplyCadence={vi.fn()}
      ritual={DEFAULT_RITUAL}
      onPatchRitual={vi.fn()}
      onUpdateRitualItem={vi.fn()}
      onClearFocusData={onClearFocusData}
      onClose={vi.fn()}
      completionAlertStatus={{
        permission: 'unsupported', alertsEnabled: false,
        soundsEnabled: false, lockScreenEnabled: false,
      }}
      onRequestCompletionAlertPermission={vi.fn(async () => ({
        permission: 'unsupported' as const, alertsEnabled: false,
        soundsEnabled: false, lockScreenEnabled: false,
      }))}
      {...overrides}
    />,
  );
  return { onClearFocusData };
}

function openDataSection() {
  fireEvent.click(screen.getByText('Your data', { selector: 'summary' }));
}

describe('Settings local data controls', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('keeps seven purpose-based groups with the completion ring under Sessions', () => {
    renderSettings();
    expect(Array.from(document.querySelectorAll('summary'), (summary) => summary.textContent))
      .toEqual(['You', 'Timer lengths', 'Sessions', 'Your day', 'Companion', 'Appearance', 'Your data']);
    expect(screen.getByRole('switch', { name: 'Ring when done' })).toBeTruthy();
  });

  it('offers local data controls without backup, transfer, or account controls', () => {
    renderSettings();
    openDataSection();
    expect(screen.queryByRole('button', { name: /export|import|backup|sign in/i })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(/Deleting the app removes its local data/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'review clear scope' })).toBeTruthy();
  });

  it('retains clear scope and explicit confirmation before removing reflection history', () => {
    const { onClearFocusData } = renderSettings();
    openDataSection();
    fireEvent.click(screen.getByRole('button', { name: 'review clear scope' }));
    expect(screen.getByRole('region', { name: 'Focus history clear scope' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'clear reflection history' }));
    expect(onClearFocusData).not.toHaveBeenCalled();
    const confirmation = screen.getByRole('dialog', { name: 'Clear reflection history?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'keep it' }));
    expect(onClearFocusData).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'clear reflection history' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Clear reflection history?' }))
      .getByRole('button', { name: 'clear reflection history' }));
    expect(onClearFocusData).toHaveBeenCalledOnce();
    expect(screen.getByText('reflection history cleared ♡')).toBeTruthy();
  });

  it('keeps history clearing unavailable while a paused work record remains open', () => {
    renderSettings({ hasOpenSession: true });
    openDataSection();
    expect(screen.getByRole('button', { name: 'review clear scope' }).hasAttribute('disabled')).toBe(true);
  });
});
