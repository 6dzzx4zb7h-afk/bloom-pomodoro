// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IOSCompletionAlertStatus } from '../native/iosCompletionAlerts';
import type { IOSLiveActivityStatus } from '../native/iosLiveActivity';
import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { DEFAULT_RITUAL } from '../store/ritual';
import {
  DEFAULT_STATE,
  persistedShapeFromState,
} from '../store/useBloom';
import { SettingsSheet } from './SettingsSheet';

const openIOSSettings = vi.hoisted(() => vi.fn(async () => ({ opened: true })));

vi.mock('../native/iosSettings', async (importOriginal) => {
  const original = await importOriginal<typeof import('../native/iosSettings')>();
  return {
    ...original,
    openNativeIOSAppSettings: openIOSSettings,
  };
});

const unsupported: IOSCompletionAlertStatus = {
  permission: 'unsupported',
  alertsEnabled: false,
  soundsEnabled: false,
  lockScreenEnabled: false,
};

afterEach(() => {
  cleanup();
  openIOSSettings.mockClear();
});

function renderSettings({
  status = unsupported,
  sound = true,
  liveActivityStatus,
  liveActivityChecking = false,
}: {
  status?: IOSCompletionAlertStatus;
  sound?: boolean;
  liveActivityStatus?: IOSLiveActivityStatus;
  liveActivityChecking?: boolean;
} = {}) {
  const state = {
    ...DEFAULT_STATE,
    settings: { ...DEFAULT_STATE.settings, name: 'Mira', sound },
  };
  const requested = vi.fn(async () => status);
  const onPatch = vi.fn();
  const view = render(
    <SettingsSheet
      settings={state.settings}
      records={[]}
      personalCadence={EMPTY_PERSONAL_CADENCE}
      now={state.now}
      running={false}
      hasOpenSession={false}
      persistedState={persistedShapeFromState(state)}
      onPatch={onPatch}
      onCacheCadence={vi.fn()}
      onApplyCadence={vi.fn()}
      ritual={DEFAULT_RITUAL}
      onPatchRitual={vi.fn()}
      onUpdateRitualItem={vi.fn()}
      onClearFocusData={vi.fn()}
      onDataImported={vi.fn()}
      onClose={vi.fn()}
      completionAlertStatus={status}
      onRequestCompletionAlertPermission={requested}
      liveActivityStatus={liveActivityStatus}
      liveActivityChecking={liveActivityChecking}
    />,
  );
  fireEvent.click(screen.getByText('Sessions', { selector: 'summary' }));
  return { ...view, requested, onPatch };
}

describe('Settings completion-alert permission state', () => {
  it('explains the native permission before requesting it', () => {
    const { requested } = renderSettings({
      status: {
        permission: 'prompt',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      },
    });

    expect(
      screen.getByText(/Allow notifications so iOS can deliver a timer alert/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'allow notifications' }));
    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('states precisely what remains when iOS permission is denied', () => {
    renderSettings({
      status: {
        permission: 'denied',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      },
    });

    expect(
      screen.getByText(/Timer alerts are off in iOS Settings/).getAttribute('role'),
    ).toBe('status');
    expect(screen.getByText(/Bloom can still chime while it’s open/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'open iOS Settings for timer alerts' }),
    );
    expect(openIOSSettings).toHaveBeenCalledOnce();
  });

  it('reports disabled sound or Lock Screen delivery after authorization', () => {
    renderSettings({
      status: {
        permission: 'granted',
        alertsEnabled: true,
        soundsEnabled: false,
        lockScreenEnabled: true,
      },
    });

    expect(screen.getByText(/One or more iOS notification options are off/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'open iOS Settings for timer alerts' }),
    ).toBeTruthy();
  });

  it('previews Ring when done without bypassing the native permission explanation', () => {
    const status: IOSCompletionAlertStatus = {
      permission: 'prompt',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    };
    const { requested, onPatch } = renderSettings({ status, sound: false });

    fireEvent.click(screen.getByRole('switch', { name: 'Ring when done' }));
    expect(onPatch).toHaveBeenCalledWith({ sound: true });
    expect(requested).not.toHaveBeenCalled();
  });

  it('reports a temporarily unavailable native bridge without hiding the foreground cue', () => {
    renderSettings({
      status: {
        permission: 'unavailable',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      },
    });

    expect(
      screen
        .getByText(/Background timer alerts aren’t available right now/)
        .getAttribute('role'),
    ).toBe('status');
    expect(screen.queryByRole('button', { name: /open iOS Settings/i })).toBeNull();
  });

  it('discloses the privacy-minimal Live Activity and its system-owned off state', () => {
    renderSettings({
      liveActivityStatus: {
        supported: true,
        enabled: false,
        active: false,
      },
    });

    expect(screen.getByText(/Task text never appears/)).toBeTruthy();
    expect(screen.getByText(/no Bloom server is involved/)).toBeTruthy();
    expect(screen.getByText(/Live Activities are off in iOS Settings/).getAttribute('role'))
      .toBe('status');
    expect(screen.getByText(/Your timer still works normally/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'open iOS Settings for Live Activities',
      }),
    );
    expect(openIOSSettings).toHaveBeenCalledOnce();
  });

  it('does not offer system Settings for prompt, allowed, or unsupported states', () => {
    const { rerender } = renderSettings({
      status: {
        permission: 'prompt',
        alertsEnabled: false,
        soundsEnabled: false,
        lockScreenEnabled: false,
      },
      liveActivityStatus: {
        supported: false,
        enabled: false,
        active: false,
      },
    });

    expect(screen.queryByRole('button', { name: /open iOS Settings/i })).toBeNull();
    rerender(<></>);

    renderSettings({
      status: {
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
    expect(screen.queryByRole('button', { name: /open iOS Settings/i })).toBeNull();
  });
});
