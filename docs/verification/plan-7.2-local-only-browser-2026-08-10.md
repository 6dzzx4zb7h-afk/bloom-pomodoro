# PLAN 7.2 local-only browser privacy verification — 2026-08-10

Scope: source, built-output, runtime-asset, production-preview, persistence,
and iOS-packaging evidence for Bloom's current local-only build. This pass does
not claim deployed-web, installed-PWA, offline-reload, physical-device, signed
archive, TestFlight, or App Store verification. Deployed/installed-PWA offline
proof remains PLAN 8.15.

## Repeatable static audit

`node scripts/local-only-audit.mjs` passed against the final production build.
It is fail-closed for new source network APIs, external URLs, network/reporting
dependencies, Capacitor server/HTTP configuration, built-bundle network sites,
remote runtime references, missing assets, and weakened service-worker guards.

- 176 `.ts`, `.tsx`, `.css`, and `.json` source files contained no `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or external URL.
- No auth, sync, telemetry, analytics, diagnostics, or reporting dependency is
  present. `capacitor.config.ts` has no remote server override and does not
  enable Capacitor HTTP patching.
- HTML, CSS, the web manifest, icons, self-hosted WOFF2 fonts, static Guide
  content, and synthesized completion-cue data resolve locally and are included
  in the app-shell precache.
- The generated app bundle has exactly two classified framework `fetch` sites:
  Vite's same-origin module-preload helper and Capacitor core's dormant web HTTP
  adapter. Bloom source imports or invokes neither HTTP API. Any additional
  bundle `fetch`, any XHR/socket/beacon API, or any unclassified external URL
  fails the audit.
- The generated service worker has exactly two cache-miss fallbacks. Both are
  guarded to same-origin GET app-shell requests; `/api`, `/auth`, `/oauth`, and
  `/.well-known` remain network-only and outside the cache.

The manifest description was also corrected during the asset audit: it no
longer advertises the ambient/background sounds removed in PLAN 12.1.

## Production-preview request evidence

`scripts/privacy-preview.mjs` serves the real `dist` output through Vite preview,
logs every request, and places the document under `connect-src 'none'`. The
service-worker response uses `connect-src 'self'` so its same-origin app-shell
installation remains testable. Header reads confirmed both policies.

On a fresh localhost origin, the only requests were the initial HTML, hashed
JavaScript/CSS, two local fonts, local icons, manifest, service worker, and the
same files fetched into the service-worker precache. Those are self-hosted
app-shell delivery and update checks; they contained no user data.

After that baseline settled, the request log stayed empty while the hidden
in-app browser performed all of the following:

- completed onboarding with a test name and created a test task;
- visited Focus, Tasks, History, Goals, Friends, and Field Guide;
- opened and read a complete bundled Guide article;
- enabled the optional local Goals surface in Settings;
- opened the Your data section, exported a JSON backup through its local blob
  path, and reviewed/cancelled the on-device clear-history flow;
- started, paused, and reset Focus, then completed the test task;
- inspected Settings and found no account, cloud, sync, diagnostics, telemetry,
  or tracking surface.

The loaded app remained operable across those core screens after the preview
server was stopped, with no console warnings or errors. The page was not
reloaded while stopped, so this is not presented as PLAN 8.15 offline proof.

## Browser-control correction

The first version of the audit harness inherited Vite's development
`server.open: true` option and briefly launched Safari. Duplicate shell requests
revealed it immediately; Safari was closed, `preview.open` was fixed to `false`,
and that run was discarded. The authoritative run used a new origin, the in-app
browser stayed hidden, and a final process check confirmed Safari was closed.

## Automated and iOS evidence

- Full Vitest suite: 64 files, 626 tests passed. An earlier run encountered a
  transient host worker-start stall; the immediate isolated standard rerun was
  clean.
- Production build: passed; 102 modules transformed and app-shell service
  worker `e786e78091358c37` generated with 11 files.
- `node --check` passed for both audit scripts; `git diff --check` passed.
- Capacitor iOS sync: passed with the audited production bundle copied into the
  app.
- Code-signing-free iOS Simulator build: passed for `App` and
  `BloomLiveActivityExtension`; Swift Package Manager resolved Capacitor 7.6.8.
