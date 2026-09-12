/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(
    async (_eventName: string, _listener: (raw: unknown) => void) => ({
      remove: vi.fn(async () => undefined),
    }),
  ),
  present: vi.fn(async () => ({ active: true })),
  dismiss: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  registerPlugin: () => plugin,
}));

import {
  dismissNativeIOSSettings,
  isNativeIOSSettingsPlatform,
  isValidNativeSettingsSnapshot,
  listenForNativeIOSSettingsAction,
  listenForNativeIOSSettingsDismissal,
  normalizeNativeSettingsAction,
  presentNativeIOSSettings,
  type NativeSettingsRow,
  type NativeSettingsSnapshot,
} from './iosSettings';

function snapshotOf(rows: NativeSettingsRow[]): NativeSettingsSnapshot {
  return {
    title: 'Settings',
    doneTitle: 'done',
    appearance: 'light',
    sections: [{ id: 'sessions', title: 'Sessions', rows }],
  };
}

const switchRow: NativeSettingsRow = {
  kind: 'switch',
  id: 'settings.flow',
  title: 'Flow timer',
  value: false,
};

describe('native iOS settings snapshot validation', () => {
  beforeEach(() => {
    plugin.present.mockClear();
    plugin.dismiss.mockClear();
    plugin.addListener.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('passes a well-formed snapshot to the plugin unchanged', async () => {
    const snapshot = snapshotOf([
      switchRow,
      {
        kind: 'stepper',
        id: 'companion.checkinMins',
        title: 'Check in every',
        valueLabel: '12 min',
        canDecrease: true,
        canIncrease: false,
      },
      {
        kind: 'picker',
        id: 'settings.dayStartHour',
        title: 'When does your day roll over?',
        options: [
          { id: 'h0', title: '00:00' },
          { id: 'h3', title: '03:00' },
        ],
        selected: 'h3',
      },
      { kind: 'note', id: 'note.streak', title: 'Gentle streak', body: 'A months game.' },
      { kind: 'disclosure', id: 'detail.data', title: 'Local data and history' },
    ]);

    await expect(presentNativeIOSSettings(snapshot)).resolves.toEqual({ active: true });
    expect(plugin.present).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(isNativeIOSSettingsPlatform()).toBe(true);
  });

  it.each([
    ['an unknown row kind', { kind: 'slider', id: 'settings.x', title: 'X' }],
    ['a missing title', { kind: 'switch', id: 'settings.x', title: '   ', value: true }],
    ['a non-boolean switch value', { kind: 'switch', id: 'settings.x', title: 'X', value: 'yes' }],
    ['an id starting with punctuation', { ...switchRow, id: '.settings.flow' }],
    ['an id containing whitespace', { ...switchRow, id: 'settings flow' }],
    [
      'a selection missing from its options',
      {
        kind: 'segmented',
        id: 'settings.chronotype',
        title: 'Sharpest',
        options: [{ id: 'betterLater', title: 'better later' }],
        selected: 'betterEarlier',
      },
    ],
    [
      'an option id that is not an identifier',
      {
        kind: 'picker',
        id: 'settings.dayStartHour',
        title: 'Rollover',
        options: [{ id: '3', title: '03:00' }],
        selected: '3',
      },
    ],
  ])('refuses %s before it can reach the native form', async (_case, row) => {
    await expect(
      presentNativeIOSSettings(snapshotOf([row as NativeSettingsRow])),
    ).resolves.toEqual({ active: false });
    expect(plugin.present).not.toHaveBeenCalled();
  });

  it('refuses a duplicate row id, which would make a tap ambiguous', () => {
    expect(
      isValidNativeSettingsSnapshot({
        title: 'Settings',
        doneTitle: 'done',
        appearance: 'light',
        sections: [
          { id: 'sessions', title: 'Sessions', rows: [switchRow] },
          { id: 'appearance', title: 'Appearance', rows: [switchRow] },
        ],
      }),
    ).toBe(false);
  });

  it('refuses empty sections and empty snapshots', () => {
    expect(
      isValidNativeSettingsSnapshot({
        title: 'Settings',
        doneTitle: 'done',
        appearance: 'light',
        sections: [{ id: 'sessions', title: 'Sessions', rows: [] }],
      }),
    ).toBe(false);
    expect(
      isValidNativeSettingsSnapshot({
        title: 'Settings',
        doneTitle: 'done',
        appearance: 'light',
        sections: [],
      }),
    ).toBe(false);
  });

  it('refuses a snapshot with no explicit appearance, which would inherit the system theme', () => {
    const snapshot = snapshotOf([switchRow]);
    expect(
      isValidNativeSettingsSnapshot({
        ...snapshot,
        appearance: 'system' as unknown as 'light',
      }),
    ).toBe(false);
  });

  it('parses a string-encoded boolean back into a real boolean', () => {
    // A Swift Bool written straight into a JSObject never arrived as a
    // JavaScript boolean, so every native switch was a silent no-op.
    expect(normalizeNativeSettingsAction({ id: 'settings.night', checked: 'true' }))
      .toEqual({ id: 'settings.night', value: true });
    expect(normalizeNativeSettingsAction({ id: 'settings.night', checked: 'false' }))
      .toEqual({ id: 'settings.night', value: false });
    expect(normalizeNativeSettingsAction({ id: 'settings.night', checked: true }))
      .toEqual({ id: 'settings.night', value: true });
  });

  it('keeps strings, directions, and valueless taps distinct', () => {
    expect(normalizeNativeSettingsAction({ id: 'settings.chronotype', value: 'betterLater' }))
      .toEqual({ id: 'settings.chronotype', value: 'betterLater' });
    expect(normalizeNativeSettingsAction({ id: 'companion.awaySecs', direction: 'decrease' }))
      .toEqual({ id: 'companion.awaySecs', direction: 'decrease' });
    expect(normalizeNativeSettingsAction({ id: 'detail.data' })).toEqual({ id: 'detail.data' });
  });

  it('drops an event with no usable identifier or a bogus direction', () => {
    expect(normalizeNativeSettingsAction({ value: 'x' })).toBeNull();
    expect(normalizeNativeSettingsAction({ id: 'not an id', checked: 'true' })).toBeNull();
    expect(normalizeNativeSettingsAction({ id: 'settings.night', direction: 'sideways' }))
      .toEqual({ id: 'settings.night' });
  });

  it('wires both event listeners by name and forwards dismissal', async () => {
    const action = vi.fn();
    const dismissed = vi.fn();

    await listenForNativeIOSSettingsAction(action);
    await listenForNativeIOSSettingsDismissal(dismissed);
    await dismissNativeIOSSettings();

    expect(plugin.addListener.mock.calls[0][0]).toBe('settingsAction');
    expect(plugin.addListener).toHaveBeenNthCalledWith(2, 'settingsDismissed', dismissed);
    expect(plugin.dismiss).toHaveBeenCalledOnce();

    // Actions reach the caller already normalized, never in wire form.
    const forward = plugin.addListener.mock.calls[0][1];
    forward({ id: 'settings.night', checked: 'true' });
    forward({ id: 'not an id', checked: 'true' });
    expect(action).toHaveBeenCalledExactlyOnceWith({ id: 'settings.night', value: true });
  });
});
