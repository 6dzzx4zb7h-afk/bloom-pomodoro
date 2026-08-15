import { DurableObjectContentStore } from '../../services/sync/cloudflare/durableContentStore';
import type { DurableObjectNamespace } from '../../services/sync/cloudflare/types';
import { base64UrlEncode, randomOpaqueId } from '../../services/sync/encoding';
import {
  CLOUD_SYNC_ALGORITHM,
  CLOUD_SYNC_PROTOCOL,
  CLOUD_SYNC_PROTOCOL_VERSION,
  type EncryptedMutationEnvelope,
  type EncryptedSnapshotEnvelope,
} from '../../services/sync/types';

export { BloomSyncContent } from './index';

interface Environment {
  SYNC_CONTENT: DurableObjectNamespace;
  CONTENT_INTERNAL_SECRET: string;
}

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    if (new URL(request.url).pathname !== '/contract') {
      return new Response('Not found', { status: 404 });
    }
    try {
      const store = new DurableObjectContentStore(
        environment.SYNC_CONTENT,
        environment.CONTENT_INTERNAL_SECRET,
      );
      const accountId = randomOpaqueId('account');
      const deviceId = randomOpaqueId('device');
      const mutationId = randomOpaqueId('mutation');
      const mutation: EncryptedMutationEnvelope = {
        protocol: CLOUD_SYNC_PROTOCOL,
        protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
        envelopeType: 'mutation',
        accountId,
        deviceId,
        mutationId,
        baseCursor: null,
        cloudGeneration: 1,
        contentSchemaVersion: 34,
        keyVersion: 1,
        algorithm: CLOUD_SYNC_ALGORITHM,
        nonce: base64UrlEncode(new Uint8Array(12).fill(1)),
        ciphertext: base64UrlEncode(new Uint8Array(32).fill(2)),
      };
      const first = await store.append(accountId, deviceId, 1, [mutation]);
      const replay = await store.append(accountId, deviceId, 1, [mutation]);
      const largeCiphertext = base64UrlEncode(new Uint8Array(2 * 1024 * 1024).fill(3));
      const snapshot: EncryptedSnapshotEnvelope = {
        protocol: CLOUD_SYNC_PROTOCOL,
        protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
        envelopeType: 'snapshot',
        accountId,
        deviceId,
        snapshotId: randomOpaqueId('snapshot'),
        coveredCursor: first[0].cursor,
        coveredMutationIds: [mutationId],
        baseCursor: first[0].cursor,
        cloudGeneration: 1,
        contentSchemaVersion: 34,
        keyVersion: 1,
        algorithm: CLOUD_SYNC_ALGORITHM,
        nonce: base64UrlEncode(new Uint8Array(12).fill(4)),
        ciphertext: largeCiphertext,
      };
      await store.storeSnapshot(accountId, deviceId, 1, snapshot);
      const restored = await store.latestSnapshot(accountId, 1);
      const changes = await store.changes(accountId, 1, null);
      await store.deleteActiveContent(accountId, 2);
      const afterDelete = await store.export(accountId, 2);
      return Response.json({
        first: first[0],
        replay: replay[0],
        revision: changes.revision,
        snapshotCharacters: restored?.envelope.ciphertext.length,
        expectedSnapshotCharacters: largeCiphertext.length,
        afterDeleteRevision: afterDelete.revision,
      });
    } catch {
      return Response.json({ error: 'contract-failed' }, { status: 500 });
    }
  },
};
