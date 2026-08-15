# PLAN 9.3 History ledger verification — 2026-08-10

Scope: deterministic component, browser, persistence, export, and iOS packaging
evidence for the calm History ledger. This pass does not claim a physical-device,
VoiceOver, signed archive, TestFlight, or App Store check.

## Fixture and behavior

- Deterministic fixture: `/fixtures/history-ledger.html`; append `?theme=night`
  for the night-theme state.
- The fixture contains nine study days, dense session detail, archived summaries,
  task completions, wander-phase chips, parked-thought counts, and paging beyond
  the first seven days.
- Session finalization now snapshots the number of session-owned parked thoughts.
  Removing a parked note later cannot rewrite the ledger. Existing records remain
  lossless: when the new optional count is absent, History can derive it from a
  retained linked note without inventing a migration-time value.
- Wander phases are derived from the independently retained Companion events and
  rendered as a named list. The day summary remains limited to the existing
  `sessionStats` fields; no new day-level aggregate was added.
- History reads synchronous local state, so a fake loading state would violate
  `docs/product-quality.md`. Paging is progressive and the app-level storage
  recovery surface continues to cover denied or corrupt local storage.

## Automated evidence

- Focused History/archive/reducer/migration/export/repair suite: 162 tests passed.
- Full suite: 63 files, 613 tests passed.
- Production web build: passed; service worker generated.
- Capacitor iOS sync: passed with the production web bundle copied into the app.
- Code-signing-free iOS Simulator build: passed for `App` and
  `BloomLiveActivityExtension` using the iPhoneSimulator 26.5 SDK.
- Coverage includes archive survival past the 500-record live cap, grouped-day and
  task-completion accuracy, empty History, paging semantics, parked-count stability,
  schema v32 migration, malformed-count rejection, JSON round-trip, and CSV output.

## Background browser evidence

The in-app Chromium browser stayed hidden; Safari was not opened.

- Small phone, day theme, 320 × 568 CSS px: body and History scroll regions each
  measured zero horizontal overflow; screen content ended above the 71.5 px fixed
  navigation; the paging control measured 44 px high. Expanded session details
  visibly wrapped without clipping.
- Wide viewport, night theme, 1024 × 768 CSS px: the 560 px ledger column was
  centered from x=232 to x=792; body and History scroll regions measured zero
  horizontal overflow; content again ended above navigation.
- Activating `Show earlier days` advanced the status from seven to all nine study
  days and removed the exhausted paging control.
- Browser console warnings and errors: none.
- Native `summary` and `button` semantics, accessible names, the named wander-timing
  list, and paging status are asserted in component tests. A manual VoiceOver pass
  remains part of later physical-device/release QA rather than evidence claimed here.
