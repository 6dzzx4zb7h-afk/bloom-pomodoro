import { describe, expect, it } from 'vitest';

import {
  EMPTY_FOUNDATIONS,
  FOUNDATION_ACTIVE_CAP,
  FOUNDATION_CATALOG,
  FOUNDATION_CUSTOM_NAME_MAX,
  compactFoundationEntries,
  createFoundationInstance,
  derivedFoundationDone,
  foundationDensity,
  foundationDayMarkers,
  foundationEntryId,
  gapRestartOffer,
  foundationInstanceId,
  foundationsWeekLine,
  isFoundationActiveOn,
  sanitizeFoundations,
  setFoundationDayDone,
  setFoundationEnabled,
  toggleFoundationDay,
  type FoundationEntry,
  type FoundationInstance,
  type FoundationsState,
} from './foundations';
import type { SessionRecord } from './sessions';

function at(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function manual(
  type: 'phone-away' | 'desk-reset' | 'tiny-start' | 'tomorrow-note' | 'custom',
  order: number,
  from = '2026-01-01',
  enabled = true,
): FoundationInstance {
  return {
    id: foundationInstanceId(type),
    type,
    ...(type === 'custom' ? { customName: 'My small thing' } : {}),
    enabled,
    order,
    ranges: enabled ? [{ from }] : [{ from, to: '2026-01-31' }],
    createdAt: at(2026, 1, 1),
  };
}

function entry(instance: FoundationInstance, dayKey: string, recordedAt = at(2026, 1, 1)) {
  return {
    id: foundationEntryId(instance.id, dayKey),
    instanceId: instance.id,
    dayKey,
    recordedAt,
  } satisfies FoundationEntry;
}

describe('foundation catalog and natural ids', () => {
  it('ships exactly the four curated manual templates as frozen data', () => {
    expect(FOUNDATION_CATALOG.map((item) => item.type)).toEqual([
      'phone-away',
      'desk-reset',
      'tiny-start',
      'tomorrow-note',
    ]);
    expect(FOUNDATION_CATALOG.map((item) => item.description)).toEqual([
      'phone in another room before the first session',
      'clear the desk before starting',
      'one two-minute start on the hardest thing',
      "write tomorrow's first move before stopping",
    ]);
    expect(Object.isFrozen(FOUNDATION_CATALOG)).toBe(true);
    expect(FOUNDATION_CATALOG.every(Object.isFrozen)).toBe(true);
  });

  it('creates one natural instance id per type and requires a bounded custom name', () => {
    expect(
      createFoundationInstance({
        type: 'focused-work',
        order: 9,
        at: at(2026, 7, 4, 2, 30),
        dayStartHour: 3,
      }),
    ).toMatchObject({
      id: 'fnd-focused-work',
      ranges: [{ from: '2026-07-03' }],
    });
    expect(
      createFoundationInstance({ type: 'custom', order: 0, customName: '   ', at: 1 }),
    ).toBeNull();
    expect(
      createFoundationInstance({
        type: 'custom',
        order: 0,
        customName: 'x'.repeat(FOUNDATION_CUSTOM_NAME_MAX + 10),
        at: at(2026, 1, 1),
      })?.customName,
    ).toBe('x'.repeat(FOUNDATION_CUSTOM_NAME_MAX));
  });
});

describe('derived focused work', () => {
  it('uses the configured study-day boundary and only finished sessions', () => {
    const endedAt = new Date(2026, 6, 27, 0, 30).getTime();
    const record = {
      id: 's-late',
      startedAt: endedAt - 25 * 60_000,
      endedAt,
      mode: 'focus',
      plannedMin: 25,
      actualMin: 25,
      outcome: 'completed',
      startHour: 0,
      driftEventIds: [],
    } satisfies SessionRecord;
    expect(derivedFoundationDone([record], '2026-07-26', 3)).toBe(true);
    expect(
      derivedFoundationDone([{ ...record, outcome: 'interrupted' }], '2026-07-26', 3),
    ).toBe(false);
  });
});

describe('14-day foundation detail', () => {
  it('shows disabled ranges as outside days and clamps the window to adoption', () => {
    const instance = manual('phone-away', 0, '2026-07-13');
    instance.ranges = [
      { from: '2026-07-13', to: '2026-07-17' },
      { from: '2026-07-21' },
    ];
    const entries = [
      entry(instance, '2026-07-14'),
      entry(instance, '2026-07-22'),
    ];

    const markers = foundationDayMarkers(instance, entries, '2026-07-26');
    expect(markers).toHaveLength(14);
    expect(markers.find((item) => item.dayKey === '2026-07-18')?.state).toBe('outside');
    expect(markers.find((item) => item.dayKey === '2026-07-22')?.state).toBe('done');
    expect(foundationDensity(instance, entries, '2026-07-26')).toEqual({
      doneDays: 2,
      activeDays: 11,
      windowDays: 14,
    });

    const fresh = manual('desk-reset', 1, '2026-07-25');
    expect(foundationDayMarkers(fresh, [], '2026-07-26')).toHaveLength(2);
  });
});

describe('gentle gap restart', () => {
  it('waits for three active unrecorded days and caps the same gap across reloads', () => {
    const instance = manual('tiny-start', 0, '2026-07-01');
    const last = entry(instance, '2026-07-10');

    expect(gapRestartOffer([last], instance, '2026-07-13')).toBeNull();
    expect(gapRestartOffer([last], instance, '2026-07-14')).toEqual({
      gapDays: 3,
      lastEntryDayKey: '2026-07-10',
    });

    const marked = { ...instance, lastRestartOfferDayKey: '2026-07-14' };
    expect(gapRestartOffer([last], marked, '2026-07-14')).toBeNull();
    expect(gapRestartOffer([last], marked, '2026-07-20')).toBeNull();
  });

  it('allows a new offer only after a new entry and a new gap', () => {
    const instance = {
      ...manual('desk-reset', 0, '2026-07-01'),
      lastRestartOfferDayKey: '2026-07-14',
    };
    const accepted = entry(instance, '2026-07-14');

    expect(gapRestartOffer([accepted], instance, '2026-07-17')).toBeNull();
    expect(gapRestartOffer([accepted], instance, '2026-07-18')).toEqual({
      gapDays: 3,
      lastEntryDayKey: '2026-07-14',
    });
  });
});

describe('sanitizeFoundations', () => {
  it('is total for garbage and truncated slice shapes', () => {
    for (const raw of [null, undefined, 7, 'bad', [], {}, { instances: 'bad' }]) {
      expect(sanitizeFoundations(raw, { todayKey: '2026-07-04' })).toEqual(
        EMPTY_FOUNDATIONS,
      );
    }
  });

  it('drops unknown types instead of coercing them and repairs dangling plan links', () => {
    const known = { ...manual('phone-away', 0), ifThenId: 'plan-kept' };
    const dangling = { ...manual('desk-reset', 1), ifThenId: 'plan-gone' };
    const unknown = {
      ...manual('tiny-start', 2),
      id: 'fnd-mystery',
      type: 'mystery',
    };

    const sanitized = sanitizeFoundations(
      { instances: [known, dangling, unknown], entries: [], archive: [] },
      { todayKey: '2026-07-04', validIfThenIds: ['plan-kept'] },
    );

    expect(sanitized.instances.map((item) => item.type)).toEqual([
      'phone-away',
      'desk-reset',
    ]);
    expect(sanitized.instances[0].ifThenId).toBe('plan-kept');
    expect(sanitized.instances[1].ifThenId).toBeUndefined();
  });

  it('keeps only the three lowest-order enabled manual instances', () => {
    const instances = [
      manual('phone-away', 8),
      manual('desk-reset', 2),
      manual('tiny-start', 4),
      manual('tomorrow-note', 1),
      {
        id: 'fnd-focused-work',
        type: 'focused-work',
        enabled: true,
        order: 99,
        ranges: [{ from: '2026-01-01' }],
        createdAt: at(2026, 1, 1),
      },
    ] satisfies FoundationInstance[];

    const sanitized = sanitizeFoundations(
      { instances, entries: [], archive: [] },
      { todayKey: '2026-07-04' },
    );
    const enabledManual = sanitized.instances.filter(
      (item) => item.type !== 'focused-work' && item.enabled,
    );

    expect(enabledManual).toHaveLength(FOUNDATION_ACTIVE_CAP);
    expect(enabledManual.map((item) => item.type)).toEqual([
      'tomorrow-note',
      'desk-reset',
      'tiny-start',
    ]);
    expect(
      sanitized.instances.find((item) => item.type === 'focused-work')?.enabled,
    ).toBe(true);
  });

  it('dedupes natural-key entries by newest write and rejects integrated or archived rows', () => {
    const phone = manual('phone-away', 0);
    const focused = {
      id: 'fnd-focused-work',
      type: 'focused-work',
      enabled: true,
      order: 4,
      ranges: [{ from: '2026-01-01' }],
      createdAt: at(2026, 1, 1),
    } satisfies FoundationInstance;
    const older = entry(phone, '2026-02-03', 10);
    const newer = { ...older, recordedAt: 20, late: true };
    const archived = entry(phone, '2026-01-03', 30);
    const integrated = entry(focused, '2026-02-03', 40);

    const sanitized = sanitizeFoundations(
      {
        instances: [phone, focused],
        entries: [older, newer, archived, integrated],
        archive: [
          { instanceId: phone.id, monthKey: '2026-01', doneDays: 7 },
          { instanceId: focused.id, monthKey: '2026-01', doneDays: 9 },
          { instanceId: 'fnd-unknown', monthKey: '2026-01', doneDays: 4 },
        ],
      },
      { todayKey: '2026-07-04' },
    );

    expect(sanitized.entries).toEqual([newer]);
    expect(sanitized.archive).toEqual([
      { instanceId: phone.id, monthKey: '2026-01', doneDays: 7 },
    ]);
  });
});

describe('enable ranges and the active cap', () => {
  it('refuses a fourth manual enable without changing ranges', () => {
    const fourth = manual('tomorrow-note', 3, '2026-01-01', false);
    const state: FoundationsState = {
      instances: [
        manual('phone-away', 0),
        manual('desk-reset', 1),
        manual('tiny-start', 2),
        fourth,
      ],
      entries: [],
      archive: [],
    };

    expect(setFoundationEnabled(state, fourth.id, true, at(2026, 7, 4))).toBe(state);
  });

  it('closes and reopens active ranges without counting the hidden month', () => {
    const instance = manual('phone-away', 0);
    const initial: FoundationsState = { instances: [instance], entries: [], archive: [] };
    const disabled = setFoundationEnabled(initial, instance.id, false, at(2026, 1, 31));
    const reenabled = setFoundationEnabled(disabled, instance.id, true, at(2026, 3, 1));
    const updated = reenabled.instances[0];

    expect(updated.ranges).toEqual([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-03-01' },
    ]);
    expect(isFoundationActiveOn(updated, '2026-02-14')).toBe(false);
    expect(foundationDensity(updated, [], '2026-02-28')).toMatchObject({
      doneDays: 0,
      activeDays: 0,
    });
  });
});

describe('binary day writes and yesterday grace', () => {
  it('resolves the study day through dayKeyFor and upserts idempotently', () => {
    const instance = manual('phone-away', 0, '2026-07-01');
    const initial: FoundationsState = { instances: [instance], entries: [], archive: [] };
    const instant = at(2026, 7, 4, 2, 30);

    const once = setFoundationDayDone(initial, instance.id, true, instant, instant, 3);
    const twice = setFoundationDayDone(once, instance.id, true, instant, instant, 3);

    expect(once.entries).toEqual([
      {
        id: `${instance.id}:2026-07-03`,
        instanceId: instance.id,
        dayKey: '2026-07-03',
        recordedAt: instant,
      },
    ]);
    expect(twice).toBe(once);
    expect(toggleFoundationDay(once, instance.id, instant, instant, 3).entries).toEqual([]);
  });

  it('allows a late yesterday add/delete and refuses edits to older days', () => {
    const instance = manual('desk-reset', 0, '2026-07-01');
    const today = at(2026, 7, 5);
    const yesterday = at(2026, 7, 4);
    const oldEntry = entry(instance, '2026-07-03', at(2026, 7, 3));
    const initial: FoundationsState = {
      instances: [instance],
      entries: [oldEntry],
      archive: [],
    };

    const added = setFoundationDayDone(initial, instance.id, true, yesterday, today);
    expect(added.entries.find((item) => item.dayKey === '2026-07-04')).toMatchObject({
      late: true,
    });
    const removed = setFoundationDayDone(added, instance.id, false, yesterday, today);
    expect(removed.entries.map((item) => item.dayKey)).toEqual(['2026-07-03']);
    expect(
      setFoundationDayDone(removed, instance.id, false, at(2026, 7, 3), today),
    ).toBe(removed);
  });

  it('refuses every stored day write for the integrated focused-work instance', () => {
    const integrated = createFoundationInstance({
      type: 'focused-work',
      order: 0,
      at: at(2026, 7, 4),
    })!;
    const state: FoundationsState = {
      instances: [integrated],
      entries: [],
      archive: [],
    };
    expect(setFoundationDayDone(state, integrated.id, true, at(2026, 7, 4))).toBe(state);
    expect(toggleFoundationDay(state, integrated.id, at(2026, 7, 4))).toBe(state);
  });
});

describe('month compaction and density', () => {
  it('compacts oldest whole months while preserving exact done-day totals', () => {
    const instance = manual('tiny-start', 0);
    const state: FoundationsState = {
      instances: [instance],
      entries: [
        entry(instance, '2026-01-02'),
        entry(instance, '2026-01-08'),
        entry(instance, '2026-02-03'),
        entry(instance, '2026-03-01'),
      ],
      archive: [],
    };

    const compacted = compactFoundationEntries(state, '2026-03-10', 2);
    const before = state.entries.length + state.archive.reduce((sum, row) => sum + row.doneDays, 0);
    const after =
      compacted.entries.length +
      compacted.archive.reduce((sum, row) => sum + row.doneDays, 0);

    expect(compacted.entries.map((item) => item.dayKey)).toEqual([
      '2026-02-03',
      '2026-03-01',
    ]);
    expect(compacted.archive).toEqual([
      { instanceId: instance.id, monthKey: '2026-01', doneDays: 2 },
    ]);
    expect(after).toBe(before);
  });

  it('counts only recorded days inside active ranges and clamps to adoption', () => {
    const instance = {
      ...manual('tomorrow-note', 0, '2026-07-08'),
      createdAt: at(2026, 7, 8),
    };
    const entries = [
      entry(instance, '2026-07-08'),
      entry(instance, '2026-07-10'),
      entry(instance, '2026-07-20'),
    ];

    expect(foundationDensity(instance, entries, '2026-07-10')).toEqual({
      doneDays: 2,
      activeDays: 3,
      windowDays: 3,
    });
  });
});

describe('guarded weekly foundations reflection', () => {
  it('stays silent below three recorded days this week', () => {
    const phone = manual('phone-away', 0, '2026-07-01');
    const entries = [
      entry(phone, '2026-07-13'),
      entry(phone, '2026-07-14'),
      entry(phone, '2026-07-06'),
      entry(phone, '2026-07-07'),
      entry(phone, '2026-07-08'),
    ];

    expect(foundationsWeekLine([phone], entries, '2026-07-13')).toBeNull();
  });

  it('shows one current-week count without comparing an under-guard previous week', () => {
    const phone = manual('phone-away', 0, '2026-07-01');
    const entries = [
      entry(phone, '2026-07-13'),
      entry(phone, '2026-07-14'),
      entry(phone, '2026-07-15'),
      entry(phone, '2026-07-06'),
      entry(phone, '2026-07-07'),
    ];

    expect(foundationsWeekLine([phone], entries, '2026-07-13')).toBe(
      'Phone away was recorded on 3 days this week.',
    );
  });

  it('uses the same comparison shape for an up week and a down week', () => {
    const phone = manual('phone-away', 0, '2026-07-01');
    const entriesFor = (current: number, previous: number) => [
      ...Array.from({ length: current }, (_, index) =>
        entry(phone, `2026-07-${String(13 + index).padStart(2, '0')}`)),
      ...Array.from({ length: previous }, (_, index) =>
        entry(phone, `2026-07-${String(6 + index).padStart(2, '0')}`)),
    ];
    const up = foundationsWeekLine([phone], entriesFor(5, 3), '2026-07-13');
    const down = foundationsWeekLine([phone], entriesFor(3, 5), '2026-07-13');

    expect(up).toBe(
      'Phone away was recorded on 5 days this week (3 last week) — both count.',
    );
    expect(down).toBe(
      'Phone away was recorded on 3 days this week (5 last week) — both count.',
    );
    expect(up?.replace(/\d/g, '#')).toBe(down?.replace(/\d/g, '#'));
  });

  it('chooses the most-recorded foundation and breaks ties by lowest order', () => {
    const later = manual('phone-away', 5, '2026-07-01');
    const earlier = manual('desk-reset', 1, '2026-07-01');
    const entries = [
      ...['13', '14', '15'].map((day) => entry(later, `2026-07-${day}`)),
      ...['13', '14', '15'].map((day) => entry(earlier, `2026-07-${day}`)),
    ];

    expect(foundationsWeekLine([later, earlier], entries, '2026-07-13')).toBe(
      'Desk reset was recorded on 3 days this week.',
    );
  });
});
