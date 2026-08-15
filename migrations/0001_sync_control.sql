PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  cloud_generation INTEGER NOT NULL CHECK (cloud_generation >= 1),
  sync_consent_at INTEGER,
  created_at INTEGER NOT NULL,
  deletion_state TEXT NOT NULL CHECK (
    deletion_state IN ('active', 'cloud-deleting', 'account-deleting')
  )
) STRICT;

CREATE TABLE identity_aliases (
  alias_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX identity_alias_account ON identity_aliases(account_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('web', 'native')),
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  recent_auth_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;
CREATE INDEX session_account ON sessions(account_id);

CREATE TABLE devices (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  key_version INTEGER NOT NULL CHECK (key_version >= 1),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_cursor TEXT,
  revoked_at INTEGER,
  PRIMARY KEY (account_id, id)
) STRICT;

CREATE TABLE auth_transactions (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  nonce TEXT NOT NULL,
  pkce_verifier TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('web', 'native')),
  native_challenge_hash TEXT,
  link_account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  link_session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX auth_transaction_expiry ON auth_transactions(expires_at);

CREATE TABLE native_handoffs (
  token_hash TEXT PRIMARY KEY,
  challenge_hash TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
) STRICT;
CREATE INDEX native_handoff_expiry ON native_handoffs(expires_at);

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  device_id TEXT,
  at INTEGER NOT NULL
) STRICT;
CREATE INDEX security_event_expiry ON security_events(at);

CREATE TABLE rate_limits (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (bucket_key, window_start)
) STRICT;

CREATE TRIGGER device_active_insert_limit
BEFORE INSERT ON devices
WHEN NEW.revoked_at IS NULL AND (
  SELECT COUNT(*) FROM devices
  WHERE account_id = NEW.account_id AND revoked_at IS NULL
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'active device limit');
END;

CREATE TRIGGER device_active_update_limit
BEFORE UPDATE OF revoked_at ON devices
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL AND (
  SELECT COUNT(*) FROM devices
  WHERE account_id = NEW.account_id AND revoked_at IS NULL
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'active device limit');
END;
