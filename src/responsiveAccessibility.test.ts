import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const onboarding = readFileSync(
  new URL('./components/Onboarding.tsx', import.meta.url),
  'utf8',
);

describe('PLAN 8.8 code-side responsive baseline', () => {
  it('gives ordinary controls the product 44px target and narrow inputs 16px text', () => {
    expect(css).toContain(".phone [role='checkbox']");
    expect(css).toContain(".phone [role='switch']");
    expect(css).toMatch(/\.phone button,[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.phone button,[\s\S]*?min-width:\s*44px/);
    expect(css).toMatch(
      /@media \(max-width: 480px\)[\s\S]*?\.phone input,[\s\S]*?font-size:\s*16px/,
    );
  });

  it('has explicit common-phone, 320px, short-height, and safe-area rules', () => {
    expect(css).toContain('@media (max-width: 480px) and (min-width: 381px)');
    expect(css).toContain('grid-template-columns: 124px minmax(64px, 1fr) 56px 44px');
    expect(css).toContain('@media (max-width: 380px)');
    expect(css).toContain('@media (max-height: 620px)');
    expect(css).toContain('@media (max-height: 500px) and (orientation: landscape)');
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps onboarding keyboard-scrollable and does not autofocus into obstruction', () => {
    expect(css).toContain('scroll-padding-bottom: 42vh');
    expect(css).toMatch(/\.onboard\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(onboarding).not.toContain('autoFocus');
  });
});

describe('PLAN 8.9 preference-mode readability baseline', () => {
  it('places essential timer copy on stable surfaces and raises supporting copy', () => {
    expect(css).toMatch(/\.greeting-row,[\s\S]*?\.readout\s*\{[\s\S]*?background:/);
    expect(css).toMatch(/\.status-label,[\s\S]*?\.onboard-label\s*\{[\s\S]*?font-size:\s*13px/);
  });

  it('defines complete increased-contrast and forced-color layers', () => {
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?background:\s*Canvas;[\s\S]*?outline:\s*3px solid Highlight/,
    );
    expect(css).toContain(".phone [aria-pressed='true']");
    expect(css).toContain('forced-color-adjust: none');
  });
});
