# PLAN 8.21a — cross-screen coverage inventory and baseline policy

Date: 2026-08-13

Status: complete for the inventory and testing-policy slice. This does not claim that PLAN 8.21's
missing component/accessibility coverage, pinned screenshots, full visual matrix, manual
screen-reader checks, or physical-device evidence are complete; 8.21b–8.21d own those outcomes.

## Why the parent was split

PLAN 8.21 combined four independently reviewable deliverables: a coverage inventory, missing
component/accessibility tests, a pinned browser/CI visual runner, and exhaustive reviewed
baselines/manual evidence. The plan now keeps 8.21 as the umbrella and assigns those deliverables to
8.21a–8.21d. This prevents a documentation or harness milestone from being represented as complete
cross-screen evidence.

## Inventory result

`src/testing/surfaceInventory.ts` records 30 production surface owners:

- all 27 interactive TSX owners discovered under `src/components` and `src/screens`;
- the non-interactive Day sky, Night sky, and PixelPal visual owners;
- representative states for every owner;
- exact existing test and fixture paths;
- one of `direct`, `indirect`, or `missing` for automated evidence;
- one of `fixture` or `missing` for deterministic visual evidence; and
- a concrete remaining gap for every row.

Current truth is 20 direct automated rows, 10 indirect rows, zero rows with no automated evidence,
and six surface rows backed by deterministic fixtures. Those six reuse four named fixture pairs:
daily target, history ledger, session repair, and honest Tasks empty state. Fixture presence is not
reported as a screenshot pass.

The contract test independently scans production TSX and fixture files, then fails for an unlisted
interactive owner or fixture, duplicate ID, stale owner/test/fixture path, empty state/gap entry, or
documentation-summary drift. `docs/qa.md` links the new policy and no longer says lint is unavailable.

## Testing and baseline policy

`docs/testing.md` now defines:

- the evidence-level vocabulary and current inventory summary;
- the existing focused and repository-wide commands;
- deterministic time/data/font/asset/motion rules for fixture authors;
- required small-phone, short-landscape, tablet, desktop, theme, motion, contrast, forced-color, and
  expanded-spacing cells where applicable;
- a pinned environment contract for the later visual runner;
- before/after/diff review requirements and a prohibition on blanket baseline updates;
- the rule that known defects receive an open remediation step instead of becoming a regenerated
  baseline; and
- a manual evidence ledger boundary for VoiceOver, TalkBack, physical touch, safe areas, virtual
  keyboards, audio, permissions, background execution, and WebView integration.

## Verification

- Focused inventory contract: 1 file / 3 tests passed.
- Full suite: 85 files / 769 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; the production bundle remained 88 modules, CSS 94.22 kB / 19.02 kB gzip,
  JavaScript 498.71 kB / 148.26 kB gzip, service-worker manifest `1c85d094e873b6db`.
- `node scripts/local-only-audit.mjs`: passed across 203 source files with no auth, sync, telemetry,
  analytics, diagnostic reporter, remote runtime asset, or application-data request path.
- `git diff --check`: passed.

No dependency, lockfile, runtime import, persisted field, schema migration, account, server, APNs,
telemetry, remote asset, Cloudflare deployment, or production configuration was added by 8.21a.
