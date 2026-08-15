import {
  CLOUD_SYNC_ALGORITHM,
  CLOUD_SYNC_PROTOCOL,
  CLOUD_SYNC_PROTOCOL_VERSION,
  MAX_ACCOUNT_CONTENT_BYTES,
  MAX_ENCRYPTED_MUTATION_BYTES,
  MAX_ENCRYPTED_SNAPSHOT_BYTES,
  MAX_SYNC_BATCH_BYTES,
  MAX_SYNC_BATCH_MUTATIONS,
  SyncServiceError,
  type AcceptedMutation,
  type Clock,
  type CloudExportArchive,
  type EncryptedMutationEnvelope,
  type EncryptedSnapshotEnvelope,
  type RandomByteFiller,
  type StoredMutation,
  type StoredSnapshot,
} from './types';
import {
  base64UrlDecode,
  encodedBytes,
  fillRandom,
  isPlainJson,
  randomOpaqueId,
  safeInteger,
  stableJson,
  validOpaqueId,
} from './encoding';
import { sha256 } from './crypto';

export interface ChangePage {
  cloudGeneration: number;
  revision: number;
  cursor: string | null;
  mutations: StoredMutation[];
  hasMore: boolean;
}

export interface ContentStore {
  append(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelopes: EncryptedMutationEnvelope[],
  ): Promise<AcceptedMutation[]>;
  changes(
    accountId: string,
    cloudGeneration: number,
    after: string | null,
    limit?: number,
  ): Promise<ChangePage>;
  storeSnapshot(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelope: EncryptedSnapshotEnvelope,
  ): Promise<StoredSnapshot>;
  latestSnapshot(
    accountId: string,
    cloudGeneration: number,
  ): Promise<StoredSnapshot | null>;
  export(accountId: string, cloudGeneration: number): Promise<CloudExportArchive>;
  deleteActiveContent(accountId: string, nextGeneration: number): Promise<void>;
}

interface AccountContent {
  generation: number;
  revision: number;
  cursorByRevision: Map<number, string>;
  revisionByCursor: Map<string, number>;
  mutations: StoredMutation[];
  replay: Map<string, StoredMutation>;
  snapshots: StoredSnapshot[];
  totalBytes: number;
}

interface SerializedAccountContent {
  accountId: string;
  generation: number;
  revision: number;
  cursorByRevision: [number, string][];
  mutations: StoredMutation[];
  snapshots: StoredSnapshot[];
  totalBytes: number;
}

export interface ContentStoreDump {
  format: 'bloom-sync-content-store';
  formatVersion: 1;
  accounts: SerializedAccountContent[];
}

export class InMemoryContentStore implements ContentStore {
  private readonly accounts = new Map<string, AccountContent>();

  constructor(
    private readonly now: Clock = Date.now,
    private readonly random: RandomByteFiller = fillRandom,
    seed?: ContentStoreDump,
  ) {
    if (seed) this.restore(seed);
  }

  dump(): ContentStoreDump {
    return {
      format: 'bloom-sync-content-store',
      formatVersion: 1,
      accounts: [...this.accounts].map(([accountId, account]) => ({
        accountId,
        generation: account.generation,
        revision: account.revision,
        cursorByRevision: [...account.cursorByRevision],
        mutations: clone(account.mutations),
        snapshots: clone(account.snapshots),
        totalBytes: account.totalBytes,
      })),
    };
  }

  async append(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelopes: EncryptedMutationEnvelope[],
  ): Promise<AcceptedMutation[]> {
    if (envelopes.length === 0 || envelopes.length > MAX_SYNC_BATCH_MUTATIONS) {
      throw new SyncServiceError(413, 'batch_count', 'The encrypted mutation batch is outside its limit.');
    }
    const account = this.account(accountId, cloudGeneration);
    const validated = await Promise.all(
      envelopes.map(async (envelope) => {
        const ciphertextBytes = validateMutationEnvelope(
          envelope,
          accountId,
          deviceId,
          cloudGeneration,
        );
        return {
          envelope: clone(envelope),
          ciphertextBytes,
          wireHash: await sha256(stableJson(envelope)),
        };
      }),
    );
    const batchBytes = validated.reduce(
      (sum, item) => sum + encodedBytes(stableJson(item.envelope)),
      0,
    );
    if (batchBytes > MAX_SYNC_BATCH_BYTES) {
      throw new SyncServiceError(413, 'batch_size', 'The encrypted mutation batch is too large.');
    }

    for (const item of validated) {
      const prior = account.replay.get(replayKey(deviceId, item.envelope.mutationId));
      if (prior) {
        if (prior.wireHash !== item.wireHash) {
          throw new SyncServiceError(409, 'replay_mismatch', 'A mutation id was reused with different ciphertext.');
        }
        continue;
      }
      if (item.envelope.baseCursor === null) {
        if (account.revision !== 0) {
          throw new SyncServiceError(409, 'cursor_required', 'Pull current changes before uploading.');
        }
      } else if (!account.revisionByCursor.has(item.envelope.baseCursor)) {
        throw new SyncServiceError(409, 'cursor_unknown', 'The encrypted mutation base cursor is unknown.');
      }
    }

    const newBytes = validated.reduce((sum, item) => {
      const prior = account.replay.get(replayKey(deviceId, item.envelope.mutationId));
      return sum + (prior ? 0 : item.ciphertextBytes);
    }, 0);
    if (account.totalBytes + newBytes > MAX_ACCOUNT_CONTENT_BYTES) {
      throw new SyncServiceError(413, 'account_quota', 'The encrypted cloud copy reached its quota.');
    }

    const accepted: AcceptedMutation[] = [];
    for (const item of validated) {
      const key = replayKey(deviceId, item.envelope.mutationId);
      const prior = account.replay.get(key);
      if (prior) {
        accepted.push({
          mutationId: prior.envelope.mutationId,
          revision: prior.revision,
          cursor: prior.cursor,
          acceptedAt: prior.acceptedAt,
          replayed: true,
        });
        continue;
      }
      const revision = account.revision + 1;
      const cursor = randomOpaqueId('cursor', 24, this.random);
      const stored: StoredMutation = {
        envelope: item.envelope,
        wireHash: item.wireHash,
        ciphertextBytes: item.ciphertextBytes,
        revision,
        cursor,
        acceptedAt: this.now(),
      };
      account.revision = revision;
      account.cursorByRevision.set(revision, cursor);
      account.revisionByCursor.set(cursor, revision);
      account.mutations.push(stored);
      account.replay.set(key, stored);
      account.totalBytes += item.ciphertextBytes;
      accepted.push({
        mutationId: stored.envelope.mutationId,
        revision,
        cursor,
        acceptedAt: stored.acceptedAt,
        replayed: false,
      });
    }
    return clone(accepted);
  }

  async changes(
    accountId: string,
    cloudGeneration: number,
    after: string | null,
    limit = 500,
  ): Promise<ChangePage> {
    const account = this.account(accountId, cloudGeneration);
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const afterRevision = after === null ? 0 : account.revisionByCursor.get(after);
    if (afterRevision === undefined) {
      throw new SyncServiceError(409, 'cursor_unknown', 'The requested sync cursor is unknown.');
    }
    const rows = account.mutations.filter((row) => row.revision > afterRevision);
    const mutations = rows.slice(0, boundedLimit);
    const last = mutations[mutations.length - 1];
    return clone({
      cloudGeneration,
      revision: last?.revision ?? afterRevision,
      cursor: last?.cursor ?? after,
      mutations,
      hasMore: rows.length > mutations.length,
    });
  }

  async storeSnapshot(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelope: EncryptedSnapshotEnvelope,
  ): Promise<StoredSnapshot> {
    const account = this.account(accountId, cloudGeneration);
    const ciphertextBytes = validateSnapshotEnvelope(
      envelope,
      accountId,
      deviceId,
      cloudGeneration,
    );
    const coveredRevision = account.revisionByCursor.get(envelope.coveredCursor);
    if (coveredRevision === undefined) {
      throw new SyncServiceError(409, 'snapshot_cursor', 'The snapshot cursor is not in this cloud generation.');
    }
    const covered = new Set(
      account.mutations
        .filter((row) => row.revision <= coveredRevision)
        .map((row) => row.envelope.mutationId),
    );
    if (envelope.coveredMutationIds.some((id) => !covered.has(id))) {
      throw new SyncServiceError(409, 'snapshot_coverage', 'The snapshot claims an uncovered mutation.');
    }
    const wireHash = await sha256(stableJson(envelope));
    const prior = account.snapshots.find(
      (snapshot) => snapshot.envelope.snapshotId === envelope.snapshotId,
    );
    if (prior) {
      if (prior.wireHash !== wireHash) {
        throw new SyncServiceError(409, 'replay_mismatch', 'A snapshot id was reused with different ciphertext.');
      }
      return clone(prior);
    }
    if (account.totalBytes + ciphertextBytes > MAX_ACCOUNT_CONTENT_BYTES) {
      throw new SyncServiceError(413, 'account_quota', 'The encrypted cloud copy reached its quota.');
    }
    const stored: StoredSnapshot = {
      envelope: clone(envelope),
      wireHash,
      ciphertextBytes,
      revision: coveredRevision,
      storedAt: this.now(),
    };
    account.snapshots.push(stored);
    account.totalBytes += ciphertextBytes;
    return clone(stored);
  }

  async latestSnapshot(
    accountId: string,
    cloudGeneration: number,
  ): Promise<StoredSnapshot | null> {
    const snapshots = this.account(accountId, cloudGeneration).snapshots;
    const latest = [...snapshots].sort(
      (a, b) => b.revision - a.revision || b.storedAt - a.storedAt,
    )[0];
    return latest ? clone(latest) : null;
  }

  async export(accountId: string, cloudGeneration: number): Promise<CloudExportArchive> {
    const account = this.account(accountId, cloudGeneration);
    return clone({
      format: 'bloom-sync-cloud-export',
      formatVersion: 1,
      accountId,
      cloudGeneration,
      exportedAt: this.now(),
      revision: account.revision,
      mutations: account.mutations,
      snapshots: account.snapshots,
    });
  }

  async deleteActiveContent(accountId: string, nextGeneration: number): Promise<void> {
    const prior = this.accounts.get(accountId);
    if (prior?.generation === nextGeneration) return;
    if (prior && nextGeneration < prior.generation) {
      throw new SyncServiceError(409, 'generation_rollback', 'Cloud generation cannot move backward.');
    }
    this.accounts.set(accountId, emptyAccount(nextGeneration));
  }

  private account(accountId: string, generation: number): AccountContent {
    let account = this.accounts.get(accountId);
    if (!account) {
      account = emptyAccount(generation);
      this.accounts.set(accountId, account);
    }
    if (account.generation !== generation) {
      throw new SyncServiceError(409, 'generation_changed', 'The cloud generation changed.');
    }
    return account;
  }

  private restore(seed: ContentStoreDump): void {
    if (
      seed.format !== 'bloom-sync-content-store' ||
      seed.formatVersion !== 1 ||
      !Array.isArray(seed.accounts)
    ) {
      throw new Error('The Bloom content object state is unsupported.');
    }
    for (const value of seed.accounts) {
      const cursorByRevision = new Map(value.cursorByRevision);
      const revisionByCursor = new Map(
        value.cursorByRevision.map(([revision, cursor]) => [cursor, revision]),
      );
      const replay = new Map(
        value.mutations.map((mutation) => [
          replayKey(mutation.envelope.deviceId, mutation.envelope.mutationId),
          mutation,
        ]),
      );
      this.accounts.set(value.accountId, {
        generation: value.generation,
        revision: value.revision,
        cursorByRevision,
        revisionByCursor,
        mutations: clone(value.mutations),
        replay,
        snapshots: clone(value.snapshots),
        totalBytes: value.totalBytes,
      });
    }
  }
}

function emptyAccount(generation: number): AccountContent {
  return {
    generation,
    revision: 0,
    cursorByRevision: new Map(),
    revisionByCursor: new Map(),
    mutations: [],
    replay: new Map(),
    snapshots: [],
    totalBytes: 0,
  };
}

function replayKey(deviceId: string, mutationId: string): string {
  return `${deviceId.length}:${deviceId}${mutationId}`;
}

function validMetadata(
  envelope: Record<string, unknown>,
  accountId: string,
  deviceId: string,
  generation: number,
): number {
  if (
    envelope.protocol !== CLOUD_SYNC_PROTOCOL ||
    envelope.protocolVersion !== CLOUD_SYNC_PROTOCOL_VERSION ||
    envelope.algorithm !== CLOUD_SYNC_ALGORITHM ||
    envelope.accountId !== accountId ||
    envelope.deviceId !== deviceId ||
    envelope.cloudGeneration !== generation ||
    !safeInteger(envelope.contentSchemaVersion, 0) ||
    !safeInteger(envelope.keyVersion, 1) ||
    !(envelope.baseCursor === null || validOpaqueId(envelope.baseCursor, 'cursor', 24)) ||
    typeof envelope.nonce !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new SyncServiceError(400, 'envelope_metadata', 'The encrypted envelope metadata is invalid.');
  }
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    nonce = base64UrlDecode(envelope.nonce);
    ciphertext = base64UrlDecode(envelope.ciphertext);
  } catch {
    throw new SyncServiceError(400, 'envelope_encoding', 'The encrypted envelope encoding is invalid.');
  }
  if (nonce.byteLength !== 12 || ciphertext.byteLength < 16) {
    throw new SyncServiceError(400, 'envelope_encoding', 'The encrypted envelope nonce or body is invalid.');
  }
  return ciphertext.byteLength;
}

export function validateMutationEnvelope(
  input: unknown,
  accountId: string,
  deviceId: string,
  generation: number,
): number {
  if (!isPlainJson(input) || !input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SyncServiceError(400, 'envelope_json', 'The encrypted mutation is not bounded JSON.');
  }
  const envelope = input as unknown as EncryptedMutationEnvelope;
  if (
    envelope.envelopeType !== 'mutation' ||
    !validOpaqueId(envelope.mutationId, 'mutation')
  ) {
    throw new SyncServiceError(400, 'mutation_id', 'The encrypted mutation id is invalid.');
  }
  const bytes = validMetadata(
    envelope as unknown as Record<string, unknown>,
    accountId,
    deviceId,
    generation,
  );
  if (bytes > MAX_ENCRYPTED_MUTATION_BYTES) {
    throw new SyncServiceError(413, 'mutation_size', 'The encrypted mutation is too large.');
  }
  return bytes;
}

export function validateSnapshotEnvelope(
  input: unknown,
  accountId: string,
  deviceId: string,
  generation: number,
): number {
  if (!isPlainJson(input) || !input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SyncServiceError(400, 'snapshot_json', 'The encrypted snapshot is not bounded JSON.');
  }
  const envelope = input as unknown as EncryptedSnapshotEnvelope;
  if (
    envelope.envelopeType !== 'snapshot' ||
    !validOpaqueId(envelope.snapshotId, 'snapshot') ||
    !validOpaqueId(envelope.coveredCursor, 'cursor', 24) ||
    !Array.isArray(envelope.coveredMutationIds) ||
    envelope.coveredMutationIds.length > 10_000 ||
    !envelope.coveredMutationIds.every((id) => validOpaqueId(id, 'mutation')) ||
    new Set(envelope.coveredMutationIds).size !== envelope.coveredMutationIds.length
  ) {
    throw new SyncServiceError(400, 'snapshot_metadata', 'The encrypted snapshot metadata is invalid.');
  }
  const bytes = validMetadata(
    envelope as unknown as Record<string, unknown>,
    accountId,
    deviceId,
    generation,
  );
  if (bytes > MAX_ENCRYPTED_SNAPSHOT_BYTES) {
    throw new SyncServiceError(413, 'snapshot_size', 'The encrypted snapshot is too large.');
  }
  return bytes;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
