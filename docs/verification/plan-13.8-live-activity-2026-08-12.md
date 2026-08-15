# PLAN 13.8 — Live Activity presentation refinement

Date: 2026-08-12

Status: PLAN 13.8 presentation implementation and PLAN 13.8a interactive-control implementation,
automated checks, native compilation, and available iPhone Simulator interaction checks pass. PLAN
13.8 remains open for physical-device and presentation states that the available automation could
not produce; the bounded 13.8a implementation step is complete with that release boundary recorded.

## Presentation changes

- Compact and minimal Dynamic Island families use a code-drawn Bloom blossom instead of the generic
  `leaf.fill` symbol. Paused and finished states retain the blossom and add a small state badge.
- The compact family pairs an 18-point blossom with an 18-point system-driven progress/status
  indicator. The exact countdown stays in the expanded and Lock Screen families so the compact
  system pill does not grow around a five-character timer.
- The expanded island identifies Bloom and the session mode, keeps the countdown prominent, and
  adds one system-driven linear progress track.
- The Lock Screen layout uses the same blossom, mode, countdown, state, and progress hierarchy.
- SwiftUI's implicit progress labels are hidden so they do not create a duplicate timer.
- The activity still receives only an opaque session identifier, mode, phase, and clock data. It
  displays no task, goal, target, account, or other user-entered text.
- Progress and countdown updates remain system-driven from the timer interval; the bridge sends no
  per-second updates and adds no network path.

## Interactive controls (PLAN 13.8a)

- iOS 17 and later use one `BloomActivityControl` in exactly the expanded Dynamic Island and Lock
  Screen layouts. Running state shows Pause; paused state with time remaining shows Continue. Both
  controls have explicit accessibility labels. iOS 16.2 keeps the existing noninteractive layout.
- Apple owns compact/minimal interaction: tapping opens Bloom and touching and holding expands the
  island. The 18-point compact blossom/progress pair is unchanged.
- The controls conform to `LiveActivityIntent`, so iOS launches Bloom's app process without opening
  the UI. The intent updates ActivityKit's system-driven clock immediately and cancels or replaces
  the same stable local completion-notification identifier.
- Each accepted intent appends one device-local command containing an opaque session id, pause or
  resume action, event timestamp, and frozen remaining seconds. The queue is capped at 32; it holds
  no task, target, goal, account, or analytics data and creates no network path.
- On mount and foreground, the typed bridge validates the bounded queue. The hook defers the normal
  interrupted-session boot sweep only when a command matches that exact open session, applies the
  ordered commands through the reducer, writes `bloom-state`, then acknowledges native ids. If the
  process exits after persistence but before acknowledgment, replaying exact frozen values produces
  the same deadline. Stale-session commands are no-ops and are acknowledged.
- No persisted shape was added: the native queue is an operational handoff, and reducer state is
  durably written in the existing schema before the handoff is removed.

## Automated and build evidence

- Focused final Live Activity/reducer run: 4 files, 75 tests passed.
- Full `npm test`: 79 files, 732 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; the production bundle and app-shell service worker were generated.
- `node scripts/local-only-audit.mjs`: passed across 195 source files.
- `npx cap sync ios`: passed.
- A post-sync, code-signing-free iOS Simulator build passed with Xcode's iOS 26.5 SDK. The built app
  embedded and validated `BloomLiveActivityExtension.appex`.
- The built app declares `NSSupportsLiveActivities = true`; the embedded extension declares the
  WidgetKit extension point and the expected `dev.bloom.pomodoro.liveactivity` identifier.
- `git diff --check`: passed.

Regression coverage lives in:

- `src/native/iosLiveActivityPresentation.test.ts`
- `src/native/iosLiveActivity.test.ts`
- `src/store/useBloom.liveActivity.test.tsx`

## Simulator evidence

Target: iPhone 17 Pro Simulator, iOS 26.5.

- Starting Focus produced one compact Dynamic Island activity after the system's expected short
  presentation delay.
- The first refinement's blossom-plus-countdown compact pill measured about 257 screenshot pixels
  wide. Replacing the compact countdown with the bounded progress indicator reduced the same
  Simulator presentation to about 139 pixels, approximately 46% narrower.
- Pausing showed the blossom's pause badge and a separate pause indicator in a similarly compact
  presentation; the frozen exact remaining time stayed available on the Lock Screen.
- The Lock Screen rendered Bloom, Focus, the countdown, one “In progress” line, and one progress
  track without clipping or duplicate timer text.
- The system's two-stage Live Activity permission prompts were exercised and the enabled state
  continued to present correctly.
- Running Focus showed an accessible Pause button on the Lock Screen. Because the Simulator was
  locked, iOS correctly required authentication; after a simulated matching Face ID, Pause changed
  the Activity to a frozen `21:51` and Continue changed it back to system-driven running state. In
  both cases Bloom's UI remained closed.
- Opening Bloom after Pause showed the same frozen `21:51`; opening after Continue showed the
  matching wall-clock countdown. This demonstrates the intent did not invent a second session.
- With Bloom explicitly terminated while the activity was paused, Continue launched only the app
  process, changed the activity to running, and reopening Bloom preserved the same session and
  resumed deadline instead of sweeping an interrupted record. A read-only Simulator defaults check
  then confirmed `dev.bloom.pomodoro.live-activity.pending-commands` no longer existed, proving the
  reducer persisted and acknowledged the handoff.
- The test timer was left paused, so it cannot emit a later completion notification.

## Evidence boundary

The available Computer Use interface cannot generate the long press needed to expose the expanded
Dynamic Island, and a single Bloom activity cannot force iOS's minimal multi-activity family. The
expanded and Lock Screen layouts instantiate the same compiled `BloomActivityControl`, but expanded
visual/physical interaction remains a device release check rather than an inferred screenshot. No
physical iPhone, paired Apple Watch, or physical StandBy setup was available. Airplane-mode,
VoiceOver, Dynamic Type, Increased Contrast, expanded/minimal, watch, StandBy, and physical-device
background checks therefore remain unverified. These are release checks, not inferred from source
or compilation, so PLAN 13.8 stays unchecked.

This run did not produce a signed archive, TestFlight build, App Store submission, or web deployment.

Apple owns Live Activity interaction: tapping a compact or minimal presentation opens the app, while
touching and holding exposes the expanded presentation. Bloom cannot change a tap into an expanded
system window. PLAN 13.8a now adds direct Pause and Continue controls where Apple permits them while
keeping Bloom's reducer authoritative through the persist-before-acknowledge command handoff.
