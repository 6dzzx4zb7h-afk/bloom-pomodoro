import { constantTimeEqual } from '../../services/sync/encoding';
import { SqliteContentStore } from '../../services/sync/cloudflare/sqliteContentStore';
import {
  SyncServiceError,
  type EncryptedMutationEnvelope,
  type EncryptedSnapshotEnvelope,
} from '../../services/sync/types';
import type { DurableObjectState } from '../../services/sync/cloudflare/types';

interface Environment {
  CONTENT_INTERNAL_SECRET: string;
}

interface InternalBody {
  accountId: string;
  deviceId?: string;
  cloudGeneration?: number;
  envelopes?: EncryptedMutationEnvelope[];
  envelope?: EncryptedSnapshotEnvelope;
  after?: string | null;
  limit?: number;
  nextGeneration?: number;
}

export class BloomSyncContent {
  private readonly ready: Promise<void>;

  constructor(
    private readonly state: DurableObjectState,
    private readonly environment: Environment,
  ) {
    this.ready = state.storage.blockConcurrencyWhile(async () => {
      new SqliteContentStore(state.storage);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    try {
      if (
        request.method !== 'POST' ||
        this.environment.CONTENT_INTERNAL_SECRET.length < 32 ||
        !constantTimeEqual(
          request.headers.get('x-bloom-internal-secret') ?? '',
          this.environment.CONTENT_INTERNAL_SECRET,
        )
      ) {
        throw new SyncServiceError(404, 'content_route', 'The encrypted content route does not exist.');
      }
      const body = await request.json() as InternalBody;
      if (!body || typeof body.accountId !== 'string') {
        throw new SyncServiceError(400, 'content_body', 'The encrypted content request is invalid.');
      }
      const store = new SqliteContentStore(this.state.storage);
      const path = new URL(request.url).pathname;
      let value: unknown;
      switch (path) {
        case '/append':
          value = await store.append(
            body.accountId,
            requiredString(body.deviceId),
            requiredInteger(body.cloudGeneration),
            body.envelopes ?? [],
          );
          break;
        case '/changes':
          value = await store.changes(
            body.accountId,
            requiredInteger(body.cloudGeneration),
            body.after ?? null,
            body.limit,
          );
          break;
        case '/snapshots':
          if (!body.envelope) {
            throw new SyncServiceError(400, 'content_body', 'The encrypted content request is invalid.');
          }
          value = await store.storeSnapshot(
            body.accountId,
            requiredString(body.deviceId),
            requiredInteger(body.cloudGeneration),
            body.envelope,
          );
          break;
        case '/snapshots/latest':
          value = await store.latestSnapshot(
            body.accountId,
            requiredInteger(body.cloudGeneration),
          );
          break;
        case '/export':
          value = await store.export(body.accountId, requiredInteger(body.cloudGeneration));
          break;
        case '/delete':
          await store.deleteActiveContent(body.accountId, requiredInteger(body.nextGeneration));
          value = { deleted: true };
          break;
        default:
          throw new SyncServiceError(404, 'content_route', 'The encrypted content route does not exist.');
      }
      return response(value, 200);
    } catch (error) {
      const serviceError = error instanceof SyncServiceError
        ? error
        : new SyncServiceError(500, 'content_internal', 'The encrypted content request could not complete.');
      return response(
        { error: { code: serviceError.code, message: serviceError.message } },
        serviceError.status,
      );
    }
  }

}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SyncServiceError(400, 'content_body', 'The encrypted content request is invalid.');
  }
  return value;
}

function requiredInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new SyncServiceError(400, 'content_body', 'The encrypted content request is invalid.');
  }
  return value as number;
}

function response(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
