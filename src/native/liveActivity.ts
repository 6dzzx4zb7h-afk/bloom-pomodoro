import { Capacitor, registerPlugin } from '@capacitor/core';

/** PLAN 13.8 — only bounded Focus/Tiny countdowns have a Live Activity. */
export type LiveActivityMode = 'focus' | 'tiny';

export type LiveActivitySnapshot =
  | {
      sessionId: string;
      mode: LiveActivityMode;
      state: 'running';
      startedAtMs: number;
      deadlineMs: number;
    }
  | {
      sessionId: string;
      mode: LiveActivityMode;
      state: 'paused';
      startedAtMs: number;
      remainingSeconds: number;
    };

export interface LiveActivityStatus {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  activityId?: string;
  sessionId?: string;
}

export interface LiveActivityMutationResult {
  supported: boolean;
  active: boolean;
  changed: boolean;
  reason?: string;
}

interface BloomLiveActivityPlugin {
  status(): Promise<LiveActivityStatus>;
  reconcile(
    options:
      | {
          sessionId: string;
          mode: LiveActivityMode;
          state: 'running';
          startedAtMs: number;
          deadlineMs: number;
        }
      | {
          sessionId: string;
          mode: LiveActivityMode;
          state: 'paused';
          startedAtMs: number;
          remainingSeconds: number;
        },
  ): Promise<LiveActivityMutationResult & { enabled?: boolean }>;
  end(options: {
    sessionId?: string;
    dismissal: 'immediate' | 'default';
  }): Promise<LiveActivityMutationResult>;
}

const bloomLiveActivity = registerPlugin<BloomLiveActivityPlugin>('BloomLiveActivity');

const UNSUPPORTED_STATUS: LiveActivityStatus = {
  supported: false,
  enabled: false,
  active: false,
};

const UNSUPPORTED_MUTATION: LiveActivityMutationResult = {
  supported: false,
  active: false,
  changed: false,
};

let reconcileGeneration = 0;
let reconcileEpoch = 0;
let reconcileQueue: Promise<void> = Promise.resolve();

/**
 * The live countdown surface. iOS renders it with ActivityKit (Lock Screen and
 * Dynamic Island); Android renders it as an ongoing foreground-service
 * notification, which is also what keeps the process alive while a session
 * runs. Same reducer-owned snapshot, same reconcile/end contract.
 */
export function isLiveActivityPlatform(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android';
}

function validSnapshot(snapshot: LiveActivitySnapshot): boolean {
  return (
    typeof snapshot.sessionId === 'string' &&
    snapshot.sessionId.trim().length > 0 &&
    (snapshot.mode === 'focus' || snapshot.mode === 'tiny') &&
    Number.isFinite(snapshot.startedAtMs) &&
    snapshot.startedAtMs > 0 &&
    ((snapshot.state === 'running' &&
      Number.isFinite(snapshot.deadlineMs) &&
      snapshot.deadlineMs > snapshot.startedAtMs) ||
      (snapshot.state === 'paused' &&
        Number.isFinite(snapshot.remainingSeconds) &&
        Number.isInteger(snapshot.remainingSeconds) &&
        snapshot.remainingSeconds >= 0 &&
        snapshot.remainingSeconds <= 7 * 24 * 60 * 60))
  );
}

function normalizeMutation(value: unknown): LiveActivityMutationResult {
  if (!value || typeof value !== 'object') return UNSUPPORTED_MUTATION;
  const result = value as Partial<LiveActivityMutationResult>;
  if (
    typeof result.supported !== 'boolean' ||
    typeof result.active !== 'boolean' ||
    typeof result.changed !== 'boolean'
  ) {
    return UNSUPPORTED_MUTATION;
  }
  return {
    supported: result.supported,
    active: result.active,
    changed: result.changed,
    ...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
  };
}

/**
 * Read system availability without prompting. ActivityKit owns its own system
 * setting; Bloom stores no permission or availability flag.
 */
export async function readLiveActivityStatus(): Promise<LiveActivityStatus> {
  if (!isLiveActivityPlatform()) return UNSUPPORTED_STATUS;
  try {
    const status = await bloomLiveActivity.status();
    if (
      typeof status?.supported !== 'boolean' ||
      typeof status?.enabled !== 'boolean' ||
      typeof status?.active !== 'boolean'
    ) {
      return UNSUPPORTED_STATUS;
    }
    return {
      supported: status.supported,
      enabled: status.enabled,
      active: status.active,
      ...(typeof status.activityId === 'string' ? { activityId: status.activityId } : {}),
      ...(typeof status.sessionId === 'string' ? { sessionId: status.sessionId } : {}),
    };
  } catch {
    return UNSUPPORTED_STATUS;
  }
}

/**
 * Mirror one reducer-owned work session into ActivityKit. Commands are
 * serialized and generation-guarded so a slow start cannot win after a rapid
 * pause, reset, or mode change. A null or malformed snapshot ends all stale
 * Bloom activities, which also reconciles the native surface after relaunch.
 */
export function reconcileLiveActivity(
  snapshot: LiveActivitySnapshot | null,
): Promise<LiveActivityMutationResult> {
  const generation = ++reconcileGeneration;
  const epoch = reconcileEpoch;
  if (!isLiveActivityPlatform()) return Promise.resolve(UNSUPPORTED_MUTATION);

  const task = reconcileQueue.then(async (): Promise<LiveActivityMutationResult> => {
    const isStale = () => generation !== reconcileGeneration || epoch !== reconcileEpoch;
    if (isStale()) return UNSUPPORTED_MUTATION;

    try {
      if (!snapshot || !validSnapshot(snapshot)) {
        return normalizeMutation(
          await bloomLiveActivity.end({ dismissal: 'immediate' }),
        );
      }
      return normalizeMutation(await bloomLiveActivity.reconcile(snapshot));
    } catch {
      // A missing extension, disabled Live Activities, or a stale native
      // wrapper must never interrupt or mutate the reducer-owned timer.
      return UNSUPPORTED_MUTATION;
    }
  });

  reconcileQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function resetLiveActivityReconciliationForTests(): void {
  reconcileEpoch += 1;
  reconcileGeneration = 0;
  reconcileQueue = Promise.resolve();
}
