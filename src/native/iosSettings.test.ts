/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  addListener: vi.fn(
    async (eventName: string, listener: (raw: unknown) => void) => {
      void eventName;
      void listener;
      return {
        remove: vi.fn(async () => undefined),
      };
    },
  ),
  present: vi.fn(async () => ({ active: true })),
  dismiss: vi.fn(async () => undefined),
  openSystemSettings: vi.fn(async () => ({ opened: true })),
  exportFile: vi.fn(async () => ({ completed: true })),
  pickDocument: vi.fn(async () => ({
    canceled: false as const,
    fileName: 'bloom-backup.json',
    size: 2,
    contents: '{}',
  })),
  confirmDestructive: vi.fn(async () => ({ confirmed: true })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => plugin.getPlatform() },
  registerPlugin: () => plugin,
}));

import {
  dismissNativeIOSSettings,
  isNativeIOSSettingsPlatform,
  isValidNativeSettingsSnapshot,
  listenForNativeIOSSettingsAction,
  listenForNativeIOSSettingsDismissal,
  normalizeNativeSettingsAction,
  openNativeIOSAppSettings,
  pickNativeIOSBackupFile,
  presentNativeIOSDestructiveConfirmation,
  presentNativeIOSExportFile,
  presentNativeIOSSettings,
  type NativeSettingsRow,
  type NativeSettingsSnapshot,
} from './iosSettings';

function snapshotOf(rows: NativeSettingsRow[]): NativeSettingsSnapshot {
  return {
    title: 'Settings',
    doneTitle: 'done',
    appearance: 'day',
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
    plugin.getPlatform.mockReset().mockReturnValue('ios');
    plugin.present.mockClear();
    plugin.dismiss.mockClear();
    plugin.openSystemSettings.mockReset().mockResolvedValue({ opened: true });
    plugin.addListener.mockClear();
    plugin.exportFile.mockClear();
    plugin.pickDocument.mockClear();
    plugin.confirmDestructive.mockClear();
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
      { kind: 'disclosure', id: 'detail.data', title: 'Backup, import, and history' },
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
        appearance: 'day',
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
        appearance: 'day',
        sections: [{ id: 'sessions', title: 'Sessions', rows: [] }],
      }),
    ).toBe(false);
    expect(
      isValidNativeSettingsSnapshot({
        title: 'Settings',
        doneTitle: 'done',
        appearance: 'day',
        sections: [],
      }),
    ).toBe(false);
  });

  it('accepts Follow system and refuses an unknown appearance', () => {
    const snapshot = snapshotOf([switchRow]);
    expect(isValidNativeSettingsSnapshot({ ...snapshot, appearance: 'system' })).toBe(true);
    expect(isValidNativeSettingsSnapshot({
      ...snapshot,
      appearance: 'sunrise' as unknown as 'system',
    })).toBe(false);
  });

  it('parses a string-encoded boolean back into a real boolean', () => {
    // A Swift Bool written straight into a JSObject never arrived as a
    // JavaScript boolean, so every native switch was a silent no-op.
    expect(normalizeNativeSettingsAction({ id: 'settings.flow', checked: 'true' }))
      .toEqual({ id: 'settings.flow', value: true });
    expect(normalizeNativeSettingsAction({ id: 'settings.flow', checked: 'false' }))
      .toEqual({ id: 'settings.flow', value: false });
    expect(normalizeNativeSettingsAction({ id: 'settings.flow', checked: true }))
      .toEqual({ id: 'settings.flow', value: true });
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
    expect(normalizeNativeSettingsAction({ id: 'settings.flow', direction: 'sideways' }))
      .toEqual({ id: 'settings.flow' });
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
    forward({ id: 'settings.flow', checked: 'true' });
    forward({ id: 'not an id', checked: 'true' });
    expect(action).toHaveBeenCalledExactlyOnceWith({ id: 'settings.flow', value: true });
  });

  it('opens only Bloom’s native iOS Settings page and normalizes bridge failure', async () => {
    await expect(openNativeIOSAppSettings()).resolves.toEqual({ opened: true });
    expect(plugin.openSystemSettings).toHaveBeenCalledOnce();

    plugin.openSystemSettings.mockRejectedValueOnce(new Error('unavailable'));
    await expect(openNativeIOSAppSettings()).resolves.toEqual({ opened: false });

    plugin.getPlatform.mockReturnValue('web');
    plugin.openSystemSettings.mockClear();
    await expect(openNativeIOSAppSettings()).resolves.toEqual({ opened: false });
    expect(plugin.openSystemSettings).not.toHaveBeenCalled();
  });

  it('validates native file and confirmation presentations before the plugin', async () => {
    await expect(presentNativeIOSExportFile({
      fileName: 'bloom-backup.json',
      mimeType: 'application/json',
      contents: '{}',
    })).resolves.toEqual({ completed: true });
    await expect(pickNativeIOSBackupFile()).resolves.toEqual({
      canceled: false,
      fileName: 'bloom-backup.json',
      size: 2,
      contents: '{}',
    });
    await expect(presentNativeIOSDestructiveConfirmation({
      title: 'Clear reflection history?',
      message: 'The selected local history will be removed.',
      confirmTitle: 'clear reflection history',
      cancelTitle: 'keep it',
    })).resolves.toEqual({ confirmed: true });

    await expect(presentNativeIOSExportFile({
      fileName: '../backup.json',
      mimeType: 'application/json',
      contents: '{}',
    })).rejects.toThrow('Invalid native export file');
    expect(plugin.exportFile).toHaveBeenCalledOnce();
    expect(plugin.pickDocument).toHaveBeenCalledOnce();
    expect(plugin.confirmDestructive).toHaveBeenCalledOnce();
  });
});
