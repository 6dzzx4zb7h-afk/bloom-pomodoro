import { defineConfig } from 'vitest/config';

// Pure logic tests do not need Vite's React transform. Keeping Vitest on its
// own small config also avoids loading the Vite 5 React plugin through
// Vitest's newer Vite runtime.
//
// Individual DOM tests opt in per file with `// @vitest-environment jsdom`.
// Those files need Web Storage that neither Node nor Vitest's jsdom bridge
// provides on modern Node; vitest.setup.ts repairs it.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
