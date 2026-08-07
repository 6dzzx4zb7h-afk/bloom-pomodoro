import { Capacitor, registerPlugin } from '@capacitor/core';
import type { TimerMode } from '../store/useBloom';

/**
 * PLAN 13.12 — AlarmKit authorization is system-owned, exactly like the PLAN
 * 13.11 notification permission. Nothing here is persisted in Bloom's data.
 */
export type IOSAlarmAuthorization =
  | 'checking'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'unsupported';

export type IOSAlarmPresentation = 'system-alarm' | 'none';

export interface IOSAlarmStatus {
  supported: boolean;
  authorization: IOSAlarmAuthorization;
}

interface NativeAlarmResult {
  supported?: boolean;
  authorization?: string;
  owns?: boolean;
  changed?: boolean;
  reason?: string;
}

interface BloomAlarmPlugin {
  status(): Promise<NativeAlarmResult>;
  requestAuthorization(): Promise<NativeAlarmResult>;
  reconcile(options: {
    deadlineMs: number;
    mode: Exclude<TimerMode, 'flow'>;
    countdownTitle: string;
    alertTitle: string;
    stopLabel: string;
  }): Promise<NativeAlarmResult>;
  cancel(options: { force: boolean }): Promise<NativeAlarmResult>;
  consumeDue(options: { deadlineMs: number }): Promise<{ presentation: string }>;
}

const alarmPlugin = registerPlugin<BloomAlarmPlugin>('BloomAlarm');

export const UNSUPPORTED_ALARM_STATUS: IOSAlarmStatus = {
  supported: false,
  authorization: 'unsupported',
};

export function isIOSAlarmPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function normalizeAuthorization(value: string | undefined): IOSAlarmAuthorization {
  return value === 'prompt' ||
    value === 'granted' ||
    value === 'denied' ||
    value === 'unsupported'
    ? value
    : 'unavailable';
}

function normalizeStatus(value: NativeAlarmResult | undefined): IOSAlarmStatus {
  const authorization = normalizeAuthorization(value?.authorization);
  // A system Bloom cannot read an authorization state from is not a system it
  // can hand the finish cue to, whatever else the response claims.
  const recognized =
    authorization === 'prompt' ||
    authorization === 'granted' ||
    authorization === 'denied';
  return {
    supported: value?.supported === true && recognized,
    authorization,
  };
}

export async function readIOSAlarmStatus(): Promise<IOSAlarmStatus> {
  if (!isIOSAlarmPlatform()) return UNSUPPORTED_ALARM_STATUS;
  try {
    return normalizeStatus(await alarmPlugin.status());
  } catch {
    return { supported: false, authorization: 'unavailable' };
  }
}

/**
 * Ask iOS once, from an explicit user action. A later change is made in iOS
 * Settings; Bloom never re-prompts and never treats a refusal as an error.
 */
export async function requestIOSAlarmAuthorization(): Promise<IOSAlarmStatus> {
  if (!isIOSAlarmPlatform()) return UNSUPPORTED_ALARM_STATUS;
  try {
    return normalizeStatus(await alarmPlugin.requestAuthorization());
  } catch {
    return { supported: false, authorization: 'unavailable' };
  }
}

export interface AlarmSystemCopy {
  /** Names the mode on the Lock Screen and Dynamic Island. Never task text. */
  countdownTitle: string;
  /** What the full-screen system alarm says when the countdown reaches zero. */
  alertTitle: string;
  stopLabel: string;
}

/**
 * Flow has no predetermined finish, so it never schedules an alarm. Every
 * other mode is bounded and gets one.
 *
 * The alert says the timer finished — never that Bloom recorded a completed
 * session. Only the reducer knows that, and a person can silence an alarm from
 * a locked screen without Bloom running at all.
 */
export function alarmSystemCopy(mode: TimerMode): AlarmSystemCopy | null {
  if (mode === 'flow') return null;
  if (mode === 'short' || mode === 'long') {
    return {
      countdownTitle: mode === 'short' ? 'Short break' : 'Long break',
      alertTitle: 'Break timer finished',
      stopLabel: 'done',
    };
  }
  if (mode === 'tiny') {
    return {
      countdownTitle: 'Tiny focus',
      alertTitle: 'Tiny timer finished',
      stopLabel: 'done',
    };
  }
  return {
    countdownTitle: 'Focus',
    alertTitle: 'Focus timer finished',
    stopLabel: 'done',
  };
}

export interface IOSAlarmSnapshot {
  enabled: boolean;
  running: boolean;
  mode: TimerMode;
  deadlineMs: number | null;
}

export interface IOSAlarmReconcileResult {
  /**
   * True while one AlarmKit alarm mirrors this exact deadline. The PLAN 13.11
   * notification and the PLAN 13.8 activity stand down when it is, so a single
   * finish never produces two sounds or two countdown surfaces.
   */
  owns: boolean;
  supported: boolean;
  authorization: IOSAlarmAuthorization;
}

const NOT_OWNED: IOSAlarmReconcileResult = {
  owns: false,
  supported: false,
  authorization: 'unsupported',
};

let reconcileGeneration = 0;
let reconcileEpoch = 0;
let reconcileQueue: Promise<void> = Promise.resolve();

function normalizeReconcile(value: NativeAlarmResult | undefined): IOSAlarmReconcileResult {
  const status = normalizeStatus(value);
  return {
    // Ownership of the finish cue requires an authorization Bloom actually
    // read as granted. Anything less leaves the fallbacks in charge.
    owns: value?.owns === true && status.authorization === 'granted',
    supported: status.supported,
    authorization: status.authorization,
  };
}

/**
 * Mirror the latest reducer snapshot into one AlarmKit alarm. Commands are
 * serialized and generation-guarded for the same reason as PLAN 13.11: native
 * calls are asynchronous, and a slow start must never win after a newer pause,
 * reset, or mode change.
 */
export function reconcileIOSAlarm(
  snapshot: IOSAlarmSnapshot,
): Promise<IOSAlarmReconcileResult> {
  const generation = ++reconcileGeneration;
  const epoch = reconcileEpoch;
  if (!isIOSAlarmPlatform()) return Promise.resolve(NOT_OWNED);

  const task = reconcileQueue.then(async (): Promise<IOSAlarmReconcileResult> => {
    const isStale = () => generation !== reconcileGeneration || epoch !== reconcileEpoch;
    if (isStale()) return NOT_OWNED;

    const copy = alarmSystemCopy(snapshot.mode);
    const shouldSchedule =
      snapshot.enabled &&
      snapshot.running &&
      snapshot.deadlineMs != null &&
      Number.isFinite(snapshot.deadlineMs) &&
      copy != null;

    try {
      if (!shouldSchedule) {
        // `force` stays false: an alarm already ringing is the cue the person
        // asked for, and only they dismiss it.
        return normalizeReconcile(await alarmPlugin.cancel({ force: false }));
      }
      const result = await alarmPlugin.reconcile({
        deadlineMs: snapshot.deadlineMs!,
        mode: snapshot.mode as Exclude<TimerMode, 'flow'>,
        ...copy!,
      });
      if (isStale()) return NOT_OWNED;
      return normalizeReconcile(result);
    } catch {
      // An older wrapper, a missing framework, or a system refusal keeps the
      // notification and chime fallbacks. The timer itself is untouched.
      return NOT_OWNED;
    }
  });

  reconcileQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/** Used by the confirmed data clear, which may silence a ringing alarm. */
export async function cancelIOSAlarm(force = false): Promise<void> {
  if (!isIOSAlarmPlatform()) return;
  try {
    await alarmPlugin.cancel({ force });
  } catch {
    // Nothing here can leave the reducer in a worse state.
  }
}

/**
 * Report whether AlarmKit is sounding the cue for this exact deadline. Only a
 * system alarm that is actually alerting replaces Bloom's own chime, so an
 * alarm the person stopped early still leaves them with a finish cue.
 */
export async function consumeIOSAlarmDelivery(
  deadlineMs: number,
): Promise<IOSAlarmPresentation> {
  if (!isIOSAlarmPlatform() || !Number.isFinite(deadlineMs)) return 'none';
  try {
    const result = await alarmPlugin.consumeDue({ deadlineMs });
    return result?.presentation === 'system-alarm' ? 'system-alarm' : 'none';
  } catch {
    return 'none';
  }
}

export function resetIOSAlarmReconciliationForTests(): void {
  reconcileEpoch += 1;
  reconcileGeneration = 0;
  reconcileQueue = Promise.resolve();
}
