import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '../store/sessions';
import {
  WOOP_COOLDOWN_MS,
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
