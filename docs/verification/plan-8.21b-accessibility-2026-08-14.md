# PLAN 8.21b — direct component and automated accessibility coverage

Date: 2026-08-14

Status: complete for direct automated interaction and jsdom-provable semantic evidence. This is not
a screenshot, screen-reader, browser accessibility-tree, WebView, or physical-device claim; PLAN
8.21c–d own those remaining layers.

## Inventory result

`src/testing/surfaceInventory.ts` now records 30 direct automated rows, zero indirect rows, and zero
missing rows. The ten former indirect owners now reference tests that render and operate them:

- Field Guide and contextual Guide suggestion;
- if-then planner and WOOP flow;
- soft restart, parking lot, and ritual;
- Sheet and primary web tab bar; and
- Friends/Collection with its Field Guide section.

The inventory contract independently discovers interactive production owners, verifies every
referenced test path, and now fails with the row IDs if any interactive surface is marked indirect or
missing. Existing direct tests continue to cover critical undo, storage recovery, session repair,
debrief, rollover, return, and modal-focus paths through user-facing controls.

## Observable interaction evidence

`src/components/SecondarySurfaces.accessibility.test.tsx` operates the component surfaces rather than
reading source strings:

- filters the Guide, opens a bundled offline article, focuses its heading, and restores the invoking
  article button on Back;
- activates the precisely named Guide suggestion;
- creates, selects, clears, and removes an if-then plan, including focus and disabled validation;
- moves the restart through offer, announced breath, focused next action, and continue;
- captures a five-word parked thought, announces it, operates item-specific return actions, and
  snoozes the return card;
- toggles the ritual checklist and starts only after the final item;
- traps and restores Sheet focus across Shift-Tab, Tab, Escape, and backdrop dismissal;
- progresses WOOP through each required answer into the shared planner and dismisses it; and
- verifies selected/hidden/shown primary-tab semantics and activation.

`src/screens/CollectionScreen.accessibility.test.tsx` changes the on-duty friend through the rendered
card, observes updated pressed/name state, switches sections, filters the bundled Guide, and audits
the resulting screen.

## Semantic audit and product fixes

`src/testing/renderedAccessibility.ts` adds deterministic checks for the high-signal invariants jsdom
can prove: unique IDs, valid ARIA references, accessible names on interactive controls, valid
`aria-pressed` values, and named modal dialogs with `aria-modal="true"`. Failures contain a rule name,
compact element locator, and exact issue. Its focused test includes intentionally broken markup and
asserts every diagnostic.

The new coverage exposed and fixed five production gaps:

1. parking-save confirmation now uses `role="status"`;
2. repeated parked-thought actions include the affected thought in their accessible names;
3. every soft-restart stage has the stable “Soft restart” region/form name;
4. WOOP step changes use an atomic polite status; and
5. Friends buttons expose concise friend, on-duty, level, and blurb names while retaining
   `aria-pressed`.

No persisted field, schema migration, dependency, account, server, telemetry, remote runtime asset,
or deployment was added.

## Verification

- Focused suite: 4 files, 15 tests passed.
- Full suite: 88 files, 781 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; 88 modules, CSS 94.50 kB / 19.09 kB gzip, JavaScript 499.12 kB /
  148.34 kB gzip, app-shell service worker `b92dcadd23fef855`.
- `node scripts/local-only-audit.mjs`: passed across 207 source files with no new application-data
  request path, remote runtime asset, auth, telemetry, analytics, or diagnostics dependency.
- Voice never-ship lexicon grep over changed production copy: no matches.
- `git diff --check`: passed.

`docs/testing.md` continues to keep manual VoiceOver, TalkBack, keyboard/browser accessibility-tree,
WebView, safe-area, virtual-keyboard, audio, permission, background, and physical-device evidence
open for PLAN 8.21d.
