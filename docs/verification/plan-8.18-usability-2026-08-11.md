# PLAN 8.18 usability audit — 2026-08-11

## Scope and method

This pass followed a new person from onboarding to the first timer start, then sampled Tasks,
Settings, the optional session setup, and the running state. It used the production bundle in a
hidden in-app browser at 1280×800 and 320×568. Local preview startup was configured with
`open: false`; no Safari navigation was launched. The audit combined the accessible DOM, measured
geometry, keyboard order, touch-target sizes, browser logs, and a source review of every Focus
surface owner.

This is usability evidence for the tested paths, not physical-device VoiceOver or App Store release
proof.

## Interaction map after the correction

1. **Onboarding:** one required name field and one submit action. Both controls measure at least
   47.5 px high on the desktop baseline; the short-phone form remains internally scrollable when a
   keyboard reduces the viewport.
2. **Fresh Focus:** timer mode, countdown, a quiet “Ready to start · a task is optional” context,
   one optional session-setup disclosure, then the three transport controls. Start does not depend
   on adding a task or answering a setup question.
3. **Optional setup:** one disclosure owns the session target, opening move, and the environment
   reset when that reset has already been enabled in Settings. The same control hides the setup
   again. Expanded content may scroll on a short phone because opening it was an explicit choice.
4. **Start:** the timer begins in one tap. On iOS, the existing notification explainer is presented
   only after the timer is already running and remains skippable; it is an in-context permission
   recovery surface, not a pre-start requirement.
5. **Tasks:** Tasks remains the place to name work. Focus is also valid without a task, and says so
   directly rather than claiming that an empty new list is “all done.”

## Prompt budget

- No optional coaching surface before the first timer start.
- The Focus surface coordinator renders at most one owned surface at a time.
- Optional setup stays inline and closed until requested.
- Permission explanations follow the direct action that needs them and never undo a timer start.
- Data-triggered coaching keeps its existing natural-pause, frequency-cap, Quiet/off, and recovery
  rules. Necessary error, conflict, and storage-recovery messages are not counted as coaching.

## Findings and disposition

| Priority | Finding and evidence | Disposition |
| --- | --- | --- |
| P1 | Immediately after onboarding, a separate ritual card asked two more questions even though the environment reset was off by default. The first Focus DOM contained “try it next time” and “maybe later.” | Fixed in 8.18. The unsolicited ritual suggestion and its surface-owner branch were removed. Environment reset remains an explicit Sessions setting. |
| P1 | At 320×568, the usable Focus region ended at y=497 while the transport sat at y=605–665. The screenshot ended midway through optional setup, with Start entirely below the tab bar. | Fixed in 8.18. All setup questions now share one disclosure, the zero-history streak chip no longer competes with the first start, and short-phone decoration yields space. Post-fix Start is y=405–465, the main region is 497 px high with `scrollHeight=497`, and no initial scroll is needed. |
| P1 | A brand-new empty list was described as “all done — go play!”, which contradicted the visible timer and suggested that starting was not appropriate. | Fixed in 8.18. The empty state now reads “Ready to start · a task is optional”; incomplete and cleared-list variants remain truthful. |
| P2 | The empty Tasks screen presents both “add your first task” and the already-visible add form, creating two controls for one action. | Implemented in PLAN 8.26: the duplicate CTA is gone and the real add form is the single entry path. Rendered matrix remains pending. |
| P2 | The task goal control exposes “Goal: 1 pomodoros.” | Implemented in PLAN 8.26 as “1 focus session” / “2 focus sessions,” with regression coverage. |
| P2 | A first Settings visit exposes 48 form controls in the accessible tree. “Timer lengths” opens with a no-history cadence ladder, four presets, and three steppers before simpler session choices. Sections prevent one giant visual sheet, but the default expansion still over-explains. | Implemented in PLAN 8.26: direct timer steppers lead on web and native iOS; optional learned cadence opens through one disclosure. Rendered matrix remains pending. |
| P2 | Appearance is a binary Night sky switch and cannot follow the device or a local solar boundary. | Routed to PLAN 8.25. The persisted enum, migration, native bridge, offline solar calculation, and privacy decision are kept separate from this no-schema usability change. |

## Post-fix verification

- At 320×568, the collapsed screen has no dialog/status coaching surface, no horizontal overflow,
  and no vertical overflow. Session setup is y=347–394; Start is fully visible at y=405–465, 32 px
  above the Focus region's bottom.
- Expanding setup exposes the named Session target and opening-move control, sets
  `aria-expanded="true"`, and makes the main region scroll to 562 px. “Hide optional session setup”
  returns it to the 497 px no-scroll state.
- At 1280×800, Start is y=506–572 inside a 729 px Focus region, with no scroll or horizontal
  overflow.
- The first Start transitions directly to a named Pause control. The tested production page emitted
  no console warnings or errors.
- Focused lifecycle, surface-coordinator, and responsive assertions passed before the full suite.

## Remaining manual evidence

Physical-device VoiceOver reading order, Dynamic Type at the largest sizes, signed TestFlight
behavior, and a true solar appearance boundary remain outside this browser pass. They belong to the
relevant iOS release and appearance steps and must not be inferred from these measurements.
