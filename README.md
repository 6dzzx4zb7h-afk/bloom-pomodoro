# Bloom 🌸

Bloom is a cozy focus timer with pixel-art animal companions. It runs on iOS and Android through
Capacitor, with a shared React + TypeScript app and a browser build for local development.

## Current features

- **Timers:** adjustable Focus, short and long breaks, 2- or 5-minute Tiny Start sessions, and an
  optional Flow stopwatch. Includes pause, resume, reset, skip, and optional auto-start.
- **Tasks and planning:** task focus targets, session intentions, optional goals and deadlines,
  daily targets, and daily foundations.
- **History:** session records, task completions, weekly reviews, and corrections to recorded work.
- **Pixel companions:** six selectable friends with levels and XP, matching native app icons, and
  animated day and night themes.
- **Optional focus support:** Companion check-ins, focus-pattern insights, distraction parking,
  preparation prompts, and a bundled Field Guide.
- **Sound:** a completion chime and optional rain, waves, or hush during work sessions. Ambient
  playback currently runs while the app is active; continuous background audio is not implemented.
- **Native integration:** iOS UIKit navigation, segmented controls, and Settings; iOS Live Activities
  and AlarmKit where supported; Android countdown notifications and completion alerts. System
  permissions and notification settings affect which alerts are available.

## Saving and accounts

Bloom currently works offline and saves settings, tasks, goals, history, and companion progress on
the installed device. Updates migrate existing saved data forward.

There are no backup, export, import, or recovery-file downloads. Android disables system backup and
device transfer; iOS marks app data as excluded from backup. Deleting the native app removes its
local data; **Offload App on iOS retains it**. In a browser, clear Bloom's site data to remove saved
data.

Sign-in is not implemented, and the current app does not sync data between devices.

## Local development

Use a current Node.js 22.x or 24.x release and the npm version declared in `package.json`.

```bash
npm ci
npm run dev      # http://localhost:5173, or the port supplied through PORT
npm run lint
npm test
npm run build    # type-check, bundle, and generate the web service worker
npm run preview  # serve the production build locally
```

## iOS

Use macOS and Xcode. The native project resolves Capacitor through Swift Package Manager.

```bash
npm run ios:sync  # build and copy the web bundle into the native project
npm run ios:open  # open ios/App/App.xcodeproj
```

Choose the **App** scheme and a Simulator or connected device in Xcode. Device and distribution
builds need the appropriate signing configuration, including the embedded Live Activity extension.
Re-run `ios:sync` after web changes.

See [iOS UI notes](docs/ios-liquid-glass.md) for the native controls. Simulator and browser checks
do not establish physical-device or App Store readiness.

## Android

```bash
npm run android:debug  # sync and build a debug APK
npm run android:check  # native unit tests and Android lint
npm run android:aab    # sync, build, sign, and verify a release bundle
```

Release signing setup, version updates, and artifact locations are documented in
[the Android release guide](docs/android-release.md).

## Code map

| Location | Purpose |
| --- | --- |
| `src/App.tsx` | Screen selection and app-wide native coordination |
| `src/screens/`, `src/components/` | Screens, dialogs, and shared UI |
| `src/store/useBloom.ts` | State reducer, timer lifecycle, persistence, and migrations |
| `src/store/`, `src/insights/` | Session records, planning, companion data, and analysis |
| `src/engine/` | Pixel animation, audio, and breathing visuals |
| `src/native/` | Typed Capacitor adapters |
| `ios/`, `android/` | Native projects and platform integrations |
| `scripts/` | Build, release, icon, and service-worker tooling |

Contributor and agent guidance lives in [CLAUDE.md](CLAUDE.md).
