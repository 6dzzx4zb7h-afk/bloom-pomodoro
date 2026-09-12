# iOS Liquid Glass architecture

Current implementation notes and historical context. Old PLAN references explain earlier choices;
they are not a task checklist or additional project rules.

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
  displays and selects items while a delegate handles the resulting navigation. It remains a
  bottom-anchored, full-width bar, and PLAN 13.13 records what happens when one is placed elsewhere.
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
  documents the separate iOS 26 authorization and prominent-alert behavior implemented in PLAN 13.12.
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

## Surface inventory

| Surface | Decision | Plan step |
| --- | --- | --- |
| Bottom destinations | Native standalone `UITabBar`; system glass and moving lens | 13.2 |
| Focus/Tiny/Short/Long/Flow selector | Standard `UISegmentedControl`, in the measured web slot | 13.3, 13.13; simplified September 12, 2026 |
| Friends/Field Guide selector | Same native `UISegmentedControl`; React section remains authoritative | 13.3, 13.13 |
| Settings affordance | Native SF Symbol glass button over a measured web fallback slot | 13.4a |
| Boolean switches | Accessible web switch on every platform until Settings itself is a native presentation | 13.14, then 13.4b |
| Settings presentation and form | Native sheet rendering a React-owned form snapshot; no web sheet behind it | 13.4b |
| Timer lengths | Native cadence card, ladder, preset control, and `UIStepper` rows | 13.4c |
| Local data and history | Web sheet with local-saving information and confirmed data clear, reached from a native disclosure row | 13.4d |
| Dialogs, menus, and sheets | Standard native presentations where behavior improves | 13.5 |
| Exceptional custom control chrome | Consider `UIGlassEffect` only when no standard control fits | 13.5 |
| Timer ring, pixel pet, sky, task/history cards, and other content | Keep as web content; do not glaze | intentional |
| Active focus countdown outside the app | WidgetKit extension and local ActivityKit Live Activity | 13.8 |
| Prominent finish alarm on iOS 26+ | AlarmKit, authorized once; owns the countdown surface while scheduled | 13.12 |
| A control pressed in system UI | Records timestamped intent; the reducer replays it and stays the only authority | 13.18 |

Native controls mirror the shared state. Cancellation, navigation guards, reducer actions,
browser/Android behavior, and accessibility are relevant checks when changing these surfaces.

## Native segmented-rail decision

13.3 first built both upper rails from a second standalone `UITabBar`, to borrow the exact material
and moving lens of the bottom navigation. TestFlight devices then showed why that class does not
belong mid-screen: a tab bar is bottom-anchored and full-width, so on iOS 26 it draws itself as a
floating capsule inset inside its own bounds and reserves the bottom safe area. Given a mid-screen
frame it rendered narrower than its measured slot and cropped its own labels along the bottom edge,
and no amount of height negotiation across the bridge fixed that reliably — 13.10 corrected the
metric on a Simulator and the crop still reached devices.

Since 13.13 both rails are a `UISegmentedControl`: the control Apple provides for a mid-screen
selector, which fills the frame it is handed, has no safe-area behaviour of its own, and on iOS 26
carries the same Liquid Glass sliding selection indicator. UIKit still owns selection, interaction,
motion, accessibility adaptations, and OS refreshes; Bloom sets no selection image or selection
animation. The web rail stays
as the layout slot and the browser/Android fallback, and the bridge still reports the height it
used so the slot can reserve more room if a system text size ever needs it.

PLAN 13.16 added a `UIVisualEffectView` with `UIGlassEffect` for an additional floating background.
The September 12, 2026 audit removed that wrapper after trying the standard control in Simulator.
Bloom now leaves the track, background, selected indicator, and animation to `UISegmentedControl`.
The control explicitly receives Bloom's light/dark interface style so its labels remain readable
when the app theme differs from the device theme. There is no custom blur, clipping capsule,
background image, or selection animation.

On iOS 26.5, the current synchronized build was exercised on a fresh iPhone 17 Simulator: day and
night appearance, Focus-to-Short selection and countdown update, bottom navigation, and
Friends-to-Field Guide selection all worked. An earlier installed Simulator copy provided the
before comparison; its newer saved schema was preserved when the current checkout refused to
downgrade it. These checks do not establish physical-device or older-iOS behavior.

## Native Settings control boundary

PLAN 13.4a keeps Settings content and reducer ownership in React while UIKit owns the iOS control
surface for the Settings affordance and boolean values. The Focus screen measures its 44-point web
button slot; iOS overlays a standard `UIButton` using `gearshape.fill` only after the symbol resolves
at runtime. iOS 26 supplies the glass configuration, older supported releases use their standard
system button appearance, and a local inline SVG stays visible if native setup is unavailable.

Every boolean call site uses the shared `SystemSwitch` wrapper. 13.4a overlaid a real `UISwitch` on
each measured slot; 13.14 took that back out and the wrapper now renders one accessible web switch
on every platform. The reason is a hard limit, not a tuning problem: a native view positioned from
JavaScript-measured rects cannot follow WKWebView scrolling. The scroll composites off the main
thread while the new frame arrives a frame or more later, and every switch here lives inside a DOM
scroll container — the Settings sheet and the foundations dialog — so each one visibly drifted out
of its row while scrolling. Real `UISwitch` semantics return with 13.4b, which presents Settings as
a native sheet so the switches live inside UIKit instead of on top of a scrolling web page.

The rule this leaves behind: only fixed chrome may be handed to a native overlay. The Settings
glyph qualifies; anything inside a scroller does not. For the overlays that remain, frame
observation still covers nested scroll, resize, visual-viewport, and relevant DOM visibility
changes. They hide when an ancestor is inert/hidden, their slot is offscreen, a modal owns the
surface, or the component unmounts. The fallback slot's own `aria-hidden` is deliberately ignored
by that visibility check: React applies it after UIKit becomes active to prevent duplicate touch
and VoiceOver targets.

## The Settings form snapshot

PLAN 13.4b makes iOS Settings a native sheet without writing Bloom's Settings twice. React builds a
typed *form snapshot* — sections of typed rows (`switch`, `stepper`, `segmented`, `picker`, `text`,
`button`, `disclosure`, `note`) — and the native layer is a generic SwiftUI `Form` that renders it
and reports which row the user touched. Every string, every unit, every conditional row, and every
mutation stays in TypeScript, so `docs/voice.md` still governs one set of strings and a new setting
needs no Swift change. Actions dispatch through the same handlers the web controls call, keeping the
reducer the only writer; an unknown identifier or a wrongly typed value is dropped rather than
guessed at.

Two details are worth keeping written down. Rows carry an explicit `appearance`, because the sheet
must follow Bloom's own day/night choice rather than inherit a dark system appearance from a device
whose owner is looking at a day sky — and because toggling Night sky inside the sheet has to restyle
it live. And booleans cross as a string-encoded `checked` key: a Swift `Bool` written straight into
a `JSObject` did not arrive in JavaScript as a boolean, which made every native switch a silent
no-op while string-valued controls worked; the adapter parses it back at the boundary.

The steppers are real `UIStepper` views rather than SwiftUI's `Stepper`, which cannot disable one
arrow at a time. The web rows they replace disable `−` at the minimum and `+` at the maximum, so the
control's own bounds stand in for those two flags and its value returns to neutral after each press.

13.4c added two row kinds worth reusing. A `values` row shows read-only figures side by side with a
spoken label per item, so the cadence ladder announces "shorter: 20 minutes focus, 4 minutes break"
rather than reading "20 slash 4". And a `segmented` or `picker` row may carry an empty `selected`,
because the preset control genuinely has no selection when the user's own lengths match no pair.

Your data uses a native **Local data and history** disclosure row. Choosing it dismisses the native
sheet and opens the same web sheet scoped to local-saving information and confirmed history clear.
Backup export/import controls have been removed; normal on-device saving remains. One known loss:
the pet's wave when Companion mode turns on is a web flourish with no native equivalent yet.

`AppDelegate` applies Apple's `isExcludedFromBackup` resource value to the app container's Documents
and Library directories at launch and when entering the background. Library includes WKWebView's
local storage and native UserDefaults; directory exclusion also covers files created later. The data
stays in durable storage, never a purgeable cache. These are OS backup exclusions, not a backup or
sync service: Apple describes the resource value as guidance, so it cannot guarantee removal from
an existing external backup. See [Apple's backup guidance](https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup).
Deleting the app removes its local data; iOS **Offload App** deliberately retains documents and data.
See [Apple's storage guidance](https://support.apple.com/en-us/108429).

## Verification matrix

PLAN 13.2–13.4a are checked with an iOS 26 Simulator build and interaction smoke, the React
test/build suite, Capacitor sync, and duplicate/overlaid-control checks. PLAN 13.4a additionally
verified the runtime SF Symbol, web fallback, exact boolean dispatch, scroll/modal/unmount cleanup,
and the user's switch interaction; its `UISwitch` overlay is superseded by 13.14. PLAN 13.13 and
13.14 are checked on an iPhone 13 Pro Max iOS 26.5 Simulator: both rails render full-width with
uncropped labels at the default and largest accessibility text sizes, mode selection still reaches
the reducer exactly once, and every switch stays locked to its row while the sheet scrolls. PLAN
13.4b is checked on the same Simulator: the native sheet presents with no web sheet behind it, its
text field, segmented control, menu picker, switches, steppers, notes, and disclosure rows all
render, conditional rows appear and disappear as React re-sends the snapshot, actions reach the
reducer and persist, the scoped web detail opens and returns, and the sheet follows Bloom's night
mode rather than the device's. Physical-device
and iPad testing, VoiceOver/Switch Control, Dynamic Type, Reduced Motion, Reduced Transparency,
Increased Contrast, rotation, and
airplane-mode QA remain part of PLAN 13.6. PLAN 13.12 compiles against the iOS 26.5 SDK with the
extension embedded and AlarmKit weak-linked, and its authorization, race, lifecycle, handoff, and
copy behavior is covered by focused tests; the alarm sounding through Silent Mode, through an active
Focus, and on a locked screen was confirmed on a physical device (August 7, 2026), which closed
PLAN 13.12. The current machine has Xcode 26, so iOS 27's refreshed
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

Generic Live Activity pause/resume also updates this ordinary notification while JavaScript is
suspended. The shared native transport retains one session-matched notification template. Pause
cancels its pending request; Resume rechecks permission and schedules the same content at the
activity's new deadline. Sound off, reset, completion, and mode departure revoke that template.
Stale session, deadline, and paused-time snapshots cannot change the newer cue. The bridge and
AppIntents share a serialized queue so an unfinished schedule cannot win after cancellation.
AlarmKit's controls continue to pause/resume their own system cue.

Simulator execution verified the real notification-content archive and restore path, native
cancellation/rescheduling with an injected notification center, permission and stale-control
guards, and an in-flight scheduling race. Actual Lock Screen delivery and sound still need a
physical-device check.

## Deployment floor

Both targets — the app and `BloomLiveActivityExtension` — declare
`IPHONEOS_DEPLOYMENT_TARGET = 17.0`. **AlarmKit and the explicit native glass APIs retain their
iOS 26 availability guards**: every remaining `@available` / `#available` in `ios/App` names iOS
26.0 or 26.1, and `canImport(AlarmKit)` guards the SDK rather than the OS. Earlier systems use the
same segmented control without its glass container and a standard tinted Settings button, while
AlarmKit falls back to the existing local notification and Live Activity.

The floor was 14.0 and moved in two steps. **14.0 → 15.0** was pure compliance: App Store Connect
warns that from Spring 2027 it will reject uploads declaring a `MinimumOSVersion` below 15.0, and
iOS 15 runs on exactly the hardware iOS 14 ran on, so it cost no devices. **15.0 → 17.0** was a
deliberate decision to stop paying for old systems, and it deleted nineteen guards:

| Was guarded at | Sites | What had been conditional |
| --- | --- | --- |
| iOS 15.0 | 4 | Dead iOS-14 branches — button configurations and `interruptionLevel` |
| iOS 16.0 | 4 | The native Settings sheet, which fell back to a **second, web-rendered Settings implementation** |
| iOS 16.2 | 6 | Live Activity and Dynamic Island, absent entirely below the guard |
| iOS 17.0 | 5 | The Lock Screen pause/resume buttons — a running timer the user could see but not control |

The device cost was the iPhone 6s, 7, and first-generation SE (from 16), plus the iPhone 8 and X
(from 17). That was accepted knowingly: the alternative was shipping a Live Activity whose controls
were missing on the systems that could see it.

The current iOS 17 floor supports the APIs in use. AlarmKit and the Settings button's glass
configuration retain iOS 26 guards so earlier systems use ordinary notifications and their
standard button appearance. The segmented control uses one implementation across supported OSes.

The web layer is *not* part of this. Vite emits a byte-identical bundle at `safari14` through
`safari17` (473.2 kB raw / 144.50 kB gzip in all four), so no build target is configured and none is
worth configuring; the source is already within what every supported WebKit understands. The
`-webkit-` prefixes in `src/styles.css` are `::-webkit-scrollbar`, `::-webkit-details-marker`, and
`-webkit-font-smoothing` — WebKit-only APIs with no standard equivalent, not legacy fallbacks.
`src/native/*.ts` negotiates capability through `supported` flags the native side returns; those
paths stay, because they serve web and Android, not old iOS.

`ios/App/CapApp-SPM/Package.swift` carries a do-not-modify banner and is generated by the Capacitor
CLI from the app target's deployment target — each `npx cap sync ios` after a bump rewrites its
`platforms:` to match. Never hand-edit it; change the app target and let sync follow.

The September 12, 2026 audit found the generated Swift package still pinned to Capacitor 7.6.8
while npm used 8.4.2. Running `cap sync ios` and Xcode package resolution aligned them at 8.4.2.
Both embedded frameworks in the resulting Simulator build report `MinimumOSVersion 15.0`.
`iosPluginRegistration.test.ts` checks that the generated manifest and resolved package match
the npm iOS version, as well as checking registration of every local native plugin.

## Live Activity decision

PLAN 13.8 uses ActivityKit rather than a CSS/native overlay or remote service. The app target keeps
its iOS 17.0 deployment floor (see §Deployment floor), so ActivityKit needs no availability guard at
all and the Lock Screen's pause/resume buttons exist on every system that can show the activity. A
separate WidgetKit extension, on the same 17.0 floor, is embedded in the app.
`NSSupportsLiveActivities` is enabled, but there is no push token, frequent-update entitlement, APNs
endpoint, background mode, account, analytics, App Group, or runtime download.

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

PLAN 13.12 implements that scoping with AlarmKit. On iOS/iPadOS 26+, its authorized system countdown
replaces—not sits beside—the generic Activity for the same timer, and it covers Focus, Tiny, Short,
and Long. Older, denied, or unavailable systems retain this ActivityKit presentation plus PLAN
13.11's ordinary notification without duplication.

## Prominent alarm boundary

PLAN 13.12 adds `AlarmKit` so a bounded finish can ring through Silent Mode and an active Focus —
the one thing an ordinary notification deliberately cannot do. The app target keeps its low
deployment floor (iOS 17.0, see §Deployment floor) and weak-links the framework behind
`@available(iOS 26.0, *)`; the built binary
carries `LC_LOAD_WEAK_DYLIB` for AlarmKit, so earlier systems launch and simply never see it. There
is no APNs endpoint, server, account, analytics, background mode, or Critical Alert entitlement, and
`NSAlarmKitUsageDescription` states the single purpose.

Authorization is explicit, one-time, and system-owned. Bloom never asks at timer start: the request
comes only from the **allow alarms** action in Settings, shown while **Ring when done** is on, under
copy that says plainly what a prominent alarm does. iOS asks once; the person reverses it in iOS
Settings, and Bloom re-reads the state on return rather than persisting a copy. No schema change.

The reducer stays the only session authority. One fixed alarm identity mirrors the current `endsAt`,
so every deadline change is a replacement rather than a queue. PLAN 13.12 initially omitted pause;
PLAN 13.19 added pause/resume buttons through the
[timestamped command channel](adr/0001-native-command-channel.md). An AlarmKit button records the
press for the reducer and pauses/resumes the system countdown while JavaScript is suspended. On
reconciliation, the reducer's paused state cancels the alarm and hands the countdown surface back
to the 13.8 activity — one system surface throughout, never two.

Ordinary reconciliation never silences an alarm that is already ringing; only a replacement or the
confirmed data clear does. That matters because the reducer closes the session within 250 ms of the
deadline, and cancelling there would silence the cue the person asked for. At completion Bloom asks
the bridge whether an alarm for that exact deadline is genuinely `alerting`. Only then does it skip
its own chime — an alarm the person stopped early still leaves them a finish cue, which is the safer
bias. Stopping the system alarm silences it and nothing more: it never writes or upgrades a record.

The alert says the timer finished, never that a session was recorded, because a person can dismiss
it from a locked screen with Bloom not running. System UI receives only the bounded mode name and
clock data — never task, target, goal, or reflection text. The cue is the bundled `BloomCompletion.wav`
already used by 13.11, so nothing is downloaded at runtime. Flow is excluded throughout: it has no
predetermined finish, so it schedules no alarm.

Ownership is a single flag returned by the bridge. While an authorized alarm holds the deadline, the
13.11 notification is cancelled and the 13.8 activity is ended. When authorization is missing, the
framework is absent, or scheduling fails, ownership is false and both fallbacks resume unchanged.
