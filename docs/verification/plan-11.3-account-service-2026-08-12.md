# PLAN 11.3 optional account service verification — 2026-08-12

## Outcome

PLAN 11.3 is implemented behind the binding `docs/sync.md` boundary. The local app remains account
free and does not import or instantiate the service adapter. No Cloudflare resource, OIDC client,
secret, staging environment, or production environment was created or changed in this run.

The service implementation includes:

- a same-origin exact-route gateway with Google/Apple authorization-code transactions, state,
  nonce, Google S256 PKCE, provider-bound native handoffs, access/refresh rotation, secure web
  cookies, CSRF, recent-auth checks, and fixed redirects;
- HMAC-only identity aliases, random accounts/devices, explicit device consent, per-account/device
  authorization, revocation, cloud generations, cloud-only deletion, and account deletion;
- client-side ARK/HKDF/AES-256-GCM envelopes whose metadata, ciphertext length, snapshot cursor, and
  snapshot coverage are authenticated, plus checksummed local recovery kits and no server escrow;
- opaque mutation/snapshot storage with server cursors, atomic replay checks, fixed rate/device/body/
  batch/account limits, encrypted export, and retained mutation/tombstone history;
- a D1 control-plane schema/adapter and a separate SQLite Durable Object whose ciphertext is stored
  in bounded chunks so the 5 MiB snapshot contract does not depend on one oversized row;
- an explicit constructor-injected client adapter with no singleton, default transport, credential
  persistence, or app import; and
- staging-only configuration/runbooks for binding, secret ownership/rotation, migration, deletion,
  backup, rollback, and pre-production authorization/log review.

## Contract evidence

`npx vitest run services/sync` passed 7 files / 26 tests. Named coverage includes:

- AES-GCM round trip, ciphertext/AAD tamper denial, unique subkeys/nonces, snapshot coverage
  authentication, and recovery-kit checksum;
- Google PKCE plus signed issuer/audience/nonce verification and Apple's no-undocumented-PKCE rule;
- one-use/expiring auth state and provider/challenge-bound native handoffs;
- sign-in without upload consent, web cookie flags/CSRF, session expiry/refresh rotation, provider
  link rotation, and foreign-origin/method/route denial;
- cross-account envelope and device isolation, revoked-device denial, exact replay acceptance,
  divergent replay rejection, payload/account quota, rate-window recovery, encrypted export,
  cloud-copy deletion, and complete account deletion;
- safe route-template logs containing no plaintext marker, ciphertext, nonce, access credential, or
  query string; and
- no transport call at adapter construction/auth-URL creation and correct native refresh credential
  selection.

The full repository gates passed:

- `npm run lint`;
- `npm test`: 77 files / 722 tests;
- `npm run build`: TypeScript included `src/`, `services/`, `functions/`, and `workers/`; Vite built
  87 modules; the generated service worker retained 11 local files;
- `node scripts/local-only-audit.mjs`: 193 app source files contained no network API/external URL,
  no auth/sync dependency was present, and `/api/`/`/auth/` remain network-only;
- direct source and production-bundle scans found no `SyncServiceClient` or `/api/sync/v1` runtime
  import/string outside contract tests;
- a fresh SQLite in-memory application of `migrations/0001_sync_control.sql` plus
  `PRAGMA foreign_key_check` passed;
- Wrangler compiled the Pages Functions gateway and dry-bundled the deployed Durable Object Worker
  (26.29 KiB / 6.15 KiB gzip) plus the local contract harness (30.88 KiB / 7.01 KiB gzip); and
- `git diff --check` passed.

The step added no npm dependency and did not regenerate the lockfile, so it does not introduce a new
Node/npm engine or lock-parser claim. The service is type-checked by the existing `tsc -b` build.

## Boundaries and remaining release work

The local Workerd contract harness was bundled, but a live loopback run could not be performed in
the managed environment because local port binding was denied and escalation was unavailable. This
does not replace the required disposable D1/Durable Object staging exercise in
`docs/sync-deployment.md`; no live service behavior or Cloudflare persistence is claimed here.

The iOS application still declares `ITSAppUsesNonExemptEncryption = false`. That remains a statement
about the current app binary: the production bundle/local-only audit proves the new service and
encryption modules are not imported into the app. Re-audit export compliance before PLAN 11.4/11.5
integrates crypto, authentication, secure storage, or networking into a distributable binary.

PLAN 11.4 still owns account/consent/device UI and platform secure credential/key storage. PLAN 11.5
owns the durable encrypted outbox and bidirectional client. PLAN 11.6 owns staged multi-device,
supported-browser/device, privacy, independent crypto review, and production release QA. Bloom is
therefore not yet ready for App Store/Play Store/web production publishing, and production remains
unchanged.
