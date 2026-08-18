import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

interface VisualCase {
  id: string;
  path: string;
  width: number;
  height: number;
  readySelector: string;
  baseline: string;
  contrast?: 'more' | 'no-preference';
  forcedColors?: 'active' | 'none';
  focusSelector?: string;
  hoverSelector?: string;
  pressSelector?: string;
}

const cases = JSON.parse(
  readFileSync(new URL('./cases.json', import.meta.url), 'utf8'),
) as VisualCase[];

const LOCAL_ORIGIN = 'http://127.0.0.1:4179';

for (const visualCase of cases) {
  test(visualCase.id, async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(LOCAL_ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:')) {
        externalRequests.push(url);
      }
    });

    await page.setViewportSize({ width: visualCase.width, height: visualCase.height });
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce',
      contrast: visualCase.contrast ?? 'no-preference',
      forcedColors: visualCase.forcedColors ?? 'none',
    });
    await page.goto(visualCase.path, { waitUntil: 'networkidle' });
    await expect(page.locator(visualCase.readySelector).first()).toBeVisible();

    const bundledFontsReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        fredoka: document.fonts.check('16px "Fredoka"'),
        nunito: document.fonts.check('16px "Nunito"'),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    });
    expect(bundledFontsReady).toEqual({
      fredoka: true,
      nunito: true,
      reducedMotion: true,
    });

    // Canvas capture can race a clear/draw boundary even when the production
    // scheduler is in its static reduced-motion mode. Snapshot each completed
    // local canvas to a data URL so the fixture keeps the same meaningful pet
    // pose while the browser captures pixels.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      for (const canvas of document.querySelectorAll('canvas')) {
        const rect = canvas.getBoundingClientRect();
        const frozen = new Image();
        frozen.alt = '';
        frozen.className = canvas.className;
        frozen.style.cssText = canvas.style.cssText;
        frozen.style.width = `${rect.width}px`;
        frozen.style.height = `${rect.height}px`;
        frozen.src = canvas.toDataURL('image/png');
        await frozen.decode();
        canvas.replaceWith(frozen);
      }
    });

    if (visualCase.focusSelector) {
      await page.locator(visualCase.focusSelector).first().focus();
    }
    if (visualCase.hoverSelector) {
      await page.locator(visualCase.hoverSelector).first().hover();
    }

    let pointerHeld = false;
    if (visualCase.pressSelector) {
      const pressed = page.locator(visualCase.pressSelector).first();
      const box = await pressed.boundingBox();
      expect(box, `${visualCase.pressSelector} must have rendered geometry`).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      pointerHeld = true;
    }

    if (process.env.BLOOM_VISUAL_PROBE === visualCase.id) {
      await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.dataset.visualProbe = 'one-css-pixel';
        probe.style.cssText = [
          'position:fixed',
          'inset:0 auto auto 0',
          'width:1px',
          'height:1px',
          'background:#ff00ff',
          'z-index:2147483647',
        ].join(';');
        document.body.append(probe);
      });
    }

    expect(externalRequests).toEqual([]);
    try {
      await expect(page).toHaveScreenshot(visualCase.baseline, { fullPage: true });
    } finally {
      if (pointerHeld) await page.mouse.up();
    }
  });
}
