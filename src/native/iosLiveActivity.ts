import { Capacitor, registerPlugin } from '@capacitor/core';

/** PLAN 13.8 — only bounded Focus/Tiny countdowns have a Live Activity. */
export type IOSLiveActivityMode = 'focus' | 'tiny';

export type IOSLiveActivitySnapshot =
  | {
      sessionId: string;
      mode: IOSLiveActivityMode;
      state: 'running';
      startedAtMs: number;
      deadlineMs: number;
      completionAlertsEnabled: boolean;
    }
  | {
      sessionId: string;
      mode: IOSLiveActivityMode;
      state: 'paused';
      startedAtMs: number;
      remainingSeconds: number;
      completionAlertsEnabled: boolean;
    };

export interface IOSLiveActivityStatus {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  activityId?: string;
  sessionId?: string;
}

export interface IOSLiveActivityMutationResult {
  supported: boolean;
  active: boolean;
  changed: boolean;
  reason?: string;
}

export interface IOSLiveActivityCommand {
  id: string;
  sessionId: string;
  action: 'pause' | 'resume';
  atMs: number;
  remainingSeconds: number;
}

interface BloomLiveActivityPlugin {
  status(): Promise<IOSLiveActivityStatus>;
  reconcile(
    options:
      | {
          sessionId: string;
          mode: IOSLiveActivityMode;
          state: 'running';
          startedAtMs: number;
          deadlineMs: number;
          completionAlertsEnabled: boolean;
        }
      | {
          sessionId: string;
          mode: IOSLiveActivityMode;
          state: 'paused';
          startedAtMs: number;
          remainingSeconds: number;
          completionAlertsEnabled: boolean;
        },
  ): Promise<IOSLiveActivityMutationResult & { enabled?: boolean }>;
  end(options: {
    sessionId?: string;
    dismissal: 'immediate' | 'default';
  }): Promise<IOSLiveActivityMutationResult>;
  pendingCommands(): Promise<{ commands: unknown[] }>;
  acknowledgeCommands(options: { ids: string[] }): Promise<void>;
}

const bloomLiveActivity = registerPlugin<BloomLiveActivityPlugin>('BloomLiveActivity');

const UNSUPPORTED_STATUS: IOSLiveActivityStatus = {
  supported: false,
  enabled: false,
  active: false,
};

const UNSUPPORTED_MUTATION: IOSLiveActivityMutationResult = {
  supported: false,
  active: false,
  changed: false,
};

let reconcileGeneration = 0;
let reconcileEpoch = 0;
let reconcileQueue: Promise<void> = Promise.resolve();

export function isIOSLiveActivityPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function validSnapshot(snapshot: IOSLiveActivitySnapshot): boolean {
  return (
    typeof snapshot.sessionId === 'string' &&
    snapshot.sessionId.trim().length > 0 &&
    (snapshot.mode === 'focus' || snapshot.mode === 'tiny') &&
    Number.isFinite(snapshot.startedAtMs) &&
    snapshot.startedAtMs > 0 &&
    typeof snapshot.completionAlertsEnabled === 'boolean' &&
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

function normalizeCommands(value: unknown): IOSLiveActivityCommand[] {
  if (!value || typeof value !== 'object') return [];
  const raw = (value as { commands?: unknown }).commands;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const commands: IOSLiveActivityCommand[] = [];
  for (const item of raw.slice(-32)) {
    if (!item || typeof item !== 'object') continue;
    const command = item as Partial<IOSLiveActivityCommand>;
    if (
      typeof command.id !== 'string' ||
      !/^[a-f0-9-]{1,64}$/i.test(command.id) ||
      seen.has(command.id) ||
      typeof command.sessionId !== 'string' ||
      !/^[A-Za-z0-9._-]{1,96}$/.test(command.sessionId) ||
      (command.action !== 'pause' && command.action !== 'resume') ||
      !Number.isFinite(command.atMs) ||
      command.atMs! <= 0 ||
      command.atMs! >= 32_503_680_000_000 ||
      !Number.isInteger(command.remainingSeconds) ||
      command.remainingSeconds! <= 0 ||
      command.remainingSeconds! > 7 * 24 * 60 * 60
    ) {
      continue;
    }
    seen.add(command.id);
    commands.push(command as IOSLiveActivityCommand);
  }
  return commands;
}

function normalizeMutation(value: unknown): IOSLiveActivityMutationResult {
  if (!value || typeof value !== 'object') return UNSUPPORTED_MUTATION;
  const result = value as Partial<IOSLiveActivityMutationResult>;
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
export async function readIOSLiveActivityStatus(): Promise<IOSLiveActivityStatus> {
  if (!isIOSLiveActivityPlatform()) return UNSUPPORTED_STATUS;
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
 * Commands are device-local and contain only an opaque session id, action,
 * and timestamp. They stay queued natively until the reducer copy has been
 * persisted, making a process exit between apply and acknowledge replay-safe.
 */
export async function readPendingIOSLiveActivityCommands(): Promise<
  IOSLiveActivityCommand[]
> {
  if (!isIOSLiveActivityPlatform()) return [];
  try {
    return normalizeCommands(await bloomLiveActivity.pendingCommands());
  } catch {
    return [];
  }
}

export async function acknowledgeIOSLiveActivityCommands(
  ids: readonly string[],
): Promise<void> {
  if (!isIOSLiveActivityPlatform()) return;
  const bounded = [...new Set(ids)].filter((id) => /^[a-f0-9-]{1,64}$/i.test(id)).slice(0, 32);
  if (!bounded.length) return;
  try {
    await bloomLiveActivity.acknowledgeCommands({ ids: bounded });
  } catch {
    // Leaving commands queued is safe: reducer application is idempotent and
    // the next foreground reconciliation retries the acknowledgment.
  }
}

/**
 * Mirror one reducer-owned work session into ActivityKit. Commands are
 * serialized and generation-guarded so a slow start cannot win after a rapid
 * pause, reset, or mode change. A null or malformed snapshot ends all stale
 * Bloom activities, which also reconciles the native surface after relaunch.
 */
export function reconcileIOSLiveActivity(
  snapshot: IOSLiveActivitySnapshot | null,
): Promise<IOSLiveActivityMutationResult> {
  const generation = ++reconcileGeneration;
  const epoch = reconcileEpoch;
  if (!isIOSLiveActivityPlatform()) return Promise.resolve(UNSUPPORTED_MUTATION);

  const task = reconcileQueue.then(async (): Promise<IOSLiveActivityMutationResult> => {
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

export function resetIOSLiveActivityReconciliationForTests(): void {
  reconcileEpoch += 1;
  reconcileGeneration = 0;
  reconcileQueue = Promise.resolve();
}
