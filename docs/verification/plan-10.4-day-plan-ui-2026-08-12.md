# PLAN 10.4 day-plan UI verification — 2026-08-12

Scope: Goals, idle Focus, and post-session debrief behavior for the optional
day plan. This pass does not claim rendered-browser, manual screen-reader,
physical-device, signed-archive, TestFlight, or App Store evidence.

## Product loop

- The Goals add path opens from `plan today` with the current pace suggestion
  already in the single amount field and today in the date field. Confirming is
  the second click. A future date persists without creating an upcoming list;
  both Goals Today and Focus remain quiet until that study day arrives.
- On a fresh idle Focus screen, the target strip now follows the task row inside
  the pre-start hierarchy. Goal targets state overall progress and today's
  derived pair. The label opens Goals; the adjacent one-tap control arms or
  disarms credit; a manually activated chevron is the only rotation path.
- Starting removes the strip. A paused open session and a no-target state also
  omit it. After completion, the debrief echoes the touched target and a goal
  credit updates the same ledger-derived value in both the echo and Goals Today.

## Automated evidence

- `src/store/useBloom.lifecycle.test.tsx`: 47 tests passed, including the
  two-click prefill, future-day visibility, label navigation, arm/start/credit,
  debrief echo, Today update, and no-target/paused states.
- Focused accessibility/lifecycle run: 2 files, 58 tests passed.
- Full Vitest run: 66 files, 647 tests passed.
- ESLint completed with zero warnings; the production build passed with 87
  modules transformed and a generated app-shell service worker.
- The deterministic day-plan fixture now supports Goals and Focus surfaces,
  active/empty states, both themes, expanded text spacing, Increase Contrast,
  and forced-color mirrors. Its independent Vite build passed with 76 modules
  transformed. Static regression coverage fixes the Focus strip between the
  task row and optional setup and keeps it full-width inside the pre-start card.
- `git diff --check` and the new-surface never-ship lexicon scan passed.

## Remaining rendered evidence

The in-app browser controller was initialized and retried after implementation,
but its browser list remained empty. No alternate browser automation was used.
Therefore small-screen and virtual-keyboard geometry, rendered focus order,
manual screen-reader output, and a clean rendered console are not claimed. The
PLAN checkbox remains open until those visual and assistive-technology checks
can be recorded.
