import { describe, expect, it } from 'vitest';
import {
  createRecoveryKit,
  decryptEnvelope,
  encryptMutation,
  exportAccountRootKey,
  generateAccountRootKey,
  importRecoveryKit,
  encryptSnapshot,
} from './crypto';
import { randomOpaqueId } from './encoding';

describe('Bloom sync end-to-end encryption', () => {
  it('round-trips opaque content and authenticates every cleartext metadata field', async () => {
    const rootKey = await generateAccountRootKey();
    const envelope = await encryptMutation(
      rootKey,
      randomOpaqueId('mutation'),
      {
        accountId: randomOpaqueId('account'),
        deviceId: randomOpaqueId('device'),
        baseCursor: null,
        cloudGeneration: 1,
        contentSchemaVersion: 34,
        keyVersion: 1,
      },
      { entity: 'task', value: 'quiet focus text' },
    );

    await expect(decryptEnvelope(rootKey, envelope)).resolves.toEqual({
      entity: 'task',
      value: 'quiet focus text',
    });
    await expect(decryptEnvelope(rootKey, {
      ...envelope,
      cloudGeneration: 2,
    })).rejects.toThrow();
    await expect(decryptEnvelope(rootKey, {
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -1)}${envelope.ciphertext.endsWith('A') ? 'B' : 'A'}`,
    })).rejects.toThrow();
  });

  it('uses independent envelope subkeys and fresh nonces', async () => {
    const rootKey = await generateAccountRootKey();
    const metadata = {
      accountId: randomOpaqueId('account'),
      deviceId: randomOpaqueId('device'),
      baseCursor: null,
      cloudGeneration: 1,
      contentSchemaVersion: 34,
      keyVersion: 1,
    };
    const first = await encryptMutation(
      rootKey,
      randomOpaqueId('mutation'),
      metadata,
      { same: true },
    );
    const second = await encryptMutation(
      rootKey,
      randomOpaqueId('mutation'),
      metadata,
      { same: true },
    );

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('exports a checksummed recovery kit without server escrow', async () => {
    const rootKey = await generateAccountRootKey();
    const kit = await createRecoveryKit(rootKey, 'account-fingerprint', 1);
    const restored = await importRecoveryKit(kit);
    expect(await exportAccountRootKey(restored)).toEqual(await exportAccountRootKey(rootKey));
    await expect(importRecoveryKit({ ...kit, accountFingerprint: 'changed' })).rejects.toThrow(
      'checksum',
    );
  });

  it('authenticates snapshot cursor and coverage metadata', async () => {
    const rootKey = await generateAccountRootKey();
    const cursor = randomOpaqueId('cursor', 24);
    const mutationId = randomOpaqueId('mutation');
    const snapshot = await encryptSnapshot(
      rootKey,
      randomOpaqueId('snapshot'),
      {
        accountId: randomOpaqueId('account'),
        deviceId: randomOpaqueId('device'),
        baseCursor: cursor,
        cloudGeneration: 1,
        contentSchemaVersion: 34,
        keyVersion: 1,
      },
      { state: 'encrypted' },
      cursor,
      [mutationId],
    );
    await expect(decryptEnvelope(rootKey, snapshot)).resolves.toEqual({ state: 'encrypted' });
    await expect(decryptEnvelope(rootKey, {
      ...snapshot,
      coveredMutationIds: [randomOpaqueId('mutation')],
    })).rejects.toThrow();
  });
});
