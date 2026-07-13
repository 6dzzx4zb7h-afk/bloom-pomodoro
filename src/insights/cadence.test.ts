import { describe, expect, it } from 'vitest';

import type { CompanionEvent } from '../store/companion';
import type { SessionRecord } from '../store/sessions';
import {
  CADENCE_PRESETS,
  DEFAULT_CADENCE,
  EMPTY_PERSONAL_CADENCE,
  computeCadenceSuggestion,
  personalCadenceForSurface,
  rememberPreviousCadence,
  shouldRecomputePersonalCadence,
  suggestPersonalCadence,
} from './cadence';

const NOW = 1_800_000_000_000;
let seq = 0;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  seq++;
  return {
    id: `s-${seq}`,
    startedAt: NOW - 86400000 + seq,
    endedAt: NOW - 86000000 + seq,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome: 'completed',
    startHour: 9,
    driftEventIds: [],
    ...overrides,
  };
}

function drift(sessionId: string | undefined, min: number): CompanionEvent {
  seq++;
  return {
    id: `e-${seq}`,
    sessionId,
    ts: NOW - 80000000 + seq,
    min,
    len: 25,
    kind: 'wander',
    src: 'checkin',
  };
}

describe('computeCadenceSuggestion', () => {
  it('keeps 25/5 as the low-signal default', () => {
    const suggestion = computeCadenceSuggestion([record()], [], NOW);
    expect(suggestion.kind).toBe('learning');
    expect(suggestion.preset).toBe(DEFAULT_CADENCE);
    expect(suggestion.because).toContain('1 focus session');
  });

  it('suggests 20/5 when the median first drift is around minute 18', () => {
    const records = [record(), record(), record()];
    const events = [drift(records[0].id, 16), drift(records[1].id, 18), drift(records[2].id, 20)];
    const suggestion = computeCadenceSuggestion(records, events, NOW);
    expect(suggestion.kind).toBe('first-drift');
    expect(suggestion.preset.id).toBe('20-5');
    expect(suggestion.because).toContain('minute 18');
  });

  it('honours estimated drift onset and record-to-event links', () => {
    const records = [record(), record(), record()];
    const events = records.map((r, index) => {
      const event = drift(undefined, 24);
      event.estOnsetMin = 17 + index;
      r.driftEventIds = [event.id!];
      return event;
    });
    expect(computeCadenceSuggestion(records, events, NOW).preset.id).toBe('20-5');
  });

  it('offers 40/8 after repeated successful 40-minute sessions', () => {
    const records = Array.from({ length: 4 }, () =>
      record({ plannedMin: 40, actualMin: 40, outcome: 'completed' }),
    );
    const suggestion = computeCadenceSuggestion(records, [], NOW);
    expect(suggestion.kind).toBe('long-session');
    expect(suggestion.preset.id).toBe('40-8');
    expect(suggestion.because).toContain('4 of your 4 40-minute sessions');
  });

  it('offers 50/10 only when 50-minute history supports it', () => {
    const records = [
      record({ plannedMin: 50 }),
      record({ plannedMin: 50 }),
      record({ plannedMin: 50 }),
      record({ plannedMin: 50, outcome: 'abandoned' }),
    ];
    expect(computeCadenceSuggestion(records, [], NOW).preset.id).toBe('50-10');
  });

  it('does not turn old sessions into a current recommendation', () => {
    const old = Array.from({ length: 4 }, () =>
      record({ plannedMin: 50, endedAt: NOW - 40 * 86400000 }),
    );
    expect(computeCadenceSuggestion(old, [], NOW).kind).toBe('learning');
  });

  it('ships the four one-tap preset pairs with 25/5 as default', () => {
    expect(CADENCE_PRESETS.map((preset) => preset.label)).toEqual([
      '20 / 5',
      '25 / 5',
      '40 / 8',
      '50 / 10',
    ]);
    expect(DEFAULT_CADENCE.id).toBe('25-5');
  });
});

describe('suggestPersonalCadence', () => {
  const current = { focusMin: 25, breakMin: 5 };

  it('uses the gentle 25/5 learning state when signal is thin', () => {
    const suggestion = suggestPersonalCadence([record()], [], 'notSure', current, NOW);
    expect(suggestion.kind).toBe('learning');
    expect(suggestion.preset.id).toBe('25-5');
    expect(suggestion.text).toBe('25/5 is a lovely starting point while I learn your rhythm.');
  });

  it('fits the starting rung just before a repeated first drift', () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      record({ outcome: index < 3 ? 'completed' : 'abandoned' }),
    );
    const events = records.slice(0, 3).map((session, index) =>
      drift(session.id, [15, 16, 18][index]),
    );
    const suggestion = suggestPersonalCadence(records, events, 'notSure', current, NOW);
    expect(suggestion.kind).toBe('drift-fit');
    expect(suggestion.preset.id).toBe('15-4');
    expect(suggestion.because).toContain('minute 16');
    expect(suggestion.because).toContain('mid-session');
    expect(suggestion.because).toContain('sharpest-time tag');
  });

  it('offers the next five-minute rung after at least 80% current-rung completion', () => {
    const records = Array.from({ length: 5 }, () => record({ outcome: 'completed' }));
    const suggestion = suggestPersonalCadence(records, [], 'betterEarlier', current, NOW);
    expect(suggestion.kind).toBe('stretch');
    expect(suggestion.preset.id).toBe('30-6');
    expect(suggestion.because).toContain('5 of your last 5');
    expect(suggestion.rungs.longer.id).toBe('30-6');
  });

  it('quietly re-offers a shorter rung during a rough patch', () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      record({ outcome: index < 2 ? 'completed' : 'abandoned' }),
    );
    const suggestion = suggestPersonalCadence(records, [], 'notSure', current, NOW);
    expect(suggestion.kind).toBe('shrink');
    expect(suggestion.preset.id).toBe('20-4');
    expect(suggestion.text).toContain('fit more softly');
    expect(suggestion.because).toContain('2 of your last 5');
  });

  it('uses the chronotype tag only as a gentle prior against recent timing', () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      record({
        outcome: index < 3 ? 'completed' : 'abandoned',
        startHour: 21,
      }),
    );
    const events = records.slice(0, 3).map((session) => drift(session.id, 22));
    const suggestion = suggestPersonalCadence(records, events, 'betterEarlier', current, NOW);
    expect(suggestion.preset.id).toBe('15-4');
    expect(suggestion.because).toContain('5 of 5 recent sessions began outside');
  });

  it('keeps the weekly answer cached until seven days have elapsed', () => {
    const cached = suggestPersonalCadence(
      Array.from({ length: 5 }, () => record({ outcome: 'completed' })),
      [],
      'notSure',
      current,
      NOW,
    );
    const memory = { computedAt: NOW, recommendation: cached, history: [] };
    const rough = Array.from({ length: 5 }, () => record({ outcome: 'abandoned' }));
    expect(personalCadenceForSurface(memory, rough, [], 'notSure', current, NOW + 6 * 86400000))
      .toBe(cached);
    expect(shouldRecomputePersonalCadence(memory, NOW + 7 * 86400000)).toBe(true);
    expect(shouldRecomputePersonalCadence(EMPTY_PERSONAL_CADENCE, NOW)).toBe(true);
  });

  it('keeps prior applied rungs unique and available for one-tap return', () => {
    const history = rememberPreviousCadence(
      [{ focusMin: 20, breakMin: 4 }],
      { focusMin: 25, breakMin: 5 },
      { focusMin: 30, breakMin: 6 },
    );
    expect(history).toEqual([
      { focusMin: 20, breakMin: 4 },
      { focusMin: 25, breakMin: 5 },
    ]);
  });
});
