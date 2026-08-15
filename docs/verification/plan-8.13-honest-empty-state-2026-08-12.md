# PLAN 8.13 honest onboarding and empty-state verification — 2026-08-12

Scope: fresh-install task data and the first Tasks empty state. This pass does
not claim a newly rendered browser screenshot, manual screen-reader session,
physical-device check, signed archive, TestFlight, or App Store review.

## Product evidence

- `DEFAULT_STATE` and a fresh `useBloom` mount contain zero tasks. No realistic
  example task is written to `bloom-state`, and the former sample titles are
  absent from application and fixture source.
- Tasks renders one labelled empty-state region that points to the real add
  form immediately below it. The named Task name input and single Add task
  control are the only entry path; submitting that form creates the first task
  and removes the empty state.
- There is no example-dismiss path, so a new user can neither mistake sample
  work for their data nor mutate real work while dismissing an illustration.
  Existing migration fixtures retain their task arrays unchanged.

## Pinned fixture and automated evidence

- Named fixture: `/fixtures/tasks-empty.html`, backed by the production
  `TasksScreen`. Its stable states are `empty` and `focused`, with day/night,
  expanded text spacing, Increase Contrast, and forced-color mirrors. After
  PLAN 8.26 removed the redundant empty-state button, the focused fixture now
  targets the real `#new-task-name` input instead of that deleted control.
- The fixture has explicit fixed date, empty state, settings, and navigation
  inputs. Its independent Vite build passed with 55 modules transformed.
- Static regression guards require the real component, an empty task array,
  one honest entry form, a 44 CSS-pixel Add task control, and absence of the
  former sample titles.
- Focused verification: 3 files, 108 tests passed, including the lifecycle,
  responsive/accessibility, and all-version migration suites.
- Full Vitest run: 66 files, 655 tests passed. ESLint, the production build,
  local-only audit over 182 source files, and `git diff --check` passed.

## August 13 continuation

- PLAN 8.26 intentionally removed the redundant empty-state button. This audit found that the
  `state=focused` fixture still queried that deleted `.task-empty-action`, so the named state focused
  nothing. It now focuses the production `#new-task-name` input, and a static cross-file guard keeps
  the fixture selector paired with that real control.
- Focused verification passed 4 files / 167 tests; the full suite passed 84 files / 766 tests.
- ESLint, the 55-module independent fixture build, production build, local-only audit over 201 source
  files, and `git diff --check` passed.

## Remaining rendered evidence

The in-app browser runtime was initialized for the named fixture on August 13,
but browser discovery again returned an empty list. No alternate browser
automation was substituted. The deterministic fixture is available for a
pinned rendered capture, but a current screenshot/diff, real keyboard focus
observation, screen-reader output, narrow-layout geometry, and rendered console
state are not claimed. PLAN 8.13 therefore remains unchecked.
