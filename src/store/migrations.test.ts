import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import companionV1 from './fixtures/migrations/companion-v1.json';
import companionV2 from './fixtures/migrations/companion-v2.json';
import companionV3 from './fixtures/migrations/companion-v3.json';
import companionV4 from './fixtures/migrations/companion-v4.json';
import companionV5 from './fixtures/migrations/companion-v5.json';
import mainV00 from './fixtures/migrations/main-v00.json';
import mainV01 from './fixtures/migrations/main-v01.json';
import mainV02 from './fixtures/migrations/main-v02.json';
import mainV03 from './fixtures/migrations/main-v03.json';
import mainV04 from './fixtures/migrations/main-v04.json';
import mainV05 from './fixtures/migrations/main-v05.json';
import mainV06 from './fixtures/migrations/main-v06.json';
import mainV07 from './fixtures/migrations/main-v07.json';
import mainV08 from './fixtures/migrations/main-v08.json';
import mainV09 from './fixtures/migrations/main-v09.json';
import mainV10 from './fixtures/migrations/main-v10.json';
import mainV11 from './fixtures/migrations/main-v11.json';
import mainV12 from './fixtures/migrations/main-v12.json';
import mainV13 from './fixtures/migrations/main-v13.json';
import mainV14 from './fixtures/migrations/main-v14.json';
import mainV15 from './fixtures/migrations/main-v15.json';
import mainV16 from './fixtures/migrations/main-v16.json';
import mainV17 from './fixtures/migrations/main-v17.json';
import mainV18 from './fixtures/migrations/main-v18.json';
import mainV19 from './fixtures/migrations/main-v19.json';
import mainV20 from './fixtures/migrations/main-v20.json';
import mainV21 from './fixtures/migrations/main-v21.json';
import mainV22 from './fixtures/migrations/main-v22.json';
import mainV23 from './fixtures/migrations/main-v23.json';
import mainV24 from './fixtures/migrations/main-v24.json';
import mainV25 from './fixtures/migrations/main-v25.json';
import mainV26 from './fixtures/migrations/main-v26.json';
import mainV27 from './fixtures/migrations/main-v27.json';
import mainV28 from './fixtures/migrations/main-v28.json';
import mainV29 from './fixtures/migrations/main-v29.json';
import mainV30 from './fixtures/migrations/main-v30.json';
import mainV31 from './fixtures/migrations/main-v31.json';
import mainV32 from './fixtures/migrations/main-v32.json';
import mainV33 from './fixtures/migrations/main-v33.json';
import mainV34 from './fixtures/migrations/main-v34.json';
import { loadEvents, updateEvent } from './companion';
import {
  DEFAULT_SETTINGS,
  migratePersistedBlob,
  readPersisted,
  SCHEMA_VERSION,
} from './useBloom';

interface MainFixture {
  version: number;
  sessions: number;
  streak: number;
  lastFocusDay: string;
  tasks: Array<Record<string, unknown>>;
  activeTaskId: number;
  palXp: Record<string, number>;
  goals: Array<Record<string, unknown>>;
  flow: { startedAt: number | null; acc: number; running: boolean };
  settings: Record<string, unknown>;
}

interface CompanionFixture {
  version: number;
  events: Array<{
    id: string;
    ts: number;
    shownAt?: number;
    min: number;
    estOnsetMin?: number;
    estDurationMin?: number;
    len: number;
    kind: string;
    src: string;
  }>;
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const mainFixtures: MainFixture[] = [
  mainV00,
  mainV01,
  mainV02,
  mainV03,
  mainV04,
  mainV05,
  mainV06,
  mainV07,
  mainV08,
  mainV09,
  mainV10,
  mainV11,
  mainV12,
  mainV13,
  mainV14,
  mainV15,
  mainV16,
  mainV17,
  mainV18,
  mainV19,
  mainV20,
  mainV21,
  mainV22,
  mainV23,
  mainV24,
  mainV25,
  mainV26,
  mainV27,
  mainV28,
  mainV29,
  mainV30,
  mainV31,
  mainV32,
  mainV33,
  mainV34,
];
const companionFixtures: CompanionFixture[] = [
  companionV1,
  companionV2,
  companionV3,
  companionV4,
  companionV5,
];
const latestMainFixtureVersion = Math.max(...mainFixtures.map((fixture) => fixture.version));

const expectedHistoricalCore = {
  sessions: 41,
  streak: 7,
  lastFocusDay: '2026-07-10',
  tasks: [{ id: 101, t: 'Keep this migration task', done: false, pomos: 3, goal: 5 }],
  activeTaskId: 101,
  palXp: { Mochi: 12.5, Pip: 3 },
  goals: [{
    id: 201,
    title: 'Keep this migration goal',
    due: '2026-12-31',
    target: 8,
    done: 2,
  }],
  flow: { startedAt: null, acc: 480, running: false },
  settings: {
    name: 'Migration Friend',
    durations: { focus: 1800, short: 420, long: 1200 },
    sound: false,
    autoStart: true,
    night: true,
    pal: 'Pip',
    companion: {
      on: true,
      checkinMins: 15,
      tabDetect: false,
      awaySecs: 60,
      quiet: true,
      intention: false,
    },
    flow: true,
    planner: true,
  },
};

const expectedCore = {
  ...expectedHistoricalCore,
  settings: {
    ...expectedHistoricalCore.settings,
    appearance: 'night',
  },
};
delete (expectedCore.settings as Record<string, unknown>).night;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('main persisted-state migrations', () => {
  it('has one contiguous fixture for every shipped schema version', () => {
    expect(mainFixtures.map((fixture) => fixture.version)).toEqual(
      Array.from({ length: latestMainFixtureVersion + 1 }, (_, version) => version),
    );
    expect(latestMainFixtureVersion).toBe(SCHEMA_VERSION);
  });

  it.each(mainFixtures)('migrates schema v$version to latest without losing user data', (fixture) => {
    // Keeping the fixture assertion independent from the migrated result makes
    // an accidental or intentionally corrupted fixture fail loudly.
    expect(fixture).toMatchObject(
      fixture.version < 33 ? expectedHistoricalCore : expectedCore,
    );
    localStorage.setItem('bloom-state', JSON.stringify(fixture));

    const migrated = readPersisted();

    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(latestMainFixtureVersion);
    expect(migrated).toMatchObject(expectedCore);
    expect(migrated).toMatchObject({
      restDayUsedOn: null,
      comeBack: false,
      sessionRecords: [],
      historyArchive: {
        hours: [],
        completedTasks: [],
        overflow: {
          hourBucketCount: 0,
          focusMinutes: 0,
          sessionCount: 0,
          completedSessionCount: 0,
          driftCount: 0,
          recoveryCount: 0,
          completedTaskCount: 0,
        },
      },
      openFocus: null,
      openFlow: null,
      lastWeeklyReviewWeek: null,
      ifThenPlans: [],
      ritual: {
        enabled: false,
        suggestionSeen: false,
        items: [
          { id: 'phone', text: 'phone away' },
          { id: 'task', text: 'task named' },
          { id: 'first-action', text: 'first action named' },
          { id: 'tabs', text: 'distracting tabs closed' },
        ],
      },
      lastWoopOfferAt: null,
      preSlump: { day: null, count: 0, silenced: false, lastSessionId: null },
      personalCadence: { computedAt: null, recommendation: null, history: [] },
      parking: [],
      guideRead: { readAt: {}, suggestions: [] },
      foundations: { instances: [], entries: [], archive: [] },
      dayPlan: { targets: [], archive: [] },
      lastRolloverOfferDay: null,
      settings: {
        chronotype: 'notSure',
        preSlumpCheck: false,
        dayStartHour: 0,
        foundations: false,
        sound: false,
      },
    });
    // The ambient choice is dropped; the completion cue remains.
    expect(migrated?.settings).not.toHaveProperty('bgSound');
    expect(migrated?.settings).not.toHaveProperty('night');
  });

  it('preserves both existing theme choices and defaults fresh installs to Follow system', () => {
    localStorage.setItem(
      'bloom-state',
      JSON.stringify({ ...mainV32, settings: { ...mainV32.settings, night: false } }),
    );
    expect(readPersisted()?.settings.appearance).toBe('day');

    localStorage.setItem('bloom-state', JSON.stringify(mainV32));
    expect(readPersisted()?.settings.appearance).toBe('night');

    localStorage.clear();
    expect(DEFAULT_SETTINGS.appearance).toBe('system');
  });

  it('marks the sync baseline without changing existing ids or timestamps', () => {
    const before = {
      ...mainV33,
      version: 33,
      tasks: [{ id: 7301, t: 'Keep exact id', done: false, pomos: 0, goal: 1 }],
      sessionRecords: [{
        id: 'session-exact',
        startedAt: 1_700_000_000_123,
        endedAt: 1_700_000_060_123,
        mode: 'focus',
        plannedMin: 1,
        actualMin: 1,
        outcome: 'completed',
        startHour: 9,
        driftEventIds: ['event-exact'],
      }],
    };

    const migrated = migratePersistedBlob(before);

    expect(migrated.version).toBe(34);
    expect(migrated.tasks[0].id).toBe(7301);
    expect(migrated.sessionRecords[0]).toMatchObject({
      id: 'session-exact',
      startedAt: 1_700_000_000_123,
      endedAt: 1_700_000_060_123,
      driftEventIds: ['event-exact'],
    });
    expect(migrated).not.toHaveProperty('deviceId');
    expect(migrated).not.toHaveProperty('cursor');
    expect(migrated).not.toHaveProperty('sync');
  });

  // PLAN 12.1: removing ambience must not reset the completion-chime choice.
  it('preserves an enabled completion chime while dropping ambience', () => {
    localStorage.setItem(
      'bloom-state',
      JSON.stringify({
        ...mainV30,
        settings: { ...mainV30.settings, sound: true, bgSound: 'coffee' },
      }),
    );

    const migrated = readPersisted();

    expect(migrated?.settings.sound).toBe(true);
    expect(migrated?.settings).not.toHaveProperty('bgSound');
  });
});

describe('independent companion-log migrations', () => {
  it('has one fixture for every shipped companion-log version', () => {
    expect(companionFixtures.map((fixture) => fixture.version)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each(companionFixtures)('loads companion log v$version and rewrites it at latest', (fixture) => {
    localStorage.setItem('bloom-companion-v1', JSON.stringify(fixture));

    expect(loadEvents()).toEqual(fixture.events);
    updateEvent(fixture.events[0].id, { min: fixture.events[0].min });

    expect(JSON.parse(localStorage.getItem('bloom-companion-v1')!)).toEqual({
      version: 5,
      events: fixture.events,
    });
  });

  it('gives an idless legacy moment a stable content id without inventing a timestamp', () => {
    const legacy = {
      ts: 1_784_217_600_000,
      min: 8,
      len: 25,
      kind: 'focused',
      src: 'checkin',
    };
    localStorage.setItem(
      'bloom-companion-v1',
      JSON.stringify({ version: 1, events: [legacy] }),
    );

    const first = loadEvents();
    const second = loadEvents();

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject(legacy);
    expect(first[0].id).toMatch(/^legacy_/);
    expect(first[0].ts).toBe(legacy.ts);
  });
});
