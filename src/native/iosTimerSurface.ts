import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';
import type { TimerMode } from '../store/useBloom';
import type { NativeControlFrame } from './iosTabs';

export type NativeIOSTimerAction = 'primary' | 'reset' | 'secondary';

/**
 * A transition snapshot for UIKit to render locally. Running countdowns use
 * their stable wall-clock deadline and Flow uses its stable start/accumulator;
 * the 250 ms React tick is deliberately not part of this bridge contract.
 */
export interface NativeIOSTimerSurfaceConfiguration {
  mode: TimerMode;
  running: boolean;
  remainingSeconds: number;
  deadlineMs?: number;
  flowStartedAtMs?: number;
  flowAccumulatedSeconds: number;
  primaryLabel: 'Start' | 'Pause' | 'Continue';
  secondaryLabel: 'Skip' | 'Finish flow session';
  enabled: boolean;
  secondaryEnabled: boolean;
  visible: boolean;
  readoutFrame: NativeControlFrame;
  controlsFrame: NativeControlFrame;
}

interface BloomTimerSurfacePlugin {
  configure(
    options: NativeIOSTimerSurfaceConfiguration,
  ): Promise<{ active: boolean }>;
  hide(): Promise<void>;
  addListener(
    eventName: 'timerAction',
    listener: (event: { action: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const bloomTimerSurface = registerPlugin<BloomTimerSurfacePlugin>('BloomTimerSurface');

const TIMER_MODES: readonly TimerMode[] = [
  'focus',
  'flow',
  'tiny',
  'short',
  'long',
];
const ACTIONS: readonly NativeIOSTimerAction[] = [
  'primary',
  'reset',
  'secondary',
];

export function isNativeIOSTimerSurfacePlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export function isNativeIOSTimerAction(value: string): value is NativeIOSTimerAction {
  return ACTIONS.some((action) => action === value);
}

function validFrame(frame: NativeControlFrame, minimumHeight: number): boolean {
  return (
    Object.values(frame).every(Number.isFinite) &&
    frame.width >= 44 &&
    frame.height >= minimumHeight
  );
}

export function configureNativeIOSTimerSurface(
  configuration: NativeIOSTimerSurfaceConfiguration,
): Promise<{ active: boolean }> {
  const finiteOptional = [configuration.deadlineMs, configuration.flowStartedAtMs]
    .every((value) => value === undefined || Number.isFinite(value));
  const valid =
    TIMER_MODES.includes(configuration.mode) &&
    Number.isFinite(configuration.remainingSeconds) &&
    configuration.remainingSeconds >= 0 &&
    Number.isFinite(configuration.flowAccumulatedSeconds) &&
    configuration.flowAccumulatedSeconds >= 0 &&
    finiteOptional &&
    validFrame(configuration.readoutFrame, 24) &&
    validFrame(configuration.controlsFrame, 44) &&
    (configuration.running
      ? configuration.mode === 'flow'
        ? configuration.flowStartedAtMs !== undefined
        : configuration.deadlineMs !== undefined
      : true);

  if (!valid) return Promise.resolve({ active: false });
  return bloomTimerSurface.configure(configuration);
}

export function hideNativeIOSTimerSurface(): Promise<void> {
  return bloomTimerSurface.hide();
}

export function listenForNativeIOSTimerAction(
  listener: (action: NativeIOSTimerAction) => void,
): Promise<PluginListenerHandle> {
  return bloomTimerSurface.addListener('timerAction', ({ action }) => {
    if (isNativeIOSTimerAction(action)) listener(action);
  });
}
