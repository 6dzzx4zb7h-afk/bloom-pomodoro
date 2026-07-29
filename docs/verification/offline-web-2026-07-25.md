# Web app-shell offline verification — 2026-07-25

Scope: local production build evidence for PLAN 8.15. This is not the remaining
deployed-web Phase 1–5 release pass.

## Automated evidence

- `npm test`: 29 files / 312 tests green, including the service-worker
  generator and registration suites.
- The generated-worker fixture installs an exact local app shell, serves an
  offline navigation and hashed asset, leaves `/api` network-only, removes only
  obsolete `bloom-shell-*` caches, and preserves unrelated caches.
- The registration fixture covers root scope, `updateViaCache: "none"`, and one
  controlled-page reload on controller change.
- `npm run build`: green; generated shell hash `461c0a10a6c442ef` with 11
  precached files.

## Browser evidence

1. Opened the production preview at `http://127.0.0.1:4173/`.
2. Completed the local-only onboarding and opened Settings → Data.
3. Confirmed the JSON/CSV controls, labelled JSON picker, and calm invalid-file
   recovery state with no console warnings or errors.
4. Stopped the preview server completely.
5. Reloaded the same URL. The cached app shell booted the Focus screen, kept
   its local name/task state, exposed its normal timer and navigation controls,
   and produced no console warnings or errors.

Remaining before PLAN 8.15 can close: repeat against the deployed web build,
verify a build-to-build service-worker update, and complete every Phase 1–5
feature with the network blocked.
