/**
 * Runtime-only storage health channel.
 *
 * Persisted payloads can fail before React mounts (during the useReducer
 * initializer), and the Companion log writes outside useBloom. Keeping the
 * warning channel outside either persisted store lets both report failures
 * without ever putting corrupt bytes back into Bloom state.
 */

export type StorageArea = 'bloom-state' | 'companion-log';
export type StorageFailureKind = 'read' | 'validation' | 'write';

export interface PreservedStorageFailure {
  area: StorageArea;
  key: string;
  kind: StorageFailureKind;
  reason: string;
  /** The exact bytes read before recovery. Null when storage could not be read. */
  raw: string | null;
  occurredAt: number;
}

export interface StorageHealthSnapshot {
  failures: PreservedStorageFailure[];
}

const EMPTY: StorageHealthSnapshot = { failures: [] };
let snapshot = EMPTY;
const listeners = new Set<() => void>();

function publish(next: StorageHealthSnapshot): void {
  snapshot = next.failures.length ? next : EMPTY;
  for (const listener of listeners) listener();
}

export function reportStorageFailure(
  failure: Omit<PreservedStorageFailure, 'occurredAt'> & { occurredAt?: number },
): void {
  const next: PreservedStorageFailure = {
    ...failure,
    occurredAt: failure.occurredAt ?? Date.now(),
  };
  // One preserved payload per key is enough. Never replace a readable corrupt
  // payload with a later write error that has no bytes attached.
  const prior = snapshot.failures.find((item) => item.key === next.key);
  const merged =
    prior && prior.raw != null && next.raw == null
      ? { ...next, raw: prior.raw, reason: `${prior.reason}; ${next.reason}` }
      : next;
  publish({
    failures: [
      ...snapshot.failures.filter((item) => item.key !== next.key),
      merged,
    ],
  });
}

export function clearStorageFailure(area?: StorageArea): void {
  publish({
    failures: area
      ? snapshot.failures.filter((failure) => failure.area !== area)
      : [],
  });
}

export function storageWritesBlocked(area: StorageArea): boolean {
  return snapshot.failures.some(
    (failure) =>
      failure.area === area &&
      (failure.kind === 'read' || failure.kind === 'validation'),
  );
}

export function getStorageHealthSnapshot(): StorageHealthSnapshot {
  return snapshot;
}

export function subscribeStorageHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only reset, exported to keep module state isolated across Vitest files. */
export function resetStorageHealthForTests(): void {
  publish(EMPTY);
}
