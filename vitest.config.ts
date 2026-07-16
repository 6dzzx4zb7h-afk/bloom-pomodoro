import { defineConfig } from 'vitest/config';

// Pure logic tests do not need Vite's React transform. Keeping Vitest on its
// own small config also avoids loading the Vite 5 React plugin through
// Vitest's newer Vite runtime.
export default defineConfig({
  test: {
    environment: 'node',
  },
});
