import { Capacitor, registerPlugin } from '@capacitor/core';
import type { TimerMode } from '../store/useBloom';

/** PLAN 13.11 — system-owned permission remains outside persisted Bloom data. */
export type IOSCompletionAlertPermission =
  | 'checking'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'unsupported';

export type IOSCompletionAlertPresentation =
  | 'foreground-suppressed'
  | 'background-system'
  | 'none';

export interface IOSCompletionAlertStatus {
  permission: IOSCompletionAlertPermission;
  alertsEnabled: boolean;
  soundsEnabled: boolean;
  lockScreenEnabled: boolean;
}

interface BloomCompletionAlertPlugin {
  status(): Promise<IOSCompletionAlertStatus>;
  requestPermission(): Promise<IOSCompletionAlertStatus>;
  schedule(options: {
    deadlineMs: number;
    title: string;
    body: string;
  }): Promise<{ scheduled: boolean; deadlineMs?: number; reason?: string }>;
  cancel(): Promise<void>;
  consumeDue(options: {
    deadlineMs: number;
  }): Promise<{ presentation: IOSCompletionAlertPresentation }>;
  pending(): Promise<{ count: number; deadlineMs?: number }>;
}

const completionAlertPlugin =
  registerPlugin<BloomCompletionAlertPlugin>('BloomCompletionAlert');

export const UNSUPPORTED_COMPLETION_ALERT_STATUS: IOSCompletionAlertStatus = {
  permission: 'unsupported',
  alertsEnabled: false,
  soundsEnabled: false,
  lockScreenEnabled: false,
};

function normalizeStatus(
  value: Partial<IOSCompletionAlertStatus> | undefined,
): IOSCompletionAlertStatus {
  const permission = value?.permission;
  if (
    permission !== 'prompt' &&
    permission !== 'granted' &&
    permission !== 'denied'
  ) {
    return {
      ...UNSUPPORTED_COMPLETION_ALERT_STATUS,
      permission: 'unavailable',
    };
  }
  return {
    permission,
    alertsEnabled: value?.alertsEnabled === true,
    soundsEnabled: value?.soundsEnabled === true,
    lockScreenEnabled: value?.lockScreenEnabled === true,
  };
}

export function isIOSCompletionAlertPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export async function readIOSCompletionAlertStatus(): Promise<IOSCompletionAlertStatus> {
  if (!isIOSCompletionAlertPlatform()) return UNSUPPORTED_COMPLETION_ALERT_STATUS;
  try {
    return normalizeStatus(await completionAlertPlugin.status());
  } catch {
    return {
      ...UNSUPPORTED_COMPLETION_ALERT_STATUS,
      permission: 'unavailable',
    };
  }
}

export async function requestIOSCompletionAlertPermission(): Promise<IOSCompletionAlertStatus> {
  if (!isIOSCompletionAlertPlatform()) return UNSUPPORTED_COMPLETION_ALERT_STATUS;
  try {
    return normalizeStatus(await completionAlertPlugin.requestPermission());
  } catch {
    return {
      ...UNSUPPORTED_COMPLETION_ALERT_STATUS,
      permission: 'unavailable',
    };
  }
}

export interface ScheduledCompletionNotice {
  title: string;
  body: string;
}

/**
 * Native delivery can happen after iOS terminated Bloom, in which case the
 * reducer honestly sweeps the record as interrupted on next launch. Keep this
 * operational: the timer finished, but no completion is claimed or recorded.
 */
export function scheduledCompletionNotice(
  mode: TimerMode,
): ScheduledCompletionNotice | null {
  if (mode === 'flow') return null;
  if (mode === 'short' || mode === 'long') {
    return {
      title: 'Break timer finished',
      body: 'Your next focus is ready when you are.',
    };
  }
  if (mode === 'tiny') {
    return {
      title: 'Tiny timer finished',
      body: 'Bloom is ready when you are.',
    };
  }
  return {
    title: 'Focus timer finished',
    body: 'Bloom is ready when you are.',
  };
}

export interface IOSCompletionAlertSnapshot {
  enabled: boolean;
  running: boolean;
  mode: TimerMode;
  deadlineMs: number | null;
}

export interface IOSCompletionAlertReconcileResult {
  scheduled: boolean;
  permission: IOSCompletionAlertPermission;
}

let reconcileGeneration = 0;
let reconcileEpoch = 0;
let reconcileQueue: Promise<void> = Promise.resolve();

/**
 * Mirror the latest reducer snapshot into one stable native request. The
 * serialized generation guard prevents an older async permission read or
 * native add from winning after a newer pause/reset/cancel snapshot. Native
 * notification-center calls are asynchronous, so the queue is what makes the
 * stable request identifier deterministic across rapid React state changes.
 */
export function reconcileIOSCompletionAlert(
  snapshot: IOSCompletionAlertSnapshot,
): Promise<IOSCompletionAlertReconcileResult> {
  const generation = ++reconcileGeneration;
  const epoch = reconcileEpoch;
  if (!isIOSCompletionAlertPlatform()) {
    return Promise.resolve({ scheduled: false, permission: 'unsupported' });
  }

  const task = reconcileQueue.then(async (): Promise<IOSCompletionAlertReconcileResult> => {
    const isStale = () => generation !== reconcileGeneration || epoch !== reconcileEpoch;
    if (isStale()) return { scheduled: false, permission: 'checking' };

    const notice = scheduledCompletionNotice(snapshot.mode);
    const shouldSchedule =
      snapshot.enabled &&
      snapshot.running &&
      snapshot.deadlineMs != null &&
      Number.isFinite(snapshot.deadlineMs) &&
      notice != null;

    if (!shouldSchedule) {
      try {
        await completionAlertPlugin.cancel();
      } catch {
        // The timer remains complete and usable if native cancellation fails.
      }
      return { scheduled: false, permission: 'checking' };
    }

    const status = await readIOSCompletionAlertStatus();
    if (isStale()) return { scheduled: false, permission: status.permission };
    if (status.permission !== 'granted') {
      try {
        await completionAlertPlugin.cancel();
      } catch {
        // Permission/status UI reports the recovery path.
      }
      return { scheduled: false, permission: status.permission };
    }

    try {
      const result = await completionAlertPlugin.schedule({
        deadlineMs: snapshot.deadlineMs!,
        title: notice.title,
        body: notice.body,
      });
      // If this command became stale while the native add was in flight, the
      // newer queued command runs next and replaces or cancels the stable ID.
      if (isStale()) return { scheduled: false, permission: status.permission };
      return { scheduled: result.scheduled, permission: status.permission };
    } catch {
      return { scheduled: false, permission: status.permission };
    }
  });

  reconcileQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/** Used by native smoke tooling and focused tests; it exposes no user data. */
export async function pendingIOSCompletionAlert(): Promise<{
  count: number;
  deadlineMs?: number;
}> {
  if (!isIOSCompletionAlertPlatform()) return { count: 0 };
  try {
    return await completionAlertPlugin.pending();
  } catch {
    return { count: 0 };
  }
}

/**
 * Consume the native delivery disposition for one exact reducer deadline.
 * Background-system means iOS owned the cue, so React must not replay it while
 * catching up on visibility. Foreground-suppressed and none keep Web Audio as
 * the one foreground cue.
 */
export async function consumeIOSCompletionAlertDelivery(
  deadlineMs: number,
): Promise<IOSCompletionAlertPresentation> {
  if (!isIOSCompletionAlertPlatform() || !Number.isFinite(deadlineMs)) return 'none';
  try {
    const result = await completionAlertPlugin.consumeDue({ deadlineMs });
    return result.presentation === 'foreground-suppressed' ||
      result.presentation === 'background-system'
      ? result.presentation
      : 'none';
  } catch {
    return 'none';
  }
}

export function resetIOSCompletionAlertReconciliationForTests(): void {
  reconcileEpoch += 1;
  reconcileGeneration = 0;
  reconcileQueue = Promise.resolve();
}
