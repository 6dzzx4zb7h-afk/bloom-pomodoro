# PLAN 11.1 sync contract security/privacy review — 2026-08-12

## Scope and result

This is the repository's pre-implementation design review of `docs/sync.md`. It checks the proposed
account/sync boundary against `docs/product-quality.md`, OWASP ASVS/MASVS design controls, W3C
privacy principles, the current schema-33 persisted shape, the separate Companion log, and 9.4's
validated export/import merge baseline.

**Result:** approved as the binding input to PLAN 11.2 and to a local/staging PLAN 11.3 service. No
production service, production data, cryptographic implementation, penetration result, legal
compliance conclusion, or store readiness is approved by this review.

## Evidence inspected

- `src/store/useBloom.ts`: every `PersistedShape` field and runtime-only timer field.
- `src/store/companion.ts`: separate versioned event log and current caps/validation.
- `src/store/exportImport.ts`: full backup envelope, migration path, stable-id merge behavior,
  collision stops, archive compaction, and atomic local recovery.
- `docs/product-quality.md`: local-first consent, endpoint/data inventory, recovery, untrusted input,
  credential/key storage, authorization, logging, standards, and offline-failure requirements.
- Official Cloudflare Pages Functions, D1, Durable Objects, storage-security, and recovery documents;
  Google OIDC server-flow guidance; and Apple's web/REST Sign in with Apple documentation linked
  from the contract.

## Findings closed in the contract

1. **Sign-in could be mistaken for upload consent — closed.** The state model separates identity
   sign-in from first upload, and the first upload is blocked on inventory confirmation and recovery.
2. **Server-readable focus content/key escrow — closed.** Content is per-envelope AES-GCM ciphertext;
   ARKs and recovery kits never reach the service. The loss consequence is stated without implying a
   support backdoor.
3. **Live timer cross-device ownership — closed.** `flow`, `openFocus`, `openFlow`, hidden parking
   entries, return snapshots, and unresolved in-session UI stay device-local. Only finalized records
   sync.
4. **Unbounded network authority — closed.** Exact same-origin routes, OIDC hosts, methods, states,
   and cleartext inventories are allowlisted. Provider scripts, diagnostics, remote assets, proxies,
   and later network features are excluded.
5. **Device-clock last-write-wins/data resurrection — closed at design level.** Server revisions,
   explicit base revisions, idempotent mutation ids, tombstones, cloud generations, compaction
   provenance, and stale-device rebase rules are binding requirements for 11.2.
6. **Account-switch contamination — closed.** A local backup precedes switch, account-bound
   outboxes/keys cannot cross credentials, separate workspace is the default, and merge is explicit.
7. **Metadata/E2EE overclaim — closed.** The contract separately lists readable metadata, traffic
   leakage, unreadable content, trusted-origin/XSS limits, and provider-managed recovery history.
8. **Deletion/retention ambiguity — closed as a service contract.** Cloud-copy/account/local deletes
   are distinct; mutation/tombstone, snapshot, operational/security-log, and 30-day provider-recovery
   windows are stated.

## Implementation gates carried forward

These are not defects in a design-only step; they are release blockers for 11.3-11.6:

- prove the protocol algebra and every per-slice rule in the network-free 11.2 core, including
  collision quarantine, unknown-field preservation, delete-vs-offline-edit, compaction provenance,
  and schema skew;
- have a security reviewer independent of the implementation review the key derivation, nonce,
  wrapping, recovery, rotation, and test vectors before production;
- prove OIDC issuer/audience/state/nonce/PKCE, CSRF, cookie, native handoff, cross-account, revoked
  device, replay, quota, and deletion controls with contract/fault tests;
- verify Keychain, Keystore-backed secure storage, IndexedDB wrapping, recovery export/import, and
  lost-key wording on physical devices and supported browsers;
- update CSP/service-worker/local-only audits so auth/sync routes are narrowly permitted only in
  opted-in code and never cached; local-only must still make zero application-data requests;
- confirm Cloudflare's contractual deletion/recovery behavior and disclose the final data inventory,
  processors, metadata, retention, rights, and contact path before collecting production data;
- re-run the iOS export-compliance/cryptography audit after the actual E2EE/auth implementation; and
- complete staging, incident/rollback, accessibility, browser/device, outage, and store privacy-label
  QA before any production rollout.

## Change-control rule

Changing providers, adding a host/route, storing a new cleartext field, adding server key recovery,
changing retention/deletion, syncing live timer state, changing account-switch behavior, or weakening
E2EE is material. Stop implementation and amend PLAN/docs with another security/privacy review first.
