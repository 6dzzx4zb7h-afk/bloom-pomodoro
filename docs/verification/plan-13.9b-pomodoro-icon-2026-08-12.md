# PLAN 13.9b — Pomodoro launcher identity

Date: 2026-08-12

## Outcome

Bloom's iOS primary and alternate icons now use one crowned Pomodoro dial with the on-duty friend
inside it. The flower, petals, blossom watermark, and pink/purple period-tracker-like backing are
absent from light, dark, and tinted variants. Web/PWA icons and the iOS launch image use the same
timer-first identity without the friend. Android publishing is deferred, so its launcher files were
intentionally left unchanged.

## Why the earlier design returned

Git history contains the better timer-dial direction in commit `73261fc` on branch
`ios-alarmkit-finish-alarms`. `git merge-base --is-ancestor 73261fc main` exits 1: that branch was
never merged into `main`. Main therefore retained the older flower-producing
`scripts/gen-icons.mjs`; rerunning that source faithfully recreated the flower. This was a source
history issue, not iOS reverting an installed asset.

Only the icon direction was recovered from that history. The branch's AlarmKit and deployment-floor
work remains outside this step and is still deferred.

## Source preservation and deterministic exports

- `scripts/gen-icons.mjs` remains the editable source of truth. iOS and web/PWA have dedicated
  timer-mark generation; the deferred Android blossom path is isolated rather than silently changed.
- The friend sprites still come from the shipped `SPRITES` and `PALETTE` data, so icon faces cannot
  drift from the app's characters.
- The artwork is repo-authored and recovered from this repository's own history; there is no
  third-party asset, external runtime asset, licensing obligation, or attribution requirement.
- `docs/verification/plan-13.9b-icon-export-manifest.json` records the generator, identity flags,
  dimensions, alpha metadata, and SHA-256 digest for all 18 iOS exports and seven web/resource
  exports. A contract test recomputes every digest from the current files.
- Android launcher SHA-256 lists were captured before and after generation and were identical.

## Visual review

- Full-size source review covered Mochi light, dark, and tinted artwork plus the standalone web mark.
- A 60 px launcher downsample retained the crown, progress arc, friend face, and clear outer
  silhouette.
- iPad mini (A17 Pro), iOS 26.5 Simulator: Xcode installed the rebuilt app; the home-screen icon
  showed the crowned timer and bunny at launcher size, and the app relaunched normally.
- iPhone 17 Pro, iOS 26.5 Simulator: the rebuilt app was installed and launched; the home-screen
  icon showed the same timer-first family without cropping.

The dark and tinted files deliberately have transparent backgrounds for system composition; the
Release asset-catalog build accepted those appearances. Light app icons are flattened and have no
alpha channel.

## Verification

- `npx vitest run src/native/iosAppIconAssets.test.ts src/native/iosAppIcon.test.ts` — 12 tests pass.
- `npm run lint` — passes with zero warnings.
- `npm test` — 82 files, 751 tests pass.
- `npm run build` — passes; production web icons are bundled.
- `npm run ios:sync` — passes after a production build.
- Release iOS Simulator `xcodebuild` with `CODE_SIGNING_ALLOWED=NO` — passes. `actool` emits the
  primary iPhone/iPad icon plus all five alternates, and the final bundle runs
  `builtin-validationUtility ... -validate-for-store` successfully.
- `node scripts/local-only-audit.mjs` — passes across 199 source files; no remote asset or data path
  was added.
- `git diff --check` — passes.

## Remaining boundary

This closes generated identity and Simulator rendering, not signed archive, App Store upload, or
physical-device release QA. Those remain in the Phase 13 publishing steps.
