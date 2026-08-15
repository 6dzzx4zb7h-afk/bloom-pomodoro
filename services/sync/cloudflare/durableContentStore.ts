import type {
  ChangePage,
  ContentStore,
} from '../contentStore';
import {
  SyncServiceError,
  type AcceptedMutation,
  type CloudExportArchive,
  type EncryptedMutationEnvelope,
  type EncryptedSnapshotEnvelope,
  type StoredSnapshot,
} from '../types';
import type { DurableObjectNamespace } from './types';

export class DurableObjectContentStore implements ContentStore {
  constructor(
    private readonly namespace: DurableObjectNamespace,
    private readonly internalSecret: string,
  ) {
    if (internalSecret.length < 32) {
      throw new Error('The content-object service secret must contain at least 32 characters.');
    }
  }

  append(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelopes: EncryptedMutationEnvelope[],
  ): Promise<AcceptedMutation[]> {
    return this.call(accountId, '/append', {
      accountId,
      deviceId,
      cloudGeneration,
      envelopes,
    });
  }

  changes(
    accountId: string,
    cloudGeneration: number,
    after: string | null,
    limit?: number,
  ): Promise<ChangePage> {
    return this.call(accountId, '/changes', { accountId, cloudGeneration, after, limit });
  }

  storeSnapshot(
    accountId: string,
    deviceId: string,
    cloudGeneration: number,
    envelope: EncryptedSnapshotEnvelope,
  ): Promise<StoredSnapshot> {
    return this.call(accountId, '/snapshots', {
      accountId,
      deviceId,
      cloudGeneration,
      envelope,
    });
  }

  latestSnapshot(
    accountId: string,
    cloudGeneration: number,
  ): Promise<StoredSnapshot | null> {
    return this.call(accountId, '/snapshots/latest', { accountId, cloudGeneration });
  }

  export(accountId: string, cloudGeneration: number): Promise<CloudExportArchive> {
    return this.call(accountId, '/export', { accountId, cloudGeneration });
  }

  async deleteActiveContent(accountId: string, nextGeneration: number): Promise<void> {
    await this.call(accountId, '/delete', { accountId, nextGeneration });
  }

  private async call<T>(
    accountId: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const id = this.namespace.idFromName(accountId);
    const response = await this.namespace.get(id).fetch(`https://bloom-content.internal${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bloom-internal-secret': this.internalSecret,
      },
      body: JSON.stringify(body),
    });
    const value = await response.json() as unknown;
    if (!response.ok) {
      const error = value && typeof value === 'object' && 'error' in value
        ? (value as { error?: { code?: unknown; message?: unknown } }).error
        : null;
      throw new SyncServiceError(
        response.status,
        typeof error?.code === 'string' ? error.code : 'content_object',
        typeof error?.message === 'string'
          ? error.message
          : 'The encrypted content object did not complete the request.',
      );
    }
    return value as T;
  }
}
