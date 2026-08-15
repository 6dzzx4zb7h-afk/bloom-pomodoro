# PLAN 8.25 — appearance verification (2026-08-11)

## Scope decision

The user canceled sunrise/sunset scheduling. Bloom now offers only Day sky, Night sky, and Follow
system. The feature requests no location permission, performs no solar calculation, and adds no
network path.

## Persistence and behavior

- Schema v32 → v33 removes the old `night` Boolean and maps `false` to `day` and `true` to `night`,
  preserving the appearance an existing person chose.
- Fresh installs default to `system`.
- Day and Night remain fixed. Follow system subscribes to `(prefers-color-scheme: dark)` and applies
  changes without reloading. Returning to Follow system reads the current preference immediately.
- The web UI presents one three-choice, `aria-pressed` selection. The native iOS form presents the
  same three values in one `UISegmentedControl`.
- Both native bridges carry the same `day | night | system` enum. UIKit uses `.light`, `.dark`, or
  `.unspecified`; the tab tint refreshes when the system color appearance changes.

## Browser usability check

The Vite preview ran at `127.0.0.1:4183` with `PORT` set, so Vite's auto-open path was disabled and
Safari was not opened. The preview was exercised in the hidden in-app browser and finalized after
the check.

- Settings exposed the three choices as Day sky / Night sky / Follow system, with one visible
  selected state and 58 px minimum-height web controls.
- Selecting Night applied the night sky to the page and phone and set browser chrome to `#1b1535`.
- Selecting Day removed both night classes and set browser chrome to `#79bff2`.
- Selecting Follow system matched the test browser's current dark preference.
- Console output contained only Vite/React development messages; there were no application errors.

## Native iOS check

Target: iPhone 17 Pro Simulator, iOS 26.5 Simulator SDK.

- Capacitor sync completed.
- A code-signing-free Debug Simulator build completed with `** BUILD SUCCEEDED **`.
- The installed app's old light choice migrated to fixed Day and correctly stayed light when iOS
  changed to Dark.
- In the real native Settings sheet, selecting System immediately changed the sheet to Dark and the
  Focus screen to Bloom's night sky.
- Changing the running Simulator from Dark back to Light updated the Focus screen to the day sky
  without relaunching.

These checks do not replace physical-device, archive-signing, TestFlight, or App Store distribution
evidence.

## Automated gates

- `npm test`: 66 files, 638 tests passed.
- `npm run build`: TypeScript and Vite production build passed; service worker regenerated.
- Focused native appearance source contract: 2 tests passed.
- `node scripts/local-only-audit.mjs`: passed across 180 source files; no network, auth, sync,
  telemetry, analytics, or remote runtime asset path was added.
- `npx cap sync ios`: passed.
- `git diff --check`: passed.
