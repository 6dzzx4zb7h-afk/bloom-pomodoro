# Bloom browser QA handoff

This is the fast browser check for PLAN 7.5. It is deliberately smaller than release QA: it
checks one representative product path in a local production build, then records the important
browser and accessibility preferences without turning an unobserved cell into a pass.

## Start a production preview

```bash
npm run build
BLOOM_PRIVACY_PREVIEW_PORT=4178 node scripts/privacy-preview.mjs
```

`privacy-preview.mjs` serves `dist/` with request logging and the local-only Content Security
Policy used by the privacy audit. It sets Vite's `preview.open` to `false`, so the command must not
open Safari or any other browser. Use a fresh port or a fresh browser profile when the smoke needs
empty local storage. Do not clear a real user's Bloom data for QA.

## Ten-minute golden path

Run the same checklist at a desktop viewport and at **320 x 568 CSS pixels**. Start from a fresh
origin and keep DevTools or the browser console open for errors.

1. **Onboard and prepare.** Enter a test name. Confirm that `welcome to Bloom`, `Your name`, and
   `let's bloom ->` have useful accessible names and that the disabled submit becomes operable.
   Accept `try it next time` in the one-time environment-reset suggestion.
2. **Prepare the short QA cadence.** Open Settings. Set Focus to `5 min`; under Companion turn on
   `Companion mode`, set `Check in every` to `3 min`, leave `Notice tab switches` on, and leave
   `Quiet mode` off. These values keep the smoke under ten minutes on its isolated QA origin.
3. **Choose Tiny and make an if-then plan.** Choose Tiny -> `2 min`. Expand `a little more prep`,
   open `what's our opening move?`, enter an `If - the cue` and `Then - the first action`, and use
   `save & use`. Enter a short Session target.
4. **Run the ritual.** Open `tiny environment reset`; operate all four named checklist buttons.
   The fourth button must close the ritual and start the timer. The running surface must retain the
   session target and expose named Reset, Pause, Skip, and `park it` controls.
5. **Finish the Tiny rung and grow it.** Let the two-minute rung end. In the `Tiny start complete`
   status choose `yes, 10 more`; the timer must continue at `10:00` with the target intact. Choose
   Focus to end this optional extension and prepare the five-minute drift session.
6. **Record a drift.** Start the five-minute Focus session with a target. At the three-minute
   Companion check-in choose `i drifted`, classify the drift, then answer or skip the optional
   onset estimate. The prompt must remain available until answered while the session is present.
7. **Park and resume the thread.** Use `park it`, save a short thought with `tuck away`, then reload
   the running app. The named `Resume interrupted session` region must restore both target and
   parked thought. Enter `next concrete action`, choose `resume from here`, and verify the timer
   resumes from its prior wall-clock remainder instead of restarting at five minutes. The live
   tab-return truth modal is additionally covered by the lifecycle and accessibility suites.
8. **Complete and inspect the debrief.** Let the resumed session finish. Resolve the parked thought
   and expect one `Session debrief`, one completed session record, one growth/reward update, the
   saved target, and the drift classification. No duplicate XP, streak, task, or record credit may
   appear.
9. **Open the suggested guide article.** From the debrief, operate the button named
   `Open Field Guide article: ...`; verify the named article opens and Back returns to Bloom without
   losing the completed record.
10. **Open the weekly review.** Open Settings -> Your data -> `see this week`. Expect the named
    `Weekly review` status. Thin-data copy is valid on a fresh origin; the surface must not invent a
    personalized conclusion.

At each step, use Tab/Shift+Tab for at least one complete pass. Enter and Space must activate native
buttons; the focus ring must remain visible and unobscured around dialogs, sticky controls, and the
bottom navigation. Record console errors, horizontal overflow, clipped text, duplicate records, or
unexpected network requests as failures.

## Compact browser matrix

Use `pass`, `fail`, `recorded`, `automated`, `linked`, `blocked`, or `deferred`; include the date and
evidence. `Automated` and `linked` are supporting evidence, not substitutes for the live
golden-path cells.

| Cell | Acceptance check | Current evidence (2026-08-11) | Status |
| --- | --- | --- | --- |
| Desktop production path | All ten steps, no relevant console errors | 1280 x 800 production run completed Tiny growth, real three-minute drift classification, parking, reload recovery at `1:31`, completed debrief with one drift, matching Field Guide article, and weekly review. Browser console log was empty. | pass |
| 320 x 568 production path | Same ten steps; no horizontal page overflow; Focus usable in 568 px height | The full path repeated at 320 x 568. Every sampled surface stayed at `clientWidth = scrollWidth = 320`. The run exposed and then verified the debrief clipping fix below. | pass |
| Keyboard and focus | Logical order; native controls, visible focus, named modal focus rules | Live Tab navigation moved focus to the 44 x 44 Settings button with a 3 px `rgb(85, 50, 103)` outline. The in-app harness did not deliver Enter/Space activation, so native-button activation remains recorded through semantics and component tests rather than claimed as a manual keypress pass. | recorded |
| Essential names | One named main; headings, navigation, timer, parking, resume, suggestions, review named | Live trees exposed `Before this session`, `Environment reset`, `Companion check-in`, `Resume interrupted session`, `Session debrief`, both Field Guide articles, `Weekly review`, and named timer/navigation controls. | pass |
| Short/narrow layout | 320 x 568 and short-height controls remain reachable; 44 px targets where required | Ritual controls measured 265 x 44; the saved if-then control 192 x 44; parking input 124 x 44; resume surface 288 px wide. A long debrief initially began at y=-80; `.debrief-card` now caps at 392.5 px with internal scrolling and begins at y=4.5. | pass |
| Day and night themes | Golden path readable and operable in both themes | Desktop path ran under night (`body.night`, `rgb(27, 21, 53)`) and returned to day (`rgb(121, 191, 242)`); the mobile path ran under day. | pass |
| 200% zoom/reflow | Ordinary content reflows without two-dimensional scrolling or clipped controls | The 320 CSS px run is the layout equivalent of a 640 px viewport at 200% zoom, as documented by the narrow-layout rule. All sampled surfaces had zero horizontal overflow. The harness could not drive the browser's zoom chrome, so this is a layout-equivalent measurement, not a claimed zoom-button interaction. | recorded |
| Reduced motion | Nonessential pal/sky motion is static; state remains understandable | Runtime media state was `reduce: false`; this browser exposes no media-emulation capability. `Sky.motion.test.tsx`, `pixelpals.motion.test.ts`, and `decorativeScheduler.test.ts` prove the static state and zero-loop policy under `reduce`. | automated |
| Empty state | Fresh Tasks, History, weekly review, and optional surfaces explain the next action | Fresh-origin Focus plus prior fresh Tasks/History browser evidence and component tests. | pass |
| Error and recovery | Validation is named; failed writes keep prior data and expose recovery; interrupted work can resume | Live reload recovery restored target, parked thought, next action, and correct remaining time at both viewports (372 ms desktop, 384 ms mobile). Storage-failure and repair-error branches remain deterministic automated coverage. | pass |
| Startup | Measure navigation until an accessible app heading; label as a local lab proxy | A fresh production navigation to the app heading measured **2692 ms**; a prior warm reload measured **51 ms**. Corrected preview responses were shell 11 ms, CSS 4 ms, and JS 17 ms on this machine. | pass |
| Interaction | Measure action until the expected accessible state | Direct state transitions measured 299 ms for desktop Tiny growth, 297 ms for the desktop guide link, and 287 ms for mobile Tiny growth (median **297 ms**). | pass |
| Local-only network | No application-data request; all runtime assets local | `node scripts/local-only-audit.mjs` plus the production request log showed only the local shell, bundled JS/CSS/fonts/icons, manifest, and service worker from `127.0.0.1`. | pass |

The performance values above are single-run local lab observations, not field data or Core Web
Vitals. Record the machine/browser, repeat count, median, p95 where meaningful, and throttling setup
before using a number as a release budget.

## Automated checks

Run after the browser pass:

```bash
node scripts/local-only-audit.mjs
npm run lint
npm test
npm run build
git diff --check
```

The living cross-screen coverage inventory, deterministic-fixture rules, and visual-baseline review
policy are in [`docs/testing.md`](testing.md). A fixture listed there is not a screenshot pass until
the pinned visual runner and reviewed baseline exist.

Relevant automated coverage includes:

- `src/store/useBloom.lifecycle.test.tsx` for timer/session finalization, Tiny, return questions,
  interrupted recovery, debrief, and weekly review;
- `src/App.accessibility.test.tsx`, `src/components/ResumeCue.test.tsx`, and
  `src/responsiveAccessibility.test.ts` for names, dialog ownership, focus, and responsive rules;
- `src/components/Sky.motion.test.tsx`, `src/engine/pixelpals.motion.test.ts`, and
  `src/engine/decorativeScheduler.test.ts` for reduced motion and hidden/offscreen work;
- `src/store/storageRecovery.test.tsx`, `src/store/sessionRepair.integration.test.tsx`, and the
  `fixtures/session-repair.html` fixture for error and recovery behavior.

## Explicitly deferred from PLAN 7.5

- physical iPhone/iPad and Android interaction, VoiceOver/TalkBack, safe-area and virtual-keyboard
  checks;
- signed IPA/APK, upgrade install, locked-device timer alerts, airplane-mode device checks, and
  App Store/Play submission;
- deployed Cloudflare/production verification, release tags, and production monitoring;
- installed-PWA offline reload evidence and exhaustive visual-regression baselines (PLAN 8.21).

Those cells must remain `deferred` or `unverified` until somebody observes them. A passing web build,
Capacitor sync, or Simulator compile must not be used as a substitute.
