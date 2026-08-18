// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IOSCompletionAlertStatus } from '../native/iosCompletionAlerts';
import type { IOSLiveActivityStatus } from '../native/iosLiveActivity';
import type { IOSAlarmStatus } from '../native/iosAlarm';
import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { DEFAULT_RITUAL } from '../store/ritual';
import {
  DEFAULT_STATE,
  persistedShapeFromState,
} from '../store/useBloom';
import { SettingsSheet } from './SettingsSheet';

const unsupported: IOSCompletionAlertStatus = {
  permission: 'unsupported',
  alertsEnabled: false,
  soundsEnabled: false,
  lockScreenEnabled: false,
};

afterEach(cleanup);

function renderSettings({
  status = unsupported,
  sound = true,
  liveActivityStatus,
  liveActivityChecking = false,
  alarmStatus,
}: {
  status?: IOSCompletionAlertStatus;
  sound?: boolean;
  liveActivityStatus?: IOSLiveActivityStatus;
  liveActivityChecking?: boolean;
  alarmStatus?: IOSAlarmStatus;
} = {}) {
  const state = {
    ...DEFAULT_STATE,
    settings: { ...DEFAULT_STATE.settings, name: 'Mira', sound },
  };
  const requested = vi.fn(async () => status);
  const requestedAlarms = vi.fn(async () => alarmStatus ?? { supported: false, authorization: 'unsupported' as const });
  const onPatch = vi.fn();
  render(
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
      alarmStatus={alarmStatus}
      onRequestAlarmAuthorization={requestedAlarms}
    />,
  );
  fireEvent.click(screen.getByText('Sessions', { selector: 'summary' }));
  return { requested, requestedAlarms, onPatch };
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
  });
});

describe('Settings alarm authorization state (PLAN 13.12)', () => {
  it('explains that an alarm can ring through Silent Mode before asking', () => {
    const { requestedAlarms } = renderSettings({
      alarmStatus: { supported: true, authorization: 'prompt' },
    });

    expect(screen.getByText('Ring through Silent Mode')).toBeTruthy();
    expect(
      screen.getByText(/even in Silent Mode or while a Focus is on/),
    ).toBeTruthy();
    expect(screen.getByText(/you can turn alarms off in iOS Settings/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'allow alarms' }));
    expect(requestedAlarms).toHaveBeenCalledTimes(1);
  });

  it('names the ordinary fallback that remains when alarms are off', () => {
    renderSettings({ alarmStatus: { supported: true, authorization: 'denied' } });

    const note = screen.getByText(/Alarms are off in iOS Settings/);
    expect(note.closest('[role="status"]')).toBeTruthy();
    expect(
      screen.getByText(/Bloom still sends its ordinary timer notification/),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'allow alarms' })).toBeNull();
  });

  it('says Flow never rings once alarms are authorized', () => {
    renderSettings({ alarmStatus: { supported: true, authorization: 'granted' } });

    expect(screen.getByText(/Timer alarms are on/)).toBeTruthy();
    expect(screen.getByText(/Flow has no set finish, so it never rings/)).toBeTruthy();
  });

  it('says nothing on a system without AlarmKit, or before the state is read', () => {
    renderSettings({ alarmStatus: { supported: false, authorization: 'unsupported' } });
    expect(screen.queryByText('Ring through Silent Mode')).toBeNull();
    cleanup();

    renderSettings({ alarmStatus: { supported: false, authorization: 'checking' } });
    expect(screen.queryByText('Ring through Silent Mode')).toBeNull();
    cleanup();

    // Nothing about a finish cue belongs here when the ring itself is off.
    renderSettings({
      sound: false,
      alarmStatus: { supported: true, authorization: 'prompt' },
    });
    expect(screen.queryByText('Ring through Silent Mode')).toBeNull();
  });
});
