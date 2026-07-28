# PLAN 8.8 — compact-height ring geometry defect and fix (2026-07-28)

Scope: a reproducible narrow-viewport layout defect found during the first live
production-preview pass after the browser-evidence blocker was cleared.

## How the preview was obtained

The July 26 pass recorded that the production preview "could not bind a local
port in the managed sandbox". That is no longer true. `.claude/launch.json` now
names an absolute Node interpreter instead of bare `npm`, which was the actual
failure (`npm` is not on the preview spawner's `PATH`). `vite preview` on
port 4173 starts normally and the app boots.

## Defect 1 — the progress ring did not follow `.ring-wrap`

`FocusScreen.tsx` renders the ring as `<svg class="ring-svg" width="236"
height="236" viewBox="0 0 236 236">`, styled `position: absolute; inset: 0`.
An absolutely positioned replaced element with intrinsic dimensions resolves
`width: auto` to its attribute width, so `left: 0` wins, `right: 0` is dropped,
and the SVG stays 236 px wide no matter what `.ring-wrap` measures.

At the default `.ring-wrap` size (236 px) the two coincide, so the bug is
invisible on a tall desktop viewport. The `@media (max-height: 620px)` rule
shrinks `.ring-wrap` to 164 px, and the landscape rule to 132 px, while the SVG
stays 236 px.

Measured at 320x568 before the fix:

| Element | size | centre |
| --- | --- | --- |
| `.ring-wrap` | 164 x 164 | (160, 220.4) |
| `.ring-svg` | 236 x 236 | (196, 256) |

The ring overflowed its wrapper by 72 px and sat 36 px down-right of the pet
disc. It also collided with the timer readout below it.

**Fix:** `.ring-svg` now declares `width: 100%; height: 100%`. The `viewBox`
already handles coordinate scaling, so the ring scales with its wrapper.

## Defect 2 — `scale` shrank the pet's centring offset

`.ring-animal` centred itself with `transform: translate(-50%, -50%)`, and the
two compact-height media queries override `scale: 0.78` / `scale: 0.62`.

Per the CSS transform spec the composed matrix is
`translate · rotate · scale · transform`, so the individual `scale` property is
applied *outside* the `transform` translate — the -50% centring offset is
scaled along with the element. At `scale: 0.78` the -65 px offset becomes
-50.7 px, leaving the pet `65 x (1 - 0.78) = 14.3 px` right and below true
centre (24.7 px in the landscape rule).

Measured at 320x568 before the fix: `.ring-animal` centre x = 174.5 against a
wrapper centre x = 160.

**Fix:** `.ring-animal` centres with the individual `translate: -50% -50%`
property, which composes ahead of `scale` and is therefore not scaled by it.

## Verification after the fix (320x568, production preview)

| Check | Result |
| --- | --- |
| `.ring-svg` size vs `.ring-wrap` | 164 x 164 vs 164 x 164 — equal |
| `.ring-svg` concentric with wrapper | yes (dx, dy < 1 px) |
| `.ring-animal` horizontal offset from wrapper centre | 0 px |
| Document horizontal overflow | none (`scrollWidth` 320 = `innerWidth` 320) |
| Elements extending past the right edge | none |
| Interactive targets below 44 x 44 CSS px | none |
| Narrow-viewport input font size | 16 px |
| Console errors/warnings | none |
| `npm test` / `npm run build` | 498 tests green; build green |

The pre-session stack remains reachable through the `.prestart-scroll`
container (`scrollHeight` 645 vs `clientHeight` 500); no control is clipped
unreachable.

## Local-only network inventory (PLAN 7.2 evidence)

A full reload of the production preview recorded exactly five requests, all
same-origin app-shell assets and zero application-data requests:

```
GET http://localhost:4173/                        200
GET http://localhost:4173/fonts/fredoka-latin.woff2 200
GET http://localhost:4173/fonts/nunito-latin.woff2  200
GET http://localhost:4173/assets/index-*.js         200
GET http://localhost:4173/assets/index-*.css        200
```

No external origin, no remote font, no telemetry. This is one screen's evidence,
not the complete 7.2 audit.

## Still not proven here

The automation browser pane reports `document.visibilityState === "hidden"`
for the duration of a scripted session. Both `requestAnimationFrame` and
`IntersectionObserver` are suspended in that state by design, so the decorative
canvases legitimately stay blank and **no live animation measurement is
possible through this harness**. PLAN 8.7's predeclared main-thread and Core
Web Vitals trace therefore remains open and is not claimed by this document.
Layout, geometry, semantics, contrast, and copy are unaffected by the
visibility state and were verified normally.
