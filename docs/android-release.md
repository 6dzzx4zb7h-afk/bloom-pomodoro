# Android Play release runbook

Bloom ships on Android as a Capacitor 8 app containing the production web build. It does not load
application code from a server. The Android application ID is permanently
`dev.bloom.pomodoro`, the minimum SDK is 24, and the compile and target SDK are 36.

This runbook covers repository and artifact preparation. Creating and verifying the developer
account, accepting Play agreements, hosting the public privacy-policy URL, completing the store
listing and declarations, choosing countries/pricing, review, and rollout remain deliberate actions
in the Play Console.

## Release invariants

- Never change `dev.bloom.pomodoro` after the first Play upload.
- Never commit, share casually, or regenerate the upload keystore for a published app. Back up
  `android/app/upload-keystore.jks` and `android/keystore.properties` together in an encrypted vault.
- Every Play update has a strictly higher integer `VERSION_CODE`. `VERSION_NAME` is the user-visible
  release label.
- Ship updates as new signed AABs. Do not add live-update code, remote runtime assets, analytics,
  advertising, or runtime network access under this release step.
- The app remains local-first and offline-capable. Android cloud backup and device-transfer backup
  are disabled so local focus data is not silently copied outside the app's explicit export flow.
- Bloom declares three runtime-visible permissions and no others: `POST_NOTIFICATIONS`,
  `USE_EXACT_ALARM`, and `SCHEDULE_EXACT_ALARM` (API 31–32 only). None of them touch the network.
  `USE_EXACT_ALARM` is install-time granted and restricted by Play policy to apps whose core
  function is an alarm clock or timer — Bloom's is, and the Console declaration says so. If a future
  change makes the exact alarm optional rather than core, drop the permission rather than restating
  the justification.

## Prerequisites

- Node 22 or newer and the npm version declared by `packageManager` in `package.json`.
- Android Studio Otter (2025.2.1) or newer with JDK 21, Android SDK Platform 36, and Build Tools 36.
- A verified Google Play developer account for the person or organization that will own Bloom.

The repository scripts locate the standard Android Studio JDK and Android SDK on Windows, validate
the required SDK, and generate ignored `android/local.properties`. No global Gradle install is
needed.

## One-time signing setup

Run this once before the first release:

```bash
npm run android:key
```

The command creates a 4096-bit RSA upload key and random credentials without printing the secrets.
It refuses to overwrite an existing key. Immediately back up these two ignored files together:

```text
android/app/upload-keystore.jks
android/keystore.properties
```

Keep the vault copy outside the repository and test that it can be restored. Enroll the app in Play
App Signing on first upload; Google then protects the app-signing key while this local key remains
the upload credential. If the upload key is lost, use Play's upload-key reset process rather than
changing the application ID or creating a replacement listing.

## First release

1. Install from the lockfile and run the web checks:

   ```bash
   corepack npm ci
   npm test
   npm run build
   ```

2. Regenerate bundled icon and splash assets if the source art changed:

   ```bash
   npm run icons
   ```

3. Build the native checks, debug APK, and signed release bundle:

   ```bash
   npm run android:debug
   npm run android:check
   npm run android:aab
   ```

   `android:aab` also verifies the package identity, versions, SDK levels, backup and cleartext
   policy, unexpected permissions, and the AAB signing certificate. The upload artifact is:

   ```text
   android/app/build/outputs/bundle/release/app-release.aab
   ```

4. Install the debug APK on representative API 24 and API 36 devices. Exercise onboarding, timer
   completion, background/foreground recovery, notification permission and completion cue,
   persistence after process restart, export/import, rotation, system Back, TalkBack, large text,
   and airplane mode. Confirm that no application-data requests occur.
5. Host `public/privacy.html` at a stable HTTPS URL controlled by the Play-account owner. Put that
   exact URL in both the store listing and App content privacy-policy field.
6. In Play Console, create the app using the same name and default language, enroll in Play App
   Signing, upload the AAB to Internal testing first, and complete the listing, content rating,
   target audience, ads declaration, app access, and Data safety form.
7. The current implementation collects and shares no user data: focus data remains on-device,
   Android backup is disabled, and export/import happens only at the user's direction. Record those
   facts accurately in Data safety. Re-audit the form before every release; adding any SDK or
   optional network feature changes this answer.
8. Review the automated device catalog and Play pre-launch report, then promote through a closed or
   open test as appropriate. Use a staged production rollout and monitor Play vitals before widening
   it.

Google Play's account eligibility, testing requirements, and declarations can vary by account and
over time. Confirm the current requirements in Play Console rather than treating this file as a
substitute for the Console's checklist.

## Every update

Start from a clean branch with the intended changes reviewed. Preserve user data and append any
required persisted-state migration before release.

```bash
corepack npm ci
npm run android:version -- <higher-version-code> <version-name>
npm test
npm run build
npm run icons                  # only when art changed
npm run android:debug
npm run android:check
npm run android:aab
```

The first update carrying Android's finish alert asks for `POST_NOTIFICATIONS` the first time a
person starts a timer with **Ring when done** on. Declining is not an error state: the in-app chime
still plays while Bloom is open, and Settings says exactly what is missing and where to change it.
Verify both paths on the Internal testing build — accepted and declined — plus a finish that lands
while the app is backgrounded and the device is locked, which is the case the alarm exists for.

The launcher entry moved from `MainActivity` to a per-friend `<activity-alias>` in PLAN 13.18. The
first update carrying that change retires `MainActivity` as a launcher component, so any home-screen
shortcut a user pinned to it before the update stops working and has to be re-pinned; the app itself,
its data, and its install are untouched. Verify on the Internal testing build that the app still
appears in the launcher after updating over the previous Play build, and that switching friends
changes the icon.

Back up the source commit and the exact AAB uploaded. Record its SHA-256 hash, version code/name,
and the upload-certificate fingerprint printed by `android:aab`. Upload to Internal testing, verify
installation over the previous Play build without data loss, then promote the same artifact.

Google Play does not support downgrading users to a lower version code. Roll back behavior by fixing
or reverting the source change, assigning another higher version code, building a new signed AAB,
and rolling that release out.

## Authoritative references

- [Capacitor Android requirements and workflow](https://capacitorjs.com/docs/android)
- [Capacitor 8 toolchain requirements](https://capacitorjs.com/docs/updating/8-0)
- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Android app signing and Play App Signing](https://developer.android.com/studio/publish/app-signing)
- [Android app versioning](https://developer.android.com/studio/publish/versioning)
- [Upload an Android App Bundle](https://developer.android.com/studio/publish/upload-bundle)
- [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
