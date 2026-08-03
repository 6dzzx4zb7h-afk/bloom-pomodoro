# Shared brief — Bloom iOS native-feel audit

Every `ios-*-audit` agent reads this first. It is the common ground so five specialists produce
findings that merge into one report instead of five overlapping ones.

## What Bloom is

A local-first pomodoro app: React 18 + TypeScript + Vite, wrapped by Capacitor 7 as an iOS app in
`ios/App`. There is no router and no state library — `src/App.tsx` swaps screens with `useState` and
all app state lives in one `useReducer` in `src/store/useBloom.ts`.

The iOS wrapper is not a second app. `ios/App/App/BloomBridgeViewController.swift` subclasses
`CAPBridgeViewController` and overlays real UIKit controls on the web view. React and `useBloom`
stay the single owner of product state, timer rules, persistence, and content; the bridge exchanges
only validated UI events and snapshots. `docs/ios-liquid-glass.md` records that boundary and the
per-surface native/keep-web decisions.

Read before auditing:

- `CLAUDE.md` — the five hard constraints, architecture boundaries, persistence rules.
- `docs/ios-liquid-glass.md` — the surface inventory, Apple guidance already cited, decisions made.
- `docs/product-quality.md` — the standard your quality claims must cite.
- `docs/voice.md` — binding for every user-visible string, including native ones.
- `PLAN.md` Phase 13 — what is already planned. 13.1–13.3, 13.7, 13.9, 13.10 are closed;
  13.4 (native Settings form), 13.5 (native presentations), 13.6 (release QA), and
  13.8 (ActivityKit Live Activity) are open.

## The five hard constraints — they bind native code too

1. **Local-first.** No account, no runtime network request for core use, no tracking, no CDN, no
   remote fonts or assets. A native capability that phones home (APNs push tokens, remote config,
   analytics) needs its own numbered plan step with explicit opt-in, an endpoint allowlist, and a
   data inventory. Prefer the local-only variant of every Apple API — local `UNNotificationRequest`
   over push, local `Activity.request` over `pushType: .token`.
2. **Persisted-state changes bump `SCHEMA_VERSION` and append a forward migration.** A new iOS
   setting (a Focus toggle, an alert preference) is persisted state. Never wipe or orphan data.
3. **Warm kawaii voice.** The pet suggests and encourages; it never guilts, shames, or moralizes.
   This applies to notification bodies, Live Activity text, permission-priming copy, and every
   native alert — those are the strings a user sees when they are *not* looking at the app, so
   they matter more, not less.
4. **Respect `docs/science.md#do-not-build`** — no punitive streaks, no dead-pet outcomes, no
   "scientifically optimal cadence" claims, no always-on nudging, no dopamine-detox framing, no
   ADHD-treatment claims. A native nudge is still a nudge.
5. Skeletons may ship copy marked `PLACEHOLDER_COPY`; final wording lands in copy-pass steps.

## Standing facts you do not need to re-derive

These were verified in the repo on 2026-08-03. Confirm anything you build a finding on, but do not
spend a budget rediscovering them:

- The Settings affordance is `.gear-btn` in `src/screens/FocusScreen.tsx` (~line 674) and its glyph
  is the literal HTML entity `&#9881;` (U+2699 GEAR). It is a text character, not an SF Symbol.
- There are 13 `role="switch"` controls: 12 in `src/components/SettingsSheet.tsx`, 1 in
  `src/components/FoundationsCard.tsx`. All are `<button className="switch">` with a `.knob` span,
  styled in `src/styles.css` (~line 1084). None is a `UISwitch`.
- SF Symbols *are* already used, but only for the five bottom tab items, in
  `BloomBridgeViewController.swift` (`timer`, `square.and.pencil`, `clock.arrow.circlepath`,
  `flag.fill`, `heart.fill`).
- Session completion calls `notify(title, body)` from `src/engine/audio.ts` via
  `src/store/useBloom.ts` (~line 3167). `notify` uses the **Web** `Notification` API. WKWebView
  inside a Capacitor app does not implement `window.Notification`, so on iOS this is a silent no-op.
  The chime is Web Audio, which iOS suspends when the app is backgrounded.
- `ios/App/App/Info.plist` declares no `UIBackgroundModes`, no `NSSupportsLiveActivities`, and no
  notification usage. There is no widget/App Intents extension target in `ios/App`.
- `capacitor.config.ts` lists only `@capacitor/core`, `/ios`, `/android`. No notification,
  haptics, or background plugin is installed.

## How to report

You are auditing, **not implementing**. Do not edit application or native source. Return findings as
markdown, ordered most-severe first, each one:

- **What a user sees** — the concrete iPhone-visible symptom, not the abstraction.
- **Evidence** — `file.ext:line` for repo claims; a linked Apple developer URL for platform claims.
  Never assert an Apple API's behavior from memory; fetch and cite it. If you cannot verify a
  platform claim, mark it `UNVERIFIED` and say what would settle it.
- **Severity** — `blocker` (ships broken or misleads the user) / `major` (clearly not native) /
  `minor` (polish).
- **Fix sketch** — enough for a plan step, including which of the five constraints it touches and
  whether it needs a `SCHEMA_VERSION` bump.
- **Plan placement** — an existing open Phase 13 step it belongs to, or a proposal for a new
  numbered step. Never propose rewriting a closed step; closed steps are immutable history.

Flag honestly when something is already correct. A finding that says "this is already native and
correct" is worth more than an invented one. Do not pad the list.
