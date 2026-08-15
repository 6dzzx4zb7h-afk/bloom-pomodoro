export const CLOUD_SYNC_PROTOCOL = 'bloom-sync';
export const CLOUD_SYNC_PROTOCOL_VERSION = 1;
export const CLOUD_SYNC_ALGORITHM = 'A256GCM+HKDF-SHA256';

export const MAX_ENCRYPTED_MUTATION_BYTES = 512 * 1024;
export const MAX_SYNC_BATCH_BYTES = 5 * 1024 * 1024;
export const MAX_SYNC_BATCH_MUTATIONS = 500;
export const MAX_ENCRYPTED_SNAPSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_ACCOUNT_CONTENT_BYTES = 25 * 1024 * 1024;
export const MAX_ACCOUNT_DEVICES = 10;
export const TOMBSTONE_RETENTION_DAYS = 180;

export type DevicePlatform = 'web' | 'ios' | 'android';
export type IdentityProviderName = 'google' | 'apple';

export interface CloudEnvelopeMetadata {
  protocol: typeof CLOUD_SYNC_PROTOCOL;
  protocolVersion: typeof CLOUD_SYNC_PROTOCOL_VERSION;
  accountId: string;
  deviceId: string;
  baseCursor: string | null;
  cloudGeneration: number;
  contentSchemaVersion: number;
  keyVersion: number;
  algorithm: typeof CLOUD_SYNC_ALGORITHM;
  nonce: string;
  ciphertext: string;
}

export interface EncryptedMutationEnvelope extends CloudEnvelopeMetadata {
  envelopeType: 'mutation';
  mutationId: string;
}

export interface EncryptedSnapshotEnvelope extends CloudEnvelopeMetadata {
  envelopeType: 'snapshot';
  snapshotId: string;
  coveredCursor: string;
  coveredMutationIds: string[];
}

export type EncryptedCloudEnvelope =
  | EncryptedMutationEnvelope
  | EncryptedSnapshotEnvelope;

export interface AcceptedMutation {
  mutationId: string;
  revision: number;
  cursor: string;
  acceptedAt: number;
  replayed: boolean;
}

export interface StoredMutation {
  envelope: EncryptedMutationEnvelope;
  wireHash: string;
  ciphertextBytes: number;
  revision: number;
  cursor: string;
  acceptedAt: number;
}

export interface StoredSnapshot {
  envelope: EncryptedSnapshotEnvelope;
  wireHash: string;
  ciphertextBytes: number;
  revision: number;
  storedAt: number;
}

export interface CloudExportArchive {
  format: 'bloom-sync-cloud-export';
  formatVersion: 1;
  accountId: string;
  cloudGeneration: number;
  exportedAt: number;
  revision: number;
  mutations: StoredMutation[];
  snapshots: StoredSnapshot[];
}

export interface AccountRecord {
  id: string;
  fingerprint: string;
  cloudGeneration: number;
  syncConsentAt: number | null;
  createdAt: number;
  deletionState: 'active' | 'cloud-deleting' | 'account-deleting';
}

export interface DeviceRecord {
  accountId: string;
  id: string;
  platform: DevicePlatform;
  keyVersion: number;
  createdAt: number;
  lastSeenAt: number;
  lastCursor: string | null;
  revokedAt: number | null;
}

export type SessionKind = 'web' | 'native';

export interface SessionRecord {
  id: string;
  accountId: string;
  kind: SessionKind;
  accessHash: string;
  refreshHash: string;
  csrfHash: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  recentAuthUntil: number;
  createdAt: number;
  revokedAt: number | null;
}

export interface SessionSecrets {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface AuthTransaction {
  stateHash: string;
  provider: IdentityProviderName;
  nonce: string;
  pkceVerifier: string | null;
  mode: SessionKind;
  nativeChallengeHash: string | null;
  linkAccountId: string | null;
  linkSessionId: string | null;
  redirectUri: string;
  expiresAt: number;
  createdAt: number;
}

export interface NativeHandoff {
  tokenHash: string;
  challengeHash: string;
  accountId: string;
  provider: IdentityProviderName;
  expiresAt: number;
  usedAt: number | null;
}

export interface SecurityEvent {
  id: string;
  kind:
    | 'sign-in'
    | 'provider-link'
    | 'session-refresh'
    | 'session-revoke'
    | 'device-register'
    | 'device-revoke'
    | 'cloud-delete'
    | 'account-delete';
  accountId: string | null;
  deviceId: string | null;
  at: number;
}

export interface SafeRequestLog {
  requestId: string;
  method: string;
  route: string;
  status: number;
  outcome: string;
  accountId: string | null;
  deviceId: string | null;
  elapsedMs: number;
}

export class SyncServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'SyncServiceError';
  }
}

export type Clock = () => number;
export type RandomByteFiller = (bytes: Uint8Array) => void;
