/**
 * PLAN 11.2 network-free sync protocol.
 *
 * These are the decrypted, validated envelopes consumed by the deterministic
 * merge engine. PLAN 11.3 will encrypt the `mutation` body before transport;
 * this module deliberately contains no fetch/auth/service code.
 */

export const SYNC_PROTOCOL = 'bloom-sync-mutation';
export const SYNC_PROTOCOL_VERSION = 1;
export const MAX_SYNC_ENVELOPE_BYTES = 512 * 1024;
export const MAX_SYNC_JSON_DEPTH = 24;
export const MAX_SYNC_ENTITY_ID_LENGTH = 1024;
export const MAX_SYNC_REFERENCES = 32;
export const MAX_SYNC_PATCH_FIELDS = 128;
export const MAX_SYNC_COMPACTION_SOURCES = 4096;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SyncEntityReference {
  kind: string;
  id: string;
}

interface MutationBase {
  kind: string;
  id: string;
}

export interface CreateSyncMutation extends MutationBase {
  operation: 'create';
  value: JsonObject;
  references?: SyncEntityReference[];
}

export interface SetSyncMutation extends MutationBase {
  operation: 'set';
  fields: JsonObject;
  unset?: string[];
  references?: SyncEntityReference[];
}

export interface RepairSyncMutation extends MutationBase {
  operation: 'repair';
  fields: JsonObject;
  unset?: string[];
  references?: SyncEntityReference[];
}

export interface DeleteSyncMutation extends MutationBase {
  operation: 'delete';
}

export interface RecreateSyncMutation extends MutationBase {
  operation: 'recreate';
  recreatesRevision: number;
  value: JsonObject;
  references?: SyncEntityReference[];
}

export interface IncrementSyncMutation extends MutationBase {
  operation: 'increment';
  kind: 'counter';
  delta: number;
}

export interface CompactSyncMutation extends MutationBase {
  operation: 'compact';
  value: JsonObject;
  sourceMutationIds: string[];
}

export type SyncMutation =
  | CreateSyncMutation
  | SetSyncMutation
  | RepairSyncMutation
  | DeleteSyncMutation
  | RecreateSyncMutation
  | IncrementSyncMutation
  | CompactSyncMutation;

export interface PendingSyncEnvelope {
  format: typeof SYNC_PROTOCOL;
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  contentSchemaVersion: number;
  deviceId: string;
  mutationId: string;
  baseRevision: number;
  mutation: SyncMutation;
}

export interface AcceptedSyncEnvelope extends PendingSyncEnvelope {
  revision: number;
  cursor: string;
  /** Sanitized original wire object, including unknown fields for round-trip. */
  wire: JsonObject;
}

export type SyncEnvelopeParseResult =
  | { status: 'valid'; envelope: AcceptedSyncEnvelope }
  | {
      status: 'future-schema' | 'unsupported-protocol' | 'invalid';
      raw: JsonValue | null;
      reason: string;
    };

export type RandomByteFiller = (bytes: Uint8Array) => void;

function defaultRandomByteFiller(bytes: Uint8Array): void {
  globalThis.crypto.getRandomValues(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Random-only identifiers: no device clock and no user/content input. */
export function newSyncId(
  prefix: 'device' | 'install' | 'mutation' | 'snapshot',
  fillRandom: RandomByteFiller = defaultRandomByteFiller,
): string {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

export function createPendingSyncEnvelope(input: {
  contentSchemaVersion: number;
  deviceId: string;
  mutation: SyncMutation;
  baseRevision?: number;
  mutationId?: string;
  fillRandom?: RandomByteFiller;
}): PendingSyncEnvelope {
  if (!isJsonValue(input.mutation)) {
    throw new Error('The sync mutation is not bounded JSON.');
  }
  const pending: PendingSyncEnvelope = {
    format: SYNC_PROTOCOL,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    contentSchemaVersion: input.contentSchemaVersion,
    deviceId: input.deviceId,
    mutationId:
      input.mutationId ?? newSyncId('mutation', input.fillRandom ?? defaultRandomByteFiller),
    baseRevision: input.baseRevision ?? 0,
    mutation: cloneJson(input.mutation as unknown as JsonValue) as unknown as SyncMutation,
  };
  const issue = validatePendingEnvelope(pending);
  if (issue) throw new Error(issue);
  return pending;
}

export function acceptPendingSyncEnvelope(
  pending: PendingSyncEnvelope,
  revision: number,
  cursor: string,
  wireExtensions: JsonObject = {},
): AcceptedSyncEnvelope {
  const wire: JsonObject = {
    ...cloneJson(wireExtensions),
    ...pendingToWire(pending),
    revision,
    cursor,
  };
  const parsed = parseSyncEnvelope(wire, pending.contentSchemaVersion);
  if (parsed.status !== 'valid') throw new Error(parsed.reason);
  return parsed.envelope;
}

function pendingToWire(pending: PendingSyncEnvelope): JsonObject {
  return {
    format: pending.format,
    protocolVersion: pending.protocolVersion,
    contentSchemaVersion: pending.contentSchemaVersion,
    deviceId: pending.deviceId,
    mutationId: pending.mutationId,
    baseRevision: pending.baseRevision,
    mutation: mutationToWire(pending.mutation),
  };
}

function mutationToWire(mutation: SyncMutation): JsonObject {
  return cloneJson(mutation as unknown as JsonValue) as JsonObject;
}

export function acceptedEnvelopeToWire(envelope: AcceptedSyncEnvelope): JsonObject {
  return cloneJson(envelope.wire);
}

export function serializeAcceptedSyncEnvelope(envelope: AcceptedSyncEnvelope): string {
  return canonicalJson(acceptedEnvelopeToWire(envelope));
}

export function parseSyncEnvelope(
  input: string | unknown,
  currentContentSchemaVersion: number,
): SyncEnvelopeParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_SYNC_ENVELOPE_BYTES) {
      return { status: 'invalid', raw: null, reason: 'The sync envelope is too large.' };
    }
    try {
      raw = JSON.parse(input);
    } catch {
      return { status: 'invalid', raw: null, reason: 'The sync envelope is not valid JSON.' };
    }
  }

  if (!isJsonValue(raw, 0)) {
    return { status: 'invalid', raw: null, reason: 'The sync envelope is not bounded JSON.' };
  }
  const safeRaw = cloneJson(raw);
  if (!isJsonObject(safeRaw)) {
    return { status: 'invalid', raw: safeRaw, reason: 'The sync envelope is not an object.' };
  }
  if (encodedJsonBytes(safeRaw) > MAX_SYNC_ENVELOPE_BYTES) {
    return { status: 'invalid', raw: safeRaw, reason: 'The sync envelope is too large.' };
  }

  const protocolVersion = safeRaw.protocolVersion;
  if (!safeInteger(protocolVersion, 1)) {
    return { status: 'invalid', raw: safeRaw, reason: 'The protocol version is invalid.' };
  }
  if (protocolVersion !== SYNC_PROTOCOL_VERSION) {
    return {
      status: 'unsupported-protocol',
      raw: safeRaw,
      reason: 'This sync protocol version is not supported by this Bloom build.',
    };
  }
  if (safeRaw.format !== SYNC_PROTOCOL) {
    return { status: 'invalid', raw: safeRaw, reason: 'The sync envelope format is invalid.' };
  }

  const contentSchemaVersion = safeRaw.contentSchemaVersion;
  if (!safeInteger(contentSchemaVersion, 0)) {
    return { status: 'invalid', raw: safeRaw, reason: 'The content schema version is invalid.' };
  }
  if (contentSchemaVersion > currentContentSchemaVersion) {
    return {
      status: 'future-schema',
      raw: safeRaw,
      reason: 'A newer Bloom build is needed before this envelope can be applied.',
    };
  }

  const deviceId = safeRaw.deviceId;
  const mutationId = safeRaw.mutationId;
  const cursor = safeRaw.cursor;
  if (!validOpaqueId(deviceId, 128, 'device_')) {
    return { status: 'invalid', raw: safeRaw, reason: 'The device id is invalid.' };
  }
  if (!validOpaqueId(mutationId, 128, 'mutation_')) {
    return { status: 'invalid', raw: safeRaw, reason: 'The mutation id is invalid.' };
  }
  if (!validCursor(cursor)) {
    return { status: 'invalid', raw: safeRaw, reason: 'The server cursor is invalid.' };
  }
  if (!safeInteger(safeRaw.baseRevision, 0) || !safeInteger(safeRaw.revision, 1)) {
    return { status: 'invalid', raw: safeRaw, reason: 'The sync revisions are invalid.' };
  }
  if (safeRaw.baseRevision >= safeRaw.revision) {
    return {
      status: 'invalid',
      raw: safeRaw,
      reason: 'The base revision must precede the accepted revision.',
    };
  }

  const mutation = parseMutation(safeRaw.mutation);
  if (typeof mutation === 'string') {
    return { status: 'invalid', raw: safeRaw, reason: mutation };
  }

  return {
    status: 'valid',
    envelope: {
      format: SYNC_PROTOCOL,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      contentSchemaVersion,
      deviceId,
      mutationId,
      baseRevision: safeRaw.baseRevision,
      revision: safeRaw.revision,
      cursor,
      mutation,
      wire: safeRaw,
    },
  };
}

function parseMutation(raw: JsonValue | undefined): SyncMutation | string {
  if (!isJsonObject(raw)) return 'The sync mutation is not an object.';
  if (!validKind(raw.kind) || !validEntityId(raw.id)) {
    return 'The sync mutation target is invalid.';
  }
  const base = { kind: raw.kind, id: raw.id };
  switch (raw.operation) {
    case 'create': {
      if (!isJsonObject(raw.value)) return 'A create mutation needs an object value.';
      const references = parseReferences(raw.references);
      if (typeof references === 'string') return references;
      return { ...base, operation: 'create', value: raw.value, ...optionalReferences(references) };
    }
    case 'set':
    case 'repair': {
      if (!isJsonObject(raw.fields)) return 'A field mutation needs an object patch.';
      const fields = raw.fields;
      if (Object.keys(fields).length > MAX_SYNC_PATCH_FIELDS) {
        return 'The sync field patch is too large.';
      }
      const unset = parseUnset(raw.unset);
      if (typeof unset === 'string') return unset;
      if (unset.some((field) => field in fields)) {
        return 'A sync field cannot be both set and unset in one mutation.';
      }
      const references = parseReferences(raw.references);
      if (typeof references === 'string') return references;
      return {
        ...base,
        operation: raw.operation,
        fields,
        ...(unset.length ? { unset } : {}),
        ...optionalReferences(references),
      };
    }
    case 'delete':
      return { ...base, operation: 'delete' };
    case 'recreate': {
      if (!safeInteger(raw.recreatesRevision, 1) || !isJsonObject(raw.value)) {
        return 'A recreate mutation needs a tombstone revision and object value.';
      }
      const references = parseReferences(raw.references);
      if (typeof references === 'string') return references;
      return {
        ...base,
        operation: 'recreate',
        recreatesRevision: raw.recreatesRevision,
        value: raw.value,
        ...optionalReferences(references),
      };
    }
    case 'increment':
      if (raw.kind !== 'counter' || !finiteNonZero(raw.delta)) {
        return 'A counter mutation needs a finite non-zero delta.';
      }
      return { kind: 'counter', id: raw.id, operation: 'increment', delta: raw.delta };
    case 'compact': {
      if (!isJsonObject(raw.value) || !Array.isArray(raw.sourceMutationIds)) {
        return 'A compaction mutation needs an object value and source ids.';
      }
      if (
        raw.sourceMutationIds.length === 0 ||
        raw.sourceMutationIds.length > MAX_SYNC_COMPACTION_SOURCES ||
        !raw.sourceMutationIds.every((id) => validOpaqueId(id, 128, 'mutation_')) ||
        new Set(raw.sourceMutationIds).size !== raw.sourceMutationIds.length
      ) {
        return 'The compaction source list is invalid.';
      }
      return {
        ...base,
        operation: 'compact',
        value: raw.value,
        sourceMutationIds: [...raw.sourceMutationIds],
      };
    }
    default:
      return 'The sync mutation operation is not supported.';
  }
}

function optionalReferences(references: SyncEntityReference[]) {
  return references.length ? { references } : {};
}

function parseReferences(raw: JsonValue | undefined): SyncEntityReference[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SYNC_REFERENCES) {
    return 'The sync reference list is invalid.';
  }
  const references: SyncEntityReference[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (!isJsonObject(item) || !validKind(item.kind) || !validEntityId(item.id)) {
      return 'A sync reference is invalid.';
    }
    const key = `${item.kind}\u0000${item.id}`;
    if (keys.has(key)) return 'The sync reference list contains a duplicate.';
    keys.add(key);
    references.push({ kind: item.kind, id: item.id });
  }
  return references;
}

function parseUnset(raw: JsonValue | undefined): string[] | string {
  if (raw === undefined) return [];
  if (
    !Array.isArray(raw) ||
    raw.length > MAX_SYNC_PATCH_FIELDS ||
    !raw.every((field) => typeof field === 'string' && field.length > 0 && field.length <= 128) ||
    new Set(raw).size !== raw.length
  ) {
    return 'The sync unset list is invalid.';
  }
  return raw.map((field) => field as string);
}

function validatePendingEnvelope(envelope: PendingSyncEnvelope): string | null {
  if (!safeInteger(envelope.contentSchemaVersion, 0)) return 'Invalid content schema version.';
  if (!validOpaqueId(envelope.deviceId, 128, 'device_')) return 'Invalid device id.';
  if (!validOpaqueId(envelope.mutationId, 128, 'mutation_')) return 'Invalid mutation id.';
  if (!safeInteger(envelope.baseRevision, 0)) return 'Invalid base revision.';
  if (encodedJsonBytes(pendingToWire(envelope)) > MAX_SYNC_ENVELOPE_BYTES) {
    return 'The sync envelope is too large.';
  }
  const mutation = parseMutation(mutationToWire(envelope.mutation));
  return typeof mutation === 'string' ? mutation : null;
}

export function validOpaqueId(
  value: JsonValue | undefined,
  maxLength: number,
  requiredPrefix?: string,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    (!requiredPrefix || value.startsWith(requiredPrefix)) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

export function validEntityId(value: JsonValue | undefined): value is string {
  // Existing Bloom ids predate sync and some validators only required a
  // non-empty string. Preserve them byte-for-byte, including whitespace and
  // escaped characters; entityKey uses a length prefix instead of a sentinel.
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SYNC_ENTITY_ID_LENGTH
  );
}

export function validKind(value: JsonValue | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[a-z][a-z0-9-]*$/.test(value)
  );
}

function validCursor(value: JsonValue | undefined): value is string {
  return validOpaqueId(value, 128);
}

function finiteNonZero(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

function safeInteger(value: JsonValue | undefined, min: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min;
}

function encodedJsonBytes(value: JsonValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > MAX_SYNC_JSON_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(
    ([key, item]) => key.length <= 256 && isJsonValue(item, depth + 1),
  );
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function entityKey(kind: string, id: string): string {
  return `${kind.length}:${kind}${id}`;
}
