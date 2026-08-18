import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * PLAN 13.18 — commands recorded by a control in system UI, replayed by the
 * reducer against the wall clock they carry.
 *
 * Nothing here is Bloom data: the queue is transport, so it is not persisted in
 * `bloom-state`, not exported, and not migrated. See
 * `docs/adr/0001-native-command-channel.md`.
 */
export type IOSCommandKind = 'pause' | 'resume';

export interface IOSCommand {
  /** Idempotency key — delivery is at-least-once. */
  id: string;
  kind: IOSCommandKind;
  /** The open session this was pressed for; a mismatch means it is dropped. */
  sessionId: string;
  /** Epoch ms. The reducer replays against this, never against read time. */
  occurredAt: number;
}

interface NativeCommandsPlugin {
  drain(): Promise<{ commands?: unknown }>;
  acknowledge(options: { ids: string[] }): Promise<void>;
  clear(): Promise<void>;
}

const commandsPlugin = registerPlugin<NativeCommandsPlugin>('BloomCommands');

export function isIOSCommandPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

const KINDS: readonly string[] = ['pause', 'resume'];

/**
 * Total, like every other adapter here: a malformed entry is dropped rather
 * than coerced. A command Bloom cannot read is a command it must not act on.
 */
function normalizeCommand(value: unknown): IOSCommand | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { id, kind, sessionId, occurredAt } = raw;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return null;
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  if (typeof occurredAt !== 'number' || !Number.isFinite(occurredAt)) return null;
  // A timestamp at or before the epoch cannot be a real press and would replay
  // as an absurd elapsed time.
  if (occurredAt <= 0) return null;
  return { id, kind: kind as IOSCommandKind, sessionId, occurredAt };
}

/**
 * Read pending commands without removing them. Acknowledgement is separate on
 * purpose: a crash between applying and acknowledging re-delivers, and the
 * caller's idempotency by `id` makes that harmless.
 */
export async function drainIOSCommands(): Promise<IOSCommand[]> {
  if (!isIOSCommandPlatform()) return [];
  try {
    const result = await commandsPlugin.drain();
    const raw = Array.isArray(result?.commands) ? result.commands : [];
    const commands: IOSCommand[] = [];
    for (const entry of raw) {
      const command = normalizeCommand(entry);
      if (command) commands.push(command);
    }
    // Oldest first, so a pause followed by a resume replays in the order it
    // was pressed rather than the order it was stored.
    return commands.sort((a, b) => a.occurredAt - b.occurredAt);
  } catch {
    // An older wrapper or a missing plugin simply means no system-UI controls.
    // The timer is untouched.
    return [];
  }
}

export async function acknowledgeIOSCommands(ids: string[]): Promise<void> {
  if (!isIOSCommandPlatform() || ids.length === 0) return;
  try {
    await commandsPlugin.acknowledge({ ids });
  } catch {
    // Leaving a command pending re-delivers it; applying it twice is a no-op.
  }
}

/** Used by the confirmed data clear — pending intent for erased data is dropped. */
export async function clearIOSCommands(): Promise<void> {
  if (!isIOSCommandPlatform()) return;
  try {
    await commandsPlugin.clear();
  } catch {
    // Nothing here can leave the reducer in a worse state.
  }
}
