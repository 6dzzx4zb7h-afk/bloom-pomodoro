# PLAN 9.6 daily-target verification — 2026-08-10

Scope: deterministic store, component, hidden-browser, persistence, and iOS
packaging evidence for the optional daily-target loop. This pass does not claim
a physical-device, manual VoiceOver, signed archive, TestFlight, or App Store
check.

## Product loop and recovery

- A goal target can be suggested from its remaining pace, edited, removed, or
  skipped. A task can independently receive one session-count target for the
  current study day. Blank, fractional, duplicate, out-of-range, and over-cap
  entries remain in the form with a named inline error instead of being
  silently rewritten.
- Goal actuals derive from the signed goal-credit ledger. Task actuals derive
  from completed linked session records. The Focus strip can arm a goal or
  select a task, and the debrief echoes every goal or task target touched by
  the completed session.
- Reload tests preserve goal and task targets. An injected localStorage write
  failure keeps the live target and prior durable bytes intact, exposes the
  app recovery notice, and persists successfully after retry.
- Editing below recorded actual soft-clamps to the recorded amount. Removing a
  target does not remove recorded work. Prior unfinished targets use neutral
  copy that states the planned/actual pair and says the recorded amount is real
  progress; no user-facing target string contains `behind`, `failed`, or
  `missed!`.
- The weekly line follows the later PLAN 10.6 guard: it compares the prior week
  only after at least three distinct target days and three completed sessions.
  Tests cover both guards, planned and derived-actual sums, and carried targets.

## Automated evidence

- Full Vitest suite: 64 files, 626 tests passed.
- Coverage includes strict parsing, goal/task entry, cancel, edit, removal,
  reload, persistence recovery, linked crediting, Focus selection, debrief
  echoes, prior-day neutral copy, and the guarded weekly calibration.
- Production web build: passed; 102 modules transformed and the app-shell
  service worker was generated.
- Capacitor iOS sync: passed with the production web bundle copied into the app.
- Code-signing-free iOS Simulator build: passed for `App` and
  `BloomLiveActivityExtension`; Swift Package Manager resolved Capacitor 7.6.8.

## Hidden-browser evidence

Safari was not opened. The Vite server ran in the background with browser
auto-open disabled, and the in-app Chromium browser remained hidden.

- Deterministic fixture: `/fixtures/daily-target.html`; supported query states
  are `empty`, `active`, `entry`, and `error`, with `theme=night` for night mode.
- Small phone, 320 × 568 CSS px: the empty state omitted the Today card; active
  and complete goal rows plus a task row rendered together; body and screen had
  zero horizontal overflow. All inputs, save/remove actions, and plan buttons
  measured 44 px high.
- Opening the entry form scrolls it above the tab bar. At a reduced 320 × 360
  CSS-px height representing an open virtual keyboard, both inputs and both
  actions stayed between y=41 and y=137, above the navigation at y=288, with
  zero horizontal overflow.
- The error fixture announced `Choose a whole number from 1 to 7.` through a
  named `role=alert`; the amount field retained `aria-invalid=true` and its
  `aria-describedby` link.
- Wide viewport, night theme, 1024 × 768 CSS px: the heading, Today card, and
  goal list shared the same centered 560 px column at x=232…792. Controls
  remained 44 px high and there was no horizontal overflow.
- A fresh hidden-browser session reported no console warnings or errors.
