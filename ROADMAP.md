# Bloom — Roadmap

Bloom is a cozy pixel-pal focus timer that explains its suggestions from your own recorded sessions.
It runs entirely on your device.

**Status:** feature-complete for daily use. 508 tests green. The web app, the Android wrapper, and
the native iOS wrapper all build and run.

**Where it's going:** a real native app on **iOS and Android**, shipped publicly — not a web page in
a shell. The approach is to keep the single React core and deepen the native layer around it, the
way the native tab bar and segmented rails already do. Not a rewrite.

The **web build stays** as a demo and landing surface (https://bloom-pomodoro.pages.dev), auto-deployed
from `main`. It is not a release target, and it should never constrain a native decision.

The detailed history of how Bloom got here — 73 completed build steps with their evidence, citations
and verification notes — is archived in [`docs/archive/plan-2026.md`](docs/archive/plan-2026.md).
Step numbers below (`7.2`, `13.4`, …) cross-reference that archive.

---

## Now — make it stop feeling like a web app

The goal is for Bloom to read as a real app on iOS and Android. Before rewriting anything, fix the
concrete tells — these are what people actually perceive as "web app", and they are cheap. A static
pass over `src/styles.css` and `index.html` on August 3, 2026 found:

- **No `-webkit-tap-highlight-color` anywhere.** Every tap in the WebView paints the default
  translucent grey rectangle over the target. This is the single most recognizable web-app tell and
  it fires on every button in the app.
- **No `user-select: none` anywhere.** Long-pressing the timer readout, a label, or a task name
  starts a text selection and raises the iOS selection magnifier and Copy/Look Up bar. Native apps
  don't do this outside text fields.
- **No `-webkit-touch-callout: none`.** Long-pressing the pet canvas or any image offers the
  "Save Image / Copy" sheet.
- **`touch-action: manipulation` appears once** (line 4742). Everywhere else, controls can still
  carry double-tap-to-zoom and its associated tap delay.

Already handled correctly, for reference: `overscroll-behavior` (7 uses, so no rubber-band chaining),
`safe-area-inset` (16 uses), `100vh`/`100dvh` fallback pairs, and `viewport-fit=cover`.

Beyond CSS, judge on device: scroll momentum and deceleration, keyboard avoidance, and whether
screen transitions animate the way the platform's do. Verify on a real phone, not a simulator —
the tap highlight and selection behaviors are exactly what a desktop browser will not show you.

## Then — before a public release

- **Local-only privacy audit** (`7.2`) — grep source and built bundles for `fetch`,
  `XMLHttpRequest`, `WebSocket` and external URLs; smoke a production build and confirm zero
  application-data requests. This proves the app's core promise. Dropping sync makes it a
  much smaller job than originally scoped: there is now no code path that is *supposed* to
  reach the network, so any hit is a defect.
- **Finish the small-screen matrix** (`8.8`) — 44 px targets, 16 px inputs and ring geometry are
  done and measured at 320×568. Remaining: compact-height, safe-area, 200% zoom and
  virtual-keyboard cells. Safe areas and the keyboard matter more on real phones than they did
  in the browser.
- **Add a linter and gate CI on it** (`8.16`) — the repo has no ESLint or Prettier config at all.
  Also collapse the duplicated npm version pin (workflow literal vs `package.json`
  `packageManager`) to one source of truth so they cannot drift.
- **Simplify the pre-start hierarchy** (`8.18`) — Start currently sits *above* the optional
  if-then, target and ritual inputs, so the screen asks for preparation after offering the commit
  action. One compact stack: active task → optional target → optional ritual → Start.
- **Real-device smoke before store submission** (narrowed from `13.6`) — one pass on a physical
  iPhone and Android device covering launch, a full session, background/foreground, the completion
  cue, rotation and airplane mode. This replaces the original step's full iOS 26 + 27 accessibility
  matrix, which was blocked on Xcode 27 and is not a realistic gate.

## Next — native depth

The stated goal is for Bloom to feel like a real app, not a styled web view. The native tab bar and
segmented rails (`13.2`, `13.3`) already do this and are verified on device simulators. Continuing
along that line:

- **Native iOS Settings** (`13.4`) — a real UIKit form with `UISwitch`, steppers and pickers.
  Note the cost: this creates a second Settings implementation to maintain alongside the web one.
- **Native presentations** (`13.5`) — inventory every dialog, sheet and menu, then decide
  native-vs-web per surface rather than converting wholesale.
- **Live Activities** (`13.8`) — Lock Screen and Dynamic Island countdown for the running session.
  Local-only, no server, and probably the single highest "this is a real app" signal available.

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
| **Sky contrast and `prefers-contrast`** | `8.9` | Dropped by choice. ⚠️ Worth revisiting before a public launch: some text sits directly on the moving sky and washes out as clouds pass, and the OS "Increase Contrast" setting is currently ignored entirely. On iOS and Android that setting is a system accessibility promise, so this is the one dropped item that works against the native-feel goal. |
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
