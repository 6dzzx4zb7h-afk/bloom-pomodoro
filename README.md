# Bloom 🌸 — a cozy pixel-pal pomodoro

A kawaii-cozy Pomodoro focus timer with a pixel-art animal companion that **works**
while the timer runs, **naps** on breaks, **bounces/blinks** when idle, and throws
**confetti** when a session completes.

**Live:** https://bloom-pomodoro.pages.dev

Built with **Vite + React + TypeScript** — the pixel-pal engine is Canvas 2D, and every
animal is procedurally drawn from sprite data (no runtime asset files).

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
  night sky.
- **Night sky:** an optional dark theme with a live animated backdrop — crescent moon, twinkling
  pixel stars, and the occasional meteor streaking down (Canvas 2D, `NightSky.tsx`).
- **Tasks screen:** per-task pomodoro goals ("cherries"); tap a task to focus it, and the
  active task earns credit + auto-checks itself when the goal is reached. Add/remove tasks.
- **Collection screen:** all six animal friends are **unlocked from the start**. Each **levels
  up** (Lv 1→20) as you complete focus sessions with them on duty — a per-friend XP bar shows
  progress to the next level. Tap a friend to bring them along on the focus ring.
- **Persistence:** everything (name, settings, streak, tasks, friends, sessions) persists to
  `localStorage` under a **versioned schema that migrates forward**, so future updates never
  wipe your data. The daily streak bumps when a focus session completes on a new day and
  resets if a day is missed.

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
    SettingsSheet.tsx        # settings bottom sheet (durations, ring, background sound)
    TabBar.tsx               # bottom navigation
  screens/
    FocusScreen.tsx
    TasksScreen.tsx
    CollectionScreen.tsx     # all friends, each with a level + XP bar
  store/useBloom.ts          # state, wall-clock timer, audio wiring, versioned persistence
  styles.css                 # design tokens + screen styles
scripts/gen-icons.mjs        # generates web + Android launcher icons (sharp)
android/                     # Capacitor native Android project
capacitor.config.ts          # Capacitor config (appId dev.bloom.pomodoro)
```
