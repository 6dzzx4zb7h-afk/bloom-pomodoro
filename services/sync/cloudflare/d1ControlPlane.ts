import {
  ACCESS_SESSION_MS,
  AUTH_TRANSACTION_MS,
  NATIVE_HANDOFF_MS,
  RECENT_AUTH_MS,
  REFRESH_SESSION_MS,
  type AuthenticatedSession,
  type ControlPlane,
  type CreatedAuthTransaction,
} from '../controlPlane';
import { constantTimeEqual, fillRandom, randomOpaqueId, validOpaqueId } from '../encoding';
import { hmacSha256, sha256 } from '../crypto';
import {
  MAX_ACCOUNT_DEVICES,
  SyncServiceError,
  type AccountRecord,
  type AuthTransaction,
  type Clock,
  type DevicePlatform,
  type DeviceRecord,
  type IdentityProviderName,
  type RandomByteFiller,
  type SecurityEvent,
  type SessionKind,
  type SessionRecord,
  type SessionSecrets,
} from '../types';
import type { D1Database, D1PreparedStatement, D1Result } from './types';

type SqlValue = string | number | null;

interface AccountRow {
  id: string;
  fingerprint: string;
  cloud_generation: number;
  sync_consent_at: number | null;
  created_at: number;
  deletion_state: AccountRecord['deletionState'];
}

interface SessionRow {
  id: string;
  account_id: string;
  kind: SessionKind;
  access_hash: string;
  refresh_hash: string;
  csrf_hash: string;
  access_expires_at: number;
  refresh_expires_at: number;
  recent_auth_until: number;
  created_at: number;
  revoked_at: number | null;
}

interface DeviceRow {
  account_id: string;
  id: string;
  platform: DevicePlatform;
  key_version: number;
  created_at: number;
  last_seen_at: number;
  last_cursor: string | null;
  revoked_at: number | null;
}

interface AuthRow {
  state_hash: string;
  provider: IdentityProviderName;
  nonce: string;
  pkce_verifier: string | null;
  mode: SessionKind;
  native_challenge_hash: string | null;
  link_account_id: string | null;
  link_session_id: string | null;
  redirect_uri: string;
  expires_at: number;
  created_at: number;
}

interface HandoffRow {
  token_hash: string;
  challenge_hash: string;
  account_id: string;
  provider: IdentityProviderName;
  expires_at: number;
  used_at: number | null;
}

export class D1ControlPlane implements ControlPlane {
  constructor(
    private readonly database: D1Database,
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
    await this.database.batch([
      this.statement('DELETE FROM auth_transactions WHERE expires_at <= ?', this.now()),
      this.statement(
        `INSERT INTO auth_transactions
         (state_hash, provider, nonce, pkce_verifier, mode, native_challenge_hash,
          link_account_id, link_session_id, redirect_uri, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        transaction.stateHash,
        transaction.provider,
        transaction.nonce,
        transaction.pkceVerifier,
        transaction.mode,
        transaction.nativeChallengeHash,
        transaction.linkAccountId,
        transaction.linkSessionId,
        transaction.redirectUri,
        transaction.expiresAt,
        transaction.createdAt,
      ),
    ]);
    return { state, transaction };
  }

  async consumeAuthTransaction(
    state: string,
    provider: IdentityProviderName,
  ): Promise<AuthTransaction> {
    const stateHash = await this.secretHash(state);
    const row = await this.first<AuthRow>(
      'SELECT * FROM auth_transactions WHERE state_hash = ?',
      stateHash,
    );
    if (!row || row.provider !== provider || row.expires_at <= this.now()) {
      throw new SyncServiceError(400, 'auth_state', 'The sign-in transaction is invalid or expired.');
    }
    const deleted = await this.run(
      'DELETE FROM auth_transactions WHERE state_hash = ? AND provider = ?',
      stateHash,
      provider,
    );
    if ((deleted.meta.changes ?? 0) !== 1) {
      throw new SyncServiceError(400, 'auth_state', 'The sign-in transaction was already used.');
    }
    return authRecord(row);
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
    const aliasHash = await hmacSha256(
      this.identityPepper,
      `${provider}\u0000${issuer}\u0000${subject}`,
    );
    const existing = await this.first<{ account_id: string }>(
      'SELECT account_id FROM identity_aliases WHERE alias_hash = ?',
      aliasHash,
    );
    if (linkAccountId) {
      const account = await this.account(linkAccountId);
      if (existing && existing.account_id !== linkAccountId) {
        throw new SyncServiceError(409, 'identity_linked', 'This provider identity belongs to another account.');
      }
      await this.run(
        'INSERT OR IGNORE INTO identity_aliases (alias_hash, account_id, created_at) VALUES (?, ?, ?)',
        aliasHash,
        linkAccountId,
        this.now(),
      );
      const linked = await this.first<{ account_id: string }>(
        'SELECT account_id FROM identity_aliases WHERE alias_hash = ?',
        aliasHash,
      );
      if (linked?.account_id !== linkAccountId) {
        throw new SyncServiceError(409, 'identity_linked', 'This provider identity belongs to another account.');
      }
      await this.event('provider-link', linkAccountId, null);
      return account;
    }
    if (existing) return this.account(existing.account_id);

    const id = randomOpaqueId('account', 16, this.random);
    const fingerprint = (await sha256(`bloom-account-fingerprint\u0000${id}`)).slice(0, 22);
    const createdAt = this.now();
    try {
      await this.database.batch([
        this.statement(
          `INSERT INTO accounts
           (id, fingerprint, cloud_generation, sync_consent_at, created_at, deletion_state)
           VALUES (?, ?, 1, NULL, ?, 'active')`,
          id,
          fingerprint,
          createdAt,
        ),
        this.statement(
          'INSERT INTO identity_aliases (alias_hash, account_id, created_at) VALUES (?, ?, ?)',
          aliasHash,
          id,
          createdAt,
        ),
      ]);
      return this.account(id);
    } catch {
      const raced = await this.first<{ account_id: string }>(
        'SELECT account_id FROM identity_aliases WHERE alias_hash = ?',
        aliasHash,
      );
      if (raced) return this.account(raced.account_id);
      throw new SyncServiceError(503, 'account_create', 'The Bloom account could not be created.');
    }
  }

  async issueSession(accountId: string, kind: SessionKind): Promise<SessionSecrets> {
    await this.account(accountId);
    const secrets = await this.createSessionSecrets();
    await this.run(
      `INSERT INTO sessions
       (id, account_id, kind, access_hash, refresh_hash, csrf_hash, access_expires_at,
        refresh_expires_at, recent_auth_until, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      secrets.sessionId,
      accountId,
      kind,
      await this.secretHash(secrets.accessToken),
      await this.secretHash(secrets.refreshToken),
      await this.secretHash(secrets.csrfToken),
      secrets.accessExpiresAt,
      secrets.refreshExpiresAt,
      this.now() + RECENT_AUTH_MS,
      this.now(),
    );
    await this.event('sign-in', accountId, null);
    return secrets;
  }

  async authenticateAccess(token: string): Promise<AuthenticatedSession> {
    const row = await this.first<SessionRow>(
      'SELECT * FROM sessions WHERE access_hash = ?',
      await this.secretHash(token),
    );
    if (!row || row.revoked_at !== null) {
      throw new SyncServiceError(401, 'session_invalid', 'The Bloom session is invalid.');
    }
    if (row.access_expires_at <= this.now()) {
      throw new SyncServiceError(401, 'session_expired', 'The Bloom session expired and can be refreshed.');
    }
    return { session: sessionRecord(row), account: await this.account(row.account_id) };
  }

  async verifyCsrf(session: SessionRecord, token: string): Promise<void> {
    if (!token || !constantTimeEqual(session.csrfHash, await this.secretHash(token))) {
      throw new SyncServiceError(403, 'csrf_invalid', 'The request confirmation token is invalid.');
    }
  }

  async refreshSession(refreshToken: string): Promise<SessionSecrets> {
    const refreshHash = await this.secretHash(refreshToken);
    const row = await this.first<SessionRow>(
      'SELECT * FROM sessions WHERE refresh_hash = ?',
      refreshHash,
    );
    if (!row || row.revoked_at !== null || row.refresh_expires_at <= this.now()) {
      throw new SyncServiceError(401, 'refresh_invalid', 'The Bloom refresh session is invalid or expired.');
    }
    await this.account(row.account_id);
    const secrets = await this.createSessionSecrets(row.id);
    const updated = await this.run(
      `UPDATE sessions SET access_hash = ?, refresh_hash = ?, csrf_hash = ?,
       access_expires_at = ?, refresh_expires_at = ?
       WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL`,
      await this.secretHash(secrets.accessToken),
      await this.secretHash(secrets.refreshToken),
      await this.secretHash(secrets.csrfToken),
      secrets.accessExpiresAt,
      secrets.refreshExpiresAt,
      row.id,
      refreshHash,
    );
    if ((updated.meta.changes ?? 0) !== 1) {
      throw new SyncServiceError(401, 'refresh_invalid', 'The Bloom refresh session was already rotated.');
    }
    await this.event('session-refresh', row.account_id, null);
    return secrets;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const row = await this.first<{ account_id: string }>(
      'SELECT account_id FROM sessions WHERE id = ? AND revoked_at IS NULL',
      sessionId,
    );
    if (!row) return;
    await this.run(
      'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      this.now(),
      sessionId,
    );
    await this.event('session-revoke', row.account_id, null);
  }

  requireRecentAuth(session: SessionRecord): void {
    if (session.recentAuthUntil <= this.now()) {
      throw new SyncServiceError(403, 'recent_auth_required', 'Please sign in again before this account change.');
    }
  }

  async account(accountId: string): Promise<AccountRecord> {
    const row = await this.first<AccountRow>('SELECT * FROM accounts WHERE id = ?', accountId);
    if (!row || row.deletion_state !== 'active') {
      throw new SyncServiceError(404, 'account_missing', 'The Bloom account is unavailable.');
    }
    return accountRecord(row);
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
    await this.account(accountId);
    const prior = await this.first<DeviceRow>(
      'SELECT * FROM devices WHERE account_id = ? AND id = ? AND revoked_at IS NULL',
      accountId,
      id,
    );
    if (prior) return deviceRecord(prior);
    const count = await this.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM devices WHERE account_id = ? AND revoked_at IS NULL',
      accountId,
    );
    if ((count?.count ?? 0) >= MAX_ACCOUNT_DEVICES) {
      throw new SyncServiceError(409, 'device_limit', 'This account already has ten active devices.');
    }
    const now = this.now();
    try {
      await this.database.batch([
        this.statement(
        `INSERT INTO devices
         (account_id, id, platform, key_version, created_at, last_seen_at, last_cursor, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
         ON CONFLICT(account_id, id) DO UPDATE SET platform = excluded.platform,
           key_version = excluded.key_version, last_seen_at = excluded.last_seen_at,
           last_cursor = NULL, revoked_at = NULL`,
        accountId,
        id,
        platform,
        keyVersion,
        now,
        now,
      ),
        this.statement(
        'UPDATE accounts SET sync_consent_at = COALESCE(sync_consent_at, ?) WHERE id = ?',
        now,
        accountId,
      ),
      ]);
    } catch {
      const active = await this.first<{ count: number }>(
        'SELECT COUNT(*) AS count FROM devices WHERE account_id = ? AND revoked_at IS NULL',
        accountId,
      );
      if ((active?.count ?? 0) >= MAX_ACCOUNT_DEVICES) {
        throw new SyncServiceError(409, 'device_limit', 'This account already has ten active devices.');
      }
      throw new SyncServiceError(503, 'device_register', 'The device grant could not be saved.');
    }
    await this.event('device-register', accountId, id);
    return this.requireDevice(accountId, id);
  }

  async requireDevice(accountId: string, id: string): Promise<DeviceRecord> {
    await this.account(accountId);
    const row = await this.first<DeviceRow>(
      'SELECT * FROM devices WHERE account_id = ? AND id = ? AND revoked_at IS NULL',
      accountId,
      id,
    );
    if (!row) {
      throw new SyncServiceError(403, 'device_revoked', 'This device is not authorized for sync.');
    }
    await this.run(
      'UPDATE devices SET last_seen_at = ? WHERE account_id = ? AND id = ?',
      this.now(),
      accountId,
      id,
    );
    return { ...deviceRecord(row), lastSeenAt: this.now() };
  }

  async listDevices(accountId: string): Promise<DeviceRecord[]> {
    const account = await this.account(accountId);
    if (account.syncConsentAt === null) {
      throw new SyncServiceError(409, 'sync_consent_required', 'Sync has not been enabled for this account.');
    }
    const result = await this.database.prepare(
      'SELECT * FROM devices WHERE account_id = ? ORDER BY created_at, id',
    ).bind(accountId).all<DeviceRow>();
    return result.results.map(deviceRecord);
  }

  async revokeDevice(accountId: string, id: string): Promise<void> {
    await this.account(accountId);
    const result = await this.run(
      'UPDATE devices SET revoked_at = ? WHERE account_id = ? AND id = ? AND revoked_at IS NULL',
      this.now(),
      accountId,
      id,
    );
    if ((result.meta.changes ?? 0) > 0) await this.event('device-revoke', accountId, id);
  }

  async acknowledgeDevice(accountId: string, id: string, cursor: string | null): Promise<void> {
    await this.requireDevice(accountId, id);
    await this.run(
      'UPDATE devices SET last_cursor = ?, last_seen_at = ? WHERE account_id = ? AND id = ?',
      cursor,
      this.now(),
      accountId,
      id,
    );
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
    await this.database.batch([
      this.statement('DELETE FROM native_handoffs WHERE expires_at <= ?', this.now()),
      this.statement(
        `INSERT INTO native_handoffs
         (token_hash, challenge_hash, account_id, provider, expires_at, used_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        await this.secretHash(token),
        challengeHash,
        accountId,
        provider,
        this.now() + NATIVE_HANDOFF_MS,
      ),
    ]);
    return token;
  }

  async consumeNativeHandoff(
    provider: IdentityProviderName,
    token: string,
    challenge: string,
  ): Promise<string> {
    const tokenHash = await this.secretHash(token);
    const row = await this.first<HandoffRow>(
      'SELECT * FROM native_handoffs WHERE token_hash = ?',
      tokenHash,
    );
    if (
      !row ||
      row.used_at !== null ||
      row.expires_at <= this.now() ||
      row.provider !== provider ||
      !constantTimeEqual(row.challenge_hash, await this.secretHash(challenge))
    ) {
      throw new SyncServiceError(401, 'handoff_invalid', 'The native sign-in handoff is invalid or expired.');
    }
    const consumed = await this.run(
      'UPDATE native_handoffs SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
      this.now(),
      tokenHash,
    );
    if ((consumed.meta.changes ?? 0) !== 1) {
      throw new SyncServiceError(401, 'handoff_invalid', 'The native sign-in handoff was already used.');
    }
    return row.account_id;
  }

  async beginCloudDeletion(accountId: string): Promise<number> {
    const account = await this.account(accountId);
    const generation = account.cloudGeneration + 1;
    await this.database.batch([
      this.statement(
        "UPDATE accounts SET deletion_state = 'cloud-deleting' WHERE id = ? AND deletion_state = 'active'",
        accountId,
      ),
      this.statement(
        'UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE account_id = ?',
        this.now(),
        accountId,
      ),
    ]);
    return generation;
  }

  async finishCloudDeletion(accountId: string, generation: number): Promise<void> {
    const result = await this.run(
      `UPDATE accounts SET cloud_generation = ?, sync_consent_at = NULL, deletion_state = 'active'
       WHERE id = ? AND deletion_state = 'cloud-deleting'`,
      generation,
      accountId,
    );
    if ((result.meta.changes ?? 0) !== 1) {
      throw new SyncServiceError(409, 'deletion_state', 'Cloud deletion is not pending.');
    }
    await this.event('cloud-delete', accountId, null);
  }

  async beginAccountDeletion(accountId: string): Promise<number> {
    const account = await this.account(accountId);
    const generation = account.cloudGeneration + 1;
    const now = this.now();
    await this.database.batch([
      this.statement(
        "UPDATE accounts SET deletion_state = 'account-deleting' WHERE id = ? AND deletion_state = 'active'",
        accountId,
      ),
      this.statement(
        'UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE account_id = ?',
        now,
        accountId,
      ),
      this.statement(
        'UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE account_id = ?',
        now,
        accountId,
      ),
    ]);
    return generation;
  }

  async finishAccountDeletion(accountId: string): Promise<void> {
    const state = await this.first<{ deletion_state: string }>(
      'SELECT deletion_state FROM accounts WHERE id = ?',
      accountId,
    );
    if (state?.deletion_state !== 'account-deleting') {
      throw new SyncServiceError(409, 'deletion_state', 'Account deletion is not pending.');
    }
    await this.event('account-delete', accountId, null);
    await this.run('DELETE FROM accounts WHERE id = ?', accountId);
  }

  async securityEvents(): Promise<SecurityEvent[]> {
    const result = await this.database.prepare(
      'SELECT id, kind, account_id, device_id, at FROM security_events ORDER BY at, id',
    ).all<{
      id: string;
      kind: SecurityEvent['kind'];
      account_id: string | null;
      device_id: string | null;
      at: number;
    }>();
    return result.results.map((row) => ({
      id: row.id,
      kind: row.kind,
      accountId: row.account_id,
      deviceId: row.device_id,
      at: row.at,
    }));
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

  private async event(
    kind: SecurityEvent['kind'],
    accountId: string | null,
    deviceId: string | null,
  ): Promise<void> {
    await this.database.batch([
      this.statement(
        'DELETE FROM security_events WHERE at < ?',
        this.now() - 30 * 86_400_000,
      ),
      this.statement(
        'INSERT INTO security_events (id, kind, account_id, device_id, at) VALUES (?, ?, ?, ?, ?)',
        randomOpaqueId('event', 16, this.random),
        kind,
        accountId,
        deviceId,
        this.now(),
      ),
    ]);
  }

  private statement(query: string, ...values: SqlValue[]): D1PreparedStatement {
    return this.database.prepare(query).bind(...values);
  }

  private run(query: string, ...values: SqlValue[]): Promise<D1Result> {
    return this.statement(query, ...values).run();
  }

  private first<T>(query: string, ...values: SqlValue[]): Promise<T | null> {
    return this.statement(query, ...values).first<T>();
  }
}

function accountRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    cloudGeneration: row.cloud_generation,
    syncConsentAt: row.sync_consent_at,
    createdAt: row.created_at,
    deletionState: row.deletion_state,
  };
}

function sessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    accessHash: row.access_hash,
    refreshHash: row.refresh_hash,
    csrfHash: row.csrf_hash,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    recentAuthUntil: row.recent_auth_until,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

function deviceRecord(row: DeviceRow): DeviceRecord {
  return {
    accountId: row.account_id,
    id: row.id,
    platform: row.platform,
    keyVersion: row.key_version,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    lastCursor: row.last_cursor,
    revokedAt: row.revoked_at,
  };
}

function authRecord(row: AuthRow): AuthTransaction {
  return {
    stateHash: row.state_hash,
    provider: row.provider,
    nonce: row.nonce,
    pkceVerifier: row.pkce_verifier,
    mode: row.mode,
    nativeChallengeHash: row.native_challenge_hash,
    linkAccountId: row.link_account_id,
    linkSessionId: row.link_session_id,
    redirectUri: row.redirect_uri,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
