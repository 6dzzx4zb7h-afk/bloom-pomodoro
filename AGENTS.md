# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # vite dev server on :5173 (respects $PORT if set)
npm run build                # tsc -b && vite build — must stay green
npm test                     # vitest run (current unit suite)
npx vitest run src/insights/why.test.ts        # a single test file
npx vitest run -t "late drift"                 # a single test by name
npx vitest                                     # watch mode
npm run deploy               # build + wrangler pages deploy (Cloudflare Pages)
npm run apk                  # build → cap sync → gradle assembleDebug (needs JDK 21 + Android SDK)
```

The current suite is mostly pure logic in React-free modules (`src/store/*.ts` minus the hooks,
`src/insights/*.ts`). Do not treat that as a testing policy: PLAN 7.4 adds reducer, hook, and
component-level lifecycle coverage for behavior that pure selectors cannot prove.

## How work is planned here

`PLAN.md` is the driving document: ~50 numbered steps across 9 phases, each sized for one session,
each with Goal / Science / Files / Done-when / Depends-on. Ticked checkboxes mark completed steps.
The checked boxes in Phases 0–5 record implementation attempts, not release proof. A July 2026
verification pass found timer/session lifecycle and UI-integration gaps in that work; the concrete
closures are tracked in Phases 7 and 8. Treat a phase as verified only when its current done-when
conditions and the cross-feature lifecycle suite pass. Phases 6 (Field Guide), 7
(verification/release), 8 (remediation), and 9 (data stewardship) remain open. Code comments
reference steps by number (`PLAN 5.2`) and migrations are annotated with the step that introduced
them — keep that convention.

Every feature traces to `docs/science.md` (a cited research report). **Five hard constraints apply
to every change**, per PLAN.md:

1. **Offline-first** — no network calls, no CDN/remote fonts. Everything bundles into the repo.
   (Sprites are procedurally drawn; audio is synthesized via Web Audio. No runtime assets.)
2. **Persisted-state changes bump `SCHEMA_VERSION` and append a forward migration.** Never wipe or
   orphan user data.
3. **Warm kawaii voice** — the pet suggests and encourages; it never guilts, shames, or moralizes.
4. **Respect the "Do NOT build" list** in `docs/science.md#do-not-build`: no punitive streaks, no
   dead-pet outcomes, no "scientifically optimal cadence" claims, no always-on nudging, no
   dopamine-detox framing, no ADHD-treatment claims.
5. Skeletons may ship placeholder copy marked `PLACEHOLDER_COPY`; final wording lands in copy-pass steps.

If a step is blocked or the code contradicts what PLAN.md assumes, stop and say so rather than improvising.

## User-facing copy

`docs/voice.md` is binding for every user-visible string: a 10-point checklist, 12 allowed/banned
phrase pairs, and a never-ship lexicon (fail, broke, lazy, willpower, optimal, proven, detox,
"you should", "we missed you"; lost/"back to zero"/"break the chain" about streaks; sad/sick/gone
about the pet). Grep new strings against that list before shipping. Evidence hedging must match the
report's confidence: "tends to help" for strong meta-analyses, "worth an experiment" for thin ones.

## Architecture

React 18 + TypeScript + Vite. **No router and no state library** — `App.tsx` swaps screens with a
`useState`, and all app state lives in one `useReducer` inside `src/store/useBloom.ts`. That hook
is passed down as a `bloom` prop; there is no context. Capacitor wraps the built bundle as an
Android app.

The codebase is layered by React-dependence, which is what makes it testable:

| Layer | Contains | Rule |
| --- | --- | --- |
| `src/engine/` | `pixelpals.ts` (Canvas 2D sprite engine), `audio.ts` (Web Audio), `breath.ts` | No React |
| `src/store/*.ts` | Types + pure helpers: `sessions`, `companion`, `streak`, `parking`, `ifThen`, `goals`, `ritual`, `sessionStats` | No React |
| `src/store/use*.ts` | `useBloom` (reducer, timer, persistence), `useCompanion` (check-in scheduling) | Hooks |
| `src/insights/` | Pure analysis over records: `why`, `weekly`, `cadence`, `triggers` | No React |
| `src/components/`, `src/screens/` | Presentation | — |

### The session log is the spine

Everything in Phases 2+ should explain itself *from the user's own recorded data*, never from an
unstated inference. The intended timer invariant is that `useBloom.ts` opens one `OpenSession` when
a work session starts and finalizes it into exactly one `SessionRecord` (`completed` / `abandoned`
/ `interrupted`) when it ends; `sessions.ts` owns that model and its 500-record ring buffer. A
session live when the app closed should be swept into an `interrupted` record on next boot.
`insights/` and `sessionStats.ts` read those records; they never write. Breaks are never recorded.
PLAN 7.4 is the executable proof for these claims; do not assume every start path currently obeys
them merely because Phase 1 is checked.

Note the two open-session slots: `openFocus` and `openFlow` are separate because a paused stopwatch
survives mode switches and can sit banked while focus sessions run.

### Persistence

Two independent localStorage keys:

- `bloom-state` — one versioned blob (`SCHEMA_VERSION`, currently 18) holding settings, tasks, goals,
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

### Timer

Wall-clock, not tick-counted: a run stores an `endsAt` epoch timestamp and recomputes `remaining`
from `Date.now()` on a 250ms interval, plus a `visibilitychange` catch-up, so a throttled background
tab stays accurate. `remaining` is intentionally *not* persisted — it's derived. Flow mode inverts
the meaning: `remaining` holds elapsed seconds and counts up, and it ends via `finishFlow`, never
`complete`. A pending return-question freezes completion until the user answers while the clock
keeps moving underneath.

## Verifying

`npm run build` green and no console errors is the bar for every step — the app must stay shippable.
Verify behavior in `npm run dev` (state lives in localStorage, so devtools inspection of `bloom-state`
is how migrations and record-writing get checked).
