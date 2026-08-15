# Bloom testing and visual-baseline policy

This document is the operating contract for PLAN 8.21. It supplements `docs/qa.md`: automated
checks provide fast, deterministic regression evidence, while the release matrix still requires
real keyboard, screen-reader, browser, WebView, and device work where automation cannot prove the
behavior.

## Source of truth

`src/testing/surfaceInventory.ts` is the machine-checked inventory of current production screens,
shared overlays, interaction primitives, and visual-only owners. It records:

- representative states that need evidence;
- whether a component/integration test directly operates the surface or only indirect logic/static
  evidence exists;
- whether a deterministic visual fixture exists; and
- the exact remaining gap, without treating planned coverage as a pass.

`src/testing/surfaceInventory.test.ts` fails when an interactive production TSX owner is missing,
an owner/test/fixture path becomes stale, a fixture is unlisted, an ID is duplicated, or this
document's summary and inventory drift.

Coverage terms are deliberately narrow:

- **Direct** — a component or integration test renders and operates the surface.
- **Indirect** — only a parent, store, selector, or static source contract currently covers it.
- **Missing** — no meaningful automated evidence exists yet.
- **Visual fixture** — deterministic fixture code exists. It does not mean a pinned screenshot has
  passed; PLAN 8.21c and 8.21d own the runner and reviewed baselines.

<!-- surface-inventory-summary: entries=30 direct=30 indirect=0 missing=0 visual-fixture=6 visual-baseline=2 -->

## Current surface inventory

| ID | Production owner | Automated | Visual fixture status |
| --- | --- | --- | --- |
| `companion-check-in` | `CompanionPrompt.tsx` | direct | missing |
| `debrief` | `DebriefCard.tsx` | direct | missing |
| `debrief-goal-credit` | `DebriefGoalCredit.tsx` | direct | missing |
| `dialog-primitive` | `Dialog.tsx` | direct | missing |
| `foundations` | `FoundationsCard.tsx` | direct | daily-target fixture |
| `guide` | `GuideScreen.tsx` | direct | missing |
| `guide-suggestion` | `GuideSuggestion.tsx` | direct | missing |
| `if-then-planner` | `IfThenPlanner.tsx` | direct | missing |
| `kind-restart` | `KindRestart.tsx` | direct | missing |
| `onboarding` | `Onboarding.tsx` | direct | missing |
| `parking-lot` | `ParkingLot.tsx` | direct | missing |
| `resume-cue` | `ResumeCue.tsx` | direct | missing |
| `ritual` | `RitualCard.tsx` | direct | missing |
| `rollover-triage` | `RolloverTriageCard.tsx` | direct | missing |
| `session-repair` | `SessionRepairEditor.tsx` | direct | session-repair fixture |
| `settings` | `SettingsSheet.tsx` | direct | missing |
| `sheet-primitive` | `Sheet.tsx` | direct | missing |
| `storage-recovery` | `StorageRecoveryNotice.tsx` | direct | missing |
| `system-switch` | `SystemSwitch.tsx` | direct | missing |
| `tab-bar` | `TabBar.tsx` | direct | missing |
| `weekly-review` | `WeeklyReview.tsx` | direct | missing |
| `woop` | `WoopCard.tsx` | direct | missing |
| `collection` | `CollectionScreen.tsx` | direct | missing |
| `focus` | `FocusScreen.tsx` | direct | partial daily-target fixture |
| `goals` | `GoalsScreen.tsx` | direct | representative baseline; matrix open |
| `history` | `HistoryScreen.tsx` | direct | history-ledger fixture |
| `tasks` | `TasksScreen.tsx` | direct | representative baseline; matrix open |
| `day-sky` | `DaySky.tsx` | direct | missing |
| `night-sky` | `NightSky.tsx` | direct | missing |
| `pixel-pal` | `PixelPal.tsx` | direct | missing |

The inventory module, rather than this compact table, owns the state list, evidence file paths, and
remaining work for each row. PLAN 8.21b closed indirect automated coverage; 8.21c adds the pinned
visual runner and CI job; 8.21d populates and reviews the required fixture matrix and records manual
device evidence.

## Commands and layers

Use the smallest relevant layer while iterating, then run the repository gates before closing a
numbered step:

```bash
npx vitest run src/testing/surfaceInventory.test.ts
npm run visual:install
npm run visual:verify
npm run lint
npm test
npm run build
node scripts/local-only-audit.mjs
git diff --check
```

Component tests assert observable roles, names, states, focus, keyboard/pointer-equivalent actions,
announcements, validation, undo, and recovery. Static source checks may guard architecture or fixture
membership but never substitute for rendered behavior. Store/selector tests prove state rules, not
component semantics.

`src/testing/renderedAccessibility.ts` supplements role/name interaction assertions with a
deterministic jsdom audit for duplicate IDs, broken ARIA references, unnamed interactive controls,
invalid pressed-state values, and unnamed/non-modal dialogs. Its failures include the rule and a
compact element locator. It does not simulate an accessibility tree or replace screen-reader,
browser, WebView, or physical-device evidence.

## Pinned visual runner

PLAN 8.21c uses `@playwright/test` `1.62.0` and its Chromium `151.0.7922.34` revision `1234` on the
GitHub Actions `macos-26` arm64 image. Node `22.23.2` and npm `11.17.0` remain the repository-wide
toolchain pins. The runner fixes `en-US`, UTC, sRGB, CSS-pixel screenshot scale, device scale 1,
light system preference, reduced motion, one worker, and each manifest viewport. The fixture query
still owns Bloom's explicit day/night state. Fredoka and Nunito load only from `public/fonts` and the
test fails if either bundled face is unavailable or any request leaves the local fixture origin.

`visual-tests/cases.json` is the representative baseline manifest. Its committed PNG set must match
exactly: a missing file and an unlisted stale file both fail with filenames. `npm run visual:verify`
then runs strict zero-threshold pixel comparisons and a deliberate one-CSS-pixel probe. That probe
must fail and leave expected, actual, diff, trace, and error-context artifacts under
`visual-artifacts/one-pixel-proof`. The pull-request, main-push, and manual visual workflow uploads
the entire ignored `visual-artifacts` directory for 14 days and has no deployment or secret access.

Run `npm run visual:test:update` only on macOS 26 arm64 with the pinned browser installed, review
every changed PNG at native resolution, then rerun `npm run visual:verify`. The two 8.21c baselines
are a day 390×844 active Goals state and a night 320×568 empty Tasks state. They prove the runner;
they do not satisfy 8.21d's full surface/state/theme/viewport matrix.

## Deterministic fixture rules

Every visual fixture must:

1. use fixed dates, clocks, data, viewport inputs, and user settings;
2. bundle fonts, images, audio metadata, and all other runtime assets locally;
3. expose named query-controlled states instead of requiring setup clicks when a stable state can be
   rendered directly;
4. disable or deterministically freeze decorative motion without hiding meaningful state;
5. cover relevant day/night, reduced-motion, increased-contrast or forced-color, and expanded text
   spacing modes;
6. contain no account, server, telemetry, remote asset, or runtime network dependency; and
7. keep error, empty, dense-data, offline, modal, and non-modal states only where those states can
   genuinely occur.

Fixtures may share production components and test-only data builders. They must not fork production
markup or styles merely to make a screenshot stable.

## Baseline creation and review

PLAN 8.21c must pin the Node/npm versions already declared by the repository plus the browser engine,
OS image, fonts, locale, timezone, color profile, device scale, animation policy, and viewport. CI
must fail on a pixel diff or missing baseline; retrying until green is not an acceptance strategy.

Baseline updates are product changes and follow these rules:

- update only named surfaces and matrix cells affected by the reviewed change;
- attach before, after, and diff artifacts at native resolution;
- explain each changed region in the review, including antialiasing or font changes;
- never use a blanket update command to absorb unrelated output;
- never regenerate a known defect into the accepted baseline—track and fix it in an open numbered
  remediation step;
- rerun the affected interaction/accessibility test, not only the screenshot; and
- review light/night and narrow/wide companions together when shared layout or tokens changed.

Generated baselines are committed only after intentional review. CI artifacts are evidence for the
run, not the durable source of truth.

## Required visual matrix

Each applicable surface/state is rendered at:

- 320-pixel small-phone portrait;
- short-landscape;
- representative tablet;
- desktop;
- day and night themes; and
- reduced motion plus increased contrast/forced colors where supported.

Expanded text spacing, error, empty, dense-data, offline, modal, and non-modal cells are added where
the inventory lists those states. The harness may reduce combinatorial duplication only through an
explicit pairwise plan that still covers every requirement and is documented beside the runner.

## Manual evidence ledger

Automated results never become claims about VoiceOver, TalkBack, physical touch targets, safe areas,
virtual keyboards, audio, permissions, background execution, or WebView integration. PLAN 8.21d
records those cells with device/OS/browser, assistive technology, date, build identity, result, and
linked defect. An unavailable cell remains open; it is not converted to a pass from emulation.
