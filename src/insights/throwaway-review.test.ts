import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '../store/sessions';
import type { CompanionEvent } from '../store/companion';
import { whyFor } from './why';
import { suggestPersonalCadence } from './cadence';

const T0 = 1_700_000_000_000;
let seq = 0;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  seq++;
  return {
    id: `s-${seq}`,
    startedAt: T0 + seq * 3_600_000,
    endedAt: T0 + seq * 3_600_000 + 25 * 60_000,
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
    ts: T0 + seq * 60_000,
    min,
    len: 25,
    kind: 'wander',
    src: 'checkin',
  };
}

describe('review probes', () => {
  it('PROBE A: first-drift rule fires with zero drift history (only this session drifted)', () => {
    // 4 past sessions, none drifted; 5th (current) has one drift at minute 12.
    const past = [record(), record(), record(), record()];
    // spread hours so golden-hour cannot fire
    past[0].startHour = 6; past[1].startHour = 8; past[2].startHour = 11; past[3].startHour = 14;
    const r = record({ startHour: 16 });
    const events = [drift(r.id, 12)];
    const why = whyFor(r, [...past, r], events);
    // If this passes, the "right around your usual" claim is made off a
    // median consisting solely of this session's own drift.
    console.log('PROBE A result:', why);
    expect(why.evidenceKey).toBe('breaks-are-fuel');
  });

  it('PROBE B: shrink offered when already at the 10-minute floor', () => {
    const current = { focusMin: 10, breakMin: 4 };
    const records = Array.from({ length: 5 }, () =>
      record({ plannedMin: 10, outcome: 'abandoned' }),
    );
    const NOW = T0 + 10 * 3_600_000;
    const s = suggestPersonalCadence(records, [], 'notSure', current, NOW);
    console.log('PROBE B result:', s.kind, s.preset, s.text);
    expect(s.kind).toBe('shrink');
    expect(s.preset.focusMin).toBe(10); // same as current
  });

  it('PROBE C: stretch offered when already at the 90-minute ceiling', () => {
    const current = { focusMin: 90, breakMin: 18 };
    const records = Array.from({ length: 5 }, () =>
      record({ plannedMin: 90, outcome: 'completed' }),
    );
    const NOW = T0 + 10 * 3_600_000;
    const s = suggestPersonalCadence(records, [], 'notSure', current, NOW);
    console.log('PROBE C result:', s.kind, s.preset, s.text);
    expect(s.kind).toBe('stretch');
    expect(s.preset.focusMin).toBe(90); // same as current
  });
});
