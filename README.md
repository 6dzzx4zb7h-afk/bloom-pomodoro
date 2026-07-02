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

## What's implemented

- **Onboarding:** first run asks the user's name; editable later in Settings.
- **Focus screen:** Focus/Short/Long tabs with a sliding pill, an SVG progress ring that
  depletes as time passes, the chosen pixel-pal companion, timer readout, reset/play-pause/skip,
  and a "now focusing on" chip with session dots.
- **Timer logic:** default focus 25:00 / short 5:00 / long 15:00 (all adjustable in Settings).
  Play/pause, reset, skip. On completion: chime + celebrate ~3.6s, increment session count
  (focus only), then advance (every 4th focus → long, else short; break → focus). Optional
  **auto-start** chains the next timer automatically.
- **Wall-clock accuracy:** the run stores an `endsAt` timestamp and recomputes remaining from
  `Date.now()`, so it stays accurate when the tab is backgrounded.
- **Settings:** name, focus/short/long durations, sound toggle, auto-start toggle.
- **Tasks screen:** per-task pomodoro goals ("cherries"); tap a task to focus it, and the
  active task earns credit + auto-checks itself when the goal is reached. Add/remove tasks.
- **Collection screen:** six animal friends unlock at total-session thresholds
  (0/5/12/25/40/60); tap an unlocked friend to bring them along on the focus ring.
- **Persistence:** everything (name, settings, streak, tasks, friends, sessions) persists to
  `localStorage` under a **versioned schema that migrates forward**, so future updates never
  wipe your data. The daily streak bumps when a focus session completes on a new day and
  resets if a day is missed.

## Project layout

```
src/
  engine/pixelpals.ts        # sprite data + Canvas animation engine
  data/friends.ts            # friend roster + unlock thresholds
  components/
    PixelPal.tsx             # React wrapper around the engine
    Onboarding.tsx           # first-run name gate
    SettingsSheet.tsx        # settings bottom sheet
    StatusBar.tsx            # live clock + battery
    TabBar.tsx               # bottom navigation
  screens/
    FocusScreen.tsx
    TasksScreen.tsx
    CollectionScreen.tsx
  store/useBloom.ts          # state, wall-clock timer, versioned persistence
  styles.css                 # design tokens + screen styles
```
