import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const onboarding = readFileSync(
  new URL('./components/Onboarding.tsx', import.meta.url),
  'utf8',
);
const focusScreen = readFileSync(
  new URL('./screens/FocusScreen.tsx', import.meta.url),
  'utf8',
);
const dailyTargetFixture = readFileSync(
  new URL('./screens/DailyTarget.visual-fixture.tsx', import.meta.url),
  'utf8',
);
const dailyTargetFixtureCss = readFileSync(
  new URL('./screens/DailyTarget.visual-fixture.css', import.meta.url),
  'utf8',
);
const foundationsCard = readFileSync(
  new URL('./components/FoundationsCard.tsx', import.meta.url),
  'utf8',
);
const tasksScreen = readFileSync(
  new URL('./screens/TasksScreen.tsx', import.meta.url),
  'utf8',
);
const collectionScreen = readFileSync(
  new URL('./screens/CollectionScreen.tsx', import.meta.url),
  'utf8',
);
const tasksEmptyFixture = readFileSync(
  new URL('./screens/TasksEmpty.visual-fixture.tsx', import.meta.url),
  'utf8',
);
const settingsSheet = readFileSync(
  new URL('./components/SettingsSheet.tsx', import.meta.url),
  'utf8',
);

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function rootHexToken(name: string) {
  const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  expect(value, `missing --${name}`).toBeTruthy();
  return value!;
}

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
    expect(css).toMatch(
      /@media \(max-width: 380px\)[\s\S]*?\.guide-filters\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow-x:\s*visible/,
    );
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps a detailed debrief reachable above the short-phone transport row', () => {
    expect(css).toMatch(
      /\.debrief-card\s*\{[\s\S]*?max-height:\s*calc\(100% - 104px - env\(safe-area-inset-bottom\)\)[\s\S]*?overflow-y:\s*auto/,
    );
  });

  it('keeps first-session Start visible without an unsolicited setup prompt', () => {
    expect(focusScreen).not.toContain('RitualSuggestion');
    expect(focusScreen).not.toContain('want to try a tiny reset before a session?');
    expect(css).toMatch(
      /@media \(max-height: 620px\)[\s\S]*?\.prestart-scroll \.ring-wrap\s*\{\s*--ring-scale:\s*0\.47/,
    );
  });

  it('keeps onboarding keyboard-scrollable and does not autofocus into obstruction', () => {
    expect(css).toContain('scroll-padding-bottom: 42vh');
    expect(css).toMatch(/\.onboard\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(onboarding).not.toContain('autoFocus');
  });
});

describe('PLAN 8.9 preference-mode readability baseline', () => {
  it('places essential timer copy on stable surfaces and raises supporting copy', () => {
    expect(css).toMatch(
      /\.greeting-row,[\s\S]*?\.readout,[\s\S]*?\.head,[\s\S]*?\.history-head\s*\{[\s\S]*?background:/,
    );
    expect(css).toMatch(/\.add-row\s*\{[\s\S]*?background:/);
    expect(css).toMatch(/\.task-empty\s*\{[\s\S]*?color:\s*var\(--plum\)/);
    expect(css).toMatch(/\.status-label,[\s\S]*?\.onboard-label\s*\{[\s\S]*?font-size:\s*13px/);
    expect(css).toMatch(
      /\.head-sub,[\s\S]*?\.foundation-chip,[\s\S]*?font-size:\s*13px/,
    );
  });

  it('keeps supporting copy and pastel action content at measured AA contrast', () => {
    const actionInk = rootHexToken('action-ink');
    const faintInk = rootHexToken('day-text-faint');
    const inactiveInk = rootHexToken('tab-inactive');
    const errorInk = rootHexToken('error-ink');
    const controlBorder = rootHexToken('control-border');

    for (const pastel of ['#ff85c2', '#a678e8', '#ffb0d4', '#c79fe6']) {
      expect(contrast(actionInk, pastel), `${actionInk} on ${pastel}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toMatch(
      /\.duty-badge\s*\{[\s\S]*?background-color:\s*#ffb0d4;[\s\S]*?background-image:\s*linear-gradient\(150deg, #ffb0d4, #c79fe6\)/,
    );
    expect(css).toMatch(
      /\.goal-go\s*\{[\s\S]*?background-color:\s*#ffb0d4;[\s\S]*?background-image:\s*linear-gradient\(150deg, #ffb0d4, #c79fe6\)/,
    );
    expect(css).toMatch(
      /\.goal-go:disabled\s*\{[\s\S]*?background-color:\s*#eee7f2;[\s\S]*?color:\s*#725a7d;[\s\S]*?opacity:\s*1/,
    );
    expect(css).toMatch(
      /\.night \.goal-go:disabled\s*\{[\s\S]*?background-color:\s*#2e2557;[\s\S]*?color:\s*#a394c4/,
    );
    expect(contrast('#725a7d', '#eee7f2')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#a394c4', '#2e2557')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(faintInk, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(inactiveInk, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(errorInk, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(controlBorder, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(css).toContain('--soft3: #a394c4');
    expect(css).toContain('--error-ink: #ffc0d9');
    expect(css).toContain('--control-border: #a394c4');
    for (const nightSurface of ['#2e2557', '#2a2350', '#262047']) {
      expect(contrast('#a394c4', nightSurface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffc0d9', nightSurface)).toBeGreaterThanOrEqual(4.5);
    }
    for (const selectedSurface of ['#43305c', '#3a2f66', '#383060', '#3f3570']) {
      expect(contrast('#a394c4', selectedSurface)).toBeGreaterThanOrEqual(3);
    }

    for (const [ink, surface] of [
      ['#7f5220', '#fff0d7'],
      ['#356959', '#e3f5ee'],
      ['#69427f', '#f5e9fb'],
      ['#3f6588', '#e7f1fb'],
    ]) {
      expect(css).toContain(`color: ${ink}`);
      expect(contrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('defines complete increased-contrast and forced-color layers', () => {
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?background:\s*Canvas;[\s\S]*?outline:\s*3px solid CanvasText !important/,
    );
    expect(css).toContain(".phone [aria-pressed='true']");
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?\.phone \[aria-pressed='true'\],[\s\S]*?forced-color-adjust:\s*none;[\s\S]*?color:\s*HighlightText;[\s\S]*?background:\s*Highlight/,
    );
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?\.play-tri\s*\{[\s\S]*?border-left-color:\s*ButtonText/,
    );
  });

  it('keeps newer instructions and controls at the practical type floor', () => {
    expect(css).toMatch(
      /\.status-label,[\s\S]*?\.foundation-restart p,[\s\S]*?\.parking-item-text\s*\{[\s\S]*?font-size:\s*13px/,
    );
    expect(css).toMatch(
      /\.phone input:not\(\[type='hidden'\]\):not\(\[type='range'\]\),[\s\S]*?border-color:\s*var\(--control-border\)/,
    );
    expect(css).toMatch(
      /\.phone \.tiny-choice\.on,[\s\S]*?outline:\s*2px solid var\(--control-border\)/,
    );
    expect(css).toMatch(
      /\.phone \.tab-btn\[aria-pressed='true'\][\s\S]*?text-decoration:\s*underline/,
    );
    expect(css).toMatch(/\.duty-badge\s*\{[\s\S]*?font:\s*700 13px/);
    expect(collectionScreen).toMatch(
      /aria-pressed=\{onDuty\}[\s\S]*?onDuty && <span className="duty-badge">on duty<\/span>/,
    );
  });

  it('keeps the mobile anti-zoom input size after the broader type-floor cascade', () => {
    expect(css).toMatch(
      /\.parking-item-text\s*\{[\s\S]*?font-size:\s*13px;[\s\S]*?@media \(max-width: 480px\)\s*\{[\s\S]*?\.phone input,[\s\S]*?font-size:\s*16px/,
    );
  });

  it('keeps deterministic day/night, preference, error, and text-spacing visual states', () => {
    expect(dailyTargetFixture).toContain("params.get('theme') === 'night'");
    expect(dailyTargetFixture).toContain("params.get('spacing') === 'expanded'");
    expect(dailyTargetFixture).toContain("params.get('preference')");
    expect(dailyTargetFixture).toContain("['entry', 'error'].includes(fixtureState)");
    expect(dailyTargetFixtureCss).toContain('.text-spacing-fixture');
    expect(dailyTargetFixtureCss).toContain('.contrast-more-fixture');
    expect(dailyTargetFixtureCss).toContain('.forced-colors-fixture');
  });
});

describe('PLAN 10.4 day-plan visual baseline', () => {
  it('keeps a deterministic Focus target surface inside the pre-start hierarchy', () => {
    expect(dailyTargetFixture).toContain("params.get('surface') ?? 'goals'");
    expect(dailyTargetFixture).toContain("surface === 'focus'");
    expect(focusScreen).toMatch(
      /<section className="prestart-stack"[\s\S]*?\{nowChip\}[\s\S]*?className="day-target-strip"[\s\S]*?className="prestart-prep"/,
    );
    expect(css).toMatch(
      /\.prestart-stack \.day-target-strip\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*8px 0 0/,
    );
  });
});

describe('PLAN 10.8 foundations surface baseline', () => {
  it('keeps the opt-in card above the Tasks list and reuses it after the break parking lot', () => {
    expect(tasksScreen).toMatch(
      /state\.settings\.foundations[\s\S]*?<FoundationsCard[\s\S]*?<div className="task-list">/,
    );
    expect(focusScreen).toMatch(
      /<ParkingLot[\s\S]*?state\.settings\.foundations[\s\S]*?<FoundationsCard/,
    );
    expect(settingsSheet).toContain('nativeId="settings.foundations"');
    expect(settingsSheet).toContain('keep up to three tiny daily actions');
  });

  it('keeps every foundation action at least 44 CSS px and the derived chip non-interactive', () => {
    expect(css).toMatch(
      /\.foundations-tend\s*\{[\s\S]*?min-width:\s*48px;[\s\S]*?min-height:\s*44px/,
    );
    expect(css).toMatch(
      /\.foundation-toggle\s*\{[\s\S]*?min-width:\s*48px/,
    );
    expect(css).toMatch(
      /\.foundation-toggle,[\s\S]*?\.foundation-detail-toggle\s*\{[\s\S]*?min-height:\s*48px/,
    );
    expect(css).toMatch(
      /\.foundation-order button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-height:\s*44px/,
    );
    expect(foundationsCard).toMatch(
      /integrated \?[\s\S]*?<div className=\{`foundation-chip derived/,
    );
  });

  it('provides deterministic active, empty, and picker fixture states without grading color', () => {
    expect(dailyTargetFixture).toContain("surface === 'foundations'");
    expect(dailyTargetFixture).toContain("fixtureState !== 'picker'");
    expect(foundationsCard).not.toMatch(/\b(?:percent|percentage)\b/i);
    expect(css.slice(css.indexOf('/* Daily foundations'), css.indexOf('/* ---------- app shell')))
      .not.toMatch(/\b(?:red|crimson|maroon)\b|#f00(?:000)?\b/i);
  });
});

describe('PLAN 8.13 honest Tasks empty-state baseline', () => {
  it('pins the real empty screen across theme, focus, spacing, and preference states', () => {
    expect(tasksEmptyFixture).toContain('<TasksScreen bloom={bloom}');
    expect(tasksEmptyFixture).toContain('tasks: []');
    expect(tasksEmptyFixture).toContain("params.get('theme') === 'night'");
    expect(tasksEmptyFixture).toContain("fixtureState !== 'focused'");
    expect(tasksEmptyFixture).toContain(
      "querySelector<HTMLInputElement>('#new-task-name')?.focus()",
    );
    expect(tasksEmptyFixture).not.toContain("querySelector<HTMLButtonElement>('.task-empty-action')");
    expect(tasksEmptyFixture).toContain("params.get('spacing') === 'expanded'");
    expect(tasksEmptyFixture).toContain("params.get('preference')");
  });

  it('keeps one honest empty-state entry form at the practical size floor', () => {
    const emptyState = tasksScreen.match(
      /<section className="task-empty"[\s\S]*?<\/section>/,
    )?.[0] ?? '';
    expect(emptyState).toContain('your list starts here');
    expect(emptyState).not.toContain('<button');
    expect(tasksScreen).toMatch(
      /<div className="add-row">[\s\S]*?<form className="add-form"[\s\S]*?aria-label="Add task"[\s\S]*?id="new-task-name"/,
    );
    expect(tasksScreen).not.toMatch(/Finish history essay|Read chapter 4|Prepare presentation/);
    expect(css).toMatch(
      /\.add-plus\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px/,
    );
  });
});
