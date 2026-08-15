# PLAN 13.8c — remaining iOS native-alternatives audit

Date: 2026-08-12

Status: complete. Every major timer, navigation, settings, picker, data/share, alert, and lifecycle
surface has a recorded use-native/keep-web decision. The two newly accepted changes are split into
PLAN 13.9b (launcher identity) and PLAN 13.11a (system-settings recovery); neither is implemented
inside this audit.

## Decision rule

Native is recommended only where iOS owns behavior Bloom cannot reproduce as reliably in web
content: Lock Screen/background delivery, launcher identity, system navigation/control semantics,
document consent, share destinations, permission prompts/settings, or destructive system alerts.
React remains preferable for product-specific content, validated forms, session explanations, and
stateful workflows whose logic already belongs to the reducer/store.

| Surface | Current mechanism and evidence | Decision | Privacy, authority, and rollback |
| --- | --- | --- | --- |
| In-app countdown and transport | PLAN 13.8b overlays a measured UIKit timer across Focus, Tiny, Short, Long, and Flow. Simulator actions used the existing reducer handlers; running display ticks generated no per-tick bridge configuration. | **Use native; complete.** | Native receives only mode and stable clock sources. `useBloom` owns sessions and persistence. Hiding/failing the plugin restores the accessible React timer. |
| Lock Screen / Dynamic Island | ActivityKit shows a system-driven timer; iOS 17+ expanded/Lock Screen controls hand bounded Pause/Continue commands back to the reducer. Compact/minimal sizing is Apple-owned. | **Use native; keep parent 13.8 open for physical release QA.** | Opaque session id and clock fields only; no task text/network. Ending the Activity restores ordinary in-app behavior. |
| Primary navigation | `UITabBar` mirrors the React-selected screen and reports one selection event. Native segmented rails mirror Focus modes and collection sections. Measured slots restore web controls if placement fails. | **Use native; complete in 13.2/13.3/13.13/13.16.** | No persisted/native navigation authority. Removing or hiding a rail exposes the existing accessible web rail. |
| Settings form | SwiftUI Form renders React's bounded snapshot; all edits route to the same handlers. Timer lengths are direct native steppers. Foundations switches intentionally returned to web where native rows split the content model. | **Keep the selective hybrid.** Do not convert every setting/content card. | Swift receives labels/values already visible on screen, stores nothing, and can fall back to the complete web sheet. Broad conversion would duplicate validation and content semantics without a system capability gain. |
| Text, number, date, and choice input | Product forms remain HTML. WKWebView already supplies the iOS keyboard, numeric keyboard, date picker, and select/menu presentation for the corresponding semantic controls. Store/component tests own validation and error recovery. | **Keep web.** | Values remain in React/store; no extra bridge copy. The same form works offline on web. A custom native form would add a second validation surface and a rollback/migration risk. |
| JSON/CSV export | Anchor/blob download was browser-correct but unreliable and undiscoverable in a wrapped app. PLAN 13.4d now presents an exact generated file through `UIActivityViewController`. | **Use native on iOS; complete.** | Temporary protected file exists only after the export tap and is deleted when the sheet ends. Destination is user-chosen. Web retains anchor download. |
| JSON import | Browser file input already invoked a system picker, but the web sub-sheet divided Settings ownership. PLAN 13.4d now uses a JSON-only `UIDocumentPickerViewController` and returns bounded UTF-8 text to the unchanged parser/migrator/merge state machine. | **Use native picker on iOS; complete.** | No file is read before explicit selection. Security-scoped access ends after reading. React remains the only validator/writer. Web retains file input/progress/cancel. |
| Destructive data confirmation | Shared web dialogs are accessible and correct generally. Clearing all reflection history is the one Settings action whose destructive scope benefits from a system alert within the native form. | **Native only for this high-risk Settings action; complete in 13.4d. Keep ordinary product dialogs web.** | Native returns a boolean and never clears data. Cancel/dismiss is a no-op. Web keeps the existing APG dialog. |
| Timer transition, debrief, planning, parking, companion, and weekly surfaces | These are content-rich, stateful product workflows with dynamic evidence/copy and tested portal ownership. They do not cross an OS boundary. | **Keep web.** | Reducer actions remain exactly once and cross-platform. Native conversion would duplicate decision/copy logic and complicate rollback for no measured reliability gain. |
| Completion alerts and permission | `UNUserNotificationCenter` mirrors one stable reducer deadline; the foreground chime stays web-owned. Permission is requested in context and local delivery adds no APNs/server. Simulator and source coverage pass; physical silent/Focus/locked checks remain open in 13.11/13.6. | **Use native delivery; existing PLAN 13.11 remains the release gate.** Add **13.11a** for a direct, user-initiated Open iOS Settings recovery action when permission/Live Activities are disabled. | Alert carries generic timer copy and deadline only. Native never completes a session. Disabling Ring or permission removes native delivery while the core timer remains usable. |
| Foreground/background lifecycle | Durable reducer changes persist immediately; deadlines are wall-clock based; `visibilitychange` catches up the web app. Native is used only where suspension makes web delivery impossible and for the queued Live Activity command handoff. | **Keep hybrid; do not add a second native lifecycle/store authority.** | No background execution, server, or telemetry. If mirrors are unavailable, boot sweep and web lifecycle remain honest and complete. |
| Launcher icon | iOS asset catalogs and alternate-icon API correctly let the on-duty friend follow the app. Current generated art is still flower-led and can be mistaken for a cycle tracker rather than a timer. | **Keep native mechanism; accept art/source redo as PLAN 13.9b.** | Icons contain no user data. Generator/source tests must prevent regeneration back to the old floral design. Web retains its separately reviewed static mark. |
| Haptics, clipboard, external links, widgets beyond timer | No current core action depends on these capabilities, and no reliability/accessibility defect was observed that they would close. | **Do not add.** | Avoids new permissions/capabilities, unneeded bridge code, and decorative native behavior. Revisit only through a bounded evidence-backed step. |

## Accepted follow-ups

1. **PLAN 13.9b — Redesign the generated iOS launcher family around a Pomodoro timer.** This is the
   user's explicit product correction. Remove the flower backing from every primary/alternate
   appearance, inspect history and the generator to identify the reversion path, and preserve the
   on-duty friend without letting the icon read as floral or health/cycle tracking.
2. **PLAN 13.11a — Open Bloom's iOS system settings from disabled-permission recovery rows.** A direct
   user tap is more reliable than prose-only recovery for notification/Live Activity settings. The
   app must never open Settings automatically and must refresh system-owned status on return.

AlarmKit, broad native-sheet/glass conversion, accounts/sync/cloud, and Android remain deferred as
required. No other native conversion met the material-improvement threshold.

## Evidence

- Source inventory covered every file in `src/native`, the iOS app/Live Activity targets,
  `SettingsSheet`, all semantic input types, data export/import, notifications, and the store's
  persistence/visibility lifecycle.
- PLAN 13.8b focused timer coverage passed 4 files/64 tests with iPhone/iPad Simulator interaction.
- PLAN 13.4d focused data-presentation coverage passed 5 files/58 tests with iPad Simulator share,
  Files picker, disable-state, and destructive-alert interaction.
- At audit close, the full suite passed 82 files/749 tests; lint, production build, iOS sync,
  code-signing-free Xcode build, local-only audit across 199 source files, and `git diff --check`
  passed.

This audit does not claim physical-device, signed archive, TestFlight, App Store submission, or web
deployment evidence.
