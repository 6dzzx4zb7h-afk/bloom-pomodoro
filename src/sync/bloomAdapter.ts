import {
  createBackupEnvelope,
  parseBackup,
  serializeBackup,
  type BackupEnvelope,
} from '../store/exportImport';
import {
  companionEventStableId,
  type CompanionEvent,
} from '../store/companion';
import type { PersistedShape, Settings } from '../store/useBloom';
import {
  cloneJson,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type SyncEntityReference,
} from './protocol';
import type {
  SyncCompactionState,
  SyncCounterState,
  SyncDocument,
  SyncDocumentSeed,
  SyncEntityKind,
  SyncEntityState,
} from './merge';

/**
 * Convert 9.4's validated complete backup into revision-zero sync material.
 * Device-local live timer ownership is intentionally absent from the seed.
 */
export function seedSyncDocumentFromBackup(backup: BackupEnvelope): SyncDocumentSeed {
  const bloom = backup.bloom;
  const entities: SyncEntityState[] = [];
  const counters: SyncCounterState[] = [bootstrapCounter('sessions', bloom.sessions)];
  const compactions: SyncCompactionState[] = [];
  const add = (
    kind: SyncEntityKind,
    id: string,
    value: unknown,
    references: SyncEntityReference[] = [],
  ) => entities.push(bootstrapEntity(kind, id, value, references));
  const compact = (kind: SyncCompactionState['kind'], id: string, value: unknown) =>
    compactions.push(bootstrapCompaction(kind, id, value));

  add('day-summary', 'current', {
    streak: bloom.streak,
    lastFocusDay: bloom.lastFocusDay,
    restDayUsedOn: bloom.restDayUsedOn,
    comeBack: bloom.comeBack,
  });
  for (const task of bloom.tasks) {
    const { pomos, ...taskValue } = task;
    add(
      'task',
      String(task.id),
      taskValue,
      task.goalId === undefined ? [] : [{ kind: 'goal', id: String(task.goalId) }],
    );
    counters.push(bootstrapCounter(`task-pomos:${task.id}`, pomos));
  }
  for (const [pal, xp] of Object.entries(bloom.palXp)) {
    counters.push(bootstrapCounter(`pal-xp:${pal}`, xp));
  }
  for (const goal of bloom.goals) {
    const { done: _derivedDone, ...goalValue } = goal;
    void _derivedDone;
    add('goal', String(goal.id), goalValue);
  }
  for (const row of bloom.goalLedger) {
    add('goal-ledger-row', row.id, row, [{ kind: 'goal', id: String(row.goalId) }]);
  }
  for (const instance of bloom.foundations.instances) {
    const { ranges, ...instanceValue } = instance;
    add(
      'foundation-instance',
      instance.id,
      instanceValue,
      instance.ifThenId ? [{ kind: 'if-then-plan', id: instance.ifThenId }] : [],
    );
    for (const range of ranges) {
      add(
        'foundation-range',
        `${instance.id}:${range.from}`,
        { ...range, instanceId: instance.id },
        [{ kind: 'foundation-instance', id: instance.id }],
      );
    }
  }
  for (const entry of bloom.foundations.entries) {
    add('foundation-entry', entry.id, entry, [
      { kind: 'foundation-instance', id: entry.instanceId },
    ]);
  }
  for (const row of bloom.foundations.archive) {
    compact('foundation-archive', `${row.instanceId}:${row.monthKey}`, row);
  }
  for (const target of bloom.dayPlan.targets) {
    const targetReference = 'goalId' in target
      ? { kind: 'goal', id: String(target.goalId) }
      : { kind: 'task', id: String(target.taskId) };
    add('day-plan-target', target.id, target, [targetReference]);
  }
  for (const row of bloom.dayPlan.archive) compact('day-plan-archive', row.weekKey, row);
  add('marker', 'last-rollover-offer-day', { value: bloom.lastRolloverOfferDay });
  for (const record of bloom.sessionRecords) add('session-record', record.id, record);
  for (const row of bloom.historyArchive.hours) {
    compact('history-hour', `${row.calendarDay}:${row.hour}`, row);
  }
  for (const row of bloom.historyArchive.completedTasks) {
    compact('history-completed-task', row.id, row);
  }
  compact('history-overflow', 'lifetime', bloom.historyArchive.overflow);
  add('marker', 'last-weekly-review-week', { value: bloom.lastWeeklyReviewWeek });
  for (const plan of bloom.ifThenPlans) {
    const { usageCount, ...planValue } = plan;
    add(
      'if-then-plan',
      plan.id,
      planValue,
      plan.taskId === undefined ? [] : [{ kind: 'task', id: String(plan.taskId) }],
    );
    counters.push(bootstrapCounter(`if-then-usage:${plan.id}`, usageCount));
  }
  add('ritual', 'settings', {
    enabled: bloom.ritual.enabled,
    suggestionSeen: bloom.ritual.suggestionSeen,
  });
  for (const item of bloom.ritual.items) add('ritual-item', item.id, item);
  add('marker', 'last-woop-offer-at', { value: bloom.lastWoopOfferAt });
  add('pre-slump', 'caps', {
    day: bloom.preSlump.day,
    silenced: bloom.preSlump.silenced,
  });
  if (bloom.preSlump.day) {
    for (let index = 0; index < bloom.preSlump.count; index += 1) {
      add('pre-slump-emission', `${bloom.preSlump.day}:bootstrap:${index}`, {
        day: bloom.preSlump.day,
        ...(index === bloom.preSlump.count - 1 && bloom.preSlump.lastSessionId
          ? { sessionId: bloom.preSlump.lastSessionId }
          : {}),
      });
    }
  }
  add('cadence', 'personal', {
    computedAt: bloom.personalCadence.computedAt,
    recommendation: bloom.personalCadence.recommendation,
  });
  for (const pair of bloom.personalCadence.history) {
    add('cadence-history', cadencePairId(pair), pair);
  }
  for (const thought of bloom.parking) {
    // Hidden thoughts still belong to an unresolved local session.
    if (thought.revealedAt !== null) add('parking-thought', thought.id, thought);
  }
  for (const [articleId, readAt] of Object.entries(bloom.guideRead.readAt)) {
    add('guide-read', articleId, { articleId, readAt });
  }
  for (const suggestion of bloom.guideRead.suggestions) {
    add('guide-suggestion', suggestion.momentKey, suggestion);
  }
  for (const [path, value] of settingsLeaves(bloom.settings)) {
    add('setting', path, { value });
  }
  backup.companion.events.forEach((event) => {
    add('companion-event', companionEventStableId(event), event);
  });

  return {
    contentSchemaVersion: bloom.version,
    entities,
    counters,
    compactions,
    tombstones: [],
  };
}

/** Materialize only validated, reference-safe entities; live device state stays local. */
export function materializeBackupFromSyncDocument(
  localBase: BackupEnvelope,
  document: SyncDocument,
): BackupEnvelope {
  const base = cloneJson(localBase as unknown as JsonValue) as unknown as BackupEnvelope;
  const entityValues = <T>(
    kind: SyncEntityKind,
    baseIds: readonly (string | number)[] = [],
  ): T[] => {
    const states = document.entities.filter((entity) => entity.kind === kind);
    const byId = new Map(states.map((entity) => [entity.id, entity]));
    const ordered = baseIds.flatMap((id) => {
      const entity = byId.get(String(id));
      if (!entity) return [];
      byId.delete(String(id));
      return [entity];
    });
    ordered.push(
      ...[...byId.values()].sort(
        (a, b) => a.revision - b.revision || a.id.localeCompare(b.id),
      ),
    );
    return ordered.map((entity) => cloneJson(entity.value) as unknown as T);
  };
  const one = <T>(kind: SyncEntityKind, id: string): T | undefined =>
    document.entities.find((entity) => entity.kind === kind && entity.id === id)
      ?.value as unknown as T | undefined;
  const marker = <T>(id: string, fallback: T): T => {
    const value = one<{ value?: T }>('marker', id)?.value;
    return value === undefined ? fallback : value;
  };
  const counter = (id: string, fallback: number) =>
    document.counters.find((item) => item.id === id)?.value ?? fallback;
  const compacted = <T>(
    kind: SyncCompactionState['kind'],
    baseIds: readonly string[] = [],
  ): T[] => {
    const states = document.compactions.filter((item) => item.kind === kind);
    const byId = new Map(states.map((item) => [item.id, item]));
    const ordered = baseIds.flatMap((id) => {
      const item = byId.get(id);
      if (!item) return [];
      byId.delete(id);
      return [item];
    });
    ordered.push(
      ...[...byId.values()].sort(
        (a, b) => a.revision - b.revision || a.id.localeCompare(b.id),
      ),
    );
    return ordered.map((item) => cloneJson(item.value) as unknown as T);
  };

  const daySummary = one<
    Pick<PersistedShape, 'streak' | 'lastFocusDay' | 'restDayUsedOn' | 'comeBack'>
  >('day-summary', 'current');
  const settings = cloneJson(base.bloom.settings as unknown as JsonValue) as unknown as Settings;
  for (const entity of document.entities.filter((item) => item.kind === 'setting')) {
    if ('value' in entity.value) setSettingsLeaf(settings, entity.id, entity.value.value);
  }
  const syncedRevealedParking = entityValues<PersistedShape['parking'][number]>(
    'parking-thought',
    base.bloom.parking.filter((thought) => thought.revealedAt !== null).map((thought) => thought.id),
  );
  const localHiddenParking = base.bloom.parking.filter((thought) => thought.revealedAt === null);
  const palXp: Record<string, number> = {};
  for (const item of document.counters) {
    if (item.id.startsWith('pal-xp:')) palXp[item.id.slice('pal-xp:'.length)] = item.value;
  }
  const baseTaskById = new Map(base.bloom.tasks.map((task) => [task.id, task]));
  const tasks = entityValues<PersistedShape['tasks'][number]>(
    'task',
    base.bloom.tasks.map((task) => task.id),
  ).map((task) => ({
    ...task,
    pomos: Math.max(
      0,
      Math.floor(
        counter(
          `task-pomos:${task.id}`,
          task.pomos ?? baseTaskById.get(task.id)?.pomos ?? 0,
        ),
      ),
    ),
  }));
  const goalLedger = entityValues<PersistedShape['goalLedger'][number]>(
    'goal-ledger-row',
    base.bloom.goalLedger.map((row) => row.id),
  );
  const goalTotals = new Map<number, number>();
  const firstGoalCrossing = new Map<number, number>();
  const goalValues = entityValues<PersistedShape['goals'][number]>(
    'goal',
    base.bloom.goals.map((goal) => goal.id),
  );
  const goalTargets = new Map(goalValues.map((goal) => [goal.id, goal.target]));
  for (const row of goalLedger) {
    const next = (goalTotals.get(row.goalId) ?? 0) + row.delta;
    goalTotals.set(row.goalId, next);
    const target = goalTargets.get(row.goalId);
    if (
      target !== undefined &&
      next >= target &&
      !firstGoalCrossing.has(row.goalId) &&
      Number.isFinite(row.at)
    ) {
      firstGoalCrossing.set(row.goalId, row.at);
    }
  }
  const goals = goalValues.map((goal) => {
    const done = Math.max(0, Math.min(goal.target, goalTotals.get(goal.id) ?? 0));
    return {
      ...goal,
      done,
      completedAt:
        done >= goal.target
          ? (goal.completedAt ?? firstGoalCrossing.get(goal.id))
          : undefined,
    };
  });
  const foundationRanges = entityValues<{
    instanceId: string;
    from: string;
    to?: string;
  }>(
    'foundation-range',
    base.bloom.foundations.instances.flatMap((instance) =>
      instance.ranges.map((range) => `${instance.id}:${range.from}`),
    ),
  );
  const foundationInstances = entityValues<
    PersistedShape['foundations']['instances'][number]
  >(
    'foundation-instance',
    base.bloom.foundations.instances.map((instance) => instance.id),
  ).map((instance) => ({
    ...instance,
    ranges: foundationRanges
      .filter((range) => range.instanceId === instance.id)
      .map(({ from, to }) => ({ from, ...(to === undefined ? {} : { to }) })),
  }));
  const basePlanById = new Map(base.bloom.ifThenPlans.map((plan) => [plan.id, plan]));
  const ifThenPlans = entityValues<PersistedShape['ifThenPlans'][number]>(
    'if-then-plan',
    base.bloom.ifThenPlans.map((plan) => plan.id),
  ).map((plan) => ({
    ...plan,
    usageCount: Math.max(
      0,
      Math.floor(
        counter(
          `if-then-usage:${plan.id}`,
          plan.usageCount ?? basePlanById.get(plan.id)?.usageCount ?? 0,
        ),
      ),
    ),
  }));
  const ritualFlags = one<Pick<PersistedShape['ritual'], 'enabled' | 'suggestionSeen'>>(
    'ritual',
    'settings',
  );
  const ritual = {
    enabled: ritualFlags?.enabled ?? base.bloom.ritual.enabled,
    suggestionSeen: ritualFlags?.suggestionSeen ?? base.bloom.ritual.suggestionSeen,
    items: entityValues<PersistedShape['ritual']['items'][number]>(
      'ritual-item',
      base.bloom.ritual.items.map((item) => item.id),
    ),
  };
  const preSlumpFlags = one<Pick<PersistedShape['preSlump'], 'day' | 'silenced'>>(
    'pre-slump',
    'caps',
  );
  const preSlumpEmissions = document.entities
    .filter((entity) => entity.kind === 'pre-slump-emission')
    .sort((a, b) => a.revision - b.revision || a.id.localeCompare(b.id));
  const preSlumpDays = [
    preSlumpFlags?.day,
    ...preSlumpEmissions.map((entity) => entity.value.day),
  ].filter((value): value is string => typeof value === 'string');
  preSlumpDays.sort();
  const preSlumpDay = preSlumpDays[preSlumpDays.length - 1] ?? null;
  const selectedPreSlumpEmissions = preSlumpEmissions.filter(
    (entity) => entity.value.day === preSlumpDay,
  );
  const preSlump = {
    day: preSlumpDay,
    count: selectedPreSlumpEmissions.length,
    silenced: preSlumpFlags?.day === preSlumpDay && preSlumpFlags.silenced,
    lastSessionId: lastString(
      selectedPreSlumpEmissions.map((entity) => entity.value.sessionId),
    ),
  };
  const cadenceCache = one<
    Pick<PersistedShape['personalCadence'], 'computedAt' | 'recommendation'>
  >('cadence', 'personal');
  const personalCadence = {
    computedAt: cadenceCache?.computedAt ?? base.bloom.personalCadence.computedAt,
    recommendation:
      cadenceCache?.recommendation ?? base.bloom.personalCadence.recommendation,
    history: entityValues<PersistedShape['personalCadence']['history'][number]>(
      'cadence-history',
      base.bloom.personalCadence.history.map(cadencePairId),
    ),
  };
  const guideReadAt = Object.fromEntries(
    entityValues<{ articleId: string; readAt: number }>('guide-read').map((item) => [
      item.articleId,
      item.readAt,
    ]),
  );
  const guideRead = {
    readAt: guideReadAt,
    suggestions: entityValues<PersistedShape['guideRead']['suggestions'][number]>(
      'guide-suggestion',
      base.bloom.guideRead.suggestions.map((suggestion) => suggestion.momentKey),
    ),
  };
  const overflowComponents = compacted<PersistedShape['historyArchive']['overflow']>(
    'history-overflow',
  );
  const historyOverflow = overflowComponents.length
    ? sumNumericObjects(overflowComponents, base.bloom.historyArchive.overflow)
    : base.bloom.historyArchive.overflow;

  const bloom: PersistedShape = {
    ...base.bloom,
    version: document.contentSchemaVersion,
    sessions: Math.max(0, Math.floor(counter('sessions', base.bloom.sessions))),
    streak: daySummary?.streak ?? base.bloom.streak,
    lastFocusDay: daySummary?.lastFocusDay ?? base.bloom.lastFocusDay,
    restDayUsedOn: daySummary?.restDayUsedOn ?? base.bloom.restDayUsedOn,
    comeBack: daySummary?.comeBack ?? base.bloom.comeBack,
    tasks,
    // Current selection and all live timer ownership remain from this device.
    activeTaskId: base.bloom.activeTaskId,
    palXp,
    goals,
    goalLedger,
    foundations: {
      instances: foundationInstances,
      entries: entityValues(
        'foundation-entry',
        base.bloom.foundations.entries.map((entry) => entry.id),
      ),
      archive: compacted(
        'foundation-archive',
        base.bloom.foundations.archive.map((row) => `${row.instanceId}:${row.monthKey}`),
      ),
    },
    dayPlan: {
      targets: entityValues(
        'day-plan-target',
        base.bloom.dayPlan.targets.map((target) => target.id),
      ),
      archive: compacted(
        'day-plan-archive',
        base.bloom.dayPlan.archive.map((row) => row.weekKey),
      ),
    },
    lastRolloverOfferDay: marker(
      'last-rollover-offer-day',
      base.bloom.lastRolloverOfferDay,
    ),
    flow: base.bloom.flow,
    sessionRecords: entityValues(
      'session-record',
      base.bloom.sessionRecords.map((record) => record.id),
    ),
    historyArchive: {
      hours: compacted(
        'history-hour',
        base.bloom.historyArchive.hours.map((row) => `${row.calendarDay}:${row.hour}`),
      ),
      completedTasks: compacted(
        'history-completed-task',
        base.bloom.historyArchive.completedTasks.map((row) => row.id),
      ),
      overflow: historyOverflow,
    },
    openFocus: base.bloom.openFocus,
    openFlow: base.bloom.openFlow,
    lastWeeklyReviewWeek: marker(
      'last-weekly-review-week',
      base.bloom.lastWeeklyReviewWeek,
    ),
    ifThenPlans,
    ritual,
    lastWoopOfferAt: marker('last-woop-offer-at', base.bloom.lastWoopOfferAt),
    preSlump,
    personalCadence,
    parking: [...localHiddenParking, ...syncedRevealedParking],
    guideRead,
    settings,
  };
  const companionEvents = entityValues<CompanionEvent>(
    'companion-event',
    base.companion.events.map(companionEventStableId),
  );
  const candidate = createBackupEnvelope(bloom, companionEvents, base.exportedAt);
  // Reuse 9.4's canonical full-envelope validation and migration before a
  // sync result is allowed to approach live storage.
  return parseBackup(serializeBackup(candidate));
}

function bootstrapEntity(
  kind: SyncEntityKind,
  id: string,
  value: unknown,
  references: SyncEntityReference[] = [],
): SyncEntityState {
  const object = jsonObject(value);
  return {
    kind,
    id,
    value: object,
    revision: 0,
    fieldRevisions: Object.fromEntries(Object.keys(object).map((field) => [field, 0])),
    references: references.map((reference) => ({ ...reference })),
    referencesRevision: 0,
    createdBy: `bootstrap:${kind}:${id}`,
    generationRevision: 0,
  };
}

function bootstrapCounter(id: string, value: number): SyncCounterState {
  return {
    id,
    value,
    revision: 0,
    components: value === 0 ? {} : { [`bootstrap:${id}`]: value },
  };
}

function bootstrapCompaction(
  kind: SyncCompactionState['kind'],
  id: string,
  value: unknown,
): SyncCompactionState {
  const mutationId = `bootstrap:${kind}:${id}`;
  return {
    kind,
    id,
    value: jsonObject(value),
    revision: 0,
    mutationId,
    sourceMutationIds: [mutationId],
  };
}

function cadencePairId(pair: { focusMin: number; breakMin: number }): string {
  return `${pair.focusMin}:${pair.breakMin}`;
}

function lastString(values: JsonValue[]): string | null {
  const strings = values.filter((value): value is string => typeof value === 'string');
  return strings[strings.length - 1] ?? null;
}

function sumNumericObjects<T extends object>(
  values: T[],
  shape: T,
): T {
  const result: Record<string, number> = {};
  for (const key of Object.keys(shape)) {
    result[key] = values.reduce((sum, value) => {
      const item = (value as Record<string, unknown>)[key];
      return sum + (typeof item === 'number' && Number.isFinite(item) ? item : 0);
    }, 0);
  }
  return result as unknown as T;
}

function jsonObject(value: unknown): JsonObject {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  if (!isJsonObject(cloned)) throw new Error('A Bloom sync entity must serialize as an object.');
  return cloned;
}

function settingsLeaves(settings: Settings): Array<[string, JsonValue]> {
  const leaves: Array<[string, JsonValue]> = [];
  const walk = (value: JsonValue, path: string) => {
    if (isJsonObject(value)) {
      for (const key of Object.keys(value).sort()) {
        walk(value[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    leaves.push([path, cloneJson(value)]);
  };
  walk(jsonObject(settings), '');
  return leaves;
}

function setSettingsLeaf(settings: Settings, path: string, value: JsonValue): void {
  const parts = path.split('.');
  if (
    !parts.length ||
    parts.some(
      (part) =>
        !part || part === '__proto__' || part === 'prototype' || part === 'constructor',
    )
  ) {
    return;
  }
  let target = settings as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(target, part)) return;
    const child = target[part];
    if (!child || typeof child !== 'object' || Array.isArray(child)) return;
    target = child as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(target, leaf)) return;
  target[leaf] = cloneJson(value);
}
