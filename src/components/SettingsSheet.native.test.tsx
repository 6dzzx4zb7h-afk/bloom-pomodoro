// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IOSCompletionAlertStatus } from '../native/iosCompletionAlerts';
import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { DEFAULT_RITUAL } from '../store/ritual';
import { DEFAULT_STATE, persistedShapeFromState } from '../store/useBloom';
import type {
  NativeSettingsAction,
  NativeSettingsRow,
  NativeSettingsSnapshot,
} from '../native/iosSettings';

const native = vi.hoisted(() => ({
  active: true,
  nativeIOS: true,
  present: vi.fn(),
  dismiss: vi.fn(async () => undefined),
  action: undefined as ((action: NativeSettingsAction) => void) | undefined,
  dismissed: undefined as (() => void) | undefined,
  removeAction: vi.fn(async () => undefined),
  removeDismissed: vi.fn(async () => undefined),
}));

vi.mock('../native/iosSettings', async (importOriginal) => {
  const original = await importOriginal<typeof import('../native/iosSettings')>();
  return {
    ...original,
    isNativeIOSSettingsPlatform: () => native.nativeIOS,
    presentNativeIOSSettings: native.present,
    dismissNativeIOSSettings: native.dismiss,
    listenForNativeIOSSettingsAction: async (
      listener: (action: NativeSettingsAction) => void,
    ) => {
      native.action = listener;
      return { remove: native.removeAction };
    },
    listenForNativeIOSSettingsDismissal: async (listener: () => void) => {
      native.dismissed = listener;
      return { remove: native.removeDismissed };
    },
  };
});

import { SettingsSheet } from './SettingsSheet';

const unsupported: IOSCompletionAlertStatus = {
  permission: 'unsupported',
  alertsEnabled: false,
  soundsEnabled: false,
  lockScreenEnabled: false,
};

function lastSnapshot(): NativeSettingsSnapshot {
  const calls = native.present.mock.calls;
  return calls[calls.length - 1][0] as NativeSettingsSnapshot;
}

function rowsOf(sectionID: string): NativeSettingsRow[] {
  return lastSnapshot().sections.find((section) => section.id === sectionID)?.rows ?? [];
}

function renderSettings(overrides: Partial<Parameters<typeof SettingsSheet>[0]> = {}) {
  const state = {
    ...DEFAULT_STATE,
    settings: { ...DEFAULT_STATE.settings, name: 'Mira' },
  };
  const handlers = {
    onPatch: vi.fn(),
    onPatchRitual: vi.fn(),
    onUpdateRitualItem: vi.fn(),
    onClose: vi.fn(),
  };
  const view = render(
    <SettingsSheet
      settings={state.settings}
      records={[]}
      personalCadence={EMPTY_PERSONAL_CADENCE}
      now={state.now}
      running={false}
      hasOpenSession={false}
      persistedState={persistedShapeFromState(state)}
      onCacheCadence={vi.fn()}
      onApplyCadence={vi.fn()}
      ritual={DEFAULT_RITUAL}
      onClearFocusData={vi.fn()}
      onDataImported={vi.fn()}
      completionAlertStatus={unsupported}
      onRequestCompletionAlertPermission={vi.fn(async () => unsupported)}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...handlers, ...view };
}

describe('Settings on iOS (PLAN 13.4b)', () => {
  beforeEach(() => {
    native.active = true;
    native.nativeIOS = true;
    native.action = undefined;
    native.dismissed = undefined;
    native.present.mockReset().mockImplementation(async () => ({ active: native.active }));
    native.dismiss.mockClear();
    native.removeAction.mockClear();
    native.removeDismissed.mockClear();
  });

  afterEach(cleanup);

  it('presents one native sheet and renders no web sheet behind it', async () => {
    renderSettings();

    await waitFor(() => expect(native.present).toHaveBeenCalled());
    expect(screen.queryByText('Sessions', { selector: 'summary' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    const snapshot = lastSnapshot();
    expect(snapshot.sections.map((section) => section.id)).toEqual([
      'you',
      'durations',
      'sessions',
      'day',
      'companion',
      'appearance',
      'data',
    ]);
  });

  it('routes a native switch back through the reducer exactly once', async () => {
    const { onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'settings.night', value: true });

    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ night: true });
  });

  it('maps a prefixed hour option back to a real clock hour', async () => {
    const { onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'settings.dayStartHour', value: 'h5' });

    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ dayStartHour: 5 });
  });

  it('steps a companion choice by direction rather than by value', async () => {
    const { onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'companion.checkinMins', direction: 'increase' });

    const patch = onPatch.mock.calls[0][0] as { companion: { checkinMins: number } };
    expect(patch.companion.checkinMins).toBeGreaterThan(
      DEFAULT_STATE.settings.companion.checkinMins,
    );
  });

  it('ignores an unknown identifier and a wrongly typed value', async () => {
    const { onPatch, onPatchRitual } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'settings.doesNotExist', value: true });
    native.action?.({ id: 'settings.night', value: 'true' });
    native.action?.({ id: 'ritual.enabled' });

    expect(onPatch).not.toHaveBeenCalled();
    expect(onPatchRitual).not.toHaveBeenCalled();
  });

  it('commits a trimmed name and refuses to blank it', async () => {
    const { onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'settings.name', value: '   ' });
    expect(onPatch).not.toHaveBeenCalled();

    native.action?.({ id: 'settings.name', value: '  Sam  ' });
    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ name: 'Sam' });
  });

  it('opens the scoped web sheet from a disclosure row and dismisses the native one', async () => {
    renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'detail.data' });

    await waitFor(() => expect(native.dismiss).toHaveBeenCalled());
    expect(await screen.findByText('Your data', { selector: 'summary' })).toBeTruthy();
    // Only the requested section travels with it.
    expect(screen.queryByText('Sessions', { selector: 'summary' })).toBeNull();
    expect(screen.queryByText('Companion', { selector: 'summary' })).toBeNull();
  });

  it('renders Timer lengths as real controls, not a disclosure (PLAN 13.4c)', async () => {
    renderSettings();
    await waitFor(() => expect(native.present).toHaveBeenCalled());

    const rows = rowsOf('durations');
    expect(rows.some((row) => row.kind === 'disclosure')).toBe(false);
    expect(rows.filter((row) => row.kind === 'stepper').map((row) => row.id)).toEqual([
      'duration.focus',
      'duration.short',
      'duration.long',
    ]);
    // Each rung is announced on its own rather than read out of one sentence.
    const ladder = rows.find((row) => row.id === 'cadence.ladder');
    expect(ladder?.kind).toBe('values');
    if (ladder?.kind === 'values') {
      expect(ladder.items.map((item) => item.caption)).toEqual([
        'shorter',
        'current',
        'longer',
      ]);
      ladder.items.forEach((item) => expect(item.spoken).toContain('minutes focus'));
    }
  });

  it('conveys the already-set cadence by disabling the row, not by the glyph alone', async () => {
    renderSettings();
    await waitFor(() => expect(native.present).toHaveBeenCalled());

    const apply = rowsOf('durations').find((row) => row.id === 'action.applyCadence');
    expect(apply?.kind).toBe('button');
    if (apply?.kind === 'button') {
      // Default state matches the default cadence, so the recommendation is set.
      expect(apply.enabled).toBe(false);
      expect(apply.title).toContain('is set');
    }
  });

  it('applies a preset through the cadence action, prefix and all', async () => {
    const onApplyCadence = vi.fn();
    renderSettings({ onApplyCadence });
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'cadence.preset', value: 'p40-8' });

    expect(onApplyCadence).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ focusMin: 40, breakMin: 8 }),
    );
  });

  it('ignores a preset id that is not one of the offered pairs', async () => {
    const onApplyCadence = vi.fn();
    renderSettings({ onApplyCadence });
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'cadence.preset', value: 'p99-99' });
    native.action?.({ id: 'cadence.preset', value: '40-8' });

    expect(onApplyCadence).not.toHaveBeenCalled();
  });

  it('steps a duration by direction and respects its bounds', async () => {
    const { onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'duration.focus', direction: 'increase' });

    const patch = onPatch.mock.calls[0][0] as { durations: { focus: number } };
    expect(patch.durations.focus).toBe(DEFAULT_STATE.settings.durations.focus + 5 * 60);

    const shortRow = rowsOf('durations').find((row) => row.id === 'duration.short');
    if (shortRow?.kind === 'stepper') {
      // The default 5-minute break is mid-range, so both arrows are live.
      expect(shortRow.canDecrease).toBe(true);
      expect(shortRow.canIncrease).toBe(true);
    }
  });

  it('closes when the sheet is dismissed natively', async () => {
    const { onClose } = renderSettings();
    await waitFor(() => expect(native.dismissed).toBeTypeOf('function'));

    native.dismissed?.();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('removes both listeners and dismisses the sheet on unmount', async () => {
    const { unmount } = renderSettings();
    await waitFor(() => expect(native.dismissed).toBeTypeOf('function'));

    unmount();

    await waitFor(() => {
      expect(native.removeAction).toHaveBeenCalledOnce();
      expect(native.removeDismissed).toHaveBeenCalledOnce();
      expect(native.dismiss).toHaveBeenCalled();
    });
  });

  it('keeps the complete web sheet when the native form is unavailable', async () => {
    native.active = false;
    renderSettings();

    await waitFor(() => expect(native.present).toHaveBeenCalled());
    expect(await screen.findByText('Sessions', { selector: 'summary' })).toBeTruthy();
    expect(await screen.findByText('Your data', { selector: 'summary' })).toBeTruthy();
  });

  it('leaves browser and Android on the web sheet without touching the bridge', async () => {
    native.nativeIOS = false;
    renderSettings();

    expect(await screen.findByText('Sessions', { selector: 'summary' })).toBeTruthy();
    expect(native.present).not.toHaveBeenCalled();
  });
});
