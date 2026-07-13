import { describe, expect, it } from 'vitest';

import type { CompanionEvent } from '../store/companion';
import type { SessionRecord } from '../store/sessions';
import {
  EMPTY_PRE_SLUMP_CAPS,
  PRE_SLUMP_DAILY_CAP,
  WOOP_COOLDOWN_MS,
  localDayKey,
  preSlumpSuggestion,
  shouldOfferWoop,
} from './triggers';

const NOW = 1_800_000_000_000;

function records(outcomes: SessionRecord['outcome'][]): SessionRecord[] {
  return outcomes.map((outcome, i) => ({
    id: `session-${i}`,
    startedAt: NOW - (outcomes.length - i) * 60_000,
    endedAt: NOW - (outcomes.length - i) * 30_000,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 3,
    outcome,
    startHour: 9,
    driftEventIds: [],
  }));
}

describe('shouldOfferWoop', () => {
  it('does not fire below three trailing abandons', () => {
    expect(shouldOfferWoop(records(['abandoned', 'abandoned']), null, NOW)).toBe(false);
  });

  it('fires at three trailing abandons', () => {
    expect(
      shouldOfferWoop(records(['completed', 'abandoned', 'abandoned', 'abandoned']), null, NOW),
    ).toBe(true);
  });

  it('does not treat interrupted sessions as the trigger', () => {
    expect(
      shouldOfferWoop(records(['abandoned', 'abandoned', 'abandoned', 'interrupted']), null, NOW),
    ).toBe(false);
  });

  it('stays quiet throughout the seven-day cooldown', () => {
    const log = records(['abandoned', 'abandoned', 'abandoned']);
    expect(shouldOfferWoop(log, NOW - WOOP_COOLDOWN_MS + 1, NOW)).toBe(false);
  });

  it('does not repeat for the same unchanged abandon run after cooldown', () => {
    const log = records(['abandoned', 'abandoned', 'abandoned']);
    const lastAbandon = log[log.length - 1].endedAt;
    expect(shouldOfferWoop(log, lastAbandon, lastAbandon + WOOP_COOLDOWN_MS)).toBe(false);
  });

  it('can fire after cooldown when a new trailing run reaches the threshold', () => {
    const lastOffer = NOW - WOOP_COOLDOWN_MS;
    const log = records(['completed', 'abandoned', 'abandoned', 'abandoned']);
    expect(shouldOfferWoop(log, lastOffer, NOW)).toBe(true);
  });

  it('treats a future offer timestamp as still cooling down', () => {
    expect(
      shouldOfferWoop(records(['abandoned', 'abandoned', 'abandoned']), NOW + 60_000, NOW),
    ).toBe(false);
  });
});

function focusHistory(
  count: number,
  firstDriftMin = 18,
): { records: SessionRecord[]; events: CompanionEvent[] } {
  const historyRecords: SessionRecord[] = [];
  const events: CompanionEvent[] = [];
  for (let i = 0; i < count; i++) {
    const sessionId = `focus-${i}`;
    const eventId = `drift-${i}`;
    historyRecords.push({
      id: sessionId,
      startedAt: NOW - (count - i) * 86_400_000,
      endedAt: NOW - (count - i) * 86_400_000 + 25 * 60_000,
      mode: 'focus',
      plannedMin: 25,
      actualMin: 25,
      outcome: 'completed',
      startHour: 9,
      driftEventIds: [eventId],
    });
    events.push({
      id: eventId,
      sessionId,
      ts: NOW - (count - i) * 86_400_000 + firstDriftMin * 60_000,
      min: firstDriftMin,
      len: 25,
      kind: 'wander',
      src: 'checkin',
    });
  }
  return { records: historyRecords, events };
}

describe('preSlumpSuggestion', () => {
  const history = focusHistory(5);
  const base = {
    optedIn: true,
    sessionId: 'current-session',
    elapsedMin: 16,
    records: history.records,
    events: history.events,
    caps: EMPTY_PRE_SLUMP_CAPS,
    now: NOW,
  };

  it('stays off unless the user opts in', () => {
    expect(preSlumpSuggestion({ ...base, optedIn: false })).toBeNull();
  });

  it('requires drift signals from five separate focus sessions', () => {
    const thin = focusHistory(4);
    expect(
      preSlumpSuggestion({ ...base, records: thin.records, events: thin.events }),
    ).toBeNull();
  });

  it('fires once in the short window before the typical first drift', () => {
    expect(preSlumpSuggestion(base)).toEqual({
      typicalFirstDriftMin: 18,
      cueMin: 16,
      signalSessions: 5,
    });
    expect(preSlumpSuggestion({ ...base, elapsedMin: 15.9 })).toBeNull();
    expect(preSlumpSuggestion({ ...base, elapsedMin: 18 })).toBeNull();
  });

  it('respects the once-per-session guard', () => {
    expect(
      preSlumpSuggestion({
        ...base,
        caps: { ...EMPTY_PRE_SLUMP_CAPS, lastSessionId: 'current-session' },
      }),
    ).toBeNull();
  });

  it('respects the twice-per-day cap and the one-tap daily silence', () => {
    const day = localDayKey(NOW);
    expect(
      preSlumpSuggestion({
        ...base,
        caps: { day, count: PRE_SLUMP_DAILY_CAP, silenced: false, lastSessionId: null },
      }),
    ).toBeNull();
    expect(
      preSlumpSuggestion({
        ...base,
        caps: { day, count: 1, silenced: true, lastSessionId: null },
      }),
    ).toBeNull();
  });

  it('starts fresh on a new local day', () => {
    expect(
      preSlumpSuggestion({
        ...base,
        caps: {
          day: '2000-01-01',
          count: PRE_SLUMP_DAILY_CAP,
          silenced: true,
          lastSessionId: 'older-session',
        },
      }),
    ).not.toBeNull();
  });
});
