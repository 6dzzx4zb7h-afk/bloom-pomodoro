# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # vite dev server on :5173 (respects $PORT if set)
npm run build                # tsc -b && vite build — must stay green
npm test                     # vitest run (current unit suite)
npm run android:debug        # build the synced debug APK
npm run android:aab          # build, sign, and verify the Play release bundle
npm run android:check        # native unit tests + Android lint
npm run android:version -- 2 1.0.1 # increase Play versionCode for an update
npm run ios:sync             # build → cap sync ios
npm run ios:open             # open the generated Xcode project
npx vitest run src/insights/why.test.ts        # a single test file
npx vitest run -t "late drift"                 # a single test by name
npx vitest                                     # watch mode
```

The suite mixes pure-logic tests over the React-free modules (`src/store/*.ts` minus the hooks,
`src/insights/*.ts`) with reducer, hook, and component-level tests that render through
`@testing-library/react` — pure selectors cannot prove lifecycle behavior. A test opts into a DOM
per file with `// @vitest-environment jsdom`; `vitest.setup.ts` then gives it Web Storage, which
neither Node nor Vitest's jsdom bridge supplies on current Node.

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

[`ROADMAP.md`](ROADMAP.md) is the current list of what's left, why, and what was deliberately
dropped. It is short on purpose. Work normally: take the task the user actually asks for, at
whatever size it comes.

Bloom was previously built through a 93-step numbered plan, retired August 3, 2026 and archived at
[`docs/archive/plan-2026.md`](docs/archive/plan-2026.md). That archive is still the best explanation
of *why* Bloom is shaped the way it is — each step carries its evidence, quality citations, and
verification notes. Existing code comments reference it by step number (`PLAN 5.2`), and migrations
are annotated with the step that introduced them. **Keep those references intact** — they are the
link between the code and its reasoning. New code does not need a step number.

Evidence and quality have three sources: behavior-change mechanisms and user-facing scientific
claims trace to `docs/science.md`; all user-facing copy follows `docs/voice.md`; UX/UI,
accessibility, privacy, security, reliability, performance, and engineering quality follow
`docs/product-quality.md`. Ordinary product-quality and engineering work needs no behavioral
rationale — cite the applicable standard, test, measurement, or observed behavior instead.
**Never invent a behavioral rationale.**

**Four hard constraints apply to every change:**

1. **Local-first, no network.** Bloom makes no application-data requests and sends no user data,
   ever. No account, no ads, no tracking, no telemetry, no CDN, no remote fonts, no remote runtime
   assets. UI, guide content, fonts, audio, and every other runtime asset bundle into the repo, and
   the complete app works offline. Cross-device sync was considered and **dropped** — see
   `ROADMAP.md`. Adding any network capability is a product decision that needs explicit user
   direction first, not an implementation detail.
2. **Persisted-state changes bump `SCHEMA_VERSION` and append a forward migration.** Never wipe or
   orphan user data, or blindly overwrite one valid copy with another.
3. **Warm kawaii voice** — the pet suggests and encourages; it never guilts, shames, or moralizes.
4. **Respect the "Do NOT build" list** in `docs/science.md#do-not-build`: no punitive streaks, no
   dead-pet outcomes, no "scientifically optimal cadence" claims, no always-on nudging, no
   dopamine-detox framing, no ADHD-treatment claims.

If a change is blocked, report it rather than working around the constraints above.

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

Capacitor wraps the built bundle as both an Android app and an iOS app. The checked-in `android/`
directory is a Capacitor 8 shell for Play Store releases, and `ios/` is its App Store counterpart.
The application ID `dev.bloom.pomodoro` is permanent. Web changes reach the native apps only through
`npm run android:sync` / `npm run ios:sync`; release signing files stay ignored, must be backed up
together, and must never be regenerated for a published app. Follow `docs/android-release.md` for
every first release and update.

A finished timer has to reach someone who has put the phone down, and neither WebView keeps
running to deliver it. Two JS contracts in `src/native/` are therefore implemented by **both**
native shells and inert in the browser: `completionAlerts.ts` (`BloomCompletionAlert` — the
scheduled finish alert; UserNotifications on iOS, AlarmManager plus one notification on Android)
and `liveActivity.ts` (`BloomLiveActivity` — the live countdown; ActivityKit on iOS, an ongoing
chronometer notification on Android). Both mirror a reducer-owned deadline and report how the cue
was presented, so React never plays a second one; neither is ever a second timer authority.
AlarmKit (`iosAlarm.ts`) stays iOS-only. Copy that names a system surface goes through
`osName()`/`systemSettingsName()` in `src/content/platformWords.ts` — telling a Pixel owner to open
iOS Settings is advice they cannot follow.

On iOS, the bottom navigation and the Focus/Collection segmented rails are **native UIKit
`UITabBar` controls**, not web elements — UIKit owns the Liquid Glass material, the moving selection
lens, and the accessibility adaptations. A typed two-way bridge in `src/native/` syncs selection with
the React reducer, which stays authoritative. Browser and Android keep the accessible web bar. See
`docs/ios-liquid-glass.md`. The roadmap continues along this line: more native chrome, same single
React core.

These are current-system facts, not permanent prohibitions. Changing them is fine with a clear
reason, migration and rollback considerations, measured bundle/performance impact, and tests.

The codebase is layered by React-dependence, which is what makes it testable:

| Layer | Contains | Current boundary |
| --- | --- | --- |
| `src/engine/` | `pixelpals.ts` (Canvas 2D sprite engine), `audio.ts` (Web Audio), `breath.ts` | No React |
| `src/store/*.ts` | Types + pure helpers: `sessions`, `companion`, `streak`, `parking`, `ifThen`, `goals`, `ritual`, `sessionStats`, `dailyTarget`, `foundations`, `historyArchive`, `sessionRepair` | No React |
| `src/store/use*.ts` | `useBloom` (reducer, timer, persistence), `useCompanion` (check-in scheduling) | Hooks |
| `src/insights/` | Pure analysis over records: `why`, `weekly`, `cadence`, `triggers` | No React |
| `src/native/` | Typed iOS bridge adapters | No React |
| `src/components/`, `src/screens/` | Presentation | — |

### The session log is the spine

Every personalized behavioral insight or recommendation should explain itself *from the user's own
recorded data*, never from an unstated inference. Ordinary UI and engineering claims use the
evidence framework in `docs/product-quality.md`. The timer invariant is that `useBloom.ts` opens one
`OpenSession` when a work session starts and finalizes it into exactly one `SessionRecord`
(`completed` / `abandoned` / `interrupted`) when it ends; `sessions.ts` owns that model and its
500-record ring buffer. A session live when the app closed is swept into an `interrupted` record on
next boot. Records past the ring-buffer cap are compacted into `historyArchive.ts` rather than
silently dropped. `insights/` and `sessionStats.ts` read those records; they never write. Breaks are
never recorded. `src/store/useBloom.lifecycle.test.tsx` is the executable proof of these claims.

Note the two open-session slots: `openFocus` and `openFlow` are separate because a paused stopwatch
survives mode switches and can sit banked while focus sessions run.

### Current persistence layout (descriptive)

Two independent localStorage keys:

- `bloom-state` — one versioned blob (the current `SCHEMA_VERSION` is defined in
  `src/store/useBloom.ts`) holding settings, tasks, goals, streak, session records, plans, parking
  lot, cadence memory, day plans, foundations, and the history archive.
- `bloom-companion-v1` — the companion event log, deliberately separate so turning Companion Mode
  off hides the UI without touching the data.

Load path in `useBloom.ts`: read → import a `LEGACY_KEYS` blob if the current key is absent → step
through `MIGRATIONS` → `withDefaults()` merge. `MIGRATIONS[i]` upgrades version i to i+1; **append,
never rewrite past entries**. `withDefaults` merges against `DEFAULT_STATE` so fields added later
pick up defaults rather than wiping data. Bump the version even when a change is field-optional and
needs no transform (pass `blob` through with a comment saying why) — several existing migrations do
exactly that, so every shape change has a version.

Any storage change must migrate forward without data loss and add migration tests. The
schema-version and forward-migration invariant is hard.

### Timer

Wall-clock, not tick-counted: a run stores an `endsAt` epoch timestamp and recomputes `remaining`
from `Date.now()` on a 250ms interval, plus a `visibilitychange` catch-up, so a throttled background
tab stays accurate. `remaining` is intentionally *not* persisted — it's derived. Flow mode inverts
the meaning: `remaining` holds elapsed seconds and counts up, and it ends via `finishFlow`, never
`complete`. A pending return-question freezes completion until the user answers while the clock
keeps moving underneath.

## Verifying

`npm test`, `npm run build`, and no relevant console errors are the minimum engineering bar — no
single command proves product quality. Verify behavior in `npm run dev` (state lives in
localStorage, so devtools inspection of `bloom-state` helps check migrations and record-writing) and
apply the relevant `docs/product-quality.md` checks for accessibility, keyboard/touch/screen reader,
responsive and offline/failure states, performance, supported devices, and visual regression.

iOS and Android are the release targets, so device behavior matters more than browser behavior for
anything shipping: safe areas, the virtual keyboard, background/foreground transitions, and the
system accessibility settings (Reduced Motion, Increase Contrast, Dynamic Type).
