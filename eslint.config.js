// ROADMAP 8.16. The repository had no linter at all.
//
// Scope is deliberately narrow: correctness rules that catch bugs a human
// reviewer misses, not style. Bloom's whole architecture is one large
// useReducer behind hooks, so the react-hooks rules are the ones that earn
// their place — a missing dependency there is a real timer bug, not a nit.
//
// Prettier is intentionally absent. Adding it would reformat ~5,300 lines of
// CSS and every source file in a single commit, destroying `git blame` on a
// codebase whose formatting is already consistent. That is a large cost for no
// defect caught.
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Generated, vendored, or native — none of it is ours to lint.
    ignores: [
      'dist/**',
      'android/**',
      'ios/**',
      'visual-artifacts/**',
      'visual-baselines/**',
      'docs/archive/**',
      'public/**',
    ],
  },

  // App source: browser globals, hooks correctness.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,

      // react-hooks v7 ships the React Compiler rules in both presets. Bloom is
      // React 18 without the compiler, and these four are the only ones the
      // codebase trips: set-state-in-effect (25), refs (12), purity (7) and
      // globals (4). Every other rule in the preset passes clean and stays an
      // error, so the linter still blocks real defects today.
      //
      // They are kept as warnings rather than switched off: each is a genuine
      // observation, but the sites are the timer and session-lifecycle effects,
      // which are the most behaviour-sensitive code in the app. Silencing them
      // would hide the list; making them errors would either block every commit
      // or force a 44-site refactor of exactly that code in a tooling change.
      // Promote them to errors one rule at a time, with tests, as they are
      // worked through.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/globals': 'warn',

      // The codebase uses leading-underscore params in a few reducer branches
      // to mark a deliberately unused argument; keep that idiom legal.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Tests may lean on `any` when they are asserting about untyped shapes.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // Build and tooling scripts run in Node, not the browser.
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,js}', 'vitest.setup.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
