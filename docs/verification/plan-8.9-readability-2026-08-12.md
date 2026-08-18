# PLAN 8.9 readability verification — 2026-08-12

Status: complete on August 17, 2026. The user explicitly restored PLAN 8.9 on August 14; the
initial code-side evidence below remained partial until the pinned rendered matrix passed in the
closure run recorded at the end of this document.

Scope: code-side and rendered Chromium contrast, type-floor, preference-mode,
deterministic-fixture, local-only, test, and build evidence for PLAN 8.9. The interactive in-app
Browser remained unavailable; this document does not claim Safari/Firefox, screen-reader,
physical-device, deployment, distribution, or the broader PLAN 8.21d matrix.

## Implemented contract

- Essential Focus copy (`greeting-row` and `readout`) and screen headings use stable, theme-aware
  surfaces instead of relying on whichever animated-sky frame happens to sit beneath them.
- Day supporting text uses opaque `#725a7d`; night support/error tokens use `#a394c4` and
  `#ffc0d9` on the app's dark surfaces. The pastel action ink is `#32183b`.
- Ordinary field/control boundaries use `#866c91` on day surfaces (4.60:1 against white) and
  `#a394c4` on night controls (5.00:1 against `#2e2557`). Selected night-state outlines remain at
  least 3:1 against each shipped selected/control surface sampled by the regression.
- Selected chips and filters gain a contrasting outline; the active timer mode also gains an
  underline and weight change. Pressed/current meaning is therefore not carried by pastel color
  alone.
- The practical 13 px floor covers essential instructions, explanatory lines, inputs, status text,
  and controls across the original UI plus History, day plans, foundations, parking, recovery,
  cadence, and session setup. Smaller type remains for dates, counts, stage tags, source citations,
  and other nonessential metadata.
- `prefers-contrast: more` replaces translucent cards with opaque, strongly bordered surfaces and
  strengthens focus/current states. `forced-colors: active` removes the decorative sky, uses system
  colors for surfaces and controls, keeps a 3 px `CanvasText` focus outline, and retains
  pressed/current distinction.
- The selected-friend badge and goal actions now keep an explicit opaque `#ffb0d4` fallback beneath
  their gradient, so computed-color audits cannot incorrectly fall through to a dark parent surface.
  The disabled goal action no longer fades its whole subtree: day uses `#725a7d` on `#eee7f2`
  (4.99:1), night uses `#a394c4` on `#2e2557` (5.00:1), and the selected-friend badge now uses the
  13 px practical state-text floor. The former Tasks empty-state action no longer exists after PLAN
  8.26 consolidated the empty screen onto the one visible add form.
- A final cascade guard keeps mobile inputs at 16 px after the broad 13 px supporting-copy floor;
  selected forced-colors controls preserve the paired `HighlightText`/`Highlight` system colors;
  and forced-colors keyboard focus uses `CanvasText !important` so the ordinary theme accent
  cannot erase the ring against a light system canvas.

## Deterministic fixture

`/fixtures/daily-target.html` supports stable query-controlled states:

- `theme=day|night`
- `state=active|entry|error|empty`
- `spacing=expanded` for the WCAG text-spacing stress override
- `preference=more|forced` as fixture-only mirrors of the production preference media queries

The fixture includes headings and cards over the sky, progress, selected/ordinary controls, inputs,
an inline error, and bottom navigation. It compiled independently through Vite as an SSR bundle: 24
modules transformed, 79.10 kB output. The fixture classes are imported only by its entry point and
do not enter Bloom's production bundle.

## Automated evidence

- `npx vitest run src/responsiveAccessibility.test.ts`: 1 file, 10 tests passed.
- `npm test`: 66 files, 642 tests passed.
- `npm run ios:sync`: production build passed (103 modules); generated the hashed app-shell service
  worker and copied the bundle into the Capacitor iOS target; plugin sync passed.
- Final production assets: CSS 95.52 kB / 19.11 kB gzip; JavaScript 489.62 kB / 150.11 kB gzip.
  The last boundary/type-floor correction added about 0.31 kB gzip to CSS versus the immediately
  preceding same-worktree build.
- `node scripts/local-only-audit.mjs`: passed for 181 source files, dependencies, bundle fetch sites,
  service-worker guards, and locally bundled runtime assets.
- `git diff --check`: passed.

### Restoration run — August 14, 2026

- `npx vitest run src/responsiveAccessibility.test.ts`: 1 file, 16 tests passed, including the
  opaque action fallbacks, disabled day/night goal-action pairs, 13 px duty state text, and the
  `aria-pressed` plus visible “on duty” redundancy.
- `npm run lint`: passed with zero warnings.
- `npm test`: 85 files, 769 tests passed.
- `npm run build`: passed; production assets are CSS 94.50 kB / 19.09 kB gzip and JavaScript
  498.71 kB / 148.26 kB gzip; the app-shell service worker was regenerated.
- Independent daily-target fixture build: 65 modules transformed, 429.31 kB / 106.25 kB gzip.
- `node scripts/local-only-audit.mjs`: passed across 203 source files; no network API, remote runtime
  asset, auth, telemetry, analytics, or diagnostic dependency was introduced.
- `git diff --check`: passed.
- Browser setup completed, but discovery again returned zero browser instances. No other browser
  surface was substituted, so the rendered matrix below remains open. No physical-device, iOS
  packaging, deployment, or distribution claim is made for this restoration run.

## Rendered matrix requirement (closed August 17, 2026)

The following matrix is the remaining gate:

1. Day and night at the lightest/darkest animated-sky frames; inspect normal, hover, focus, pressed,
   selected, disabled, and inline-error states.
2. 320 x 568, representative tablet, and desktop; then a 320 CSS px 200%-layout-equivalent pass. If
   the browser can control actual page zoom, record that separately rather than calling the layout
   equivalent an actual zoom interaction.
3. `spacing=expanded`; confirm no essential text or action clips or overlaps.
4. Real Increase Contrast and forced-colors settings where the browser/OS supports them; use the
   fixture mirrors only as deterministic regression states, not proof of OS preference delivery.
5. Record computed foreground/background/boundary colors and geometry, console output, browser and
   version, viewport, and screenshots or diffable baselines.

Browser setup reached the runtime successfully on this pass, but browser discovery returned an empty
list. No unrelated browser automation surface was substituted, and no rendered result is claimed.

## Closure run — August 17, 2026

The interactive Browser skill again exposed no controllable instances. Since the earlier partial
run, the repository gained PLAN 8.21c's pinned local renderer; it supplied a reproducible rendered
Chromium surface without being treated as in-app-browser, Safari/Firefox, assistive-technology, or
device evidence.

### Rendered coverage and measurements

- Engine/environment: Chromium `151.0.7922.34`, Playwright `1.62.0`, macOS `26.6.1` arm64, sRGB,
  device scale 1, UTC, `en-US`, bundled Fredoka/Nunito, reduced motion, software/Skia raster path.
- Viewports: 320×568 small phone / 200%-layout equivalent, 390×844 common phone, 768×1024 tablet,
  and 1280×900 desktop. The runner cannot issue real browser page zoom, so the 320 CSS-pixel cell
  remains explicitly layout-equivalent rather than mislabeled as an actual zoom interaction.
- Worst frames: fixture-controlled white day-cloud backing and `#0f0b26`, the darkest shipped night
  token. Essential copy stays on the production stable surfaces over both.
- States: normal, hovered, keyboard-focused, pointer-pressed, selected, disabled, and inline error.
  Expanded WCAG text spacing produced no overlap; the 320×568 Start control scrolls above the
  navigation hit layer and remains operable.
- Preference delivery: Chromium's real `prefers-contrast: more` and `forced-colors: active` media
  queries matched through browser emulation. This is production media-query delivery, not the
  fixture-only mirror and not an OS Settings UI claim.
- Minimum rendered values: 4.99:1 text, 4.60:1 input/control boundary, 13 px essential supporting
  copy, 16 px form controls at narrow widths, and 11.30:1 minimum text in the forced-colors cell.
  There was no document/phone horizontal overflow, control collision, external request, console
  warning, or console error.

### Reviewed baseline set

Five new PLAN 8.9 baselines join the two PLAN 8.21c runner proofs:

| Baseline | Bytes | SHA-256 |
| --- | ---: | --- |
| `focus-day-lightest-selected-320x568.png` | 46,123 | `e5c3db974acd7f6cb731d2901168c998ef897f8ae8656678dd34940f726659d9` |
| `focus-night-forced-colors-390x844.png` | 49,296 | `d8b50b48931a061ab361fd659f6789d6a803f57bdca561ad4f1120de3c247eb2` |
| `goals-day-expanded-1280x900.png` | 149,810 | `296644ceac1afc1fbe746970ce68cad0f8190e03fd77e8db136a4d735b9e50ce` |
| `goals-day-increased-contrast-390x844.png` | 114,373 | `6b5a7f5180afdbfeaccc19bc7fda80f0528774f80d8b76e10f5118def6b50fa1` |
| `goals-night-darkest-error-768x1024.png` | 115,291 | `e08b1083d8f6a3d6d88c035bccecb68033895772fd7817be0cfdd867a8a4f8f1` |

Every new image was reviewed at native resolution. The existing Goals 390×844 baseline changed in
233 of 329,160 pixels, bounded to the three day-plan number glyphs (`x=192–200`, `y=276–427`),
which is exactly the reviewed 13→16 px mobile input correction; before, after, and amplified diff
views showed no unrelated region changing.

### Final commands

- `npx vitest run src/responsiveAccessibility.test.ts src/testing/surfaceInventory.test.ts`: 2
  files / 20 tests passed.
- `npm run visual:verify`: seven strict zero-threshold baseline comparisons and five rendered
  readability audits passed; missing/stale diagnostics passed; the deliberate one-CSS-pixel probe
  failed as required and emitted readable expected/actual/diff artifacts.
- `npm run lint`: passed with zero warnings.
- `npm test`: 88 files / 782 tests passed. An earlier parallel run starved five fork workers before
  they loaded tests; the isolated full run passed in 9.03 seconds with no unhandled errors.
- `npm run build`: 88 modules; CSS 94.68 kB / 19.10 kB gzip; JavaScript 499.12 kB / 148.34 kB gzip;
  app-shell service worker `700e5d89630fe552` across 11 files.
- `node scripts/local-only-audit.mjs`: passed across 207 source files with local assets and no new
  auth, sync, telemetry, analytics, diagnostics, external runtime URL, or application-data request.
- `git diff --check`: passed.
