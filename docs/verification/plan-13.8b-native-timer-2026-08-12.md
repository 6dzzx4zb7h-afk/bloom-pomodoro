# PLAN 13.8b — native iOS in-app timer

Date: 2026-08-12

Status: complete for the bounded implementation step. The iOS native surface, browser fallback,
automated checks, native compilation, and available iPhone/iPad Simulator interaction checks pass.
Physical-device checks remain part of the parent PLAN 13.8 release boundary.

## Architecture and behavior

- `useBloom` remains the only timer/session authority. The native surface receives a stable wall-clock
  deadline for countdown modes or a Flow start plus accumulated seconds; it owns no session state,
  storage, completion, or record-writing path.
- The Swift overlay derives its visible value with a local 250 ms timer and only changes the label
  when the displayed integer second changes. Running React display ticks are not sent across the
  bridge.
- Native Start, Pause, Continue, Reset, Skip, and Finish actions call the existing React handlers and
  therefore enter the existing reducer exactly once. Reset and Skip keep their existing confirmation
  policy; Flow finishes through `finishFlow`.
- Focus, Tiny, Short break, Long break, and Flow use the same native readout/control surface on iOS.
  Browsers keep the React clock and controls, including an explicit `timer` role and accessible name.
- A measured React slot reserves the overlay's layout space. The web fallback becomes available again
  whenever the native plugin is unavailable, placement fails, a dialog owns the surface, Settings is
  open, or a text field/keyboard owns the interaction area.
- During text entry the native timer, mode/settings rails, and bottom navigation all hide together;
  the web clock and transport controls return. They restore after keyboard dismissal, avoiding an
  empty clock region or controls behind the keyboard.
- The bridge adds no network, account, telemetry, analytics, or remote-asset path and changes no
  persisted schema.

## Accessibility and presentation

- The native readout exposes `Time remaining` or `Elapsed focus time`, a spoken hours/minutes/seconds
  value, and the stable identifier `bloom-native-timer-readout`.
- Native controls expose Start/Pause/Continue, Reset, and Skip/Finish labels and stable identifiers.
  Every button has a 44-point minimum target.
- The readout uses monospaced digits plus a `UIFontMetrics`-scaled large-title font and responds to
  content-size-category changes without clipping its measured slot.
- iOS 26 uses system glass button configurations. Older supported iOS versions use tinted/fallback
  configurations rather than source-incompatible glass APIs.
- Simulator accessibility-tree traversal exposed the readout's label/value followed by Reset,
  Start/Pause/Continue, and Skip/Finish as operable controls. Increased Preferred Text Size kept the
  readout and actions unclipped. This validates the same UIKit accessibility surface consumed by
  VoiceOver; final spoken-output and physical-device navigation stay in parent release QA.

## Automated, build, and privacy evidence

- Focused final run: 4 files, 64 tests passed, covering reducer routing, web fallback semantics,
  bridge validation, accessibility contracts, stable clock sources, and absence of per-tick bridge
  configuration.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; the production bundle and app-shell service worker were generated.
- `npm run ios:sync`: passed after the final web/native coordination changes.
- `node scripts/local-only-audit.mjs`: passed across 198 source files.
- `git diff --check`: passed.
- A post-sync, code-signing-free Xcode Debug build for a generic iOS Simulator passed with the iOS
  26.5 SDK and embedded the Live Activity extension.

## Simulator evidence

### iPhone 17 Pro, iOS 26.5

- Paused Focus exposed `Continue`; Continue resumed the wall-clock countdown and changed the native
  primary action to Pause; Pause froze the exact displayed value and restored Continue.
- Reset and Skip exercised the existing confirmation/lifecycle paths without creating duplicate
  session records or a native-owned session.
- Tiny showed its two-minute countdown; Short and Long showed their configured break countdowns;
  Flow counted upward, paused/resumed from its accumulated value, and Finish opened the existing
  debrief surface.
- Mode-change confirmation, debrief, and native Settings each removed the timer overlay while that
  surface owned the screen and restored it afterward.
- Focusing a text field restored the accessible web clock/controls and hid all native rails; keyboard
  Done restored the native surface.

### iPad mini (A17 Pro), iOS 26.5

- A fresh install completed onboarding and displayed the native Focus readout and controls in the
  measured center slot without clipping on the wider portrait layout.
- The accessibility hierarchy exposed Settings, the native segmented modes, Time remaining, Reset,
  Start, Skip, and the tab bar in a coherent order.
- The first launch waited about 41 seconds for Simulator WebKit processes and initially appeared
  blank. Relaunching after the device finished booting loaded Bloom normally; no product crash or
  persistent blank state reproduced.

## Evidence boundary

No physical iPhone/iPad, signed archive, TestFlight build, App Store submission, or web deployment
was produced by this step. Spoken VoiceOver on physical hardware, additional content-size categories,
rotation/multitasking combinations, and physical background/interruption checks remain release QA
under the still-open parent PLAN 13.8 rather than inferred evidence.
