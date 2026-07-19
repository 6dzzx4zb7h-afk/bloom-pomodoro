# Bloom 🌸 — a cozy pixel-pal pomodoro

A kawaii-cozy Pomodoro focus timer with a pixel-art animal companion that **works**
while the timer runs, **naps** on breaks, **bounces/blinks** when idle, and throws
**confetti** when a session completes.

**Live:** https://bloom-pomodoro.pages.dev

**Project standards:** behavior-change mechanisms and scientific claims use
[docs/science.md](docs/science.md); voice and copy use [docs/voice.md](docs/voice.md); UX/UI,
accessibility, privacy, security, reliability, performance, and engineering quality use
[docs/product-quality.md](docs/product-quality.md). Non-behavioral work may correctly state
`Science: n/a` instead of inventing a behavioral rationale.

**Roadmap:** optional account-based cross-device sync is the first planned network feature. Bloom
will remain local-only by default; no account is required, the complete core stays offline-capable,
and local-only sends no user data. Any later network feature needs its own plan step, explicit opt-in,
endpoint/data inventory, local-only regression, and pause/export/deletion semantics.

Built with **Vite + React + TypeScript** — the current pixel-pal engine is Canvas 2D, and every
animal is procedurally drawn from sprite data. Runtime assets such as fonts, images, and audio may
be bundled locally; remote runtime assets are prohibited.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview  # serve the production build locally
```

## Deploy

Hosted on **Cloudflare Pages** (project `bloom-pomodoro`).

- **Automatic:** every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
  which builds and deploys. Requires a repository secret `CLOUDFLARE_API_TOKEN` — a
  Cloudflare token with the *Cloudflare Pages → Edit* permission. The account ID is baked
  into the workflow. Until the secret exists, CI still builds; it just skips the deploy step.
- **Manual:** `npm run deploy` (builds, then `wrangler pages deploy dist`).

## Android app (APK)

Bloom is wrapped as a native Android app with **Capacitor** — the built web bundle is packaged
inside the APK, so it runs fully offline (timer, sounds, and friends all work with no network).

**Prerequisites:** JDK 21 (Capacitor 7 compiles against Java 21) and the Android SDK
(platform-tools, `platforms;android-35`, `build-tools;35.0.0`). Point `android/local.properties`
at your SDK with `sdk.dir=/path/to/Android/Sdk` (already set up on this machine). This machine's
default `java` is 17, so `android/gradle.properties` pins the build to a bundled JDK 21 via
`org.gradle.java.home` — update or remove that line if your JDK 21 lives elsewhere.

```bash
npm run icons     # regenerate app + launcher icons from scripts/gen-icons.mjs (only if art changes)
npm run apk       # build web → cap sync → gradle assembleDebug (via scripts/build-apk.mjs)
```

The installable debug APK lands at
`android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to your phone and open it to
install (enable "install from unknown sources" for your file manager/browser the first time).
Being a debug build, it's self-signed — perfect for personal sideloading; no Play Store account
needed.

To pick up web changes later, just re-run `npm run apk` (it rebuilds and re-syncs before packaging).

## What's implemented

- **Onboarding:** first run asks the user's name; editable later in Settings.
- **Focus screen:** Focus/Short/Long tabs with a sliding pill, an SVG progress ring that
  depletes as time passes, the chosen pixel-pal companion, timer readout, reset/play-pause/skip,
  and a "now focusing on" chip with session dots.
- **Timer logic:** default focus 25:00 / short 5:00 / long 15:00 (all adjustable in Settings).
  Play/pause, reset, skip. On completion: **ring** + celebrate ~3.6s, increment session count
  (focus only), then advance (every 4th focus → long, else short; break → focus). Optional
  **auto-start** chains the next timer automatically.
- **Sound (all synthesized live via Web Audio — no asset files, works offline):**
  - **Ring when done** — a warm rising chime at session end. Enabling it also asks for
    Notification permission so it can alert you when the app is backgrounded.
  - **Background sound** while a session runs: **No sound**, **Calm music** (soft pads +
    drifting bells), **Coffee shop** (room hum, murmur & clinks), or **White noise**. Tapping
    an option in Settings plays a short preview.
- **Wall-clock accuracy:** the run stores an `endsAt` timestamp and recomputes remaining from
  `Date.now()`, so it stays accurate when the tab is backgrounded.
- **Settings:** name, focus/short/long durations, ring toggle, background-sound picker, auto-start,
  night sky, flow timer, goals & deadlines, companion mode.
- **Companion Mode (opt-in):** the pet gently checks in during focus sessions ("still with me?"),
  notices tab-aways, and offers a two-tap drift triage (rabbit hole / interruption / urge /
  wandering / restlessness) with a matching micro-tip. Everything logs to a small local event
  store and feeds the **focus patterns** card on the Tasks screen.
- **Attention recipe:** a personal "how to enhance *your* attention" card built from the last
  4 weeks of companion data — session length tuned to where focus actually fades, golden/foggy
  hours of the day, a strategy matched to the dominant drift style, and a tab-away countermeasure.
  No two people get the same recipe, and it only speaks once it has enough signal.
- **Flow timer (opt-in):** a count-up stopwatch tab beside Focus/Short/Long for people who'd
  rather ride momentum than race a countdown. It survives reloads (a stopwatch keeps counting),
  pauses when you switch modes, and **finish (✓)** banks the elapsed time as pomodoro-equivalents
  ("blooms") — crediting sessions, streak, task cherries, and friend XP just like classic sessions.
- **Goals & deadlines (opt-in):** a planner tab for a whole semester — each goal is a deadline
  plus "how many parts" (lectures, chapters, problem sets) and how many are done, so work always
  points at an objective. Cards show progress and the **pace that lands the deadline** ("about 2
  a day / 4 a week"); suggestions go quiet for overdue or clearly unreachable goals instead of
  nagging.
- **Night sky:** an optional dark theme with a live animated backdrop — crescent moon, twinkling
  pixel stars, and the occasional meteor streaking down (Canvas 2D, `NightSky.tsx`).
- **Tasks screen:** per-task pomodoro goals ("cherries"); tap a task to focus it, and the
  active task earns credit + auto-checks itself when the goal is reached. Add/remove tasks.
- **Collection screen:** all six animal friends are **unlocked from the start**. Each **levels
  up** (Lv 1→20) as you complete focus sessions with them on duty — a per-friend XP bar shows
  progress to the next level. Tap a friend to bring them along on the focus ring.
- **Persistence:** everything (name, settings, streak, tasks, friends, sessions) persists to
  `localStorage` under a **versioned schema that migrates forward**, so future updates never
  wipe your data. The daily streak grows when a focus session completes on a new day and uses
  a gentle rest-day / come-back state instead of punitive loss messaging.

## Project layout

```
src/
  engine/
    pixelpals.ts             # sprite data + Canvas animation engine
    audio.ts                 # synthesized ambience + end-of-session ring (Web Audio)
  data/friends.ts            # friend roster + level/XP helpers
  components/
    PixelPal.tsx             # React wrapper around the engine
    Onboarding.tsx           # first-run name gate
    SettingsSheet.tsx        # settings bottom sheet (durations, ring, background sound, features)
    CompanionPrompt.tsx      # the pet's check-in speech bubble + drift triage
    TabBar.tsx               # bottom navigation (Goals tab appears when the planner is on)
  screens/
    FocusScreen.tsx          # countdown modes + the opt-in flow stopwatch
    TasksScreen.tsx          # tasks + focus patterns + the attention recipe
    GoalsScreen.tsx          # opt-in deadline planner with pace insights
    CollectionScreen.tsx     # all friends, each with a level + XP bar
  store/useBloom.ts          # state, wall-clock timer, audio wiring, versioned persistence
  store/companion.ts         # companion event log, insights + attention-recipe math
  store/useCompanion.ts      # live check-in scheduling / tab-away detection
  store/goals.ts             # goal types + deadline pace math
  styles.css                 # design tokens + screen styles
scripts/gen-icons.mjs        # generates web + Android launcher icons (sharp)
android/                     # Capacitor native Android project
capacitor.config.ts          # Capacitor config (appId dev.bloom.pomodoro)
```
