# PLAN 8.21c — pinned visual-regression runner

Date: 2026-08-14

Status: implemented and verified locally, including a pristine exact-toolchain copy. The PLAN step
remains open until the new main-push workflow runs on GitHub and proves the same bytes in CI.

## Scope and boundary

This run adds a development-only Playwright visual gate. It does not change Bloom's production
runtime, persistence, networking, Cloudflare deploy job, native package, user-facing behavior, or
copy. `@playwright/test` is an exact dev dependency and its browser download is a test setup action,
not a remote runtime asset. The visual workflow is separate from deploy, receives read-only contents
permission, has no secrets, and only checks pull requests, main pushes, or manual dispatches.

The runner follows Playwright's requirement that screenshot baselines use the same environment and
that the package/browser image versions stay aligned:

- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
- [Playwright emulation options](https://playwright.dev/docs/test-use-options)
- [GitHub macOS 26 arm64 runner label](https://github.com/actions/runner-images)

## Reproducibility pins

- Node `22.23.2` and Corepack npm `11.17.0`;
- `@playwright/test`, `playwright`, and `playwright-core` `1.62.0`;
- Chrome for Testing `151.0.7922.34`, Playwright Chromium revision `1234`;
- GitHub Actions `macos-26` arm64, matching the local macOS 26 arm64 baseline family;
- bundled Fredoka and Nunito only, with a browser assertion that both faces loaded;
- locale `en-US`, timezone UTC, sRGB color profile, device scale 1, CSS-pixel screenshots, one
  worker, fixed viewport per manifest case, light system preference, and reduced motion; and
- fixture-only canvas freezing after its completed reduced-motion frame, retaining the visible pet
  pose while preventing a screenshot from racing a canvas clear/draw boundary.

Every observed request must stay on `http://127.0.0.1:4179` or use a local data/blob URL. The service
worker is blocked. The Vite server has a strict fixed port and no reuse, so an occupied port fails
instead of silently attaching to unrelated state.

## Reviewed representative baselines

| Case | Size | Theme/state | File size | SHA-256 |
| --- | ---: | --- | ---: | --- |
| Goals active daily targets | 390×844 | day, reduced motion | 130,731 bytes | `551430360f57230100158fe286274650d7d462ffad47d51413d3a38d18a32d53` |
| Tasks honest empty state | 320×568 | night, reduced motion | 40,193 bytes | `a870fe47f5ffacfad13767352f70e11f3d3a127b8fb31d614b024de2e7aeed10` |

Both PNGs were inspected at native resolution. Goals keeps its static bunny, target edit controls,
progress cards, and visible navigation without clipping. Tasks keeps its empty explanation,
task-add affordance, and navigation inside the short-phone viewport. These are representative
runner proofs, not 8.21d's exhaustive surface/state/theme/viewport matrix.

## Failure contracts and artifacts

`visual-tests/cases.json` and the inventory must name exactly the committed baseline set.
`scripts/check-visual-baselines.mjs` fails with the affected filenames for either a missing expected
PNG or an unlisted stale PNG; its proof command exercises both diagnostics.

The strict comparison allows zero changed pixels. `scripts/prove-visual-failure.mjs` adds one
fixture-only magenta CSS pixel to the Goals case and requires Playwright to return nonzero. The proof
reported exactly one changed pixel and emitted expected, actual, diff, screenshot, trace, and error
context under ignored `visual-artifacts/one-pixel-proof`. The script itself returns success only
after finding all three comparison PNGs. CI uploads the artifact directory for 14 days.

## Exact-toolchain and lockfile evidence

The source tree was copied without `.git`, `node_modules`, build output, or visual artifacts to
`/tmp/bloom-plan-8.21c.ryH1Ab`. Before install, `node_modules` did not exist.

- pristine `npm ci`: 332 packages installed / 333 audited, zero vulnerabilities, no engine warning,
  and no unapproved install script;
- pristine lint: zero errors and zero warnings;
- pristine full suite: 88 files and 781 tests passed;
- pristine production build: 88 modules; CSS 94.50 kB / 19.09 kB gzip; JavaScript 499.12 kB /
  148.34 kB gzip; service worker `b92dcadd23fef855` across 11 files; and
- pristine `npm run visual:verify`: two baseline comparisons passed; missing/stale proof passed; the
  deliberate one-pixel comparison failed and emitted the required artifacts.

The lockfile is version 3 and pins all three Playwright packages to `1.62.0`. The platform inventory
retains 26 esbuild, 26 Sharp, and 14 Rolldown binding entries. A platform-filtered Node-engine audit
found zero incompatibilities among 339 deploy-linux-x64 eligible packages / 221 engine declarations
and 335 visual-darwin-arm64 eligible packages / 219 engine declarations. A separate `npm audit`
reported zero known vulnerabilities. The exact `fsevents@2.3.2` optional Playwright watcher script
was added to the existing strict allowlist; no blanket install-script bypass was used.

## Remaining CI/publish evidence

The local visual gate passed repeatedly on macOS `26.6.1` arm64. GitHub CLI authentication was
restored for account `0xzeki` on August 15 and the reviewed branch is being published. PLAN 8.21c
stays unchecked until the resulting pull-request `macos-26` workflow proves both committed
baselines byte-for-byte and uploads the one-pixel artifacts. No deployment was attempted.
