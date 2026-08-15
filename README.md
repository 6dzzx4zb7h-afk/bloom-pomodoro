# Bloom 🌸 — a cozy pixel-pal pomodoro

A kawaii-cozy Pomodoro focus timer with a pixel-art animal companion that **works**
while the timer runs, **naps** on breaks, **bounces/blinks** when idle, and throws
**confetti** when a session completes.

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

## Android

Bloom's Android app is a Capacitor 8 shell around the same bundled, offline-capable web app. Its
permanent Play identity is `dev.bloom.pomodoro`; do not change that ID after the first Play upload.

```bash
npm run android:debug              # sync and build a debug APK
npm run android:key                # one time only: create the ignored upload key
npm run android:aab                # sync, build, sign, and verify the release AAB
npm run android:check              # native unit tests and Android lint
npm run android:version -- 2 1.0.1 # future release: increase code and set display version
```

The Play bundle is written to `android/app/build/outputs/bundle/release/app-release.aab`. Upload
credentials are deliberately ignored by Git. Back up `android/app/upload-keystore.jks` and
`android/keystore.properties` together in a secure password manager or encrypted vault before the
first upload. See [docs/android-release.md](docs/android-release.md) for the first release, Play
Console checklist, and repeatable update procedure.

## iOS app (Xcode)

Bloom also ships as a Capacitor iOS project. It uses the same React/store implementation as the
web and Android builds, and the production web bundle is copied into the app so the core remains
local-first and offline-capable at runtime.

**Prerequisites:** macOS with Xcode. The project uses Swift Package Manager, so Xcode resolves the
Capacitor package on the first native build; this build-time download does not add a runtime network
feature to Bloom. A Simulator build does not need an Apple Developer account. Running on a physical
device needs an Xcode signing team, and App Store distribution needs its own signing and release work.

```bash
npm run ios:sync   # build web -> copy the bundle -> update the native project
npm run ios:open   # open ios/App/App.xcodeproj in Xcode
```

In Xcode, choose the **App** scheme and an iPhone or iPad Simulator, then press Run. Re-run
`npm run ios:sync` whenever the web app changes. `npm run icons` refreshes the web, Android, and iOS
icons and the native launch image when the source art changes.

On current iOS releases, Bloom's bottom navigation is a real UIKit `UITabBar`: iOS renders the
floating Liquid Glass rail and moving selected-item lens, while React remains the source of truth
for screens and timer guards. It has no CSS glass imitation. The native-control decisions and
remaining conversion roadmap are documented in
[docs/ios-liquid-glass.md](docs/ios-liquid-glass.md).

The **App** scheme also embeds `BloomLiveActivityExtension`. On iOS 16.2 or later, starting Focus or
Tiny can show a local Live Activity on the Lock Screen and supported Dynamic Island devices. The
extension receives only the timer mode, an opaque local session identifier, and clock state; it
does not receive task text or contact a Bloom server. If physical-device signing asks for attention,
select the `BloomLiveActivityExtension` target in Xcode and choose the same Team and automatic
signing used by the **App** target.

The checked-in project has been compiled as a code-signing-free generic iOS Simulator build. App
Store submission and real-device accessibility, notification, safe-area, background-timer, and
airplane-mode QA remain separate release work.

## What's implemented

- **Onboarding:** first run asks the user's name; editable later in Settings.
- **Focus screen:** Focus/Short/Long tabs with a sliding pill, an SVG progress ring that
  depletes as time passes, the chosen pixel-pal companion, timer readout, reset/play-pause/skip,
  and a "now focusing on" chip with session dots.
- **Timer logic:** default focus 25:00 / short 5:00 / long 15:00 (all adjustable in Settings).
  Play/pause, reset, skip. On completion: **ring** + celebrate ~3.6s, increment session count
  (focus only), then advance (every 4th focus → long, else short; break → focus). Optional
  **auto-start** chains the next timer automatically.
- **Completion cue (local and offline):** **Ring when done** plays a warm rising chime at session
  end. In the iOS app, a single native local notification mirrors the active countdown after an
  in-context permission choice, so iOS can deliver the bundled Bloom cue while the app is
  backgrounded or the phone is locked. Foreground Bloom keeps the synthesized Web Audio cue and
  suppresses the duplicate system presentation. Ordinary iOS Silent Mode, Focus, and notification
  settings still apply; there is no server or APNs path. Web builds use the browser Notification API
  when it is available. Bloom has no ambient audio, soundscapes, or audio previews.
- **Wall-clock accuracy:** the run stores an `endsAt` timestamp and recomputes remaining from
  `Date.now()`, so it stays accurate when the tab is backgrounded.
- **iOS Live Activity (local and offline):** Focus and Tiny mirror their reducer-owned deadline or
  paused remaining time into one ActivityKit presentation. The system advances the visible clock;
  pause/resume updates the same Activity, terminal timer actions remove it, and swiping it away keeps
  it away for that session. Breaks and the open-ended Flow stopwatch do not create one.
- **Settings:** grouped into You (name, chronotype), Timer lengths (cadence ladder + durations),
  Sessions (auto-start, flow timer, environment reset, ring when done), Your day (day rollover,
  daily foundations, goals & deadlines), Companion, Appearance (night sky), and Your data
  (export/import, weekly review, focus history).
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
    audio.ts                 # synthesized end-of-session chime + notification
  data/friends.ts            # friend roster + level/XP helpers
  components/
    PixelPal.tsx             # React wrapper around the engine
    Onboarding.tsx           # first-run name gate
    SettingsSheet.tsx        # settings bottom sheet (seven collapsible groups)
    CompanionPrompt.tsx      # the pet's check-in speech bubble + drift triage
    TabBar.tsx               # bottom navigation (Goals tab appears when the planner is on)
  screens/
    FocusScreen.tsx          # countdown modes + the opt-in flow stopwatch
    TasksScreen.tsx          # tasks + focus patterns + the attention recipe
    GoalsScreen.tsx          # opt-in deadline planner with pace insights
    CollectionScreen.tsx     # all friends, each with a level + XP bar
  store/useBloom.ts          # state, wall-clock timer, versioned persistence
  store/companion.ts         # companion event log, insights + attention-recipe math
  store/useCompanion.ts      # live check-in scheduling / tab-away detection
  store/goals.ts             # goal types + deadline pace math
  styles.css                 # design tokens + screen styles
scripts/gen-icons.mjs        # generates web + Android/iOS native art (sharp)
scripts/android-*.mjs        # native environment, signing, version, build, and verification tools
android/                     # Capacitor Android Studio project (API 24–36)
ios/                         # Capacitor native iOS project (Swift Package Manager)
capacitor.config.ts          # immutable app identity and bundled-web configuration
```
