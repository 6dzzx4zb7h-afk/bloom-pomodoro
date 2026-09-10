# PLAN 13.18 Android friend launcher icons — 2026-08-16

## Scope

Per-friend Android launcher icons following the friend on duty, and the release build that carries
them: `1.0.1 (2)`. No Play Console state was changed and nothing was uploaded.

## Environment

- Windows; Node `22.17.0`; npm `11.17.0`
- Capacitor core/CLI/Android `8.4.2`
- Android Studio bundled JDK; Android Gradle Plugin `8.13.0`; Gradle `8.14.3`
- Android compile/target SDK 36; minimum SDK 24; Build Tools 36.0.0
- Device: Pixel 10 Pro XL emulator, Android 17

## Automated evidence

- `npm test` — 64 files, 617 tests passed, including the new `androidAppIconAssets` guard that
  checks every friend has an alias in the manifest and every mipmap the alias points at.
- `npm run build` passed.
- `npm run icons` regenerated the art; the iOS appiconsets came out byte-identical, so the shared
  refactor did not disturb them.
- `npm run android:debug`, `npm run android:check` (native unit tests + release lint, 0 errors), and
  `npm run android:aab` (bundle, signing, repository verifier) all passed.
- Merged **release** manifest: six `<activity-alias>` entries, only `.BloomMochi` enabled, each with
  its own `@mipmap/ic_launcher_<friend>`; no `<activity>` carries a LAUNCHER filter.

## Device evidence

- Fresh install resolves exactly one launcher component: `dev.bloom.pomodoro.BloomMochi`.
- Choosing Luna moved it to `BloomLuna` and the app-drawer icon became the owl on her gradient.
- Choosing Mochi moved it back and the drawer icon returned to the bunny.
- The app process id was unchanged across both switches — `DONT_KILL_APP` holds, so an icon change
  cannot end a running focus session.
- Re-choosing the friend already on duty produced no PackageManager component activity at all, so
  the launcher does not churn on a redundant selection.
- The choice survived a device reboot (`BloomSnappy` still enabled, drawer showed the crab).
- Updating `1.0.0 (1)` → `1.0.1 (2)` over the top preserved the enabled alias and the app's data;
  the app launched normally afterwards with the same friend on duty.

## Release artifact

- `android/app/build/outputs/bundle/release/app-release.aab`
- Version `1.0.1 (2)`, target SDK 36
- SHA-256 `49d8fd17c0939a59e7720f143b5f9ca6b36d295ed4ccf118072dfc9ee0cbd8b2`
- Upload certificate `CN=Bloom Upload, OU=Mobile, O=Bloom, L=Riyadh, ST=Riyadh, C=SA`
- Upload certificate SHA-256
  `7B:B5:82:C4:36:32:55:50:57:B7:71:45:F9:31:D7:AF:68:5D:4C:5C:80:3F:19:B2:8E:18:17:41:84:C6:DD:C5`

## Known consequence of this release

The launcher entry moved from `MainActivity` to the per-friend aliases. Home-screen shortcuts a user
pinned to `MainActivity` before this update stop working and need re-pinning; the app, its data, and
its install are untouched, and the emulator update path above confirms that. Recorded in
`docs/android-release.md`.

## Not verified here

The AAB itself was not installed on a device: `bundletool` is present only as an unshaded library
jar in the Gradle cache, and no tooling was downloaded to work around that. The runtime evidence
above comes from the debug APK built from the same synced tree. `minifyEnabled = false` for release,
so the release build carries the same unshrunk code; release differs in signing and debuggability
only. Installing the Internal testing build over a previous Play build remains the pre-promotion
check the runbook calls for.
