# Bloom optional sync service deployment

**Status:** PLAN 11.3 staging runbook. The service implementation is locally testable, but the Bloom
app does not instantiate it and production sync is not enabled. Do not add real resource ids,
provider credentials, peppers, or internal secrets to the repository.

## Components and deployment order

Use separate Cloudflare resources, bindings, OIDC clients, secrets, and cookie suffixes for staging
and production:

1. Apply `migrations/0001_sync_control.sql` to the environment's D1 control database.
2. Deploy `workers/sync-content/` as the environment's SQLite Durable Object Worker.
3. Bind the Pages project to that D1 database and Durable Object Worker, configure the fixed origin
   and cookie suffix, add secrets, and deploy the Pages Functions/static bundle.

Cloudflare Pages cannot define the Durable Object class itself. `SYNC_CONTENT` must bind to the
separately deployed Worker. The gateway derives the object name from the authorized random account
id; no client-supplied object name is accepted.

## Toolchain and local contract checks

Use the repository versions in `.node-version` and `packageManager`, then run:

```bash
npm ci
npm run lint
npm test
npm run build
npx vitest run services/sync
npx wrangler deploy --dry-run --config workers/sync-content/wrangler.toml
node scripts/local-only-audit.mjs
```

For local D1, create a disposable database/config and apply the migration in Wrangler's local mode.
Exercise the Pages Function against that binding and the content Worker before remote staging. The
deterministic in-memory control/content implementations are test fakes, not production persistence.

For the local SQLite Durable Object contract, start the non-production harness and request
`http://127.0.0.1:8791/contract`:

```bash
npx wrangler dev --config workers/sync-content/wrangler.contract.toml --port 8791 --local
```

A passing response reports first acceptance, idempotent replay, matching stored/restored
multi-megabyte snapshot lengths, and revision zero after generation deletion. The harness config is
local-only and is not the deployed Worker entry point.

## Provision staging

Create environment-specific resources. Record returned ids only in a private staging config copied
from `wrangler.sync.staging.example.toml`:

```bash
npx wrangler d1 create bloom-sync-control-staging
npx wrangler d1 migrations apply bloom-sync-control-staging --remote
npx wrangler deploy --config workers/sync-content/wrangler.toml --name bloom-sync-content-staging
```

Test migrations against new local and disposable remote staging databases before applying them.
Never point production aliases or the production Pages project at the staging namespace.

The Pages environment needs these bindings/variables:

| Name | Purpose |
| --- | --- |
| `SYNC_CONTROL` | Environment-specific D1 control database. |
| `SYNC_CONTENT` | Environment-specific `BloomSyncContent` Durable Object binding. |
| `BLOOM_SYNC_ORIGIN` | Exact HTTPS Pages origin used for redirects and Origin checks. |
| `BLOOM_COOKIE_SUFFIX` | Unique environment suffix such as `staging`. |

## Secrets and rotation

Generate independent random values per environment and store them only with Cloudflare's secret
interface and the team's approved password manager:

| Secret | Minimum/handling |
| --- | --- |
| `IDENTITY_PEPPER` | At least 32 random bytes; HMACs OIDC issuer/sub aliases. |
| `SESSION_PEPPER` | At least 32 independent random bytes; HMACs sessions, CSRF state, and handoffs. |
| `CONTENT_INTERNAL_SECRET` | At least 32 independent random bytes; same value on Pages and the content Worker. |
| `GOOGLE_OIDC_CLIENT_ID` / `GOOGLE_OIDC_CLIENT_SECRET` | Environment-only Google server OIDC client. |
| `APPLE_OIDC_CLIENT_ID` / `APPLE_OIDC_CLIENT_SECRET` | Environment-only Apple service id and signed client-secret JWT. |

Never echo secret values in command history, CI output, tickets, logs, screenshots, or fixtures. Use
interactive secret entry. Apple's signed client-secret JWT expires and needs an owned reminder.

Pepper rotation changes lookup hashes and requires a migration/re-authentication plan; never blindly
replace it. Rotate the content internal secret with a bounded old/new overlap, Worker first, then
Pages, then remove the old value. Follow each identity provider's overlap/revocation procedure for
OIDC secrets.

## Staging gates

Before accepting any staging Bloom content:

- verify both authorization-code flows, state, nonce, exact issuer/audience, Google PKCE, web cookie
  flags/CSRF, and native handoff expiry/replay;
- run cross-account attempts against every content route and confirm generic errors plus safe
  route-template logs;
- verify mutation, batch, device, account quota, and rate-limit responses preserve the local outbox;
- verify device revoke, session rotation/expiry, encrypted export, cloud-copy deletion, and complete
  account deletion against D1 and the account Durable Object;
- confirm logs omit URL queries, OIDC codes/tokens, cookies, authorization headers, bodies,
  ciphertext, nonces, recovery material, and decrypted focus content;
- verify the static local-only app makes no auth/sync request and its service worker never caches
  `/api/` or `/auth/` responses; and
- re-run the threat model, dependency/secrets review, and independent crypto-design review.

PLAN 11.4 must add reviewed consent and secure storage before first upload is reachable. PLAN 11.5
must add the crash-safe encrypted client/outbox. PLAN 11.6 owns staged multi-device release QA.
Until all three close, there is no production sync launch.

## Deletion, backups, and rollback

`DELETE /cloud-copy` denies device access, advances the cloud generation, and removes active content
while keeping the account alias. `DELETE /account` revokes sessions/devices before removing aliases,
control rows, and active content. Test both scopes after every schema or Worker change.

D1 Time Travel and Durable Object point-in-time restore are disaster-recovery mechanisms, never a
source for restoring a user-deleted generation. Restrict restore permissions and record deleted
account/generation exclusions before a broad restore. The privacy notice must describe active
deletion separately from provider-managed restore-point retention.

Rollback the gateway/static deployment and content Worker separately. Never roll D1 backward by
dropping new columns/tables. A rollback must preserve opaque envelopes and generations; otherwise
disable the optional endpoints with a truthful unavailable response while the complete local app
continues to work.
