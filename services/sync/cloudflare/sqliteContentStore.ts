import {
  MAX_ACCOUNT_CONTENT_BYTES,
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
} from '../types';
import {
  type ChangePage,
  type ContentStore,
  validateMutationEnvelope,
  validateSnapshotEnvelope,
} from '../contentStore';
import { encodedBytes, fillRandom, randomOpaqueId, stableJson } from '../encoding';
import { sha256 } from '../crypto';
import type { DurableObjectStorage, DurableObjectSqlStorage } from './types';

const CIPHERTEXT_CHUNK_CHARACTERS = 64 * 1024;

interface MetaRow {
  generation: number;
  revision: number;
  total_bytes: number;
}

interface MutationRow {
  device_id: string;
  mutation_id: string;
  envelope_json: string;
  wire_hash: string;
  ciphertext_bytes: number;
  revision: number;
  cursor: string;
  accepted_at: number;
}

interface SnapshotRow {
  snapshot_id: string;
  envelope_json: string;
  wire_hash: string;
  ciphertext_bytes: number;
  revision: number;
  stored_at: number;
}

interface ValidatedMutation {
  envelope: EncryptedMutationEnvelope;
  ciphertextBytes: number;
  wireHash: string;
}

export class SqliteContentStore implements ContentStore {
  private readonly sql: DurableObjectSqlStorage;

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly now: Clock = Date.now,
    private readonly random: RandomByteFiller = fillRandom,
  ) {
    this.sql = storage.sql;
    this.initialize();
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
    const validated = await Promise.all(envelopes.map(async (envelope) => ({
      envelope: structuredClone(envelope),
      ciphertextBytes: validateMutationEnvelope(
        envelope,
        accountId,
        deviceId,
        cloudGeneration,
      ),
      wireHash: await sha256(stableJson(envelope)),
    })));
    if (validated.reduce(
      (sum, value) => sum + encodedBytes(stableJson(value.envelope)),
      0,
    ) > MAX_SYNC_BATCH_BYTES) {
      throw new SyncServiceError(413, 'batch_size', 'The encrypted mutation batch is too large.');
    }
    return this.storage.transactionSync(() => this.appendTransaction(
      accountId,
      deviceId,
      cloudGeneration,
      validated,
    ));
  }

  async changes(
    _accountId: string,
    cloudGeneration: number,
    after: string | null,
    limit = 500,
  ): Promise<ChangePage> {
    const meta = this.meta(cloudGeneration);
    const afterRevision = after === null
      ? 0
      : this.first<{ revision: number }>(
        'SELECT revision FROM cursors WHERE cursor = ?',
        after,
      )?.revision;
    if (afterRevision === undefined) {
      throw new SyncServiceError(409, 'cursor_unknown', 'The requested sync cursor is unknown.');
    }
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = this.all<MutationRow>(
      `SELECT * FROM mutations WHERE revision > ? ORDER BY revision LIMIT ?`,
      afterRevision,
      boundedLimit + 1,
    );
    const hasMore = rows.length > boundedLimit;
    const mutations = rows.slice(0, boundedLimit).map((row) => this.storedMutation(row));
    const last = mutations[mutations.length - 1];
    return {
      cloudGeneration: meta.generation,
      revision: last?.revision ?? afterRevision,
      cursor: last?.cursor ?? after,
      mutations,
      hasMore,
    };
  }

  async storeSnapshot(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelope: EncryptedSnapshotEnvelope,
  ): Promise<StoredSnapshot> {
    const ciphertextBytes = validateSnapshotEnvelope(
      envelope,
      accountId,
      deviceId,
      cloudGeneration,
    );
    const wireHash = await sha256(stableJson(envelope));
    return this.storage.transactionSync(() => {
      const meta = this.meta(cloudGeneration);
      const prior = this.first<SnapshotRow>(
        'SELECT * FROM snapshots WHERE snapshot_id = ?',
        envelope.snapshotId,
      );
      if (prior) {
        if (prior.wire_hash !== wireHash) {
          throw new SyncServiceError(409, 'replay_mismatch', 'A snapshot id was reused with different ciphertext.');
        }
        return this.storedSnapshot(prior);
      }
      const coveredRevision = this.first<{ revision: number }>(
        'SELECT revision FROM cursors WHERE cursor = ?',
        envelope.coveredCursor,
      )?.revision;
      if (coveredRevision === undefined) {
        throw new SyncServiceError(409, 'snapshot_cursor', 'The snapshot cursor is not in this cloud generation.');
      }
      const covered = new Set(this.all<{ mutation_id: string }>(
        'SELECT mutation_id FROM mutations WHERE revision <= ?',
        coveredRevision,
      ).map((row) => row.mutation_id));
      if (envelope.coveredMutationIds.some((mutationId) => !covered.has(mutationId))) {
        throw new SyncServiceError(409, 'snapshot_coverage', 'The snapshot claims an uncovered mutation.');
      }
      if (meta.total_bytes + ciphertextBytes > MAX_ACCOUNT_CONTENT_BYTES) {
        throw new SyncServiceError(413, 'account_quota', 'The encrypted cloud copy reached its quota.');
      }
      const storedAt = this.now();
      this.sql.exec(
        `INSERT INTO snapshots
         (snapshot_id, envelope_json, wire_hash, ciphertext_bytes, revision, stored_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        envelope.snapshotId,
        envelopeMetadataJson(envelope),
        wireHash,
        ciphertextBytes,
        coveredRevision,
        storedAt,
      );
      this.writeChunks('snapshot_chunks', 'snapshot_id', envelope.snapshotId, envelope.ciphertext);
      this.sql.exec(
        'UPDATE account_meta SET total_bytes = total_bytes + ? WHERE id = 1',
        ciphertextBytes,
      );
      return {
        envelope: structuredClone(envelope),
        wireHash,
        ciphertextBytes,
        revision: coveredRevision,
        storedAt,
      };
    });
  }

  async latestSnapshot(
    _accountId: string,
    cloudGeneration: number,
  ): Promise<StoredSnapshot | null> {
    this.meta(cloudGeneration);
    const row = this.first<SnapshotRow>(
      'SELECT * FROM snapshots ORDER BY revision DESC, stored_at DESC LIMIT 1',
    );
    return row ? this.storedSnapshot(row) : null;
  }

  async export(accountId: string, cloudGeneration: number): Promise<CloudExportArchive> {
    const meta = this.meta(cloudGeneration);
    return {
      format: 'bloom-sync-cloud-export',
      formatVersion: 1,
      accountId,
      cloudGeneration,
      exportedAt: this.now(),
      revision: meta.revision,
      mutations: this.all<MutationRow>(
        'SELECT * FROM mutations ORDER BY revision',
      ).map((row) => this.storedMutation(row)),
      snapshots: this.all<SnapshotRow>(
        'SELECT * FROM snapshots ORDER BY revision, stored_at',
      ).map((row) => this.storedSnapshot(row)),
    };
  }

  async deleteActiveContent(_accountId: string, nextGeneration: number): Promise<void> {
    this.storage.transactionSync(() => {
      const current = this.first<MetaRow>('SELECT * FROM account_meta WHERE id = 1');
      if (current?.generation === nextGeneration) return;
      if (current && nextGeneration < current.generation) {
        throw new SyncServiceError(409, 'generation_rollback', 'Cloud generation cannot move backward.');
      }
      for (const table of [
        'mutation_chunks',
        'snapshot_chunks',
        'mutations',
        'snapshots',
        'cursors',
      ]) {
        this.sql.exec(`DELETE FROM ${table}`);
      }
      this.sql.exec(
        `INSERT INTO account_meta (id, generation, revision, total_bytes)
         VALUES (1, ?, 0, 0)
         ON CONFLICT(id) DO UPDATE SET generation = excluded.generation,
           revision = 0, total_bytes = 0`,
        nextGeneration,
      );
    });
  }

  private appendTransaction(
    _accountId: string,
    deviceId: string,
    generation: number,
    validated: ValidatedMutation[],
  ): AcceptedMutation[] {
    const meta = this.meta(generation);
    const unique = new Map<string, ValidatedMutation>();
    for (const value of validated) {
      const priorInput = unique.get(value.envelope.mutationId);
      if (priorInput && priorInput.wireHash !== value.wireHash) {
        throw new SyncServiceError(409, 'replay_mismatch', 'A mutation id was reused with different ciphertext.');
      }
      unique.set(value.envelope.mutationId, value);
      const prior = this.first<MutationRow>(
        'SELECT * FROM mutations WHERE device_id = ? AND mutation_id = ?',
        deviceId,
        value.envelope.mutationId,
      );
      if (prior) {
        if (prior.wire_hash !== value.wireHash) {
          throw new SyncServiceError(409, 'replay_mismatch', 'A mutation id was reused with different ciphertext.');
        }
        continue;
      }
      if (value.envelope.baseCursor === null) {
        if (meta.revision !== 0) {
          throw new SyncServiceError(409, 'cursor_required', 'Pull current changes before uploading.');
        }
      } else if (!this.first<{ revision: number }>(
        'SELECT revision FROM cursors WHERE cursor = ?',
        value.envelope.baseCursor,
      )) {
        throw new SyncServiceError(409, 'cursor_unknown', 'The encrypted mutation base cursor is unknown.');
      }
    }
    const newBytes = [...unique.values()].reduce((sum, value) => {
      const prior = this.first<{ present: number }>(
        'SELECT 1 AS present FROM mutations WHERE device_id = ? AND mutation_id = ?',
        deviceId,
        value.envelope.mutationId,
      );
      return sum + (prior ? 0 : value.ciphertextBytes);
    }, 0);
    if (meta.total_bytes + newBytes > MAX_ACCOUNT_CONTENT_BYTES) {
      throw new SyncServiceError(413, 'account_quota', 'The encrypted cloud copy reached its quota.');
    }

    const acceptedByMutation = new Map<string, AcceptedMutation>();
    let revision = meta.revision;
    let addedBytes = 0;
    for (const value of unique.values()) {
      const prior = this.first<MutationRow>(
        'SELECT * FROM mutations WHERE device_id = ? AND mutation_id = ?',
        deviceId,
        value.envelope.mutationId,
      );
      if (prior) {
        acceptedByMutation.set(value.envelope.mutationId, acceptedMutation(prior, true));
        continue;
      }
      revision += 1;
      const cursor = randomOpaqueId('cursor', 24, this.random);
      const acceptedAt = this.now();
      this.sql.exec(
        `INSERT INTO mutations
         (device_id, mutation_id, envelope_json, wire_hash, ciphertext_bytes,
          revision, cursor, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        deviceId,
        value.envelope.mutationId,
        envelopeMetadataJson(value.envelope),
        value.wireHash,
        value.ciphertextBytes,
        revision,
        cursor,
        acceptedAt,
      );
      this.sql.exec('INSERT INTO cursors (revision, cursor) VALUES (?, ?)', revision, cursor);
      this.writeMutationChunks(deviceId, value.envelope.mutationId, value.envelope.ciphertext);
      addedBytes += value.ciphertextBytes;
      acceptedByMutation.set(value.envelope.mutationId, {
        mutationId: value.envelope.mutationId,
        revision,
        cursor,
        acceptedAt,
        replayed: false,
      });
    }
    this.sql.exec(
      'UPDATE account_meta SET revision = ?, total_bytes = total_bytes + ? WHERE id = 1',
      revision,
      addedBytes,
    );
    return validated.map((value, index) => {
      const accepted = acceptedByMutation.get(value.envelope.mutationId)!;
      return index > validated.findIndex(
        (candidate) => candidate.envelope.mutationId === value.envelope.mutationId,
      )
        ? { ...accepted, replayed: true }
        : accepted;
    });
  }

  private meta(generation: number): MetaRow {
    let meta = this.first<MetaRow>('SELECT * FROM account_meta WHERE id = 1');
    if (!meta) {
      this.sql.exec(
        'INSERT INTO account_meta (id, generation, revision, total_bytes) VALUES (1, ?, 0, 0)',
        generation,
      );
      meta = { generation, revision: 0, total_bytes: 0 };
    }
    if (meta.generation !== generation) {
      throw new SyncServiceError(409, 'generation_changed', 'The cloud generation changed.');
    }
    return meta;
  }

  private storedMutation(row: MutationRow): StoredMutation {
    const metadata = JSON.parse(row.envelope_json) as EncryptedMutationEnvelope;
    return {
      envelope: {
        ...metadata,
        ciphertext: this.readMutationChunks(row.device_id, row.mutation_id),
      },
      wireHash: row.wire_hash,
      ciphertextBytes: row.ciphertext_bytes,
      revision: row.revision,
      cursor: row.cursor,
      acceptedAt: row.accepted_at,
    };
  }

  private storedSnapshot(row: SnapshotRow): StoredSnapshot {
    const metadata = JSON.parse(row.envelope_json) as EncryptedSnapshotEnvelope;
    return {
      envelope: {
        ...metadata,
        ciphertext: this.readChunks('snapshot_chunks', 'snapshot_id', row.snapshot_id),
      },
      wireHash: row.wire_hash,
      ciphertextBytes: row.ciphertext_bytes,
      revision: row.revision,
      storedAt: row.stored_at,
    };
  }

  private writeMutationChunks(deviceId: string, mutationId: string, value: string): void {
    for (let offset = 0, chunk = 0; offset < value.length; offset += CIPHERTEXT_CHUNK_CHARACTERS) {
      this.sql.exec(
        `INSERT INTO mutation_chunks (device_id, mutation_id, chunk_index, chunk_text)
         VALUES (?, ?, ?, ?)`,
        deviceId,
        mutationId,
        chunk,
        value.slice(offset, offset + CIPHERTEXT_CHUNK_CHARACTERS),
      );
      chunk += 1;
    }
  }

  private writeChunks(table: string, idColumn: string, id: string, value: string): void {
    for (let offset = 0, chunk = 0; offset < value.length; offset += CIPHERTEXT_CHUNK_CHARACTERS) {
      this.sql.exec(
        `INSERT INTO ${table} (${idColumn}, chunk_index, chunk_text) VALUES (?, ?, ?)`,
        id,
        chunk,
        value.slice(offset, offset + CIPHERTEXT_CHUNK_CHARACTERS),
      );
      chunk += 1;
    }
  }

  private readMutationChunks(deviceId: string, mutationId: string): string {
    return this.all<{ chunk_text: string }>(
      `SELECT chunk_text FROM mutation_chunks
       WHERE device_id = ? AND mutation_id = ? ORDER BY chunk_index`,
      deviceId,
      mutationId,
    ).map((row) => row.chunk_text).join('');
  }

  private readChunks(table: string, idColumn: string, id: string): string {
    return this.all<{ chunk_text: string }>(
      `SELECT chunk_text FROM ${table} WHERE ${idColumn} = ? ORDER BY chunk_index`,
      id,
    ).map((row) => row.chunk_text).join('');
  }

  private first<T>(query: string, ...bindings: unknown[]): T | undefined {
    return this.sql.exec<T>(query, ...bindings).next().value;
  }

  private all<T>(query: string, ...bindings: unknown[]): T[] {
    return [...this.sql.exec<T>(query, ...bindings)];
  }

  private initialize(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS account_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generation INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        total_bytes INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cursors (
        revision INTEGER PRIMARY KEY,
        cursor TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS mutations (
        device_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        wire_hash TEXT NOT NULL,
        ciphertext_bytes INTEGER NOT NULL,
        revision INTEGER NOT NULL UNIQUE,
        cursor TEXT NOT NULL UNIQUE,
        accepted_at INTEGER NOT NULL,
        PRIMARY KEY (device_id, mutation_id)
      );
      CREATE TABLE IF NOT EXISTS mutation_chunks (
        device_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        PRIMARY KEY (device_id, mutation_id, chunk_index),
        FOREIGN KEY (device_id, mutation_id)
          REFERENCES mutations(device_id, mutation_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id TEXT PRIMARY KEY,
        envelope_json TEXT NOT NULL,
        wire_hash TEXT NOT NULL,
        ciphertext_bytes INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        stored_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshot_chunks (
        snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS mutation_revision ON mutations(revision);
      CREATE INDEX IF NOT EXISTS snapshot_revision ON snapshots(revision, stored_at);
    `);
  }
}

function envelopeMetadataJson(
  envelope: EncryptedMutationEnvelope | EncryptedSnapshotEnvelope,
): string {
  return stableJson({ ...envelope, ciphertext: '' });
}

function acceptedMutation(row: MutationRow, replayed: boolean): AcceptedMutation {
  return {
    mutationId: row.mutation_id,
    revision: row.revision,
    cursor: row.cursor,
    acceptedAt: row.accepted_at,
    replayed,
  };
}
