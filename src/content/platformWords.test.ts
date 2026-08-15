import { describe, expect, it } from 'vitest';
import { wordsFor } from './platformWords';
import { computeAttentionPlan, type CompanionEvent } from '../store/companion';

const NOW = Date.UTC(2026, 7, 4, 12, 0, 0);

function awayEvents(count: number): CompanionEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    ts: NOW - (index + 1) * 3600_000,
    min: 10,
    len: 25,
    kind: 'away' as const,
    src: 'return' as const,
  }));
}

describe('platform wording (PLAN 13.15)', () => {
  it('names a leave-and-return for the device it happened on', () => {
    expect(wordsFor('browser').awayToggleTitle).toBe('Notice tab switches');
    expect(wordsFor('app').awayToggleTitle).toBe('Notice when you leave');
    expect(wordsFor('browser').awayCount(1)).toBe('1 quiet tab-away');
    expect(wordsFor('app').awayCount(1)).toBe('1 quiet moment away');
    expect(wordsFor('app').awayCount(3)).toBe('3 quiet moments away');
  });

  it('never says "tab" on the app surface', () => {
    const app = wordsFor('app');
    const strings = [
      app.awayToggleTitle,
      app.flowSubtitle,
      app.awayMomentsScope,
      app.awaySuggestionText,
      app.awayCount(2),
    ];
    strings.forEach((text) => expect(text.toLowerCase()).not.toContain('tab'));
  });

  it('gives a phone a suggestion a phone can follow', () => {
    const events = awayEvents(12);
    const browser = computeAttentionPlan(events, 25, NOW, 28, undefined, 'browser');
    const app = computeAttentionPlan(events, 25, NOW, 28, undefined, 'app');

    const browserAway = browser.find((item) => item.evidenceKey === 'desk-help');
    const appAway = app.find((item) => item.evidenceKey === 'desk-help');

    expect(browserAway?.text).toContain('fullscreen');
    // "a separate desktop" is not an action available on an iPhone.
    expect(appAway?.text).not.toContain('desktop');
    expect(appAway?.text).not.toContain('fullscreen');
    expect(appAway?.because).toContain('quiet moments away');
    // Same behaviour-change mechanism, so the same evidence trail.
    expect(appAway?.evidenceKey).toBe(browserAway?.evidenceKey);
  });
});
