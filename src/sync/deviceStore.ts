import {
  SYNC_PROTOCOL,
  SYNC_PROTOCOL_VERSION,
  MAX_SYNC_ENVELOPE_BYTES,
  canonicalJson,
  cloneJson,
  createPendingSyncEnvelope,
  isJsonObject,
  isJsonValue,
  newSyncId,
  validOpaqueId,
  type JsonObject,
  type JsonValue,
  type PendingSyncEnvelope,
  type RandomByteFiller,
  type SyncMutation,
} from './protocol';

/**
 * Device/account/cursor state never rides inside a Bloom sync payload.
 * This is an abstract record key, not authorization to use localStorage:
 * runtime web wiring must use IndexedDB and native wiring secure/platform
 * storage as required by docs/sync.md. Credentials and root keys never enter
 * this record.
 */
export const SYNC_DEVICE_STORAGE_KEY = 'bloom-sync-device-v1';
export const SYNC_DEVICE_STORAGE_VERSION = 1;
export const MAX_SYNC_OUTBOX = 2_000;
export const MAX_PRESERVED_INBOX = 2_000;
export const MAX_SYNC_DEVICE_STORE_BYTES = 32 * 1024 * 1024;

export type SyncDeviceMode =
  | 'local-only'
  | 'signed-in-no-upload'
  | 'enabled'
  | 'paused';

export interface SyncAccountBinding {
  accountId: string;
  deviceId: string;
  cloudGeneration: number;
  keyVersion: number;
  mode: Exclude<SyncDeviceMode, 'local-only'>;
  cursor: string | null;
  lastRevision: number;
}

export interface SyncDeviceState {
  version: typeof SYNC_DEVICE_STORAGE_VERSION;
  installationId: string;
  binding: SyncAccountBinding | null;
  outbox: PendingSyncEnvelope[];
  /** Opaque newer envelopes retained until this client can understand them. */
  preservedInbox: JsonObject[];
}

export interface SyncDeviceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadedSyncDeviceState {
  state: SyncDeviceState;
  issue: string | null;
  /** The invalid raw copy is returned to callers; it is never silently overwritten. */
  rejectedRaw: string | null;
}

export function createSyncDeviceState(
  fillRandom?: RandomByteFiller,
): SyncDeviceState {
  return {
    version: SYNC_DEVICE_STORAGE_VERSION,
    installationId: newSyncId('install', fillRandom),
    binding: null,
    outbox: [],
    preservedInbox: [],
  };
}

export function bindSyncAccount(
  state: SyncDeviceState,
  accountId: string,
  input: {
    cloudGeneration: number;
    keyVersion: number;
    mode?: Exclude<SyncDeviceMode, 'local-only'>;
    fillRandom?: RandomByteFiller;
  },
): SyncDeviceState {
  if (state.binding) {
    throw new Error('Clear the existing sync binding through the account-switch recovery flow first.');
  }
  if (!validAccountId(accountId)) throw new Error('Invalid Bloom account id.');
  if (!safeInteger(input.cloudGeneration, 1) || !safeInteger(input.keyVersion, 1)) {
    throw new Error('Invalid sync account generation or key version.');
  }
  return {
    ...cloneDeviceState(state),
    binding: {
      accountId,
      deviceId: newSyncId('device', input.fillRandom),
      cloudGeneration: input.cloudGeneration,
      keyVersion: input.keyVersion,
      mode: input.mode ?? 'signed-in-no-upload',
      cursor: null,
      lastRevision: 0,
    },
    outbox: [],
    preservedInbox: [],
  };
}

export function queueSyncMutation(
  state: SyncDeviceState,
  contentSchemaVersion: number,
  mutation: SyncMutation,
  fillRandom?: RandomByteFiller,
): SyncDeviceState {
  if (!state.binding) throw new Error('A Bloom account must be bound before queueing sync.');
  if (state.binding.mode !== 'enabled' && state.binding.mode !== 'paused') {
    throw new Error('Sync upload consent has not been enabled.');
  }
  if (state.outbox.length >= MAX_SYNC_OUTBOX) {
    throw new Error('The local sync outbox is full.');
  }
  const pending = createPendingSyncEnvelope({
    contentSchemaVersion,
    deviceId: state.binding.deviceId,
    baseRevision: state.binding.lastRevision,
    mutation,
    fillRandom,
  });
  const next = { ...cloneDeviceState(state), outbox: [...state.outbox, pending] };
  if (encodedBytes(next) > MAX_SYNC_DEVICE_STORE_BYTES) {
    throw new Error('The local sync outbox has reached its storage limit.');
  }
  return next;
}

export function acknowledgeSyncMutations(
  state: SyncDeviceState,
  mutationIds: Iterable<string>,
  accepted: { revision: number; cursor: string; cloudGeneration: number },
): SyncDeviceState {
  if (!state.binding) return cloneDeviceState(state);
  if (accepted.cloudGeneration !== state.binding.cloudGeneration) {
    throw new Error('The cloud generation changed; a full rebase is required.');
  }
  if (!safeInteger(accepted.revision, state.binding.lastRevision) || !validCursor(accepted.cursor)) {
    throw new Error('The sync acknowledgement cursor is invalid or rolled back.');
  }
  const acknowledged = new Set(mutationIds);
  const queuedIds = new Set(state.outbox.map((item) => item.mutationId));
  if ([...acknowledged].some((mutationId) => !queuedIds.has(mutationId))) {
    throw new Error('The sync acknowledgement names a mutation outside this outbox.');
  }
  if (
    accepted.revision === state.binding.lastRevision &&
    state.binding.cursor !== null &&
    accepted.cursor !== state.binding.cursor
  ) {
    throw new Error('The sync acknowledgement changed a cursor without advancing its revision.');
  }
  return {
    ...cloneDeviceState(state),
    binding: {
      ...state.binding,
      lastRevision: accepted.revision,
      cursor: accepted.cursor,
    },
    outbox: state.outbox.filter((item) => !acknowledged.has(item.mutationId)),
  };
}

export function preserveFutureEnvelope(
  state: SyncDeviceState,
  raw: JsonObject,
): SyncDeviceState {
  if (state.preservedInbox.length >= MAX_PRESERVED_INBOX) {
    throw new Error('The preserved sync inbox is full.');
  }
  if (!isJsonValue(raw) || encodedBytes(raw) > MAX_SYNC_ENVELOPE_BYTES) {
    throw new Error('The future sync envelope is invalid or too large to preserve.');
  }
  const canonical = canonicalJson(raw);
  if (state.preservedInbox.some((item) => canonicalJson(item) === canonical)) {
    return cloneDeviceState(state);
  }
  const next = {
    ...cloneDeviceState(state),
    preservedInbox: [...state.preservedInbox, cloneJson(raw)],
  };
  if (encodedBytes(next) > MAX_SYNC_DEVICE_STORE_BYTES) {
    throw new Error('The preserved sync inbox has reached its storage limit.');
  }
  return next;
}

export function loadSyncDeviceState(
  storage: SyncDeviceStorageLike,
  fillRandom?: RandomByteFiller,
): LoadedSyncDeviceState {
  const raw = storage.getItem(SYNC_DEVICE_STORAGE_KEY);
  if (!raw) return { state: createSyncDeviceState(fillRandom), issue: null, rejectedRaw: null };
  if (new TextEncoder().encode(raw).byteLength > MAX_SYNC_DEVICE_STORE_BYTES) {
    return {
      state: createSyncDeviceState(fillRandom),
      issue: 'The device-local sync metadata is larger than Bloom supports.',
      rejectedRaw: raw,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      state: createSyncDeviceState(fillRandom),
      issue: 'The device-local sync metadata is not valid JSON.',
      rejectedRaw: raw,
    };
  }
  const state = sanitizeSyncDeviceState(parsed);
  if (!state) {
    return {
      state: createSyncDeviceState(fillRandom),
      issue: 'The device-local sync metadata is invalid or unsupported.',
      rejectedRaw: raw,
    };
  }
  return { state, issue: null, rejectedRaw: null };
}

/** Persist a first-install id once; corrupt existing metadata remains untouched. */
export function loadOrCreateSyncDeviceState(
  storage: SyncDeviceStorageLike,
  fillRandom?: RandomByteFiller,
): LoadedSyncDeviceState {
  const wasMissing = storage.getItem(SYNC_DEVICE_STORAGE_KEY) === null;
  const loaded = loadSyncDeviceState(storage, fillRandom);
  if (wasMissing && loaded.issue === null) saveSyncDeviceState(storage, loaded.state);
  return loaded;
}

export function saveSyncDeviceState(
  storage: SyncDeviceStorageLike,
  state: SyncDeviceState,
): void {
  const sanitized = sanitizeSyncDeviceState(state);
  if (!sanitized) throw new Error('Refusing to save invalid device-local sync metadata.');
  if (encodedBytes(sanitized) > MAX_SYNC_DEVICE_STORE_BYTES) {
    throw new Error('Refusing to save oversized device-local sync metadata.');
  }
  storage.setItem(SYNC_DEVICE_STORAGE_KEY, JSON.stringify(sanitized));
}

export function sanitizeSyncDeviceState(raw: unknown): SyncDeviceState | null {
  if (!isJsonObject(raw) || raw.version !== SYNC_DEVICE_STORAGE_VERSION) return null;
  if (!validOpaqueId(raw.installationId, 128, 'install_')) return null;
  const binding = sanitizeBinding(raw.binding);
  if (raw.binding !== null && !binding) return null;
  if (!Array.isArray(raw.outbox) || raw.outbox.length > MAX_SYNC_OUTBOX) return null;
  const outbox: PendingSyncEnvelope[] = [];
  const mutationIds = new Set<string>();
  for (const item of raw.outbox) {
    const pending = sanitizePending(item);
    if (!pending || mutationIds.has(pending.mutationId)) return null;
    if (binding && pending.deviceId !== binding.deviceId) return null;
    mutationIds.add(pending.mutationId);
    outbox.push(pending);
  }
  if (
    !Array.isArray(raw.preservedInbox) ||
    raw.preservedInbox.length > MAX_PRESERVED_INBOX ||
    !raw.preservedInbox.every(
      (item) =>
        isJsonObject(item) &&
        isJsonValue(item) &&
        encodedBytes(item) <= MAX_SYNC_ENVELOPE_BYTES,
    )
  ) {
    return null;
  }
  return {
    version: SYNC_DEVICE_STORAGE_VERSION,
    installationId: raw.installationId,
    binding,
    outbox,
    preservedInbox: (raw.preservedInbox as JsonObject[]).map((item) => cloneJson(item)),
  };
}

function sanitizePending(raw: JsonValue): PendingSyncEnvelope | null {
  if (!isJsonObject(raw)) return null;
  if (
    raw.format !== SYNC_PROTOCOL ||
    raw.protocolVersion !== SYNC_PROTOCOL_VERSION ||
    !safeInteger(raw.contentSchemaVersion, 0) ||
    !validOpaqueId(raw.deviceId, 128, 'device_') ||
    !validOpaqueId(raw.mutationId, 128, 'mutation_') ||
    !safeInteger(raw.baseRevision, 0) ||
    !isJsonObject(raw.mutation)
  ) {
    return null;
  }
  try {
    return createPendingSyncEnvelope({
      contentSchemaVersion: raw.contentSchemaVersion,
      deviceId: raw.deviceId,
      mutationId: raw.mutationId,
      baseRevision: raw.baseRevision,
      mutation: cloneJson(raw.mutation) as unknown as SyncMutation,
    });
  } catch {
    return null;
  }
}

function sanitizeBinding(raw: JsonValue | undefined): SyncAccountBinding | null {
  if (raw === null) return null;
  if (!isJsonObject(raw)) return null;
  if (
    !validAccountId(raw.accountId) ||
    !validOpaqueId(raw.deviceId, 128, 'device_') ||
    !safeInteger(raw.cloudGeneration, 1) ||
    !safeInteger(raw.keyVersion, 1) ||
    !['signed-in-no-upload', 'enabled', 'paused'].includes(raw.mode as string) ||
    !(raw.cursor === null || validCursor(raw.cursor)) ||
    !safeInteger(raw.lastRevision, 0)
  ) {
    return null;
  }
  return {
    accountId: raw.accountId,
    deviceId: raw.deviceId,
    cloudGeneration: raw.cloudGeneration,
    keyVersion: raw.keyVersion,
    mode: raw.mode as SyncAccountBinding['mode'],
    cursor: raw.cursor,
    lastRevision: raw.lastRevision,
  };
}

function validAccountId(value: JsonValue | undefined): value is string {
  return validOpaqueId(value, 128, 'account_');
}

function validCursor(value: JsonValue | undefined): value is string {
  return validOpaqueId(value, 128);
}

function safeInteger(value: JsonValue | undefined, min: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min;
}

function cloneDeviceState(state: SyncDeviceState): SyncDeviceState {
  return cloneJson(state as unknown as JsonValue) as unknown as SyncDeviceState;
}

function encodedBytes(value: JsonValue | SyncDeviceState): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
