# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # vite dev server on :5173 (respects $PORT if set)
npm run build                # tsc -b && vite build — must stay green
npm test                     # vitest run (current unit suite)
npm run android:debug        # build the synced debug APK
npm run android:aab          # build, sign, and verify the Play release bundle
npm run android:check        # native unit tests + Android lint
npm run android:version -- 2 1.0.1 # increase Play versionCode for an update
npx vitest run src/insights/why.test.ts        # a single test file
npx vitest run -t "late drift"                 # a single test by name
npx vitest                                     # watch mode
```

The current suite is mostly pure logic in React-free modules (`src/store/*.ts` minus the hooks,
`src/insights/*.ts`). Do not treat that as a testing policy: PLAN 7.4 adds reducer, hook, and
component-level lifecycle coverage for behavior that pure selectors cannot prove.

### Dependency toolchain changes

Generate and validate the lockfile with the exact Node/npm versions declared by the repository.
Before committing any dependency or lockfile change, run a **clean `npm ci` in a temporary/pristine
checkout with those versions**,
then `npm test` and `npm run build`. An existing `node_modules`, `npm install`, or a successful
`npm ci` under another npm version does not prove that the declared toolchain will accept the
lockfile. Never hand-edit `package-lock.json`; inspect its diff for unexpected dependency movement
and platform-package loss. If the declared toolchain cannot be reproduced, stop and report the
mismatch rather than pushing the dependency change.

## How work is planned here

`PLAN.md` is the driving document: ~80 numbered steps across 12 phases. Each implementation run does
exactly one numbered step; split an oversized step in `PLAN.md` before implementation. Unchecked
steps define Goal / Files / Done-when / Depends-on plus behavioral evidence where applicable or
`Science: n/a` and the relevant quality/engineering authority. Ticked checkboxes mark completed steps.
The checked boxes in Phases 0–5 record implementation attempts, not release proof. A July 2026
verification pass found timer/session lifecycle and UI-integration gaps in that work; the concrete
closures are tracked in Phases 7 and 8. Treat a phase as verified only when its current done-when
conditions and the cross-feature lifecycle suite pass. Phases 7 (verification/release), 8
(remediation), 9 (data stewardship), 10 (day plans & foundational habits), and 11 (optional
cross-device sync) remain open. Completed steps are immutable history: apply the product-quality
framework prospectively and record older gaps in unchecked remediation steps. Code comments
reference steps by number (`PLAN 5.2`) and migrations are annotated with the step that introduced
them — keep that convention.

Evidence and quality have three distinct sources: behavior-change mechanisms and user-facing
scientific claims trace to `docs/science.md`; all user-facing copy follows `docs/voice.md`; UX/UI,
accessibility, privacy, security, reliability, performance, and engineering quality follow
`docs/product-quality.md`. Ordinary product-quality and engineering work may say `Science: n/a` and
cite the applicable standard, test, measurement, or observed behavior. Never invent a behavioral
rationale. **Five hard constraints apply to every change**, per PLAN.md:

1. **Local-first, optional network features** — no account is required; local-only is the default, makes zero
   application-data requests and sends no user data after the app shell loads, and keeps the
   complete core app usable offline. UI, guide content, fonts, audio, and other runtime assets
   bundle into the repo. Never add ads, tracking, default behavioral telemetry, CDNs, remote fonts,
   or remote runtime assets. Every optional network capability needs its own numbered plan step,
   explicit feature-specific opt-in, documented endpoint allowlist and data inventory, local-only
   regression coverage, and precise pause, export, and deletion semantics. Optional diagnostics are
   separate: off by default, explicitly enabled, minimized, redacted, disclosed before enabling,
   and contain no behavioral analytics by default. Pausing a feature or signing out keeps a complete
   local copy unless the user explicitly removes it from that device.
2. **Persisted-state changes bump `SCHEMA_VERSION` and append a forward migration.** Never wipe or
   orphan user data, or blindly overwrite one valid copy with another.
3. **Warm kawaii voice** — the pet suggests and encourages; it never guilts, shames, or moralizes.
4. **Respect the "Do NOT build" list** in `docs/science.md#do-not-build`: no punitive streaks, no
   dead-pet outcomes, no "scientifically optimal cadence" claims, no always-on nudging, no
   dopamine-detox framing, no ADHD-treatment claims.
5. Skeletons may ship placeholder copy marked `PLACEHOLDER_COPY`; final wording lands in copy-pass steps.

If a step is blocked, report it. Minor implementation differences that preserve an unchecked step's
goal and scope may be reconciled by updating that step's assumptions, Files, and tests. Stop for
user direction when the difference materially changes product behavior, privacy, persisted data,
security, or the numbered step's scope. Never rewrite completed-step history.

## User-facing copy

`docs/voice.md` is binding for every user-visible string: a 10-point checklist, 13 allowed/banned
phrase pairs, and a never-ship lexicon (fail, broke, lazy, willpower, optimal, proven, detox,
"you should", "we missed you"; lost/"back to zero"/"break the chain" about streaks; sad/sick/gone
about the pet). Grep new strings against that list before shipping. Evidence hedging must match the
report's confidence: "tends to help" for strong meta-analyses, "worth an experiment" for thin ones.

## Current architecture (descriptive)

React 18 + TypeScript + Vite. There is currently no router or state library: `App.tsx` swaps screens with a
`useState`, and all app state lives in one `useReducer` inside `src/store/useBloom.ts`. That hook
is passed down as a `bloom` prop; there is no context.

The checked-in `android/` directory is a Capacitor 8 shell for Play Store releases. The application
ID `dev.bloom.pomodoro` is permanent. Web changes reach Android only through `npm run android:sync`;
release signing files stay ignored, must be backed up together, and must never be regenerated for a
published app. Follow `docs/android-release.md` for every first release and update.

These are current-system facts, not permanent prohibitions. A future numbered step may change them
with a clear reason, migration and rollback considerations, measured bundle/performance impact,
tests, and an ADR for a material decision. Preserve the current boundaries when the active step does
not authorize an architecture change.

The codebase is layered by React-dependence, which is what makes it testable:

| Layer | Contains | Current boundary |
| --- | --- | --- |
| `src/engine/` | `pixelpals.ts` (Canvas 2D sprite engine), `audio.ts` (Web Audio), `breath.ts` | No React |
| `src/store/*.ts` | Types + pure helpers: `sessions`, `companion`, `streak`, `parking`, `ifThen`, `goals`, `ritual`, `sessionStats` | No React |
| `src/store/use*.ts` | `useBloom` (reducer, timer, persistence), `useCompanion` (check-in scheduling) | Hooks |
| `src/insights/` | Pure analysis over records: `why`, `weekly`, `cadence`, `triggers` | No React |
| `src/components/`, `src/screens/` | Presentation | — |

### The session log is the spine

Every personalized behavioral insight or recommendation should explain itself *from the user's own
recorded data*, never from an unstated inference. Ordinary UI and engineering claims use the
evidence framework in `docs/product-quality.md`. The intended timer invariant is that `useBloom.ts` opens one `OpenSession` when
a work session starts and finalizes it into exactly one `SessionRecord` (`completed` / `abandoned`
/ `interrupted`) when it ends; `sessions.ts` owns that model and its 500-record ring buffer. A
session live when the app closed should be swept into an `interrupted` record on next boot.
`insights/` and `sessionStats.ts` read those records; they never write. Breaks are never recorded.
PLAN 7.4 is the executable proof for these claims; do not assume every start path currently obeys
them merely because Phase 1 is checked.

Note the two open-session slots: `openFocus` and `openFlow` are separate because a paused stopwatch
survives mode switches and can sit banked while focus sessions run.

### Current persistence layout (descriptive)

Two independent localStorage keys:

- `bloom-state` — one versioned blob (the current `SCHEMA_VERSION` is defined in
  `src/store/useBloom.ts`) holding settings, tasks, goals,
  streak, session records, plans, parking lot, cadence memory.
- `bloom-companion-v1` — the companion event log, deliberately separate so turning Companion Mode off
  hides the UI without touching the data.

Load path in `useBloom.ts`: read → import a `LEGACY_KEYS` blob if the current key is absent → step
through `MIGRATIONS` → `withDefaults()` merge. `MIGRATIONS[i]` upgrades version i to i+1; **append,
never rewrite past entries**. `withDefaults` merges against `DEFAULT_STATE` so fields added later
pick up defaults rather than wiping data. Validation is currently incomplete, and corrupt-current
key fallback plus full-slice normalization are explicitly tracked in PLAN 8.11; do not paper over
those cases with a cast or a silent catch. Bump the version even when a change is field-optional and
needs no transform (pass `blob` through with a comment saying why) — several existing migrations do
exactly that, so every shape change has a version.

A planned storage architecture may change, but it must migrate forward without data loss, cover
rollback and compatibility, add migration/integration tests, and use an ADR when the decision is
material. The schema-version and forward-migration invariant remains hard.

### Local-first and optional network features

Until Phase 11's networking implementation lands, Bloom has no runtime auth or sync traffic.
Phase 11 must preserve local storage as a complete, durable working copy: opening the app,
starting and finishing sessions,
reading the Guide, exporting/importing data, and every other core path must work without an account
or network. Nothing leaves the device before explicit opt-in. Sync code must be isolated behind a
documented endpoint allowlist, queue safely while offline, merge without blind last-write-wins data
loss, and never make remote state the only copy. Pausing sync, signing out, deleting the cloud copy,
and deleting local data are distinct actions with precise confirmation copy.
Phase 11 sync is the first planned optional network capability, not a blanket authorization or a
limit on future feature categories. Any later networked capability must meet the numbered-step,
feature-specific consent, allowlist, data-inventory, local-only regression, pause, export, and
deletion requirements above.

### Timer

Wall-clock, not tick-counted: a run stores an `endsAt` epoch timestamp and recomputes `remaining`
from `Date.now()` on a 250ms interval, plus a `visibilitychange` catch-up, so a throttled background
tab stays accurate. `remaining` is intentionally *not* persisted — it's derived. Flow mode inverts
the meaning: `remaining` holds elapsed seconds and counts up, and it ends via `finishFlow`, never
`complete`. A pending return-question freezes completion until the user answers while the clock
keeps moving underneath.

## Verifying

`npm test`, `npm run build`, and no relevant console errors are the minimum engineering bar — no
single command proves product quality. Verify behavior in `npm run dev` (state lives in localStorage,
so devtools inspection of `bloom-state` helps check migrations and record-writing) and apply the
relevant `docs/product-quality.md` checks for accessibility, keyboard/touch/screen reader,
responsive and offline/failure states, performance, supported devices, and visual regression.
