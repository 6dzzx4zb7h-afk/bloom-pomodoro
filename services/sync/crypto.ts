import {
  CLOUD_SYNC_ALGORITHM,
  CLOUD_SYNC_PROTOCOL,
  CLOUD_SYNC_PROTOCOL_VERSION,
  type CloudEnvelopeMetadata,
  type EncryptedMutationEnvelope,
  type EncryptedSnapshotEnvelope,
  type RandomByteFiller,
} from './types';
import {
  base64UrlDecode,
  base64UrlEncode,
  decodeUtf8,
  fillRandom,
  isPlainJson,
  ownedArrayBuffer,
  stableJson,
  utf8,
} from './encoding';

const HKDF_SALT = utf8('bloom-sync:v1:hkdf-salt');
const AES_GCM_TAG_BYTES = 16;

export interface EncryptionMetadata {
  accountId: string;
  deviceId: string;
  baseCursor: string | null;
  cloudGeneration: number;
  contentSchemaVersion: number;
  keyVersion: number;
}

export interface RecoveryKit {
  format: 'bloom-sync-recovery';
  formatVersion: 1;
  accountFingerprint: string;
  accountRootKey: string;
  keyVersion: number;
  checksum: string;
}

export interface AccountRootKey {
  readonly material: Uint8Array<ArrayBuffer>;
  readonly derivationKey: CryptoKey;
}

export async function generateAccountRootKey(
  random: RandomByteFiller = fillRandom,
): Promise<AccountRootKey> {
  const bytes = new Uint8Array(32);
  random(bytes);
  return importAccountRootKey(bytes);
}

export async function importAccountRootKey(bytes: Uint8Array): Promise<AccountRootKey> {
  if (bytes.byteLength !== 32) throw new Error('A Bloom account root key must be 256 bits.');
  const material = new Uint8Array(ownedArrayBuffer(bytes));
  const derivationKey = await crypto.subtle.importKey(
    'raw',
    material,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return { material, derivationKey };
}

export async function exportAccountRootKey(
  key: AccountRootKey,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(ownedArrayBuffer(key.material));
}

async function derivedEnvelopeKey(
  rootKey: AccountRootKey,
  envelopeId: string,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: ownedArrayBuffer(HKDF_SALT),
      info: ownedArrayBuffer(utf8(`bloom-sync:v1:${envelopeId}`)),
    },
    rootKey.derivationKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function aadObject(
  envelope: Omit<CloudEnvelopeMetadata, 'nonce' | 'ciphertext'> & {
    envelopeType: 'mutation' | 'snapshot';
    envelopeId: string;
    coveredCursor?: string;
    coveredMutationIds?: string[];
  },
  ciphertextBytes: number,
) {
  const authenticated = {
    protocol: envelope.protocol,
    protocolVersion: envelope.protocolVersion,
    envelopeType: envelope.envelopeType,
    accountId: envelope.accountId,
    deviceId: envelope.deviceId,
    envelopeId: envelope.envelopeId,
    baseCursor: envelope.baseCursor,
    cloudGeneration: envelope.cloudGeneration,
    contentSchemaVersion: envelope.contentSchemaVersion,
    keyVersion: envelope.keyVersion,
    algorithm: envelope.algorithm,
    ciphertextBytes,
  };
  return envelope.envelopeType === 'snapshot'
    ? {
      ...authenticated,
      coveredCursor: envelope.coveredCursor,
      coveredMutationIds: envelope.coveredMutationIds,
    }
    : authenticated;
}

async function encryptPayload(
  rootKey: AccountRootKey,
  envelopeId: string,
  metadata: EncryptionMetadata,
  envelopeType: 'mutation' | 'snapshot',
  plaintext: unknown,
  random: RandomByteFiller,
  snapshotCoverage?: { coveredCursor: string; coveredMutationIds: string[] },
): Promise<{ nonce: string; ciphertext: string }> {
  if (!isPlainJson(plaintext)) throw new Error('Bloom sync plaintext must be bounded JSON.');
  const nonce = new Uint8Array(12);
  random(nonce);
  const bytes = utf8(stableJson(plaintext));
  const base = {
    protocol: CLOUD_SYNC_PROTOCOL,
    protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    envelopeType,
    envelopeId,
    ...snapshotCoverage,
    ...metadata,
    algorithm: CLOUD_SYNC_ALGORITHM,
  } as const;
  const additionalData = utf8(stableJson(aadObject(base, bytes.byteLength + AES_GCM_TAG_BYTES)));
  const key = await derivedEnvelopeKey(rootKey, envelopeId);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ownedArrayBuffer(nonce),
      additionalData: ownedArrayBuffer(additionalData),
      tagLength: 128,
    },
    key,
    ownedArrayBuffer(bytes),
  );
  return {
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(new Uint8Array(encrypted)),
  };
}

export async function encryptMutation(
  rootKey: AccountRootKey,
  mutationId: string,
  metadata: EncryptionMetadata,
  plaintext: unknown,
  random: RandomByteFiller = fillRandom,
): Promise<EncryptedMutationEnvelope> {
  const encrypted = await encryptPayload(
    rootKey,
    mutationId,
    metadata,
    'mutation',
    plaintext,
    random,
  );
  return {
    protocol: CLOUD_SYNC_PROTOCOL,
    protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    envelopeType: 'mutation',
    mutationId,
    ...metadata,
    algorithm: CLOUD_SYNC_ALGORITHM,
    ...encrypted,
  };
}

export async function encryptSnapshot(
  rootKey: AccountRootKey,
  snapshotId: string,
  metadata: EncryptionMetadata,
  plaintext: unknown,
  coveredCursor: string,
  coveredMutationIds: string[],
  random: RandomByteFiller = fillRandom,
): Promise<EncryptedSnapshotEnvelope> {
  const encrypted = await encryptPayload(
    rootKey,
    snapshotId,
    metadata,
    'snapshot',
    plaintext,
    random,
    { coveredCursor, coveredMutationIds: [...coveredMutationIds] },
  );
  return {
    protocol: CLOUD_SYNC_PROTOCOL,
    protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    envelopeType: 'snapshot',
    snapshotId,
    coveredCursor,
    coveredMutationIds: [...coveredMutationIds],
    ...metadata,
    algorithm: CLOUD_SYNC_ALGORITHM,
    ...encrypted,
  };
}

export async function decryptEnvelope(
  rootKey: AccountRootKey,
  envelope: EncryptedMutationEnvelope | EncryptedSnapshotEnvelope,
): Promise<unknown> {
  const envelopeId = envelope.envelopeType === 'mutation'
    ? envelope.mutationId
    : envelope.snapshotId;
  const nonce = base64UrlDecode(envelope.nonce);
  if (nonce.byteLength !== 12) throw new Error('The Bloom sync nonce is invalid.');
  const ciphertext = base64UrlDecode(envelope.ciphertext);
  const base = {
    protocol: envelope.protocol,
    protocolVersion: envelope.protocolVersion,
    envelopeType: envelope.envelopeType,
    envelopeId,
    accountId: envelope.accountId,
    deviceId: envelope.deviceId,
    baseCursor: envelope.baseCursor,
    cloudGeneration: envelope.cloudGeneration,
    contentSchemaVersion: envelope.contentSchemaVersion,
    keyVersion: envelope.keyVersion,
    algorithm: envelope.algorithm,
    ...(envelope.envelopeType === 'snapshot'
      ? {
        coveredCursor: envelope.coveredCursor,
        coveredMutationIds: envelope.coveredMutationIds,
      }
      : {}),
  } as const;
  const additionalData = utf8(stableJson(aadObject(base, ciphertext.byteLength)));
  const key = await derivedEnvelopeKey(rootKey, envelopeId);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ownedArrayBuffer(nonce),
      additionalData: ownedArrayBuffer(additionalData),
      tagLength: 128,
    },
    key,
    ownedArrayBuffer(ciphertext),
  );
  return JSON.parse(decodeUtf8(new Uint8Array(plaintext))) as unknown;
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? utf8(value) : value;
  return base64UrlEncode(
    new Uint8Array(await crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes))),
  );
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ownedArrayBuffer(utf8(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, ownedArrayBuffer(utf8(value)))),
  );
}

export async function createRecoveryKit(
  rootKey: AccountRootKey,
  accountFingerprint: string,
  keyVersion: number,
): Promise<RecoveryKit> {
  const accountRootKey = base64UrlEncode(await exportAccountRootKey(rootKey));
  const unsigned = {
    format: 'bloom-sync-recovery' as const,
    formatVersion: 1 as const,
    accountFingerprint,
    accountRootKey,
    keyVersion,
  };
  return { ...unsigned, checksum: (await sha256(stableJson(unsigned))).slice(0, 22) };
}

export async function importRecoveryKit(kit: RecoveryKit): Promise<AccountRootKey> {
  if (kit.format !== 'bloom-sync-recovery' || kit.formatVersion !== 1) {
    throw new Error('This is not a supported Bloom recovery kit.');
  }
  const unsigned = {
    format: kit.format,
    formatVersion: kit.formatVersion,
    accountFingerprint: kit.accountFingerprint,
    accountRootKey: kit.accountRootKey,
    keyVersion: kit.keyVersion,
  };
  const checksum = (await sha256(stableJson(unsigned))).slice(0, 22);
  if (checksum !== kit.checksum) throw new Error('The Bloom recovery kit checksum does not match.');
  return importAccountRootKey(base64UrlDecode(kit.accountRootKey));
}
