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
- [Asking permission to use notifications](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
  recommends requesting authorization in context and re-reading system settings before scheduling.
- [`UNNotificationSound`](https://developer.apple.com/documentation/usernotifications/unnotificationsound)
  requires a custom local-notification sound to be bundled on the device and under 30 seconds.
- [Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
  requires a WidgetKit extension, compact/minimal/expanded presentations, and an app-owned
  ActivityKit lifecycle.
- [`Text(timerInterval:)`](https://developer.apple.com/documentation/swiftui/text/init(timerinterval:pausetime:countsdown:showshours:))
  lets the system advance a wall-clock countdown without per-second app updates.
- [Scheduling an alarm with AlarmKit](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit)
  documents the separate iOS 26 authorization and prominent-alert behavior scoped in PLAN 13.12.
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
| Settings affordance and boolean switches | Native SF Symbol glass button and `UISwitch` controls over measured web fallback slots | 13.4a |
| Settings sheet, durations, pickers, fields, and data actions | Native form/presentation after the boolean-control seam is proven | 13.4b |
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

## Native Settings control boundary

PLAN 13.4a keeps Settings content and reducer ownership in React while UIKit owns the iOS control
surface for the Settings affordance and boolean values. The Focus screen measures its 44-point web
button slot; iOS overlays a standard `UIButton` using `gearshape.fill` only after the symbol resolves
at runtime. iOS 26 supplies the glass configuration, older supported releases use their standard
system button appearance, and a local inline SVG stays visible if native setup is unavailable.

Every existing boolean call site uses the shared `SystemSwitch` wrapper. Browser and Android render
its accessible web switch. On iOS, the wrapper reports the measured slot, label, enabled state, and
reducer-owned boolean to one validated bridge, which places a real `UISwitch` there. A native value
change returns the exact boolean; React never infers a toggle from stale state. Control events are
not retained, malformed identifiers or frames never cross the bridge, and an unavailable native
control leaves the web fallback active.

Native overlays do not participate in WebKit scrolling or z-index, so frame observation covers
nested scroll, resize, visual-viewport, and relevant DOM visibility changes. Controls hide when an
ancestor is inert/hidden, their slot is offscreen, a modal owns the surface, or the component
unmounts. The fallback slot's own `aria-hidden` is deliberately ignored by that visibility check:
React applies it after UIKit becomes active to prevent duplicate touch and VoiceOver targets.

## Verification matrix

PLAN 13.2–13.4a are checked with an iOS 26 Simulator build and interaction smoke, the React
test/build suite, Capacitor sync, and duplicate/overlaid-control checks. PLAN 13.4a additionally
verified the runtime SF Symbol, native switch accessibility identifiers/values, web fallback, exact
boolean dispatch, scroll/modal/unmount cleanup, and the user's switch interaction. Physical-device
and iPad testing, VoiceOver/Switch Control, Dynamic Type, Reduced Motion, Reduced Transparency,
Increased Contrast, rotation, and
airplane-mode QA remain part of PLAN 13.6. The current machine has Xcode 26, so iOS 27's refreshed
system rendering must be verified later with Xcode 27 rather than approximated locally.

## Completion-alert boundary

PLAN 13.11 fixes the locked/background timer cue with `UNUserNotificationCenter`; it does not ask
WebKit to keep running and does not add a background mode. React's reducer remains authoritative.
Whenever a Focus, Tiny, Short, or Long countdown is running, the bridge mirrors its `endsAt` value
into one local request with a stable identifier. A deadline change replaces that request. Pause,
reset, skip, mode change, completion, or switching **Ring when done** off cancels it. Flow mode never
schedules one because it has no deadline.

Permission is system-owned and requested only after a skippable explanation at the first relevant
timer start, or after the person uses the separate **allow notifications** action while **Ring when
done** is on. Bloom re-reads alert, sound, and Lock Screen settings when it becomes visible and
explains when only the foreground chime is available. No permission value is added to Bloom's
persisted data.

The notification contains only the timer mode and neutral finish copy—never the task, goal, or
reflection text. The native request is a delivery cue and never writes a session record. If iOS
terminates Bloom, the local notification can still say that the timer finished, while the existing
next-launch sweep may honestly record the open session as interrupted.

The existing Web Audio chime and `BloomCompletion.wav` are generated from the same checked-in cue
definition. A process-local deadline handshake distinguishes system-owned background delivery from
a native presentation suppressed while Bloom is active. React therefore does not replay Web Audio
after visibility catch-up, but still supplies the one foreground chime. If Bloom is merely inactive
under Control Center or another interruption, iOS presents the native request because Web Audio is
not a reliable fallback. A due request is not canceled during iOS's short background execution
window. A terminated process needs no second native record: the local request remains with the
system, while the existing next-launch reducer sweep remains the sole session authority.

This is an ordinary notification, not a Time Sensitive or Critical Alert: the person's Silent Mode,
Focus, Scheduled Summary, sound, banner, and Lock Screen choices remain in control. It uses no APNs
endpoint, account, runtime download, analytics, or task data. Regenerate the native resource after
intentionally changing the cue with `node scripts/gen-completion-sound.mjs`.

## Live Activity decision

PLAN 13.8 uses ActivityKit rather than a CSS/native overlay or remote service. The app target keeps
its iOS 14 deployment floor and weak-links an availability-guarded ActivityKit bridge. A separate
WidgetKit extension has an iOS 16.2 floor and is embedded in the app. `NSSupportsLiveActivities` is
enabled, but there is no push token, frequent-update entitlement, APNs endpoint, background mode,
account, analytics, App Group, or runtime download.

React's timer/session reducer remains the authority. The bridge receives only an opaque local
session identifier, `focus` or `tiny`, and the clock fields needed to render the activity. Task,
target, goal, reflection, and friend text never cross this bridge. Starting eligible work requests
at most one Activity; pause freezes the same Activity's remaining seconds; resume updates its
wall-clock deadline; and completion, reset, skip, mode departure, false-start discard, idle data
clear, and relaunch recovery end stale state. Breaks and the unbounded Flow stopwatch never create
this Activity.

The SwiftUI presentation uses the system timer interval, so React sends no 250 ms or per-second
updates. Lock Screen, compact, minimal, and expanded Dynamic Island layouts are included, with
runtime-validated SF Symbols and a nonblank shape fallback. Accessibility exposes both a descriptive
timer label and the dynamic time value. If a person swipes the Activity away, a native tombstone
prevents pause, resume, or foreground reconciliation from recreating it for that same session; the
next new session may appear normally.

A local-only suspended app cannot guarantee an ActivityKit `end()` call exactly at the deadline.
The content therefore sets `staleDate` to the reducer deadline and changes to the neutral state
“Timer reached zero — open Bloom”; it does not claim that Bloom recorded a completion. The next
foreground/relaunch reconciliation ends the Activity, while ActivityKit retains its own system
lifetime limit. This is separate from the 13.11 local notification, which owns the actual background
finish cue.

Settings discloses that only mode and remaining time appear, reports when Live Activities are off or
unavailable, and leaves the timer fully usable. Availability remains system-owned rather than a new
persisted Bloom setting, so PLAN 13.8 does not change the storage schema.

PLAN 13.12 now scopes AlarmKit after the user explicitly requested prominent finish alarms. On
iOS/iPadOS 26+, its authorized system countdown will replace—not sit beside—the generic Activity for
the same timer and will cover Focus, Tiny, Short, and Long. Older, denied, or unavailable systems
retain this ActivityKit presentation plus PLAN 13.11's ordinary notification without duplication.
