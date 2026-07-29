# PLAN 8.25 Android release verification — 2026-07-29

## Scope

Fresh Capacitor Android packaging, local upload signing, repeatable version/build/verification
commands, local-first manifest hardening, Android assets, privacy disclosure, and the release/update
runbook. No Play Console state was changed.

## Environment

- Windows; Node `22.17.0`; npm `11.17.0`
- Capacitor core/CLI/Android `8.4.2`
- Android Studio bundled JDK `21.0.10`
- Android Gradle Plugin `8.13.0`; Gradle `8.14.3`
- Android compile/target SDK 36; minimum SDK 24; Build Tools 36.0.0

## Automated evidence

- Pristine copy at `C:\tmp\bloom-android-clean-019faecb-20260729`:
  `corepack npm ci`, `corepack npm test`, and `corepack npm run build` passed with the declared
  toolchain. Vitest: 48 files, 502 tests passed. The install reported the repository's current npm
  advisory count of one moderate and two high findings; this step did not change them with an
  unreviewed automatic audit fix.
- Working tree: `corepack npm test` and `corepack npm run build` passed.
- `corepack npm run android:debug` passed and synchronized the current production web assets.
- `corepack npm run android:check` passed the app native unit test and fresh release lint analysis.
- `corepack npm run android:aab` passed bundle creation, release signing, and the repository
  verifier.
- `git diff --check` passed. `git check-ignore -v` confirmed `android/keystore.properties`,
  `android/app/upload-keystore.jks`, and `android/local.properties` are ignored.

## Verified release properties

- Application ID: `dev.bloom.pomodoro`
- Version: `1.0.0`; version code: `1`
- Target SDK: 36; minimum SDK: 24
- Merged release manifest: backup/transfer disabled; cleartext disabled; no Android runtime
  permissions (including no network permission)
- Upload-certificate subject: `CN=Bloom Upload, OU=Mobile, O=Bloom, L=Riyadh, ST=Riyadh, C=SA`
- Upload-certificate SHA-256:
  `7B:B5:82:C4:36:32:55:50:57:B7:71:45:F9:31:D7:AF:68:5D:4C:5C:80:3F:19:B2:8E:18:17:41:84:C6:DD:C5`

## Artifacts

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
  - 5,020,779 bytes
  - SHA-256 `3D15BB1AD47E99CC15AEF25F8C7FE6685B17EA55B0E6B1781C6E14F75755659E`
- Signed release AAB: `android/app/build/outputs/bundle/release/app-release.aab`
  - 3,507,943 bytes
  - SHA-256 `F1D67AB31066F5F8AD9FB58C134D0A26F1529F3D9DF392BD9A3CEE5E2421152A`

## Account-owned handoff still required

- Back up and restore-test the ignored upload keystore and credentials together.
- Test on representative API 24 and API 36 devices, including an update over the previous build.
- Host the privacy policy at a stable HTTPS URL.
- Create/verify the Play developer account; complete listing, declarations, Data safety, content
  rating, target audience, testing eligibility, and country/pricing choices.
- Upload this AAB to Internal testing, review Play's pre-launch report, then promote through an
  appropriate staged rollout.

Follow `docs/android-release.md`; do not infer that any of these Play Console actions occurred from
the local build evidence.
