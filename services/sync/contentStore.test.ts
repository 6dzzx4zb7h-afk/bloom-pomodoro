import { describe, expect, it } from 'vitest';
import { InMemoryContentStore } from './contentStore';
import { base64UrlEncode, randomOpaqueId } from './encoding';
import {
  CLOUD_SYNC_ALGORITHM,
  CLOUD_SYNC_PROTOCOL,
  CLOUD_SYNC_PROTOCOL_VERSION,
  MAX_ENCRYPTED_MUTATION_BYTES,
  TOMBSTONE_RETENTION_DAYS,
  type EncryptedMutationEnvelope,
} from './types';

function envelope(input: {
  accountId: string;
  deviceId: string;
  mutationId?: string;
  baseCursor?: string | null;
  generation?: number;
  bytes?: number;
  fill?: number;
}): EncryptedMutationEnvelope {
  return {
    protocol: CLOUD_SYNC_PROTOCOL,
    protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    envelopeType: 'mutation',
    accountId: input.accountId,
    deviceId: input.deviceId,
    mutationId: input.mutationId ?? randomOpaqueId('mutation'),
    baseCursor: input.baseCursor ?? null,
    cloudGeneration: input.generation ?? 1,
    contentSchemaVersion: 34,
    keyVersion: 1,
    algorithm: CLOUD_SYNC_ALGORITHM,
    nonce: base64UrlEncode(new Uint8Array(12).fill(7)),
    ciphertext: base64UrlEncode(
      new Uint8Array(input.bytes ?? 32).fill(input.fill ?? 9),
    ),
  };
}

describe('opaque encrypted content storage', () => {
  it('issues cursors, accepts exact retry, and rejects divergent replay', async () => {
    const store = new InMemoryContentStore();
    const accountId = randomOpaqueId('account');
    const deviceId = randomOpaqueId('device');
    const first = envelope({ accountId, deviceId });
    const accepted = await store.append(accountId, deviceId, 1, [first]);
    expect(accepted[0]).toMatchObject({ revision: 1, replayed: false });
    await expect(store.append(accountId, deviceId, 1, [first])).resolves.toMatchObject([
      { revision: 1, cursor: accepted[0].cursor, replayed: true },
    ]);
    await expect(store.append(accountId, deviceId, 1, [{
      ...first,
      ciphertext: base64UrlEncode(new Uint8Array(32).fill(10)),
    }])).rejects.toMatchObject({ code: 'replay_mismatch' });
  });

  it('prevents one account or device from storing another grant’s envelope', async () => {
    const store = new InMemoryContentStore();
    const firstAccount = randomOpaqueId('account');
    const secondAccount = randomOpaqueId('account');
    const firstDevice = randomOpaqueId('device');
    const secondDevice = randomOpaqueId('device');
    const first = envelope({ accountId: firstAccount, deviceId: firstDevice });

    await expect(
      store.append(secondAccount, firstDevice, 1, [first]),
    ).rejects.toMatchObject({ code: 'envelope_metadata' });
    await expect(
      store.append(firstAccount, secondDevice, 1, [first]),
    ).rejects.toMatchObject({ code: 'envelope_metadata' });
  });

  it('enforces mutation and account byte quotas atomically', async () => {
    const store = new InMemoryContentStore();
    const accountId = randomOpaqueId('account');
    const deviceId = randomOpaqueId('device');
    await expect(store.append(accountId, deviceId, 1, [envelope({
      accountId,
      deviceId,
      bytes: MAX_ENCRYPTED_MUTATION_BYTES + 1,
    })])).rejects.toMatchObject({ code: 'mutation_size' });

    let cursor: string | null = null;
    let nextId = 0;
    for (let batch = 0; batch < 8; batch += 1) {
      const count = batch === 7 ? 1 : 7;
      const rows = Array.from({ length: count }, () => envelope({
        accountId,
        deviceId,
        mutationId: deterministicId('mutation', nextId++),
        baseCursor: cursor,
        bytes: MAX_ENCRYPTED_MUTATION_BYTES,
        fill: batch + 1,
      }));
      const accepted = await store.append(accountId, deviceId, 1, rows);
      cursor = accepted[accepted.length - 1].cursor;
    }
    await expect(store.append(accountId, deviceId, 1, [envelope({
      accountId,
      deviceId,
      mutationId: deterministicId('mutation', nextId),
      baseCursor: cursor,
      bytes: 16,
    })])).rejects.toMatchObject({ code: 'account_quota' });
  });

  it('exports only the account’s opaque archive and deletion advances its generation', async () => {
    let now = 1_000_000;
    const store = new InMemoryContentStore(() => now);
    const accountId = randomOpaqueId('account');
    const deviceId = randomOpaqueId('device');
    await store.append(accountId, deviceId, 1, [envelope({ accountId, deviceId })]);
    const archive = await store.export(accountId, 1);
    expect(archive).toMatchObject({
      format: 'bloom-sync-cloud-export',
      accountId,
      cloudGeneration: 1,
      revision: 1,
    });
    expect(JSON.stringify(archive)).not.toContain('quiet focus text');
    now += (TOMBSTONE_RETENTION_DAYS + 1) * 86_400_000;
    await expect(store.export(accountId, 1)).resolves.toMatchObject({
      revision: 1,
      mutations: [{ envelope: { accountId } }],
    });

    await store.deleteActiveContent(accountId, 2);
    await expect(store.export(accountId, 1)).rejects.toMatchObject({ code: 'generation_changed' });
    await expect(store.export(accountId, 2)).resolves.toMatchObject({
      cloudGeneration: 2,
      revision: 0,
      mutations: [],
    });
  });

  it('restores durable opaque state across a content-object eviction', async () => {
    const accountId = randomOpaqueId('account');
    const deviceId = randomOpaqueId('device');
    const original = new InMemoryContentStore();
    const mutation = envelope({ accountId, deviceId });
    const accepted = await original.append(accountId, deviceId, 1, [mutation]);

    const restored = new InMemoryContentStore(Date.now, undefined, original.dump());
    await expect(restored.changes(accountId, 1, null)).resolves.toMatchObject({
      revision: 1,
      cursor: accepted[0].cursor,
      mutations: [{ envelope: { mutationId: mutation.mutationId } }],
    });
    await expect(restored.append(accountId, deviceId, 1, [mutation])).resolves.toMatchObject([
      { revision: 1, replayed: true },
    ]);
  });
});

function deterministicId(prefix: string, value: number): string {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return `${prefix}_${base64UrlEncode(bytes)}`;
}
