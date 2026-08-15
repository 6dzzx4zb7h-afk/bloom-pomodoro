import {
  MAX_ACCOUNT_DEVICES,
  SyncServiceError,
  type AccountRecord,
  type AuthTransaction,
  type Clock,
  type DevicePlatform,
  type DeviceRecord,
  type IdentityProviderName,
  type NativeHandoff,
  type RandomByteFiller,
  type SecurityEvent,
  type SessionKind,
  type SessionRecord,
  type SessionSecrets,
} from './types';
import {
  constantTimeEqual,
  fillRandom,
  randomOpaqueId,
  validOpaqueId,
} from './encoding';
import { hmacSha256, sha256 } from './crypto';

export const ACCESS_SESSION_MS = 15 * 60_000;
export const REFRESH_SESSION_MS = 30 * 86_400_000;
export const RECENT_AUTH_MS = 10 * 60_000;
export const AUTH_TRANSACTION_MS = 10 * 60_000;
export const NATIVE_HANDOFF_MS = 60_000;

export interface AuthenticatedSession {
  session: SessionRecord;
  account: AccountRecord;
}

export interface CreatedAuthTransaction {
  state: string;
  transaction: AuthTransaction;
}

export interface ControlPlane {
  createAuthTransaction(input: {
    provider: IdentityProviderName;
    mode: SessionKind;
    nativeChallenge: string | null;
    linkAccountId: string | null;
    linkSessionId: string | null;
    redirectUri: string;
    pkceVerifier: string | null;
  }): Promise<CreatedAuthTransaction>;
  consumeAuthTransaction(state: string, provider: IdentityProviderName): Promise<AuthTransaction>;
  resolveIdentity(
    provider: IdentityProviderName,
    issuer: string,
    subject: string,
    linkAccountId?: string | null,
  ): Promise<AccountRecord>;
  issueSession(accountId: string, kind: SessionKind): Promise<SessionSecrets>;
  authenticateAccess(token: string): Promise<AuthenticatedSession>;
  verifyCsrf(session: SessionRecord, token: string): Promise<void>;
  refreshSession(refreshToken: string): Promise<SessionSecrets>;
  revokeSession(sessionId: string): Promise<void>;
  requireRecentAuth(session: SessionRecord): void;
  account(accountId: string): Promise<AccountRecord>;
  registerDevice(
    accountId: string,
    id: string,
    platform: DevicePlatform,
    keyVersion: number,
    consentConfirmed: boolean,
  ): Promise<DeviceRecord>;
  requireDevice(accountId: string, id: string): Promise<DeviceRecord>;
  listDevices(accountId: string): Promise<DeviceRecord[]>;
  revokeDevice(accountId: string, id: string): Promise<void>;
  acknowledgeDevice(accountId: string, id: string, cursor: string | null): Promise<void>;
  createNativeHandoff(
    accountId: string,
    provider: IdentityProviderName,
    challenge: string,
  ): Promise<string>;
  createNativeHandoffFromHash(
    accountId: string,
    provider: IdentityProviderName,
    challengeHash: string,
  ): Promise<string>;
  consumeNativeHandoff(
    provider: IdentityProviderName,
    token: string,
    challenge: string,
  ): Promise<string>;
  beginCloudDeletion(accountId: string): Promise<number>;
  finishCloudDeletion(accountId: string, generation: number): Promise<void>;
  beginAccountDeletion(accountId: string): Promise<number>;
  finishAccountDeletion(accountId: string): Promise<void>;
  securityEvents(): Promise<SecurityEvent[]>;
}

export class InMemoryControlPlane implements ControlPlane {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly aliases = new Map<string, string>();
  private readonly aliasKeysByAccount = new Map<string, Set<string>>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly sessionByAccessHash = new Map<string, string>();
  private readonly sessionByRefreshHash = new Map<string, string>();
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly authTransactions = new Map<string, AuthTransaction>();
  private readonly nativeHandoffs = new Map<string, NativeHandoff>();
  private readonly events: SecurityEvent[] = [];

  constructor(
    private readonly identityPepper: string,
    private readonly sessionPepper: string,
    private readonly now: Clock = Date.now,
    private readonly random: RandomByteFiller = fillRandom,
  ) {
    if (identityPepper.length < 32 || sessionPepper.length < 32) {
      throw new Error('Bloom service peppers must each contain at least 32 characters.');
    }
  }

  async createAuthTransaction(input: {
    provider: IdentityProviderName;
    mode: SessionKind;
    nativeChallenge: string | null;
    linkAccountId: string | null;
    linkSessionId: string | null;
    redirectUri: string;
    pkceVerifier: string | null;
  }): Promise<CreatedAuthTransaction> {
    if (input.mode === 'native' && !input.nativeChallenge) {
      throw new SyncServiceError(400, 'native_challenge', 'Native sign-in needs a device challenge.');
    }
    if (input.linkAccountId) await this.account(input.linkAccountId);
    const state = randomOpaqueId('state', 24, this.random);
    const transaction: AuthTransaction = {
      stateHash: await this.secretHash(state),
      provider: input.provider,
      nonce: randomOpaqueId('nonce', 24, this.random),
      pkceVerifier: input.pkceVerifier,
      mode: input.mode,
      nativeChallengeHash: input.nativeChallenge
        ? await this.secretHash(input.nativeChallenge)
        : null,
      linkAccountId: input.linkAccountId,
      linkSessionId: input.linkSessionId,
      redirectUri: input.redirectUri,
      expiresAt: this.now() + AUTH_TRANSACTION_MS,
      createdAt: this.now(),
    };
    this.authTransactions.set(transaction.stateHash, transaction);
    return { state, transaction: clone(transaction) };
  }

  async consumeAuthTransaction(
    state: string,
    provider: IdentityProviderName,
  ): Promise<AuthTransaction> {
    const stateHash = await this.secretHash(state);
    const transaction = this.authTransactions.get(stateHash);
    if (
      !transaction ||
      transaction.provider !== provider ||
      transaction.expiresAt <= this.now()
    ) {
      throw new SyncServiceError(400, 'auth_state', 'The sign-in transaction is invalid or expired.');
    }
    this.authTransactions.delete(stateHash);
    return clone(transaction);
  }

  async resolveIdentity(
    provider: IdentityProviderName,
    issuer: string,
    subject: string,
    linkAccountId: string | null = null,
  ): Promise<AccountRecord> {
    if (!issuer || !subject) {
      throw new SyncServiceError(401, 'identity_claims', 'The identity provider claims are incomplete.');
    }
    const aliasKey = await hmacSha256(
      this.identityPepper,
      `${provider}\u0000${issuer}\u0000${subject}`,
    );
    const existingAccountId = this.aliases.get(aliasKey);
    if (linkAccountId) {
      const account = await this.account(linkAccountId);
      if (existingAccountId && existingAccountId !== linkAccountId) {
        throw new SyncServiceError(409, 'identity_linked', 'This provider identity belongs to another account.');
      }
      this.aliases.set(aliasKey, linkAccountId);
      const keys = this.aliasKeysByAccount.get(linkAccountId) ?? new Set<string>();
      keys.add(aliasKey);
      this.aliasKeysByAccount.set(linkAccountId, keys);
      this.event('provider-link', linkAccountId, null);
      return clone(account);
    }
    if (existingAccountId) return this.account(existingAccountId);

    const id = randomOpaqueId('account', 16, this.random);
    const fingerprint = (await sha256(`bloom-account-fingerprint\u0000${id}`)).slice(0, 22);
    const account: AccountRecord = {
      id,
      fingerprint,
      cloudGeneration: 1,
      syncConsentAt: null,
      createdAt: this.now(),
      deletionState: 'active',
    };
    this.accounts.set(id, account);
    this.aliases.set(aliasKey, id);
    this.aliasKeysByAccount.set(id, new Set([aliasKey]));
    return clone(account);
  }

  async issueSession(accountId: string, kind: SessionKind): Promise<SessionSecrets> {
    await this.account(accountId);
    const secrets = await this.createSessionSecrets();
    const session: SessionRecord = {
      id: secrets.sessionId,
      accountId,
      kind,
      accessHash: await this.secretHash(secrets.accessToken),
      refreshHash: await this.secretHash(secrets.refreshToken),
      csrfHash: await this.secretHash(secrets.csrfToken),
      accessExpiresAt: secrets.accessExpiresAt,
      refreshExpiresAt: secrets.refreshExpiresAt,
      recentAuthUntil: this.now() + RECENT_AUTH_MS,
      createdAt: this.now(),
      revokedAt: null,
    };
    this.sessions.set(session.id, session);
    this.sessionByAccessHash.set(session.accessHash, session.id);
    this.sessionByRefreshHash.set(session.refreshHash, session.id);
    this.event('sign-in', accountId, null);
    return secrets;
  }

  async authenticateAccess(token: string): Promise<AuthenticatedSession> {
    const hash = await this.secretHash(token);
    const sessionId = this.sessionByAccessHash.get(hash);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || session.revokedAt !== null) {
      throw new SyncServiceError(401, 'session_invalid', 'The Bloom session is invalid.');
    }
    if (session.accessExpiresAt <= this.now()) {
      throw new SyncServiceError(401, 'session_expired', 'The Bloom session expired and can be refreshed.');
    }
    const account = await this.account(session.accountId);
    return { session: clone(session), account };
  }

  async verifyCsrf(session: SessionRecord, token: string): Promise<void> {
    if (!token || !constantTimeEqual(session.csrfHash, await this.secretHash(token))) {
      throw new SyncServiceError(403, 'csrf_invalid', 'The request confirmation token is invalid.');
    }
  }

  async refreshSession(refreshToken: string): Promise<SessionSecrets> {
    const hash = await this.secretHash(refreshToken);
    const sessionId = this.sessionByRefreshHash.get(hash);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || session.revokedAt !== null || session.refreshExpiresAt <= this.now()) {
      throw new SyncServiceError(401, 'refresh_invalid', 'The Bloom refresh session is invalid or expired.');
    }
    await this.account(session.accountId);
    this.sessionByAccessHash.delete(session.accessHash);
    this.sessionByRefreshHash.delete(session.refreshHash);
    const secrets = await this.createSessionSecrets(session.id);
    session.accessHash = await this.secretHash(secrets.accessToken);
    session.refreshHash = await this.secretHash(secrets.refreshToken);
    session.csrfHash = await this.secretHash(secrets.csrfToken);
    session.accessExpiresAt = secrets.accessExpiresAt;
    session.refreshExpiresAt = secrets.refreshExpiresAt;
    this.sessionByAccessHash.set(session.accessHash, session.id);
    this.sessionByRefreshHash.set(session.refreshHash, session.id);
    this.event('session-refresh', session.accountId, null);
    return secrets;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAt !== null) return;
    session.revokedAt = this.now();
    this.sessionByAccessHash.delete(session.accessHash);
    this.sessionByRefreshHash.delete(session.refreshHash);
    this.event('session-revoke', session.accountId, null);
  }

  requireRecentAuth(session: SessionRecord): void {
    if (session.recentAuthUntil <= this.now()) {
      throw new SyncServiceError(403, 'recent_auth_required', 'Please sign in again before this account change.');
    }
  }

  async account(accountId: string): Promise<AccountRecord> {
    const account = this.accounts.get(accountId);
    if (!account || account.deletionState !== 'active') {
      throw new SyncServiceError(404, 'account_missing', 'The Bloom account is unavailable.');
    }
    return clone(account);
  }

  async registerDevice(
    accountId: string,
    id: string,
    platform: DevicePlatform,
    keyVersion: number,
    consentConfirmed: boolean,
  ): Promise<DeviceRecord> {
    if (!consentConfirmed) {
      throw new SyncServiceError(409, 'sync_consent_required', 'Encrypted upload needs explicit sync consent.');
    }
    if (!validOpaqueId(id, 'device') || !['web', 'ios', 'android'].includes(platform)) {
      throw new SyncServiceError(400, 'device_metadata', 'The device registration metadata is invalid.');
    }
    if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
      throw new SyncServiceError(400, 'key_version', 'The device key version is invalid.');
    }
    const account = await this.account(accountId);
    const key = deviceKey(accountId, id);
    const prior = this.devices.get(key);
    if (prior && prior.revokedAt === null) return clone(prior);
    const activeCount = [...this.devices.values()].filter(
      (device) => device.accountId === accountId && device.revokedAt === null,
    ).length;
    if (activeCount >= MAX_ACCOUNT_DEVICES) {
      throw new SyncServiceError(409, 'device_limit', 'This account already has ten active devices.');
    }
    const device: DeviceRecord = {
      accountId,
      id,
      platform,
      keyVersion,
      createdAt: this.now(),
      lastSeenAt: this.now(),
      lastCursor: null,
      revokedAt: null,
    };
    this.devices.set(key, device);
    if (account.syncConsentAt === null) {
      const mutable = this.accounts.get(accountId)!;
      mutable.syncConsentAt = this.now();
    }
    this.event('device-register', accountId, id);
    return clone(device);
  }

  async requireDevice(accountId: string, id: string): Promise<DeviceRecord> {
    await this.account(accountId);
    const device = this.devices.get(deviceKey(accountId, id));
    if (!device || device.revokedAt !== null) {
      throw new SyncServiceError(403, 'device_revoked', 'This device is not authorized for sync.');
    }
    device.lastSeenAt = this.now();
    return clone(device);
  }

  async listDevices(accountId: string): Promise<DeviceRecord[]> {
    const account = await this.account(accountId);
    if (account.syncConsentAt === null) {
      throw new SyncServiceError(409, 'sync_consent_required', 'Sync has not been enabled for this account.');
    }
    return [...this.devices.values()]
      .filter((device) => device.accountId === accountId)
      .map(clone)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  async revokeDevice(accountId: string, id: string): Promise<void> {
    await this.account(accountId);
    const device = this.devices.get(deviceKey(accountId, id));
    if (!device || device.revokedAt !== null) return;
    device.revokedAt = this.now();
    this.event('device-revoke', accountId, id);
  }

  async acknowledgeDevice(accountId: string, id: string, cursor: string | null): Promise<void> {
    const device = await this.requireDevice(accountId, id);
    const mutable = this.devices.get(deviceKey(accountId, device.id))!;
    mutable.lastCursor = cursor;
    mutable.lastSeenAt = this.now();
  }

  async createNativeHandoff(
    accountId: string,
    provider: IdentityProviderName,
    challenge: string,
  ): Promise<string> {
    return this.createNativeHandoffFromHash(
      accountId,
      provider,
      await this.secretHash(challenge),
    );
  }

  async createNativeHandoffFromHash(
    accountId: string,
    provider: IdentityProviderName,
    challengeHash: string,
  ): Promise<string> {
    await this.account(accountId);
    const token = randomOpaqueId('handoff', 24, this.random);
    const handoff: NativeHandoff = {
      tokenHash: await this.secretHash(token),
      challengeHash,
      accountId,
      provider,
      expiresAt: this.now() + NATIVE_HANDOFF_MS,
      usedAt: null,
    };
    this.nativeHandoffs.set(handoff.tokenHash, handoff);
    return token;
  }

  async consumeNativeHandoff(
    provider: IdentityProviderName,
    token: string,
    challenge: string,
  ): Promise<string> {
    const tokenHash = await this.secretHash(token);
    const handoff = this.nativeHandoffs.get(tokenHash);
    if (
      !handoff ||
      handoff.usedAt !== null ||
      handoff.expiresAt <= this.now() ||
      handoff.provider !== provider ||
      !constantTimeEqual(handoff.challengeHash, await this.secretHash(challenge))
    ) {
      throw new SyncServiceError(401, 'handoff_invalid', 'The native sign-in handoff is invalid or expired.');
    }
    handoff.usedAt = this.now();
    return handoff.accountId;
  }

  async beginCloudDeletion(accountId: string): Promise<number> {
    const account = await this.account(accountId);
    const nextGeneration = account.cloudGeneration + 1;
    const mutable = this.accounts.get(accountId)!;
    mutable.deletionState = 'cloud-deleting';
    for (const device of this.devices.values()) {
      if (device.accountId === accountId && device.revokedAt === null) device.revokedAt = this.now();
    }
    return nextGeneration;
  }

  async finishCloudDeletion(accountId: string, generation: number): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account || account.deletionState !== 'cloud-deleting') {
      throw new SyncServiceError(409, 'deletion_state', 'Cloud deletion is not pending.');
    }
    account.cloudGeneration = generation;
    account.syncConsentAt = null;
    account.deletionState = 'active';
    this.event('cloud-delete', accountId, null);
  }

  async beginAccountDeletion(accountId: string): Promise<number> {
    const account = await this.account(accountId);
    const nextGeneration = account.cloudGeneration + 1;
    const mutable = this.accounts.get(accountId)!;
    mutable.deletionState = 'account-deleting';
    for (const session of this.sessions.values()) {
      if (session.accountId === accountId) await this.revokeSession(session.id);
    }
    for (const device of this.devices.values()) {
      if (device.accountId === accountId && device.revokedAt === null) device.revokedAt = this.now();
    }
    return nextGeneration;
  }

  async finishAccountDeletion(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account || account.deletionState !== 'account-deleting') {
      throw new SyncServiceError(409, 'deletion_state', 'Account deletion is not pending.');
    }
    this.event('account-delete', accountId, null);
    for (const alias of this.aliasKeysByAccount.get(accountId) ?? []) this.aliases.delete(alias);
    this.aliasKeysByAccount.delete(accountId);
    for (const [key, device] of this.devices) {
      if (device.accountId === accountId) this.devices.delete(key);
    }
    for (const [id, session] of this.sessions) {
      if (session.accountId === accountId) this.sessions.delete(id);
    }
    this.accounts.delete(accountId);
  }

  async securityEvents(): Promise<SecurityEvent[]> {
    return this.events.map(clone);
  }

  private async createSessionSecrets(existingId?: string): Promise<SessionSecrets> {
    return {
      sessionId: existingId ?? randomOpaqueId('session', 16, this.random),
      accessToken: randomOpaqueId('access', 32, this.random),
      refreshToken: randomOpaqueId('refresh', 32, this.random),
      csrfToken: randomOpaqueId('csrf', 24, this.random),
      accessExpiresAt: this.now() + ACCESS_SESSION_MS,
      refreshExpiresAt: this.now() + REFRESH_SESSION_MS,
    };
  }

  private secretHash(value: string): Promise<string> {
    return hmacSha256(this.sessionPepper, value);
  }

  private event(kind: SecurityEvent['kind'], accountId: string | null, deviceId: string | null) {
    this.events.push({
      id: randomOpaqueId('event', 16, this.random),
      kind,
      accountId,
      deviceId,
      at: this.now(),
    });
  }
}

function deviceKey(accountId: string, deviceId: string): string {
  return `${accountId.length}:${accountId}${deviceId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
