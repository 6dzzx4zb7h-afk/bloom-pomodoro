# PLAN 9.5 session-repair verification — 2026-08-10

Scope: deterministic store, component, hidden-browser, persistence, and iOS
packaging evidence for session repair and retroactive drift notes. This pass does
not claim a physical-device, manual VoiceOver, signed archive, TestFlight, or App
Store check.

## Integrity and recovery

- History and debrief offer repair only at natural pauses. The normal History
  path is three actions or fewer: expand the day, open repair, save.
- Repaired end time is clamped to the session start, the next session, and the
  last captured wall-clock return. Unit tests cover all three bounds. Outcome
  and optional retrospective wander timing are validated before mutation.
- Successful repairs keep the original session id, set `edited: true`, and show
  the shared `Edited estimate` label in both History and debrief. Stats and
  insights read the repaired record directly.
- Repair dispatches no timer-completion action and cannot award XP, streak,
  confetti, pet progress, or task/goal credit. Integration coverage asserts the
  reward-bearing state is unchanged.
- The main record and Companion drift note are staged as one repair operation.
  The updated main store is durably validated before it is dispatched; a main
  write failure restores the Companion rows, leaves the prior record and main
  bytes unchanged, keeps the editor open, and points to the app-level storage
  recovery surface.
- Validation, cancel, and failed-save fixtures preserve the source record. Clamp
  feedback names the bound that was applied instead of silently changing the
  estimate.

## Automated evidence

- Full Vitest suite: 64 files, 619 tests passed.
- Coverage includes proposal validation, all clamp paths, eligibility windows,
  estimate labels, History/debrief interactions, repaired stats, absence of a
  reward path, cancel, and injected main-store failure with Companion rollback.
- Production web build: passed; the service worker was generated.
- Capacitor iOS sync: passed with the production web bundle copied into the app.
- Code-signing-free iOS Simulator build: passed for `App` and
  `BloomLiveActivityExtension` with Capacitor 7.6.8.

## Hidden-browser evidence

Safari was not opened. The local Vite server ran in the background and the
in-app Chromium browser remained hidden.

- Deterministic fixture: `/fixtures/session-repair.html`; append `?theme=night`
  for the night-theme state.
- Small phone, day theme, 320 × 568 CSS px: the collapsed dialog measured
  304 × 463 px at x=8 and had zero horizontal or vertical content overflow.
  With retrospective wander expanded it stayed within y=20…548, scrolled
  internally, and retained zero horizontal overflow. Inputs measured 44 px high
  and the checkbox label touch target measured 280 × 50 px.
- Filling an end time after the next session saved the bounded value and announced
  `Repair saved as an estimate. Its end time stops at the next session.` Invalid
  wander timing announced its inline alert and kept the dialog open. Cancel and
  Escape restored focus to the repair invoker.
- Wide viewport, night theme, 1024 × 768 CSS px: the dialog measured 390 × 463 px,
  centered at x=317 and y=153, with zero horizontal overflow. Its datetime,
  select, label, and status contrast remained legible.
- The dialog is portaled inside the phone surface, has named dialog/close/form
  controls, and returns focus on dismissal. Component tests cover these semantic
  contracts; a manual VoiceOver pass remains later release QA.
- Fresh narrow and wide browser sessions reported no console warnings or errors.
