import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import companionV1 from './fixtures/migrations/companion-v1.json';
import companionV2 from './fixtures/migrations/companion-v2.json';
import companionV3 from './fixtures/migrations/companion-v3.json';
import companionV4 from './fixtures/migrations/companion-v4.json';
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
import { loadEvents, updateEvent } from './companion';
import { readPersisted, SCHEMA_VERSION } from './useBloom';

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
];
const companionFixtures: CompanionFixture[] = [
  companionV1,
  companionV2,
  companionV3,
  companionV4,
];
const latestMainFixtureVersion = Math.max(...mainFixtures.map((fixture) => fixture.version));

const expectedCore = {
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
    bgSound: 'calm',
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
    expect(fixture).toMatchObject(expectedCore);
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
      },
    });
  });
});

describe('independent companion-log migrations', () => {
  it('has one fixture for every shipped companion-log version', () => {
    expect(companionFixtures.map((fixture) => fixture.version)).toEqual([1, 2, 3, 4]);
  });

  it.each(companionFixtures)('loads companion log v$version and rewrites it at latest', (fixture) => {
    localStorage.setItem('bloom-companion-v1', JSON.stringify(fixture));

    expect(loadEvents()).toEqual(fixture.events);
    updateEvent(fixture.events[0].id, { min: fixture.events[0].min });

    expect(JSON.parse(localStorage.getItem('bloom-companion-v1')!)).toEqual({
      version: 4,
      events: fixture.events,
    });
  });
});
