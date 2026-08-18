import { expect, test } from '@playwright/test';

interface ReadabilityCase {
  id: string;
  path: string;
  width: number;
  height: number;
  readySelector: string;
  surface: 'focus' | 'goals';
  contrast?: 'more' | 'no-preference';
  forcedColors?: 'active' | 'none';
  focusSelector?: string;
  hoverSelector?: string;
  pressSelector?: string;
  expandedSpacing?: boolean;
}

const LOCAL_ORIGIN = 'http://127.0.0.1:4179';
const cases: ReadabilityCase[] = [
  {
    id: 'day-lightest-small-phone',
    path: '/fixtures/daily-target.html?surface=focus&state=active&theme=day&sky=lightest',
    width: 320,
    height: 568,
    readySelector: '.readout-time',
    surface: 'focus',
    focusSelector: ".tab-btn[aria-pressed='true']",
  },
  {
    id: 'night-darkest-tablet-error-pressed',
    path: '/fixtures/daily-target.html?surface=goals&state=error&theme=night&sky=darkest',
    width: 768,
    height: 1024,
    readySelector: '.day-plan-form-error',
    surface: 'goals',
    pressSelector: '.day-plan-form .goal-go',
  },
  {
    id: 'day-lightest-desktop-expanded-hover-focus',
    path: '/fixtures/daily-target.html?surface=goals&state=active&theme=day&sky=lightest&spacing=expanded',
    width: 1280,
    height: 900,
    readySelector: '.goal-card',
    surface: 'goals',
    focusSelector: '.day-plan-edit input',
    hoverSelector: '.day-plan-row .goal-go',
    expandedSpacing: true,
  },
  {
    id: 'day-lightest-increased-contrast',
    path: '/fixtures/daily-target.html?surface=goals&state=active&theme=day&sky=lightest',
    width: 390,
    height: 844,
    readySelector: '.goal-card',
    surface: 'goals',
    contrast: 'more',
    focusSelector: '.day-plan-row .goal-go',
  },
  {
    id: 'night-darkest-forced-colors',
    path: '/fixtures/daily-target.html?surface=focus&state=active&theme=night&sky=darkest',
    width: 390,
    height: 844,
    readySelector: '.readout-time',
    surface: 'focus',
    forcedColors: 'active',
    focusSelector: ".tab-btn[aria-pressed='true']",
  },
];

for (const auditCase of cases) {
  test(`PLAN 8.9 rendered readability: ${auditCase.id}`, async ({ browser, page }) => {
    const consoleProblems: string[] = [];
    const externalRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(LOCAL_ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:')) {
        externalRequests.push(url);
      }
    });

    await page.setViewportSize({ width: auditCase.width, height: auditCase.height });
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce',
      contrast: auditCase.contrast ?? 'no-preference',
      forcedColors: auditCase.forcedColors ?? 'none',
    });
    /* The Vite development transport can stay active after the screenshot
       suite and make `networkidle` nondeterministic. Named rendered state plus
       bundled-font readiness is the fixture contract this audit needs. */
    await page.goto(auditCase.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(auditCase.readySelector).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    if (auditCase.focusSelector) {
      await page.locator(auditCase.focusSelector).first().focus();
    }
    if (auditCase.hoverSelector) {
      const hovered = page.locator(auditCase.hoverSelector).first();
      await hovered.hover();
      await expect(hovered).toBeVisible();
      expect(await hovered.evaluate((element) => element.matches(':hover'))).toBe(true);
    }

    let pointerHeld = false;
    if (auditCase.pressSelector) {
      const pressed = page.locator(auditCase.pressSelector).first();
      const box = await pressed.boundingBox();
      expect(box, `${auditCase.pressSelector} must have rendered geometry`).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      pointerHeld = true;
      expect(
        await page.evaluate(
          (selector) => document.querySelector(selector)?.matches(':active') ?? false,
          auditCase.pressSelector,
        ),
      ).toBe(true);
    }

    try {
      const metrics = await page.evaluate(({ surface }) => {
        interface Color {
          r: number;
          g: number;
          b: number;
          a: number;
        }

        const parseColor = (value: string): Color | null => {
          const values = value.match(/[\d.]+/g)?.map(Number);
          if (!values || values.length < 3) return null;
          return {
            r: values[0],
            g: values[1],
            b: values[2],
            a: values[3] ?? 1,
          };
        };
        const composite = (front: Color, back: Color): Color => {
          const alpha = front.a + back.a * (1 - front.a);
          if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
          return {
            r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
            g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
            b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
            a: alpha,
          };
        };
        const backgroundFor = (element: Element | null): Color => {
          if (!element) return { r: 255, g: 255, b: 255, a: 1 };
          const parent = backgroundFor(element.parentElement);
          const own = parseColor(getComputedStyle(element).backgroundColor);
          return own ? composite(own, parent) : parent;
        };
        const luminance = (color: Color) => {
          const channel = (value: number) => {
            const normalized = value / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
        };
        const contrast = (first: Color, second: Color) => {
          const firstLuminance = luminance(first);
          const secondLuminance = luminance(second);
          return (
            (Math.max(firstLuminance, secondLuminance) + 0.05) /
            (Math.min(firstLuminance, secondLuminance) + 0.05)
          );
        };
        const isRendered = (element: Element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const uniqueElements = (selectors: string[]) =>
          [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
            .filter(isRendered) as HTMLElement[];

        const textSelectors = surface === 'focus'
          ? ['.greeting', '.status-label', '.readout-time', '.tab-btn']
          : [
              '.head-title',
              '.head-sub',
              '.prog-count',
              '.prog-sub',
              '.day-plan-copy strong',
              '.day-plan-copy span',
              '.goal-title',
              '.goal-pace',
              '.goal-go',
              '.field-error',
            ];
        const essentialSelectors = surface === 'focus'
          ? ['.greeting-row', '.tabs', '.ring-wrap', '.readout', '.prestart-stack', '.controls']
          : ['.head', '.prog-card', '.day-plan-row', '.goal-card', '.goal-add'];

        const textMeasurements = uniqueElements(textSelectors).map((element) => {
          const style = getComputedStyle(element);
          const background = backgroundFor(element);
          const parsedColor = parseColor(style.color)!;
          const foreground = composite(parsedColor, background);
          return {
            selector: element.className || element.tagName.toLowerCase(),
            contrast: contrast(foreground, background),
            fontSize: Number.parseFloat(style.fontSize),
          };
        });

        const boundaryMeasurements = uniqueElements(['input', 'select', 'textarea']).map((element) => {
          const style = getComputedStyle(element);
          const background = backgroundFor(element);
          const border = parseColor(style.borderTopColor)!;
          return {
            selector: element.className || element.tagName.toLowerCase(),
            contrast: contrast(composite(border, background), background),
            fontSize: Number.parseFloat(style.fontSize),
          };
        });

        const phone = document.querySelector<HTMLElement>('.phone')!;
        const phoneRect = phone.getBoundingClientRect();
        const clipped = uniqueElements(essentialSelectors)
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < phoneRect.left - 0.5 || rect.right > phoneRect.right + 0.5;
          })
          .map((element) => element.className || element.tagName.toLowerCase());

        const controls = uniqueElements(['button', 'input', 'select', 'textarea']);
        const collisions: string[] = [];
        for (let index = 0; index < controls.length; index += 1) {
          for (let otherIndex = index + 1; otherIndex < controls.length; otherIndex += 1) {
            const first = controls[index];
            const second = controls[otherIndex];
            if (first.contains(second) || second.contains(first) || first.parentElement !== second.parentElement) continue;
            const firstRect = first.getBoundingClientRect();
            const secondRect = second.getBoundingClientRect();
            const overlapWidth = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
            const overlapHeight = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
            if (overlapWidth > 1 && overlapHeight > 1) {
              collisions.push(`${first.className || first.tagName}/${second.className || second.tagName}`);
            }
          }
        }

        const focused = document.activeElement as HTMLElement | null;
        const focusStyle = focused ? getComputedStyle(focused) : null;
        const focusBackground = focused ? backgroundFor(focused.parentElement) : null;
        const focusOutline = focusStyle ? parseColor(focusStyle.outlineColor) : null;
        const selectedTab = document.querySelector<HTMLElement>(".tab-btn[aria-pressed='true']");
        const disabledAction = document.querySelector<HTMLElement>('.goal-go:disabled');
        const disabledStyle = disabledAction ? getComputedStyle(disabledAction) : null;
        const disabledBackground = disabledAction ? backgroundFor(disabledAction) : null;
        const disabledColor = disabledStyle ? parseColor(disabledStyle.color) : null;

        return {
          textMeasurements,
          boundaryMeasurements,
          clipped,
          collisions,
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          phoneOverflow: phone.scrollWidth - phone.clientWidth,
          focused: focused?.className || focused?.tagName.toLowerCase() || null,
          focusContrast:
            focusOutline && focusBackground
              ? contrast(composite(focusOutline, focusBackground), focusBackground)
              : null,
          selectedTabUnderlined: selectedTab
            ? getComputedStyle(selectedTab).textDecorationLine.includes('underline')
            : null,
          disabledActionContrast:
            disabledColor && disabledBackground
              ? contrast(composite(disabledColor, disabledBackground), disabledBackground)
              : null,
          disabledActionOpacity: disabledStyle ? Number.parseFloat(disabledStyle.opacity) : null,
          increasedContrast: matchMedia('(prefers-contrast: more)').matches,
          forcedColors: matchMedia('(forced-colors: active)').matches,
          expandedSpacing: document.querySelector('.text-spacing-fixture') !== null,
        };
      }, { surface: auditCase.surface });

      expect(consoleProblems).toEqual([]);
      expect(externalRequests).toEqual([]);
      expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
      expect(metrics.phoneOverflow).toBeLessThanOrEqual(0);
      expect(metrics.clipped).toEqual([]);
      expect(metrics.collisions).toEqual([]);
      expect(metrics.textMeasurements.length).toBeGreaterThan(0);
      for (const measurement of metrics.textMeasurements) {
        expect(measurement.contrast, `${measurement.selector} text contrast`).toBeGreaterThanOrEqual(4.5);
        expect(measurement.fontSize, `${measurement.selector} practical type floor`).toBeGreaterThanOrEqual(13);
      }
      for (const measurement of metrics.boundaryMeasurements) {
        expect(measurement.contrast, `${measurement.selector} boundary contrast`).toBeGreaterThanOrEqual(3);
        if (auditCase.width <= 480) {
          expect(measurement.fontSize, `${measurement.selector} mobile input size`).toBeGreaterThanOrEqual(16);
        }
      }
      if (auditCase.focusSelector) {
        expect(metrics.focused).not.toBeNull();
        expect(metrics.focusContrast, `${auditCase.focusSelector} focus contrast`).toBeGreaterThanOrEqual(3);
      }
      if (auditCase.surface === 'focus') {
        expect(metrics.selectedTabUnderlined).toBe(true);
      } else {
        expect(metrics.disabledActionContrast).toBeGreaterThanOrEqual(4.5);
        expect(metrics.disabledActionOpacity).toBe(1);
      }
      expect(metrics.increasedContrast).toBe(auditCase.contrast === 'more');
      expect(metrics.forcedColors).toBe(auditCase.forcedColors === 'active');
      expect(metrics.expandedSpacing).toBe(Boolean(auditCase.expandedSpacing));

      if (auditCase.id === 'day-lightest-small-phone') {
        const primary = page.locator('.ctrl-play');
        await primary.scrollIntoViewIfNeeded();
        await expect(primary).toBeVisible();
        expect(
          await primary.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return hit === element || Boolean(hit && element.contains(hit));
          }),
          'the short-phone Start control must remain reachable above navigation',
        ).toBe(true);
      }

      const minimumTextContrast = Math.min(...metrics.textMeasurements.map((item) => item.contrast));
      const minimumBoundaryContrast = metrics.boundaryMeasurements.length > 0
        ? Math.min(...metrics.boundaryMeasurements.map((item) => item.contrast))
        : null;
      const minimumFontSize = Math.min(...metrics.textMeasurements.map((item) => item.fontSize));
      console.log(
        `[PLAN 8.9] ${auditCase.id} · Chromium ${browser.version()} · ${auditCase.width}x${auditCase.height} · text ${minimumTextContrast.toFixed(2)}:1 · boundary ${minimumBoundaryContrast?.toFixed(2) ?? 'n/a'}:1 · type ${minimumFontSize}px`,
      );
    } finally {
      if (pointerHeld) await page.mouse.up();
    }
  });
}
