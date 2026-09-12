# Repository guidance

Bloom is a React + TypeScript focus app wrapped with Capacitor for iOS and Android.

[README.md](README.md) describes the current features. Follow the user's current task; older plans
and policy documents do not add product restrictions, approval gates, or mandatory work.

## Product context

The current app saves data on the installed device and works offline. Backup, export, import, and
recovery-file downloads have been removed at the user's request. Keep normal saving through app
updates. Android disables system backup and device transfer; iOS excludes app data from backup.

Sign-in is not implemented. The owner will define future features and add a checklist later.

For iOS UI work, use the standard native control appropriate to the interaction and let UIKit
render its system appearance. Keep native controls aligned with Bloom's selected day or night
theme.

## Commands

Use a current Node.js 22.x or 24.x release and the npm version declared in `package.json`.

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm run test:migrations
npx vitest run src/store/useBloom.lifecycle.test.tsx
npm run ios:sync
npm run ios:open
npm run android:debug
npm run android:check
npm run android:aab
```

`build` runs TypeScript, Vite, and service-worker generation. CI runs lint, tests, and build on Node
22 and 24.

When changing dependencies, generate the lockfile with npm and verify a clean `npm ci` using the
declared toolchain. Keep the Capacitor CLI, core, iOS, and Android packages aligned, including the
generated iOS Swift package reference after syncing.

## Architecture

- `src/App.tsx` owns screen selection. `src/store/useBloom.ts` owns the app reducer, timer
  lifecycle, and main saved state; screens receive the `bloom` hook result as a prop.
- Pure helpers in `src/store/` and `src/insights/` handle records, planning, and derived insights.
  `useCompanion` handles live companion scheduling.
- `src/engine/` provides Canvas animation and audio. Audio shares one AudioContext; clean up
  nodes, animation work, listeners, and native subscriptions when their owners stop.
- `src/native/` contains typed adapters. Completion alerts and countdown displays have iOS and
  Android implementations. UIKit controls, native Settings, and AlarmKit are iOS integrations.
  Check platform availability, retain working web fallbacks, and keep native and web Settings
  behavior aligned.
- Native projects use app ID `dev.bloom.pomodoro`. Web changes reach them through
  `ios:sync` or `android:sync`. Keep release credentials out of Git and preserve the signing
  identity used for published builds.

### Timer and session records

Countdowns use epoch deadlines and catch up from the wall clock. Flow uses elapsed time and ends
through its own finish action. Native displays and alerts mirror the reducer's timer; native
commands return through the command queue and must remain safe to replay.

Work sessions use separate `openFocus` and `openFlow` slots. Finalization creates a session record;
breaks do not. Reload handling differs for countdowns and Flow, so inspect the lifecycle before
changing it. History beyond the detailed-record cap is compacted through `historyArchive.ts`.
Corrections use `sessionRepair.ts` and do not award session credit again.

On iOS, UIKit views sit above the WebView. Hide or suppress native chrome when a web dialog owns the
screen, and validate native navigation through the same guards as web navigation. CSS stacking
alone cannot cover a native view.

See [iOS UI notes](docs/ios-liquid-glass.md) and [Android release notes](docs/android-release.md) for
platform details.

### Saved data

The main localStorage key is `bloom-state`; the companion log uses `bloom-companion-v1`.
`SCHEMA_VERSION`, `MIGRATIONS`, and default merging live in `src/store/useBloom.ts`.

When changing the saved format, bump the schema version and append a forward migration. Preserve
existing records, identifiers, and settings; add migration coverage for the affected old shape.
Avoid changing past migrations or replacing unreadable data with a fresh default save.

Storage failures are reported through `storageHealth.ts`. Keep failures visible and retry saving
without discarding edits made since the last successful write. This is normal persistence, not a
backup feature.

## Verification and handoff

For code changes, run relevant checks and keep `npm run lint`, `npm test`, and `npm run build`
green. Exercise timer, persistence, and native lifecycle changes with meaningful regression tests.
For documentation-only changes, verify commands, links, and claims against the repository.

Check changed UI in the relevant browser, Simulator, or device. Native alert, background, and
accessibility behavior needs the appropriate platform checks. State exactly what was tested and
what remains unverified; a build is not a device test.

Keep the active docs concise and current. Report confirmed defects and important suggestions to
the user; add a backlog only when asked.
