# PLAN 13.5 — native presentations and restrained glass

Date: 2026-08-13

Status: complete for the presentation inventory, automated contracts, iOS 26.5 Simulator build, and
interactive Simulator smoke. This is not physical-device, iOS 27, signed archive, TestFlight, App
Store, VoiceOver, Switch Control, or production-deployment evidence; PLAN 13.6 owns that release QA.

## Exhaustive decision boundary

`docs/ios-liquid-glass.md` now records a native/keep-web decision for every production interactive
owner. A regression recursively scans production TSX under `src/components` and `src/screens` for
interactive HTML and Bloom's shared modal/switch primitives. Its exact 27-file result must match the
documented inventory, so a future interactive owner cannot silently bypass the audit.

The selected native surfaces are the ones whose behavior is owned by iOS:

- fixed destination navigation, section/mode selection, Settings, and timer transport;
- the standard SwiftUI Settings form rendered from React's bounded snapshot;
- system share, document-picker, and destructive-alert presentations;
- explicit app-settings recovery, notification delivery, and Live Activity presentation.

React remains the single owner of validation, local data, timer/session transitions, content, and
mutations. Product-specific dialogs, onboarding, tasks, goals, history/repair, foundations,
Companion prompts, debriefs, planning, parking, and recovery stay in the web layer. Browser and
Android retain the complete accessible web fallback.

The glass budget is source-enforced: one `UIGlassEffect()` host for the fixed upper segmented rail
and two `UIButton.Configuration.glass()` configuration sites for fixed timer and Settings chrome.
The native Settings form, system presentations, content layer, dialogs, cards, pet, ring, and sky
contain no custom glass effect.

## Safety and behavior coverage

- Native Settings renders no duplicate web sheet and dispatches validated row actions exactly once.
- Browser/Android and unavailable-native paths render the complete web sheet without calling the
  native bridge.
- Native document-picker cancellation restores the import action and performs no import, clear, or
  Settings mutation.
- Native export-presentation failure reports the existing non-blaming recovery status and performs
  no data mutation.
- Canceling the destructive native alert performs no clear, import, or Settings mutation; confirming
  it calls the clear action exactly once.
- The shared APG dialog tests cover initial focus, inert background, contained Tab/Shift-Tab, safe
  Escape, unsafe-Escape refusal, and invoker focus restoration. Routine Companion check-ins remain
  non-modal and do not steal focus.
- Swift source contracts keep temporary export cleanup, security-scoped bounded import, and the
  React-owned parse/prepare/commit path intact.

No runtime copy, persisted shape, schema migration, account, server, APNs path, telemetry, remote
asset, or application-data request was added by this step.

## iPhone Simulator interaction

Device: iPhone 17 Pro Max Simulator, iOS 26.5, app installed from the code-signing-free Debug build
produced from this worktree.

1. Focus exposed one accessible fixed Settings button, one native segmented mode rail, the native
   time readout and Start/Reset/Skip buttons, and one system tab bar. The rendered capture showed
   system material only on that fixed chrome; the pet, ring, task/setup card, and sky remained
   unglazed content.
2. Settings presented as one native sheet with standard text field, segmented choice, menu picker,
   switches, steppers, notes, buttons, and a Done action. There was no duplicate web sheet behind it.
3. **export JSON backup** opened the system share sheet for
   `bloom-backup-2026-08-13.json` (3 KB), including Copy and Save to Files. Dismissing the popover
   returned to the same native Settings scroll position; no destination was selected.
4. **choose a JSON backup to import** opened the system document picker. Canceling returned to the
   same native sheet, removed the reading status, and restored the enabled import action. No file was
   selected or read.
5. **review clear scope** showed the Removes/Keeps explanation before enabling
   **clear reflection history**. That action opened a standard native destructive alert. Choosing
   **keep it** returned to the scope with the same `0 sessions · 0 Companion moments` history state.
6. Leaving the scope and choosing **done** dismissed Settings and restored the fixed Focus controls.

All UI actions above were cancellation/read-only checks; no share destination, import, permission,
or destructive mutation was accepted.

## Automated and build evidence

- Focused presentation, Settings, dialog, data-contract, surface-coordination, and native-chrome
  coverage: 6 files, 46 tests passed.
- Full suite: 84 files, 766 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; 88 modules transformed, CSS 94.22 kB / 19.02 kB gzip, JavaScript
  498.71 kB / 148.26 kB gzip, service-worker manifest `1c85d094e873b6db`.
- `node scripts/local-only-audit.mjs`: passed across 201 source files with no auth, sync, telemetry,
  analytics, diagnostic reporter, remote runtime asset, or application-data request path.
- `npm run cap:sync`: production build and Android Capacitor asset/plugin sync passed.
- `npm run ios:sync`: production build and iOS Capacitor asset/plugin sync passed.
- Code-signing-free Debug Xcode build for the iPhone 17 Pro Max Simulator destination:
  `BUILD SUCCEEDED`, including Bloom and its Live Activity extension.
- `git diff --check`: passed.

The host has no Java runtime or Android Studio JDK, so `npm run apk` could not reach Gradle and no
APK compilation is claimed. PLAN 13.5 changed documentation/tests only on top of the already gated
iOS implementation; no Android source changed. Android's synchronized web bundle and explicit
non-iOS fallback coverage passed. Full Android release-device QA remains outside this iOS
presentation step.
