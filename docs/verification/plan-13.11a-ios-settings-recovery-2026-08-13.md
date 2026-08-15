# PLAN 13.11a — iOS system-settings recovery

Date: 2026-08-13

Status: complete for implementation, automated coverage, and Simulator interaction. This is not
physical-device, signed archive, TestFlight, App Store, or production deployment evidence.

## Implemented contract

- Native and fallback Settings show one accessible **open iOS Settings** action beside each
  applicable recovery note: denied/partly disabled timer notifications and supported-but-disabled
  Live Activities.
- Prompt, fully allowed, checking, unavailable, and unsupported states show no recovery action.
- Every action is user initiated. The typed adapter is a quiet no-op away from iOS, catches bridge
  failure, and never treats the open result as permission state.
- The Swift plugin uses the public `UIApplication.openSettingsURLString`; it contains no private
  Settings URL. React/store remain authoritative and persist no permission value.
- The existing `visibilitychange` lifecycle re-reads `UNUserNotificationCenter` and ActivityKit
  status when Bloom becomes visible again.

## Simulator interaction

Device: clean iPhone 17 Pro Max Simulator, iOS 26.5, app built from this worktree.

1. Fresh notification status rendered the in-context **allow notifications** action and no
   recovery action.
2. The system prompt was denied for this disposable Simulator. Bloom immediately rendered
   **Timer alerts are off in iOS Settings** plus one accessible **open iOS Settings for timer
   alerts** button; the timer and foreground chime fallback remained available.
3. A recovery tap transferred to iOS Settings. The Simulator's first-ever cold Settings launch
   initially displayed the Settings root; after its app-settings index initialized, a subsequent
   single recovery tap opened the exact **Bloom** page. That page showed **Notifications — Off** and
   **Live Activities — On**. Bloom used the same public app-specific URL both times and attempted no
   private fallback.
4. Returning through the Home screen to Bloom restored the native Settings sheet, re-read the
   system status, and still showed the denied note and recovery action. No system toggle was changed
   during this return check.
5. A second existing Simulator with notifications and Live Activities fully enabled showed neither
   recovery action, confirming the allowed-state absence in live UI.

The OS owns whether a cold Simulator has finished indexing its per-app Settings page. The app-side
contract is one public URL open per tap; no claim is made that Bloom can override an OS routing
failure. Physical-device confirmation remains release QA.

## Automated and build evidence

- Focused recovery, native-sheet, permission-lifecycle, and Live Activity coverage: 6 files,
  63 tests passed.
- Full suite: 83 files, 760 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed; the service-worker manifest was regenerated.
- `node scripts/local-only-audit.mjs`: passed across 200 source files with no auth, sync, telemetry,
  remote runtime asset, or other application-data request path.
- `npm run ios:sync`: passed.
- Code-signing-free Debug build for the iPhone 17 Pro Simulator destination: `BUILD SUCCEEDED`,
  including the app and Live Activity extension.
- Added-copy never-ship lexicon check and `git diff --check`: passed.

No account, server, APNs, telemetry, persisted-state field, schema migration, or Android behavior was
added. Cloudflare/production deployment remains unchanged.
