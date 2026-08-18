# PLAN 8.7 animation verification

## Fixture and pre-change baseline

Recorded before animation implementation on 2026-07-23.

- Fixture: production build, Collection → Friends, six `PixelPal` canvases plus
  the active day or night sky canvas.
- Animation-source hashes:
  - `DaySky.tsx`: `b8351ca94bb1b30ff95f12a5015eb66b27353cd4`
  - `NightSky.tsx`: `482b1e8389839142fbcfa3e5e4696a5cedb19971`
  - `PixelPal.tsx`: `d4c3d9bf35e19e956369a693682b29e265e209af`
  - `pixelpals.ts`: `c63c4fc5e82575368fa49f370552c1da08c2c9c8`
- Production JavaScript: 328,310 bytes raw / 101,414 bytes gzip.
- Driver inventory:
  - Six independent 50 ms pal intervals: 120 timer callbacks/second.
  - One sky `requestAnimationFrame` loop: approximately 60 callbacks/second on
    a 60 Hz visible display.
  - Expected visible Friends workload: approximately 180 animation-driver
    callbacks/second before canvas draw work.
  - Hidden: the six interval callbacks still wake and check
    `document.visibilityState`, approximately 120 callbacks/second even though
    they skip drawing.
  - Offscreen friend cards: their intervals continue at 20 callbacks/second
    each because there is no intersection gating.

The in-app browser was unavailable when this baseline was recorded, so the
driver trace above is a reproducible source/schedule inventory, not a DevTools
main-thread or Core Web Vitals trace. PLAN 8.7 must remain open until that
browser evidence is recorded.

## Budgets declared before implementation

These budgets apply to the same seven-canvas Friends fixture:

1. Exactly one shared `requestAnimationFrame` driver; zero per-canvas
   intervals or animation-frame loops.
2. Pal rendering is capped at 15 frames/second and sky rendering at 20
   frames/second. With all seven canvases intersecting, subscriber draws are
   capped at 110/second (6 × 15 + 20), at least 38% below the 180/second
   baseline driver count.
3. A hidden document performs zero scheduled decorative frames and zero
   subscriber draws. An offscreen canvas performs zero subscriber draws.
4. Turning reduced motion on stops the loop and performs one static redraw per
   visible canvas; mode/state changes may request another static redraw, but
   no decorative loop restarts.
5. Shared-scheduler dispatch for seven no-op subscribers stays below 2 ms p95
   in the deterministic local benchmark. A later real-browser trace must show
   decorative tasks below 8 ms p95, zero animation-attributable long tasks,
   and no timer-control interaction regression.
6. Production JavaScript gzip growth stays within 1.5 KiB.

## After-change evidence

Recorded after implementation on 2026-07-25.

- One lazily shared `DecorativeScheduler` now drives every subscribed pal and
  sky canvas. Source hashes:
  - `DaySky.tsx`: `007d94b66bf2b43cd94243cdc0982d9600e92a4d`
  - `NightSky.tsx`: `a2696ee2acc1d26d1d9535fba14bf46d40738623`
  - `pixelpals.ts`: `41f2590d2eaa07fb5be02f3a5a9e053b148dd9d6`
  - `decorativeScheduler.ts`: `2caf08618ba89d5fed176b574aa1d636c191d0af`
- Deterministic scheduler coverage proves one pending driver for seven visible
  subscribers, 100–110 animated subscriber draws/second in the declared
  fixture, zero pending frames/draws while hidden, zero offscreen draws, and
  seven-subscriber dispatch below the declared 2 ms p95 ceiling.
- Render tests prove DaySky, NightSky, and PixelPal hold a stable,
  state-understandable frame under reduced motion; meteors, star pulses,
  particles, bobbing, and sky drift do not advance.
- `npm test` is green at 29 files / 312 tests; `npm run build` is green.
- The current production JavaScript is 345,375 bytes raw / 106,868 bytes gzip,
  but this was measured after the concurrent study-day, data-stewardship,
  empty-state, and service-worker batch. Its +5,454-byte gzip change is not an
  animation-only delta and therefore cannot honestly close budget 6.

### Isolated bundle comparison

Recorded on 2026-07-26 from two builds of the same `HEAD` snapshot, both using
the workspace dependency installation:

- Baseline: 327,218 bytes raw / 101,031 bytes gzip.
- Animation-only variant (`DaySky.tsx`, `NightSky.tsx`, `pixelpals.ts`, and
  `decorativeScheduler.ts`): 330,411 bytes raw / 102,028 bytes gzip.
- Delta: +3,193 bytes raw / **+997 bytes gzip**, within the predeclared
  1.5 KiB gzip ceiling.

PLAN 8.7 remains open for the predeclared real-browser decorative-task/Core Web
Vitals trace and timer-control interaction comparison. The isolated bundle
budget is now satisfied.
