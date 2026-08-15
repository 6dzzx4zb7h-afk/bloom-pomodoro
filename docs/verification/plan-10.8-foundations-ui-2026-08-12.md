# PLAN 10.8 Foundations UI verification — 2026-08-12

Scope: the opt-in Foundations setting, Tasks card, break echo, picker, and
local persistence boundary. This pass does not claim a rendered-browser,
manual screen-reader, physical-device, signed-archive, TestFlight, or App Store
check.

## Product and state evidence

- With `settings.foundations` off, Tasks contains neither the card heading nor
  its only empty-state action. The pre-existing task empty state remains the
  available path.
- A one-tap Phone away check at 23:50 with a 03:00 study-day boundary writes
  `fnd-phone-away:2026-07-16` into the versioned `bloom-state` blob. Unmounting
  and reloading restores the pressed state. Returning visible after the next
  03:00 boundary advances the card to July 17 and presents a fresh unchecked
  state.
- Turning that foundation off removes its chip while preserving the July 16
  entry through another reload. The picker states this distinction before the
  switches. A fourth active manual foundation is refused with the visible
  three-at-a-time cap line.
- The same component renders after the parking lot on Short and Long breaks.
  A shared fixture proves its manual and derived states match Tasks. Focused
  work is structurally a `div` with no button and states that its value comes
  from finished sessions.
- The picker remains an accessible `Dialog`; native integration coverage
  proves both native iOS rails hide while it owns the Focus surface and return
  after it closes.

## Automated evidence

- Focused run: 6 files, 97 tests passed. It includes component semantics,
  reducer rules, native-overlay ownership, copy lint, static placement and
  touch-size guards, plus the new persistence and two-surface lifecycle cases.
- Full Vitest run: 66 files, 653 tests passed.
- ESLint completed with zero warnings. The production build passed with 87
  modules transformed and a generated app-shell service worker.
- The deterministic fixture supports `surface=foundations` with `active`,
  `empty`, and `picker` states plus day/night, expanded text spacing, Increase
  Contrast, and forced-color mirrors. Its independent Vite build passed with
  76 modules transformed.
- The local-only audit passed across 181 source files; `git diff --check` and
  the Foundations never-ship lexicon scan passed. Static CSS guards require
  44–48 CSS-pixel action targets and find no percentage or red grading terms
  in the Foundations surface.

## Remaining rendered evidence

The in-app browser runtime was initialized according to its browser workflow,
but discovery returned an empty browser list. No alternate browser automation
was substituted. Therefore rendered 320 px geometry, real keyboard focus,
manual screen-reader output, direct devtools storage inspection, and a clean
rendered console are not claimed. The PLAN checkbox remains open until that
runtime evidence can be recorded.
