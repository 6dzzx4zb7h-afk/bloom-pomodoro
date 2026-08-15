# PLAN 8.26 usability cleanup — implementation evidence

Date: 2026-08-12

Status: implementation and automated verification pass; rendered browser matrix unavailable, so
PLAN 8.26 remains open.

## Product changes

- The empty Tasks state no longer offers a duplicate “add your first task” button above the real
  form. Its one entry path is the existing named input plus Add task submit control.
- The task target announces “Goal: 1 focus session” and pluralizes subsequent values as “focus
  sessions.”
- Web Settings leads with Focus, Short break, and Long break steppers. Learned cadence copy,
  history, and presets mount only after the person opens the clearly named Cadence suggestions
  button, which exposes `aria-expanded` and `aria-controls`.
- Native iOS Settings presents the same three direct steppers followed by one Cadence suggestions
  disclosure. That disclosure opens a scoped detail containing every existing cadence action.
- No setting, persisted field, timer rule, cadence calculation, or network capability changed.

## Automated and build evidence

- Focused regression run: 4 files, 73 tests passed.
- Full `npm test`: 78 files, 723 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; the production bundle and app-shell service worker were generated.
- `node scripts/local-only-audit.mjs`: passed across 194 source files; no auth, sync, telemetry,
  analytics, diagnostics, external runtime asset, or unapproved network path was found.
- `npx cap sync ios`: passed.
- Code-signing-free iOS Simulator build passed for the App scheme and embedded Live Activity
  extension using Xcode’s iOS 26.5 Simulator SDK.
- `git diff --check`: passed.
- The new strings were checked against the repository’s banned voice terms; no match was found.

Regression coverage lives in:

- `src/components/SettingsSheet.usability.test.tsx`
- `src/components/SettingsSheet.native.test.tsx`
- `src/App.accessibility.test.tsx`
- `src/store/useBloom.lifecycle.test.tsx`
- `src/responsiveAccessibility.test.ts`

## Evidence boundary

The local Vite server started successfully at `http://127.0.0.1:4178/`, but the browser runtime
reported no available browser instances. The required live keyboard path, screen-reader review,
and rendered 320×568, tablet, and desktop geometry checks therefore were not observed. A component
test, production build, or Simulator compile is not substituted for those checks. PLAN 8.26 stays
unchecked until that rendered matrix passes.

This run did not produce a signed archive, install on a physical device, exercise VoiceOver, deploy
the web app, or submit either publishing target.
