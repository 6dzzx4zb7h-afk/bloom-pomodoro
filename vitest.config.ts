import { configDefaults, defineConfig } from 'vitest/config';

// Pure logic tests do not need Vite's React transform. Keeping Vitest on its
// own small config avoids loading browser-only React transforms for Node tests.
export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'visual-tests/**'],
  },
});
