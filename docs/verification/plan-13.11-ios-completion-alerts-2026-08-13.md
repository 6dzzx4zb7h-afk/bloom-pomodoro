# PLAN 13.11 — reliable local iOS completion alerts

Date: 2026-08-13

Status: implementation, automated coverage, build verification, and an ordinary locked/background
Simulator smoke are complete. The Airplane Mode Simulator smoke is still pending because it changes
the Simulator's network setting, so PLAN 13.11 remains unchecked. This is not physical-device,
signed archive, TestFlight, App Store, or production-deployment evidence.

## Verified contract

- React's reducer remains the timer and session authority. The iOS bridge mirrors one bounded
  Focus, Tiny, Short, or Long deadline into the stable
  `dev.bloom.pomodoro.timer-complete` notification request and never writes a session record.
- Start, resume, and deadline changes replace that request. Pause, reset, skip, mode change,
  completion, and turning **Ring when done** off reconcile it away.
- Permission is requested only after Bloom's skippable in-context primer. Denied, skipped,
  unavailable, web, and Android paths retain the complete timer and foreground cue.
- Foreground suppression and background-system delivery are consumed against the matching reducer
  deadline, preventing the system notification and web cue from both presenting for one finish.
- The notification contains only the timer kind and generic recovery copy. It contains no task,
  session, goal, account, or analytics data and never claims that a focus session was recorded.
- The implementation adds no APNs, server, runtime network path, background-execution mode, Time
  Sensitive notification, or Critical Alert entitlement.

## Locked/background Simulator smoke

Device: iPhone 17 Pro Simulator, iOS 26.5, with Bloom notification permission already granted.
**Ring when done** was on and the Short break length was one minute.

1. Bloom's History ledger showed 14 finished focus sessions before the smoke.
2. A real one-minute Short break was started. Its native readout counted down from one minute, then
   Bloom was sent to the Home screen and the Simulator was locked through **Device > Lock**.
3. At the deadline, the Lock Screen exposed exactly one Bloom notification:
   **Break timer finished — Your next focus is ready when you are.** No task text or session claim
   appeared.
4. Opening that notification returned to an idle 25-minute Focus timer. After four seconds there
   was still no second banner.
5. History still showed the same 10-session and 4-session study days, for 14 sessions total. The
   break notification therefore did not create a false completed focus session.

The Computer Use surface verifies the system notification and return state, but it cannot establish
audible output. The built app contains the configured bundled cue; physical-device Silent Mode,
Focus, and force-quit behavior remains release QA under PLAN 13.6.

## Automated and build evidence

- Focused lifecycle, adapter, sound-asset, permission-copy, system-settings, and modal-coordination
  coverage: 6 files, 38 tests passed.
- Full suite: 84 files, 766 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; 88 modules transformed, CSS 94.22 kB / 19.02 kB gzip, JavaScript
  498.71 kB / 148.26 kB gzip, service-worker manifest `1c85d094e873b6db`.
- `node scripts/local-only-audit.mjs`: passed across 201 source files with no auth, sync, telemetry,
  analytics, diagnostic reporter, remote runtime asset, or application-data request path.
- `npx cap sync ios`: passed.
- Code-signing-free Debug Xcode build for the iPhone 17 Pro Simulator destination:
  `BUILD SUCCEEDED`, including Bloom and its Live Activity extension.
- Built-bundle inspection found `BloomCompletion.wav` as a 3.04-second, mono, 44.1 kHz, 16-bit WAV.
  The app plist contains no `UIBackgroundModes` key and declares no non-exempt encryption.

## Remaining gate

The same real-timer, background, lock, notification, return, and no-false-session smoke must be
repeated with Airplane Mode enabled and then restored to its prior setting. No network setting was
changed without the required explicit confirmation. Until that passes, PLAN 13.11 stays open.
