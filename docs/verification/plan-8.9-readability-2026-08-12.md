# PLAN 8.9 readability verification — 2026-08-12

Status update (August 14, 2026): the user explicitly restored PLAN 8.9 to the program. The evidence
below remains partial until the rendered browser matrix passes.

Scope: code-side contrast, type-floor, preference-mode, deterministic-fixture, local-only, build,
and iOS packaging evidence for PLAN 8.9. The rendered browser matrix did not run because the
available browser runtime reported zero browser instances. PLAN 8.9 is active but not completed;
this document does not claim a visual, browser, physical-device, or distribution pass.

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
  colors for surfaces and controls, keeps a 3 px Highlight focus outline, and retains pressed/current
  distinction.
- The selected-friend badge and goal actions now keep an explicit opaque `#ffb0d4` fallback beneath
  their gradient, so computed-color audits cannot incorrectly fall through to a dark parent surface.
  The disabled goal action no longer fades its whole subtree: day uses `#725a7d` on `#eee7f2`
  (4.99:1), night uses `#a394c4` on `#2e2557` (5.00:1), and the selected-friend badge now uses the
  13 px practical state-text floor. The former Tasks empty-state action no longer exists after PLAN
  8.26 consolidated the empty screen onto the one visible add form.

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

## Rendered matrix still required

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
