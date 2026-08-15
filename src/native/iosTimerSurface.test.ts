/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(async (...listenerArguments: [
    string,
    (event: { action: string }) => void,
  ]) => {
    void listenerArguments;
    return { remove: vi.fn(async () => undefined) };
  }),
  configure: vi.fn(async () => ({ active: true })),
  hide: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  registerPlugin: () => plugin,
}));

import {
  configureNativeIOSTimerSurface,
  hideNativeIOSTimerSurface,
  listenForNativeIOSTimerAction,
} from './iosTimerSurface';

const frame = { x: 12, y: 280, width: 366, height: 74 };
const pausedConfiguration = {
  mode: 'focus' as const,
  running: false,
  remainingSeconds: 1_200,
  flowAccumulatedSeconds: 0,
  primaryLabel: 'Continue' as const,
  secondaryLabel: 'Skip' as const,
  enabled: true,
  secondaryEnabled: true,
  visible: true,
  readoutFrame: { ...frame, y: 250, height: 52 },
  controlsFrame: frame,
};

describe('native iOS timer surface bridge', () => {
  beforeEach(() => {
    plugin.addListener.mockClear();
    plugin.configure.mockClear();
    plugin.hide.mockClear();
  });

  it('passes a validated transition snapshot without a ticking display value', async () => {
    const running = {
      ...pausedConfiguration,
      running: true,
      deadlineMs: 1_800_000,
      primaryLabel: 'Pause' as const,
    };

    await expect(configureNativeIOSTimerSurface(running)).resolves.toEqual({ active: true });
    expect(plugin.configure).toHaveBeenCalledExactlyOnceWith(running);
  });

  it('requires the stable native time source for a running countdown or Flow run', async () => {
    await expect(configureNativeIOSTimerSurface({
      ...pausedConfiguration,
      running: true,
      primaryLabel: 'Pause',
    })).resolves.toEqual({ active: false });
    await expect(configureNativeIOSTimerSurface({
      ...pausedConfiguration,
      mode: 'flow',
      running: true,
      deadlineMs: 1_800_000,
      primaryLabel: 'Pause',
      secondaryLabel: 'Finish flow session',
    })).resolves.toEqual({ active: false });
    expect(plugin.configure).not.toHaveBeenCalled();
  });

  it('rejects invalid time and frame values before crossing the native boundary', async () => {
    await expect(configureNativeIOSTimerSurface({
      ...pausedConfiguration,
      remainingSeconds: Number.NaN,
    })).resolves.toEqual({ active: false });
    await expect(configureNativeIOSTimerSurface({
      ...pausedConfiguration,
      controlsFrame: { ...frame, height: 20 },
    })).resolves.toEqual({ active: false });
    expect(plugin.configure).not.toHaveBeenCalled();
  });

  it('filters unknown native actions and exposes hide', async () => {
    const listener = vi.fn();
    await listenForNativeIOSTimerAction(listener);
    const nativeListener = plugin.addListener.mock.calls[0]?.[1] as
      | ((event: { action: string }) => void)
      | undefined;

    nativeListener?.({ action: 'primary' });
    nativeListener?.({ action: 'unexpected' });
    expect(listener).toHaveBeenCalledExactlyOnceWith('primary');

    await hideNativeIOSTimerSurface();
    expect(plugin.hide).toHaveBeenCalledOnce();
  });
});
