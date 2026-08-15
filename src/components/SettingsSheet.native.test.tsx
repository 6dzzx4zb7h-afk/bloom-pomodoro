// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IOSCompletionAlertStatus } from '../native/iosCompletionAlerts';
import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { createBackupEnvelope, serializeBackup } from '../store/exportImport';
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
  openAppSettings: vi.fn(async () => ({ opened: true })),
  exportFile: vi.fn(async (file: {
    fileName: string;
    mimeType: 'application/json' | 'text/csv';
    contents: string;
  }) => {
    void file;
    return { completed: true };
  }),
  pickDocument: vi.fn(async (): Promise<
    | { canceled: true }
    | { canceled: false; fileName: string; size: number; contents: string }
  > => ({ canceled: true })),
  confirmDestructive: vi.fn(async (options: {
    title: string;
    message: string;
    confirmTitle: string;
    cancelTitle: string;
  }) => {
    void options;
    return { confirmed: false };
  }),
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
    openNativeIOSAppSettings: native.openAppSettings,
    presentNativeIOSExportFile: native.exportFile,
    pickNativeIOSBackupFile: native.pickDocument,
    presentNativeIOSDestructiveConfirmation: native.confirmDestructive,
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
    onClearFocusData: vi.fn(),
    onDataImported: vi.fn(),
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
    localStorage.clear();
    native.active = true;
    native.nativeIOS = true;
    native.action = undefined;
    native.dismissed = undefined;
    native.present.mockReset().mockImplementation(async () => ({ active: native.active }));
    native.dismiss.mockClear();
    native.openAppSettings.mockReset().mockResolvedValue({ opened: true });
    native.exportFile.mockClear();
    native.pickDocument.mockReset().mockResolvedValue({ canceled: true });
    native.confirmDestructive.mockReset().mockResolvedValue({ confirmed: false });
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

  it('renders and routes the three-way appearance choice exactly once', async () => {
    const { onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    const row = rowsOf('appearance')[0];
    expect(row).toMatchObject({
      kind: 'segmented',
      id: 'settings.appearance',
      selected: 'system',
      options: [
        { id: 'day', title: 'Day' },
        { id: 'night', title: 'Night' },
        { id: 'system', title: 'System' },
      ],
    });

    native.action?.({ id: 'settings.appearance', value: 'night' });

    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ appearance: 'night' });
  });

  it('routes each applicable permission-recovery row to Bloom’s iOS Settings page', async () => {
    const { onPatch, onPatchRitual } = renderSettings({
      completionAlertStatus: {
        permission: 'denied',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      },
      liveActivityStatus: {
        supported: true,
        enabled: false,
        active: false,
      },
    });
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    expect(rowsOf('sessions')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'button',
        id: 'action.openIOSSettings.liveActivity',
        title: 'open iOS Settings for Live Activities',
      }),
      expect.objectContaining({
        kind: 'button',
        id: 'action.openIOSSettings.notificationsDenied',
        title: 'open iOS Settings for timer alerts',
      }),
    ]));

    native.action?.({ id: 'action.openIOSSettings.liveActivity' });
    native.action?.({ id: 'action.openIOSSettings.notificationsDenied' });
    await waitFor(() => expect(native.openAppSettings).toHaveBeenCalledTimes(2));
    expect(onPatch).not.toHaveBeenCalled();
    expect(onPatchRitual).not.toHaveBeenCalled();
  });

  it('shows no recovery action while permission is prompt or fully allowed', async () => {
    const first = renderSettings({
      completionAlertStatus: {
        permission: 'prompt',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      },
      liveActivityStatus: {
        supported: true,
        enabled: true,
        active: false,
      },
    });
    await waitFor(() => expect(native.present).toHaveBeenCalled());
    expect(rowsOf('sessions').some((row) => row.id.startsWith('action.openIOSSettings')))
      .toBe(false);

    first.unmount();
    native.present.mockClear();
    renderSettings({
      completionAlertStatus: {
        permission: 'granted',
        alertsEnabled: true,
        soundsEnabled: true,
        lockScreenEnabled: true,
      },
      liveActivityStatus: {
        supported: true,
        enabled: true,
        active: false,
      },
    });
    await waitFor(() => expect(native.present).toHaveBeenCalled());
    expect(rowsOf('sessions').some((row) => row.id.startsWith('action.openIOSSettings')))
      .toBe(false);
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
    native.action?.({ id: 'settings.appearance', value: true });
    native.action?.({ id: 'settings.appearance', value: 'sunrise' });
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

  it('renders Your data directly in the native form with no disclosure detour', async () => {
    renderSettings();
    await waitFor(() => expect(native.present).toHaveBeenCalled());

    expect(rowsOf('data').map((row) => row.id)).toEqual([
      'note.dataTransfer',
      'action.exportJSON',
      'action.exportCSV',
      'action.importJSON',
      'note.focusHistory',
      'action.reviewClearScope',
    ]);
    expect(rowsOf('data').some((row) => row.kind === 'disclosure')).toBe(false);
    expect(native.dismiss).not.toHaveBeenCalled();
  });

  it('sends the canonical JSON and CSV bytes only after a native export action', async () => {
    renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'action.exportJSON' });
    native.action?.({ id: 'action.exportCSV' });

    await waitFor(() => expect(native.exportFile).toHaveBeenCalledTimes(2));
    const json = native.exportFile.mock.calls[0][0];
    expect(json.fileName).toMatch(/^bloom-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(json.mimeType).toBe('application/json');
    expect(JSON.parse(json.contents)).toMatchObject({ format: 'bloom-backup' });
    expect(native.exportFile.mock.calls[1][0]).toMatchObject({
      mimeType: 'text/csv',
      contents: expect.stringContaining('"id","started_at","ended_at","mode"'),
    });
  });

  it('runs a picked native document through the same preview and atomic commit path', async () => {
    const state = {
      ...DEFAULT_STATE,
      settings: { ...DEFAULT_STATE.settings, name: 'From backup' },
    };
    const contents = serializeBackup(
      createBackupEnvelope(persistedShapeFromState(state), []),
    );
    native.pickDocument.mockResolvedValueOnce({
      canceled: false,
      fileName: 'bloom-backup.json',
      size: new TextEncoder().encode(contents).byteLength,
      contents,
    });
    const { onDataImported } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'action.importJSON' });

    await waitFor(() => {
      expect(rowsOf('data').some((row) => row.id === 'note.importReady')).toBe(true);
    });
    native.action?.({ id: 'action.commitImport' });

    await waitFor(() => expect(onDataImported).toHaveBeenCalledOnce());
    expect(JSON.parse(localStorage.getItem('bloom-state') ?? '{}').settings.name)
      .toBe('Mira');
    expect(rowsOf('data').some((row) => row.id === 'note.importSuccess')).toBe(true);
  });

  it('treats document-picker cancellation as a no-op and restores the import action', async () => {
    const { onDataImported, onClearFocusData } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'action.importJSON' });

    await waitFor(() => expect(native.pickDocument).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(rowsOf('data').some((row) => row.id === 'action.importJSON')).toBe(true);
      expect(rowsOf('data').some((row) => row.id.startsWith('note.import'))).toBe(false);
    });
    expect(onDataImported).not.toHaveBeenCalled();
    expect(onClearFocusData).not.toHaveBeenCalled();
  });

  it('reports native presentation failure without mutating Bloom data', async () => {
    native.exportFile.mockRejectedValueOnce(new Error('presentation unavailable'));
    const { onDataImported, onClearFocusData, onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'action.exportJSON' });

    await waitFor(() => {
      expect(rowsOf('data')).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'note.dataTransferStatus',
          body: 'That file could not be prepared. Your data is still safe in Bloom.',
        }),
      ]));
    });
    expect(onDataImported).not.toHaveBeenCalled();
    expect(onClearFocusData).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('clears only after the native destructive confirmation resolves true', async () => {
    native.confirmDestructive.mockResolvedValueOnce({ confirmed: true });
    const { onClearFocusData } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'action.reviewClearScope' });
    await waitFor(() => {
      expect(rowsOf('data').some((row) => row.id === 'action.clearFocusHistory')).toBe(true);
    });
    native.action?.({ id: 'action.clearFocusHistory' });

    await waitFor(() => expect(native.confirmDestructive).toHaveBeenCalledOnce());
    expect(onClearFocusData).toHaveBeenCalledOnce();
    expect(native.confirmDestructive.mock.calls[0][0]).toMatchObject({
      title: 'Clear reflection history?',
      confirmTitle: 'clear reflection history',
      cancelTitle: 'keep it',
    });
  });

  it('keeps reflection history when native destructive confirmation is canceled', async () => {
    const { onClearFocusData, onDataImported, onPatch } = renderSettings();
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'action.reviewClearScope' });
    await waitFor(() => {
      expect(rowsOf('data').some((row) => row.id === 'action.clearFocusHistory')).toBe(true);
    });
    native.action?.({ id: 'action.clearFocusHistory' });

    await waitFor(() => expect(native.confirmDestructive).toHaveBeenCalledOnce());
    expect(onClearFocusData).not.toHaveBeenCalled();
    expect(onDataImported).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('puts direct Timer lengths before one optional cadence disclosure (PLAN 8.26)', async () => {
    renderSettings();
    await waitFor(() => expect(native.present).toHaveBeenCalled());

    const rows = rowsOf('durations');
    expect(rows.map((row) => row.id)).toEqual([
      'duration.focus',
      'duration.short',
      'duration.long',
      'detail.cadence',
    ]);
    expect(rows.filter((row) => row.kind === 'stepper').map((row) => row.id)).toEqual([
      'duration.focus',
      'duration.short',
      'duration.long',
    ]);
    expect(rows[rows.length - 1]).toMatchObject({
      kind: 'disclosure',
      title: 'Cadence suggestions',
    });
    expect(rows.some((row) => row.id === 'action.applyCadence')).toBe(false);
    expect(rows.some((row) => row.id === 'cadence.ladder')).toBe(false);
  });

  it('opens cadence suggestions as one scoped detail and keeps every cadence action', async () => {
    const onApplyCadence = vi.fn();
    renderSettings({ onApplyCadence });
    await waitFor(() => expect(native.action).toBeTypeOf('function'));

    native.action?.({ id: 'detail.cadence' });

    await waitFor(() => expect(native.dismiss).toHaveBeenCalled());
    expect(await screen.findByText('Cadence suggestions', { selector: 'summary' })).toBeTruthy();
    expect(screen.queryByText('Sessions', { selector: 'summary' })).toBeNull();

    fireEvent.click(screen.getByRole('button', {
      name: '40 minutes focus, 8 minutes break',
    }));

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
