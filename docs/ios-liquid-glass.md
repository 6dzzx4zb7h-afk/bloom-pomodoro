# iOS Liquid Glass architecture

Bloom uses Apple's native controls for the iOS navigation and control layer. It does not recreate
Liquid Glass with CSS. React and `useBloom` remain the single owners of product state, timer rules,
persistence, and content; the Capacitor bridge only exchanges validated UI events and snapshots.

This boundary preserves the local-first app, avoids multiple web views or duplicate stores, and lets
iOS apply its own material, lensing, motion, hit testing, VoiceOver semantics, and accessibility
adaptations. Browser and Android builds continue to use the accessible web controls.

## Apple guidance used

- [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) describes the material's
  dynamic lensing and morphing, recommends reserving glass for the navigation/control layer, and
  explains its automatic Reduced Transparency, Reduced Motion, and Increased Contrast adaptations.
- [What's new in SwiftUI](https://developer.apple.com/videos/play/wwdc2025/256/) shows that standard
  tab bars and controls receive the current design automatically.
- [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)
  demonstrates the system floating tab bar and updated UIKit controls.
- [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
  recommends standard bars and controls, removing custom backgrounds, and avoiding unnecessary
  glass effects inside the content layer.
- [`UITabBar`](https://developer.apple.com/documentation/uikit/uitabbar) supports standalone use: it
  displays and selects items while a delegate handles the resulting navigation.
- [What's new in SwiftUI 2026](https://developer.apple.com/videos/play/wwdc2026/269/) confirms that
  apps using standard controls receive the refreshed iOS 27 appearance when built with Xcode 27.

## Implemented in PLAN 13.2

The iOS wrapper overlays one standalone `UITabBar` on the existing `CAPBridgeViewController`.
UIKit owns the floating rail and the selected tab's interactive Liquid Glass lens, including the
liquid transition as selection moves. Bloom sets only semantic items, SF Symbols, selected tint,
and the current interface style. It deliberately supplies no custom background, selection image,
blur, mask, or selection animation.

The bridge has two messages:

- React sends the selected screen, Goals visibility, onboarding visibility, and day/night state.
- UIKit sends a validated tab identifier when the user selects an item.

React applies the existing navigation guard exactly once. If the guard refuses the destination,
React acknowledges the actual screen back to UIKit so the native selection lens returns to the
visible destination. If the native plugin is unavailable or stale, Bloom keeps the web tab bar.

## Surface inventory and roadmap

| Surface | Decision | Plan step |
| --- | --- | --- |
| Bottom destinations | Native standalone `UITabBar`; system glass and moving lens | 13.2 |
| Focus/Tiny/Short/Long/Flow selector | Compact standalone `UITabBar`, identical system rail/lens class to bottom navigation; `UISegmentedControl` fallback before iOS 26 | 13.3 |
| Friends/Field Guide selector | Same compact native `UITabBar`; React section remains authoritative | 13.3 |
| Settings affordance, switches, durations, pickers, and fields | Native entry point and form with `UISwitch`, steppers, pickers, and text fields | 13.4 |
| Dialogs, menus, and sheets | Standard native presentations where behavior improves | 13.5 |
| Exceptional custom control chrome | Consider `UIGlassEffect` only when no standard control fits | 13.5 |
| Timer ring, pixel pet, sky, task/history cards, and other content | Keep as web content; do not glaze | intentional |
| Active focus countdown outside the app | WidgetKit extension and local ActivityKit Live Activity | 13.8 |

Moving all of these surfaces in one change would duplicate too much state and make timer/settings
regressions hard to isolate. Each later step must preserve cancellation, navigation guards,
exactly-once reducer actions, offline operation, browser/Android behavior, and accessibility.

## Native segmented-rail decision

Simulator evidence rejected two prototypes: `UISegmentedControl` rendered only a translucent
segmented background, while a custom SwiftUI `GlassEffectContainer` produced real glass but did not
match the lower tab rail's system lens closely enough. The final iOS 26+ selector therefore uses a
second compact standalone `UITabBar`, with semantic text-only mode/section items. It is the
same UIKit class as bottom navigation; UIKit owns both rails' material, selected lens, interaction,
motion, accessibility adaptations, and OS refreshes. Bloom sets no background, blur, mask, glass
effect, selection image, or selection animation. The existing web rail stays only as a layout slot
and browser/Android fallback, while older iOS versions receive `UISegmentedControl`.

## Verification matrix

PLAN 13.2–13.3 are checked with an iOS 26 Simulator build and interaction smoke, the React
test/build suite, Capacitor sync, and duplicate/overlaid-bar checks. Physical-device and iPad
testing, VoiceOver/Switch
Control, Dynamic Type, Reduced Motion, Reduced Transparency, Increased Contrast, rotation, and
airplane-mode QA remain part of PLAN 13.6. The current machine has Xcode 26, so iOS 27's refreshed
system rendering must be verified later with Xcode 27 rather than approximated locally.

## Live Activity decision

PLAN 13.8 uses ActivityKit rather than a CSS/native overlay or a remote service. Apple requires the
UI to live in a WidgetKit extension and the app to start the activity while foregrounded. A system
timer interval can render the wall-clock countdown without sending a bridge update every second.
The first version is local-only and uses no ActivityKit push token or APNs endpoint.

The Live Activity shows only the mode and remaining time by default because Lock Screen content can
be visible to other people. React's timer/session reducer remains authoritative: native code mirrors
its lifecycle and reconciles any surviving Activity when Bloom launches. AlarmKit is intentionally
not part of this step because its prominent-alert authorization and silent-mode behavior would be a
separate product decision from the requested glanceable Live Activity.
