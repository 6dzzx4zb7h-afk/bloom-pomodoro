# Bloom — Roadmap

Bloom is a cozy pixel-pal focus timer that explains its suggestions from your own recorded sessions.
It runs entirely on your device.

**Status:** feature-complete for daily use. 675 tests green, linted, and gated by CI on Node 22 and 24. The web app, the Android wrapper, and
the native iOS wrapper all build and run. The iOS layer now carries native tabs and segmented rails,
a native Settings sheet, prominent finish alarms, and a Lock Screen / Dynamic Island Live Activity.

**Where it's going:** a real native app on **iOS and Android**, shipped publicly — not a web page in
a shell. The approach is to keep the single React core and deepen the native layer around it, the
way the native tab bar and segmented rails already do. Not a rewrite.

The **web build stays** as a demo and landing surface (https://bloom-pomodoro.pages.dev). Note that
it no longer auto-deploys: the Cloudflare Pages workflow went out with the legacy deployment tooling,
so that URL serves whatever was last published until a deploy path is deliberately restored. The web
build is not a release target, and it should never constrain a native decision.

The detailed history of how Bloom got here — 73 completed build steps with their evidence, citations
and verification notes — is archived in [`docs/archive/plan-2026.md`](docs/archive/plan-2026.md).
Step numbers below (`7.2`, `13.4`, …) cross-reference that archive.

---

## Now — make it stop feeling like a web app

The goal is for Bloom to read as a real app on iOS and Android.

**The four CSS tells are fixed** (August 18, 2026). A static pass on August 3 found
`-webkit-tap-highlight-color`, `user-select` and `-webkit-touch-callout` missing entirely, and
`touch-action` present once; all four were still missing when the work started. Every tap painted
the WebView's grey rectangle, long-pressing the readout or a task name raised the iOS selection
magnifier, long-pressing the pet canvas offered a Save Image sheet, and links, labels and the
radio/menuitem/option roles kept double-tap-to-zoom with its tap delay. Selection is restored for
`input`, `textarea` and `contenteditable`, plus a `.selectable` hook. Two of the four are invisible
in a desktop browser, so `src/nativeFeel.test.ts` guards them.

Already handled correctly, for reference: `overscroll-behavior` (7 uses, so no rubber-band
chaining), `safe-area-inset` (16 uses), `100vh`/`100dvh` fallback pairs, and `viewport-fit=cover`.

**What is left here needs a real phone.** `-webkit-touch-callout` cannot be confirmed in Chrome,
which does not implement it. Beyond CSS, judge on device: scroll momentum and deceleration,
keyboard avoidance, and whether screen transitions animate the way the platform's do. A simulator
will not show the tap highlight or the selection behaviors either.

## Then — before a public release

- ~~**Local-only privacy audit** (`7.2`)~~ — **done** (August 18, 2026), and now a standing test
  rather than a one-off grep: `src/localOnly.test.ts`. App source has no `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon` and no external origin; the HTML
  shell loads nothing remote; both typefaces are bundled; the service worker returns early on any
  cross-origin request. The built bundle's only `fetch` sites are Vite's same-origin module preload
  and the inert CapacitorHttp bridge, and its only external strings are font licence text and
  React's error URL. The guard was confirmed to fail when a violation is planted.
- ~~**Sky contrast and `prefers-contrast`** (`8.9`)~~ — **done**, and previously mis-filed under
  "deliberately dropped" with a warning that text over the animated sky washes out and the OS
  "Increase Contrast" setting is ignored. Neither is true: `styles.css` carries both
  `@media (prefers-contrast: more)` and `@media (forced-colors: active)`, essential Focus copy sits
  on stable theme-aware surfaces rather than the moving sky, and
  `src/responsiveAccessibility.test.ts` guards it. It was restored on August 14 and closed on
  August 17; the pinned visual baselines proving it live on the `agent/finish-bloom-usability`
  branch and reach main when PR #2 does.
- ~~**Finish the small-screen matrix** (`8.8`)~~ — **done in the browser** (August 18, 2026).
  Compact height (390×500) passes: Start sits below the fold but `.prestart-scroll` reaches it.
  Virtual keyboard (390×508) passes: the focused field stays visible and is 16px, so iOS will not
  zoom on focus. 200% zoom (a 195px viewport) found and fixed a real defect — the four mode tabs
  held their 44px floor against a 22px shell margin and the last one was laid out past the screen
  edge with nothing able to scroll to it. Safe areas are covered by 17 `env(safe-area-inset-*)`
  uses but Chrome cannot override `env()`, so that cell stays part of the device pass below.
- ~~**Add a linter and gate CI on it** (`8.16`)~~ — **done** (August 18, 2026). `npm run lint`
  runs ESLint; `.github/workflows/ci.yml` runs lint, tests and build on push and every PR, across
  a Node 22/24 matrix. It paid for itself twice on the first run: the matrix caught that `npm ci`
  could not install on Node 22 at all, and the linter caught two effects whose stale-async guard
  was dead code. Prettier is deliberately not included — it would reformat the whole codebase in
  one commit and catch nothing.
- ~~**Simplify the pre-start hierarchy** (`8.18`)~~ — **superseded by `13.17`**, which folded
  everything below the session target behind a single "a little more prep" row. `FocusScreen.tsx`
  now renders active task → session target → collapsed prep → controls, so Start no longer sits
  above the optional inputs and the described problem is gone. Verified in the running app.
- **Real-device smoke before store submission** (narrowed from `13.6`) — one pass on a physical
  iPhone and Android device covering launch, a full session, background/foreground, the completion
  cue, rotation and airplane mode. This replaces the original step's full iOS 26 + 27 accessibility
  matrix, which was blocked on Xcode 27 and is not a realistic gate.

## Next — native depth

The stated goal is for Bloom to feel like a real app, not a styled web view. Most of this section
has now shipped and is verified on device simulators:

- ~~**Native iOS Settings** (`13.4`)~~ — **shipped.** `BloomSettingsPlugin` presents a real UIKit
  sheet with a genuine `UIStepper`. The cost noted when this was planned is real and now live:
  there are two Settings implementations to keep in step.
- ~~**Live Activities** (`13.8`)~~ — **shipped**, and went further than scoped. Lock Screen and
  Dynamic Island countdown with pause/resume, App Intents, a native command channel back into the
  reducer, and AlarmKit prominent finish alarms. Local-only, no server.
- **Native presentations** (`13.5`) — **the remaining native-depth work.** Settings is native; the
  rest of the app still presents through the web `Dialog` component. Inventory every dialog, sheet
  and menu, then decide native-vs-web per surface rather than converting wholesale — each
  conversion adds a second implementation to maintain, as Settings just demonstrated.

## Deferred

- **Cross-screen visual regression baseline** (`8.21`) — pinned baselines across sizes, themes and
  accessibility preferences, wired into CI. Genuinely valuable before a public release, but large,
  and it never blocked anything. Revisit once the native surfaces stop moving.
- **Written QA checklist** (`7.5`) — worth having as a short device checklist rather than the
  browser matrix it was originally scoped as.

## Deliberately dropped

| Dropped | Was | Why |
| --- | --- | --- |
| **Cross-device sync** | `11.1`–`11.6` | Six steps, a backend service, an encrypted API, a merge engine and a two-device QA matrix — the only part of Bloom that would need a server. Data export/import (`9.4`) already moves your data between devices by hand. Losing this costs convenience, not capability. |
| **Animation performance trace** | `8.7` | Only the *measurement* is dropped. The shared scheduler, frame-rate caps, and static reduced-motion rendering all shipped and stay. The trace was unobtainable through the automation harness anyway. |
| **Deployed-web / installed-PWA offline proof** | `8.15` | Web and PWA are not release targets. The service worker already ships and only registers on production web, so it is inert for the iOS and Android builds. |
| **Full iOS 26/27 accessibility matrix** | `13.6` | Blocked on Xcode 27 and iOS 27 runtimes that aren't installed. Replaced by the narrower real-device smoke listed under *Now*. |

## Hard constraints

These outlived the plan and still bind every change. Full detail in [`CLAUDE.md`](CLAUDE.md).

1. **Local-first, no network.** No account, no telemetry, no ads, no CDN, no remote fonts or runtime
   assets. Everything bundles. With sync dropped, this is now absolute rather than "default off."
2. **Persisted-state changes bump `SCHEMA_VERSION` and append a forward migration.** Never wipe or
   orphan user data.
3. **Warm kawaii voice** — the pet suggests and encourages; it never guilts, shames or moralizes.
   See [`docs/voice.md`](docs/voice.md).
4. **Respect the do-not-build list** in [`docs/science.md`](docs/science.md#do-not-build): no
   punitive streaks, no dead-pet outcomes, no "scientifically optimal cadence" claims, no always-on
   nudging, no dopamine-detox framing, no ADHD-treatment claims.
