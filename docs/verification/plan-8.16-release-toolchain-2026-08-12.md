# PLAN 8.16 release-toolchain verification — 2026-08-12

## Scope

This run completed PLAN 8.16 only. Science is not applicable; the authority is the repository's
engineering-quality and release-toolchain contract. It did not execute a deployment.

## Declared toolchain and CI gates

- `.node-version` pins Actions and local version managers to Node `22.23.2`. The downloaded
  darwin-arm64 archive matched Node's published SHA-256 checksum
  `61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6`.
- `package.json#packageManager` is the only npm version pin: `npm@11.17.0`. The workflow enables
  Corepack and carries no duplicated npm-version literal.
- CI runs `npm ci`, `npm run lint`, `npm test`, and `npm run build` in that order before the
  conditional deploy step.
- `.npmrc` makes unreviewed dependency install scripts a hard install failure. The three reviewed
  packages are approved only at their resolved versions: `esbuild@0.28.1`, `fsevents@2.3.3`, and
  `workerd@1.20260804.1`. Esbuild and workerd validate or prepare their platform binaries;
  fsevents supplies Vite's optional macOS file watcher. Any version change requires a new review.

## Dependency alignment

- The browser transform path is pinned to Vite `8.2.1` with `@vitejs/plugin-react` `6.0.5`.
- Vitest `4.1.10` resolves that same Vite `8.2.1`; its standalone Node config does not load the
  browser-only React transform.
- `npm ls vite vitest @vitejs/plugin-react esbuild --all` showed one deduplicated Vite path.
  Esbuild `0.28.1` remains only below Wrangler, where it is intentional.
- ESLint `9.39.5` is paired with `@eslint/js` `9.39.5`, typescript-eslint `8.67.0`, and
  eslint-plugin-react-hooks `5.2.0`. Hooks 5 supplies the standard Rules of Hooks and exhaustive
  dependency preset for this React 18 app and supports ESLint 9. Hooks 7's recommended preset also
  enables React Compiler adoption rules, which is a separate architecture migration rather than a
  lint-bootstrap change.
- The regenerated lockfile retains all 26 esbuild platform packages. A lockfile engine audit for
  the Actions `linux-x64` runner examined 337 eligible packages, including 219 with Node engine
  declarations; none reject Node `22.23.2`.
- `npm audit` reported zero known vulnerabilities after patched transitive Wrangler, Miniflare,
  Undici, Sharp, tar, and brace-expansion releases were locked.

## Lint findings

The flat config uses `@eslint/js` recommended, typescript-eslint recommended, and the React Hooks
recommended rules without a custom rule collection. Findings were resolved by:

- removing unused values or explicitly consuming destructured migration fields that are
  intentionally discarded;
- making native-control callbacks stable and fixing observer cleanup so late promises cannot
  update disposed surfaces;
- making rolling-analysis clock refresh dependencies explicit while retaining fresh wall-clock
  computation;
- completing missing Hook dependency lists and removing unnecessary memoization; and
- documenting the sole exhaustive-deps exception beside `useBloom` persistence: tick-derived
  `remaining` and `now` must not rewrite localStorage four times per second.

Final `npm run lint` result: zero errors and zero warnings.

## Pristine exact-version proof

The source tree was copied to `/tmp/bloom-plan-8.16-final.ZGJk0e` with `.git`, `node_modules`, and
build outputs excluded. Before installation, `node_modules` did not exist. Commands used the
checksum-verified Node executable and Corepack npm shim directly.

- Node: `v22.23.2`
- npm: `11.17.0`
- `npm ci`: 328 packages installed, zero vulnerabilities, no engine or install-script warnings.
- `npm run lint`: passed with zero warnings.
- `npm test`: 66 test files and 642 tests passed.
- `npm run build`: TypeScript passed; Vite `8.2.1` transformed 87 modules; the production bundle
  and 11-file content-hashed service worker were generated.
- Static workflow check: lint precedes test, test precedes build, and no duplicate npm pin exists.
- `git diff --check`: passed.

This proves the repository's local release-toolchain gate. It does not substitute for the remaining
PLAN device, visual, privacy, deployment, signing, or store-submission evidence.
