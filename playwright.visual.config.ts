import { defineConfig } from '@playwright/test';

const visualPort = 4179;

export default defineConfig({
  testDir: './visual-tests',
  testMatch: '**/*.visual.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: 'visual-artifacts/test-results',
  snapshotPathTemplate: 'visual-baselines/{projectName}/{arg}{ext}',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'visual-artifacts/report', open: 'never' }],
  ],
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 0,
      threshold: 0,
      stylePath: './visual-tests/screenshot.css',
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${visualPort}`,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      args: [
        '--force-color-profile=srgb',
        '--font-render-hinting=none',
        '--disable-lcd-text',
        // Keep rounded-corner and gradient rasterization independent of the
        // local/hosted Mac GPU and ARM CPU feature set. The comparator stays
        // at a true zero-pixel threshold; production styles are not masked.
        '--disable-gpu',
        '--disable-skia-runtime-opts',
      ],
    },
  },
  projects: [
    {
      name: 'chromium-macos26-arm64',
      use: { browserName: 'chromium', reducedMotion: 'reduce' },
    },
  ],
  webServer: {
    command: 'npm run visual:serve',
    url: `http://127.0.0.1:${visualPort}/fixtures/tasks-empty.html`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      TZ: 'UTC',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
    },
  },
});
