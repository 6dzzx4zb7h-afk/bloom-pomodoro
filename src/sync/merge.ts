import {
  SYNC_PROTOCOL_VERSION,
  acceptedEnvelopeToWire,
  canonicalJson,
  cloneJson,
  entityKey,
  isJsonObject,
  parseSyncEnvelope,
  type AcceptedSyncEnvelope,
  type JsonObject,
  type JsonValue,
  type SyncEntityReference,
  type SyncEnvelopeParseResult,
} from './protocol';

export type SyncEntityKind =
  | 'archive-component'
  | 'cadence'
  | 'cadence-history'
  | 'companion-event'
  | 'counter'
  | 'day-plan-archive'
  | 'day-plan-target'
  | 'day-summary'
  | 'foundation-archive'
  | 'foundation-entry'
  | 'foundation-instance'
  | 'foundation-range'
  | 'goal'
  | 'goal-ledger-row'
  | 'guide-read'
  | 'guide-suggestion'
  | 'history-completed-task'
  | 'history-hour'
  | 'history-overflow'
  | 'if-then-plan'
  | 'marker'
  | 'parking-thought'
  | 'pre-slump'
  | 'pre-slump-emission'
  | 'ritual'
  | 'ritual-item'
  | 'session-record'
  | 'setting'
  | 'task';

export interface SyncEntityRule {
  mode: 'append' | 'mutable' | 'counter' | 'compaction';
  allowDelete: boolean;
  allowRepair: boolean;
}

export const SYNC_ENTITY_RULES: Readonly<Record<SyncEntityKind, SyncEntityRule>> = {
  'archive-component': { mode: 'compaction', allowDelete: false, allowRepair: false },
  cadence: { mode: 'mutable', allowDelete: false, allowRepair: false },
  'cadence-history': { mode: 'mutable', allowDelete: true, allowRepair: false },
  'companion-event': { mode: 'append', allowDelete: true, allowRepair: true },
  counter: { mode: 'counter', allowDelete: false, allowRepair: false },
  'day-plan-archive': { mode: 'compaction', allowDelete: false, allowRepair: false },
  'day-plan-target': { mode: 'mutable', allowDelete: true, allowRepair: false },
  'day-summary': { mode: 'mutable', allowDelete: false, allowRepair: false },
  'foundation-archive': { mode: 'compaction', allowDelete: false, allowRepair: false },
  'foundation-entry': { mode: 'mutable', allowDelete: true, allowRepair: false },
  'foundation-instance': { mode: 'mutable', allowDelete: true, allowRepair: false },
  'foundation-range': { mode: 'mutable', allowDelete: true, allowRepair: false },
  goal: { mode: 'mutable', allowDelete: true, allowRepair: false },
  'goal-ledger-row': { mode: 'append', allowDelete: false, allowRepair: false },
  'guide-read': { mode: 'mutable', allowDelete: false, allowRepair: false },
  'guide-suggestion': { mode: 'mutable', allowDelete: false, allowRepair: false },
  'history-completed-task': { mode: 'compaction', allowDelete: false, allowRepair: false },
  'history-hour': { mode: 'compaction', allowDelete: false, allowRepair: false },
  'history-overflow': { mode: 'compaction', allowDelete: false, allowRepair: false },
  'if-then-plan': { mode: 'mutable', allowDelete: true, allowRepair: false },
  marker: { mode: 'mutable', allowDelete: false, allowRepair: false },
  'parking-thought': { mode: 'mutable', allowDelete: true, allowRepair: false },
  'pre-slump': { mode: 'mutable', allowDelete: false, allowRepair: false },
  'pre-slump-emission': { mode: 'append', allowDelete: false, allowRepair: false },
  ritual: { mode: 'mutable', allowDelete: false, allowRepair: false },
  'ritual-item': { mode: 'mutable', allowDelete: true, allowRepair: false },
  'session-record': { mode: 'append', allowDelete: true, allowRepair: true },
  setting: { mode: 'mutable', allowDelete: false, allowRepair: false },
  task: { mode: 'mutable', allowDelete: true, allowRepair: false },
};

export interface SyncEntityState {
  kind: SyncEntityKind;
  id: string;
  value: JsonObject;
  revision: number;
  fieldRevisions: Record<string, number>;
  references: SyncEntityReference[];
  referencesRevision: number;
  createdBy: string;
  /** Revision that created the current post-tombstone generation; bootstrap is zero. */
  generationRevision: number;
}

export interface SyncCounterState {
  id: string;
  value: number;
  revision: number;
  components: Record<string, number>;
}

export interface SyncCompactionState {
  kind: Extract<SyncEntityKind,
    | 'archive-component'
    | 'day-plan-archive'
    | 'foundation-archive'
    | 'history-completed-task'
    | 'history-hour'
    | 'history-overflow'>;
  id: string;
  value: JsonObject;
  revision: number;
  mutationId: string;
  sourceMutationIds: string[];
}

export interface SyncTombstone {
  kind: SyncEntityKind;
  id: string;
  revision: number;
  mutationId: string;
}

export type SyncConflictKind =
  | 'disallowed-operation'
  | 'missing-base'
  | 'overlapping-compaction'
  | 'revision-collision'
  | 'revision-gap'
  | 'stable-id-collision'
  | 'stale-after-delete'
  | 'unresolved-reference'
  | 'unsupported-kind';

export interface SyncConflict {
  kind: SyncConflictKind;
  entityKind?: string;
  entityId?: string;
  mutationIds: string[];
  reason: string;
}

export interface PreservedSyncEnvelope {
  status: 'future-schema' | 'unsupported-protocol';
  raw: JsonValue;
  reason: string;
}

export interface QuarantinedSyncEnvelope {
  raw: JsonValue | null;
  reason: string;
}

export interface SyncDocumentSeed {
  contentSchemaVersion: number;
  revision?: number;
  cursor?: string | null;
  entities?: SyncEntityState[];
  counters?: SyncCounterState[];
  compactions?: SyncCompactionState[];
  tombstones?: SyncTombstone[];
}

export interface SyncDocument {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  contentSchemaVersion: number;
  revision: number;
  cursor: string | null;
  entities: SyncEntityState[];
  blockedEntities: SyncEntityState[];
  counters: SyncCounterState[];
  compactions: SyncCompactionState[];
  tombstones: SyncTombstone[];
  conflicts: SyncConflict[];
  preservedEnvelopes: PreservedSyncEnvelope[];
  quarantinedEnvelopes: QuarantinedSyncEnvelope[];
  retainedEnvelopes: JsonObject[];
  appliedMutationIds: string[];
}

export type SyncEnvelopeInput = string | unknown | AcceptedSyncEnvelope;

const COMPACTION_KINDS = new Set<SyncEntityKind>([
  'archive-component',
  'day-plan-archive',
  'foundation-archive',
  'history-completed-task',
  'history-hour',
  'history-overflow',
]);

export function mergeSyncEnvelopes(
  inputs: readonly SyncEnvelopeInput[],
  currentContentSchemaVersion: number,
  seed?: SyncDocumentSeed,
): SyncDocument {
  const parsed = inputs.map((input) =>
    isAcceptedEnvelope(input)
      ? ({ status: 'valid', envelope: input } as const)
      : parseSyncEnvelope(input, currentContentSchemaVersion),
  );
  const preservedEnvelopes = parsed.flatMap((result): PreservedSyncEnvelope[] =>
    result.status === 'future-schema' || result.status === 'unsupported-protocol'
      ? [{ status: result.status, raw: result.raw ?? null, reason: result.reason }]
      : [],
  );
  const quarantinedEnvelopes = parsed.flatMap((result): QuarantinedSyncEnvelope[] =>
    result.status === 'invalid' ? [{ raw: result.raw, reason: result.reason }] : [],
  );
  const valid = parsed.flatMap((result) =>
    result.status === 'valid' ? [result.envelope] : [],
  );
  const retainedEnvelopes: JsonObject[] = valid.map(acceptedEnvelopeToWire);

  const conflicts: SyncConflict[] = [];
  const unique = removeDuplicateAndCollidingMutations(valid, conflicts);
  const revisionSafe = removeRevisionCollisions(unique, conflicts);
  const collidingEntityKeys = stableIdCollisions(revisionSafe, conflicts);
  const ordered = revisionSafe
    .filter((envelope) => !collidingEntityKeys.has(mutationEntityKey(envelope)))
    .sort(compareEnvelope);

  const entities = new Map(
    (seed?.entities ?? []).map((entity) => [entityKey(entity.kind, entity.id), cloneEntity(entity)]),
  );
  const counters = new Map(
    (seed?.counters ?? []).map((counter) => [counter.id, cloneCounter(counter)]),
  );
  const compactions = new Map(
    (seed?.compactions ?? []).map((item) => [entityKey(item.kind, item.id), cloneCompaction(item)]),
  );
  const tombstones = new Map(
    (seed?.tombstones ?? []).map((item) => [entityKey(item.kind, item.id), { ...item }]),
  );
  const sourceOwners = new Map<string, string>();
  for (const item of compactions.values()) {
    for (const source of item.sourceMutationIds) {
      sourceOwners.set(source, item.mutationId);
    }
  }

  const appliedMutationIds: string[] = [];
  let revision = seed?.revision ?? 0;
  let cursor: string | null = seed?.cursor ?? null;

  for (const envelope of ordered) {
    if (envelope.revision !== revision + 1) {
      conflicts.push({
        kind: 'revision-gap',
        mutationIds: [envelope.mutationId],
        reason: `Expected server revision ${revision + 1} before revision ${envelope.revision}.`,
      });
      break;
    }
    revision = Math.max(revision, envelope.revision);
    if (envelope.revision === revision) cursor = envelope.cursor;
    const result = applyEnvelope(
      envelope,
      entities,
      counters,
      compactions,
      tombstones,
      sourceOwners,
    );
    if (result) conflicts.push(result);
    else appliedMutationIds.push(envelope.mutationId);
  }

  for (const item of preservedEnvelopes) {
    if (isJsonObject(item.raw)) retainedEnvelopes.push(cloneJson(item.raw));
  }

  const { materialized, blocked } = separateBlockedReferences(entities, tombstones, conflicts);

  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    contentSchemaVersion: Math.max(seed?.contentSchemaVersion ?? 0, currentContentSchemaVersion),
    revision,
    cursor,
    entities: sortEntities(materialized),
    blockedEntities: sortEntities(blocked),
    counters: [...counters.values()].map(cloneCounter).sort((a, b) => a.id.localeCompare(b.id)),
    compactions: [...compactions.values()].map(cloneCompaction).sort(compareCompaction),
    tombstones: [...tombstones.values()].map((item) => ({ ...item })).sort(compareTombstone),
    conflicts: sortConflicts(conflicts),
    preservedEnvelopes: preservedEnvelopes.sort((a, b) => canonicalJson(a.raw).localeCompare(canonicalJson(b.raw))),
    quarantinedEnvelopes: quarantinedEnvelopes.sort((a, b) => a.reason.localeCompare(b.reason)),
    retainedEnvelopes: dedupeWireEnvelopes(retainedEnvelopes),
    appliedMutationIds: [...new Set(appliedMutationIds)].sort(),
  };
}

function applyEnvelope(
  envelope: AcceptedSyncEnvelope,
  entities: Map<string, SyncEntityState>,
  counters: Map<string, SyncCounterState>,
  compactions: Map<string, SyncCompactionState>,
  tombstones: Map<string, SyncTombstone>,
  sourceOwners: Map<string, string>,
): SyncConflict | null {
  const mutation = envelope.mutation;
  const rule = ruleFor(mutation.kind);
  if (!rule) return conflict('unsupported-kind', envelope, 'This entity kind is not supported.');

  if (mutation.operation === 'increment') {
    if (rule.mode !== 'counter') {
      return conflict('disallowed-operation', envelope, 'Only counters accept increments.');
    }
    const current = counters.get(mutation.id) ?? {
      id: mutation.id,
      value: 0,
      revision: 0,
      components: {},
    };
    if (current.components[envelope.mutationId] === undefined) {
      current.components[envelope.mutationId] = mutation.delta;
      current.value = sumCounterComponents(current.components);
      current.revision = Math.max(current.revision, envelope.revision);
      counters.set(mutation.id, current);
    }
    return null;
  }

  if (mutation.operation === 'compact') {
    if (rule.mode !== 'compaction' || !COMPACTION_KINDS.has(mutation.kind as SyncEntityKind)) {
      return conflict('disallowed-operation', envelope, 'This entity does not accept compaction.');
    }
    if (!compactionIdentityMatches(mutation.kind as SyncCompactionState['kind'], mutation.id, mutation.value)) {
      return conflict(
        'stable-id-collision',
        envelope,
        'The archive payload identity does not match its stable component id.',
      );
    }
    const compactionKey = entityKey(mutation.kind, mutation.id);
    const existing = compactions.get(compactionKey);
    if (existing) {
      const sameValue = canonicalJson(existing.value) === canonicalJson(mutation.value);
      const sameSources = canonicalJson(existing.sourceMutationIds as unknown as JsonValue) ===
        canonicalJson([...mutation.sourceMutationIds].sort() as unknown as JsonValue);
      if (!sameValue || !sameSources) {
        return conflict(
          'stable-id-collision',
          envelope,
          'A different archive component already claims this stable id.',
        );
      }
      return null;
    }
    const owner = mutation.sourceMutationIds
      .map((source) => sourceOwners.get(source))
      .find((value) => value && value !== envelope.mutationId);
    if (owner) {
      return conflict(
        'overlapping-compaction',
        envelope,
        `A retained compaction already covers one or more sources (${owner}).`,
      );
    }
    const item: SyncCompactionState = {
      kind: mutation.kind as SyncCompactionState['kind'],
      id: mutation.id,
      value: cloneJson(mutation.value),
      revision: envelope.revision,
      mutationId: envelope.mutationId,
      sourceMutationIds: [...mutation.sourceMutationIds].sort(),
    };
    compactions.set(compactionKey, item);
    for (const source of item.sourceMutationIds) sourceOwners.set(source, envelope.mutationId);
    return null;
  }

  if (rule.mode === 'counter' || rule.mode === 'compaction') {
    return conflict('disallowed-operation', envelope, 'This entity requires its specialized operation.');
  }

  const key = entityKey(mutation.kind, mutation.id);
  const tombstone = tombstones.get(key);
  const entity = entities.get(key);

  switch (mutation.operation) {
    case 'create': {
      const derivedFields = DERIVED_ENTITY_FIELDS[mutation.kind as SyncEntityKind] ?? [];
      if (derivedFields.some((field) => field in mutation.value)) {
        return conflict(
          'disallowed-operation',
          envelope,
          'This derived field must start from its idempotent source mutation.',
        );
      }
      if (!valueIdentityMatches(mutation.kind as SyncEntityKind, mutation.id, mutation.value)) {
        return conflict(
          'stable-id-collision',
          envelope,
          'The entity payload id does not match its stable envelope id.',
        );
      }
      if (tombstone) {
        return conflict(
          'stale-after-delete',
          envelope,
          'A create cannot implicitly replace a retained tombstone.',
        );
      }
      if (!entity) {
        entities.set(
          key,
          createdEntity(
            mutation.kind as SyncEntityKind,
            mutation.id,
            mutation.value,
            mutation.references,
            envelope,
          ),
        );
      } else if (
        canonicalJson(entity.value) !== canonicalJson(mutation.value) ||
        canonicalJson(entity.references as unknown as JsonValue) !==
          canonicalJson(
            reconciledReferences(
              mutation.kind as SyncEntityKind,
              mutation.value,
              mutation.references ?? [],
              [],
            ) as unknown as JsonValue,
          )
      ) {
        return conflict(
          'stable-id-collision',
          envelope,
          'A different entity already claims this stable id.',
        );
      }
      return null;
    }
    case 'set':
    case 'repair': {
      if (mutation.operation === 'set' && rule.mode === 'append') {
        return conflict(
          'disallowed-operation',
          envelope,
          'This append-only entity can only change through an explicit repair.',
        );
      }
      if (mutation.operation === 'repair' && !rule.allowRepair) {
        return conflict('disallowed-operation', envelope, 'This entity does not accept repairs.');
      }
      const derivedFields = DERIVED_ENTITY_FIELDS[mutation.kind as SyncEntityKind] ?? [];
      if (
        derivedFields.some(
          (field) => field in mutation.fields || mutation.unset?.includes(field),
        )
      ) {
        return conflict(
          'disallowed-operation',
          envelope,
          'This derived field changes only through its idempotent source mutation.',
        );
      }
      if (tombstone && envelope.baseRevision < tombstone.revision) {
        return conflict(
          'stale-after-delete',
          envelope,
          'The edit is based on state older than the retained tombstone.',
        );
      }
      if (!entity || envelope.baseRevision > entity.revision) {
        return conflict('missing-base', envelope, 'The referenced base entity revision is unavailable.');
      }
      if (envelope.baseRevision < entity.generationRevision) {
        return conflict(
          'stale-after-delete',
          envelope,
          'The edit predates this explicitly recreated entity generation.',
        );
      }
      if (
        mutation.unset?.includes('id') ||
        ('id' in mutation.fields &&
          !valueIdentityMatches(
            mutation.kind as SyncEntityKind,
            mutation.id,
            mutation.fields,
          ))
      ) {
        return conflict(
          'stable-id-collision',
          envelope,
          'An edit cannot change or remove an entity stable id.',
        );
      }
      patchEntity(entity, mutation.fields, mutation.unset ?? [], mutation.references, envelope.revision);
      return null;
    }
    case 'delete': {
      if (!rule.allowDelete) {
        return conflict('disallowed-operation', envelope, 'This append-only entity cannot be deleted.');
      }
      if (tombstone && tombstone.revision >= envelope.revision) return null;
      if (entity && envelope.baseRevision < entity.generationRevision) {
        return conflict(
          'stale-after-delete',
          envelope,
          'The delete predates this explicitly recreated entity generation.',
        );
      }
      entities.delete(key);
      tombstones.set(key, {
        kind: mutation.kind as SyncEntityKind,
        id: mutation.id,
        revision: envelope.revision,
        mutationId: envelope.mutationId,
      });
      return null;
    }
    case 'recreate': {
      if (rule.mode !== 'mutable' || !tombstone || mutation.recreatesRevision !== tombstone.revision) {
        return conflict(
          'stale-after-delete',
          envelope,
          'Re-creation must explicitly name the current tombstone revision.',
        );
      }
      const derivedFields = DERIVED_ENTITY_FIELDS[mutation.kind as SyncEntityKind] ?? [];
      if (derivedFields.some((field) => field in mutation.value)) {
        return conflict(
          'disallowed-operation',
          envelope,
          'A recreated entity cannot seed an independently derived field.',
        );
      }
      if (!valueIdentityMatches(mutation.kind as SyncEntityKind, mutation.id, mutation.value)) {
        return conflict(
          'stable-id-collision',
          envelope,
          'The recreated payload id does not match its stable envelope id.',
        );
      }
      tombstones.delete(key);
      entities.set(
        key,
        createdEntity(
          mutation.kind as SyncEntityKind,
          mutation.id,
          mutation.value,
          mutation.references,
          envelope,
        ),
      );
      return null;
    }
    default:
      return conflict('disallowed-operation', envelope, 'The mutation operation is not valid here.');
  }
}

function createdEntity(
  kind: SyncEntityKind,
  id: string,
  value: JsonObject,
  references: SyncEntityReference[] | undefined,
  envelope: AcceptedSyncEnvelope,
): SyncEntityState {
  return {
    kind,
    id,
    value: cloneJson(value),
    revision: envelope.revision,
    fieldRevisions: Object.fromEntries(
      Object.keys(value).sort().map((field) => [field, envelope.revision]),
    ),
    references: reconciledReferences(kind, value, references ?? [], []),
    referencesRevision: envelope.revision,
    createdBy: envelope.mutationId,
    generationRevision: envelope.revision,
  };
}

function patchEntity(
  entity: SyncEntityState,
  fields: JsonObject,
  unset: string[],
  references: SyncEntityReference[] | undefined,
  revision: number,
): void {
  if (olderDaySummaryPatch(entity, fields) || olderGreatestMarkerPatch(entity, fields)) {
    entity.revision = Math.max(entity.revision, revision);
    return;
  }
  for (const [field, value] of Object.entries(fields)) {
    if ((entity.fieldRevisions[field] ?? -1) <= revision) {
      defineEnumerable(entity.value, field, cloneJson(value));
      defineEnumerable(entity.fieldRevisions, field, revision);
    }
  }
  for (const field of unset) {
    if ((entity.fieldRevisions[field] ?? -1) <= revision) {
      delete entity.value[field];
      entity.fieldRevisions[field] = revision;
    }
  }
  if (references && entity.referencesRevision <= revision) {
    entity.references = reconciledReferences(
      entity.kind,
      entity.value,
      references,
      [],
    );
    entity.referencesRevision = revision;
  } else {
    entity.references = reconciledReferences(
      entity.kind,
      entity.value,
      [],
      entity.references,
    );
  }
  entity.revision = Math.max(entity.revision, revision);
}

function defineEnumerable<T extends JsonValue | number>(
  target: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function stableIdCollisions(
  envelopes: AcceptedSyncEnvelope[],
  conflicts: SyncConflict[],
): Set<string> {
  const creates = new Map<string, AcceptedSyncEnvelope[]>();
  for (const envelope of envelopes) {
    if (envelope.mutation.operation !== 'create') continue;
    const key = mutationEntityKey(envelope);
    const rows = creates.get(key) ?? [];
    rows.push(envelope);
    creates.set(key, rows);
  }
  const collisions = new Set<string>();
  for (const [key, rows] of creates) {
    const bodies = new Set(rows.map((row) => canonicalCreateBody(row)));
    if (bodies.size <= 1) continue;
    collisions.add(key);
    const kind = rows[0].mutation.kind;
    const id = rows[0].mutation.id;
    conflicts.push({
      kind: 'stable-id-collision',
      entityKind: kind,
      entityId: id,
      mutationIds: rows.map((row) => row.mutationId).sort(),
      reason: 'Different creates claim the same stable entity id; both are retained for review.',
    });
  }
  return collisions;
}

function removeDuplicateAndCollidingMutations(
  envelopes: AcceptedSyncEnvelope[],
  conflicts: SyncConflict[],
): AcceptedSyncEnvelope[] {
  const groups = new Map<string, AcceptedSyncEnvelope[]>();
  for (const envelope of envelopes) {
    const identity = `${envelope.deviceId}\u0000${envelope.mutationId}`;
    const rows = groups.get(identity) ?? [];
    rows.push(envelope);
    groups.set(identity, rows);
  }
  const result: AcceptedSyncEnvelope[] = [];
  for (const rows of groups.values()) {
    const byWire = new Map(rows.map((row) => [canonicalJson(acceptedEnvelopeToWire(row)), row]));
    if (byWire.size === 1) {
      result.push(rows[0]);
      continue;
    }
    const first = rows[0];
    conflicts.push({
      kind: 'stable-id-collision',
      entityKind: first.mutation.kind,
      entityId: first.mutation.id,
      mutationIds: [first.mutationId],
      reason: 'The same device mutation id was delivered with different content.',
    });
  }
  return result;
}

function removeRevisionCollisions(
  envelopes: AcceptedSyncEnvelope[],
  conflicts: SyncConflict[],
): AcceptedSyncEnvelope[] {
  const groups = new Map<number, AcceptedSyncEnvelope[]>();
  for (const envelope of envelopes) {
    const rows = groups.get(envelope.revision) ?? [];
    rows.push(envelope);
    groups.set(envelope.revision, rows);
  }
  const result: AcceptedSyncEnvelope[] = [];
  for (const [revision, rows] of groups) {
    if (rows.length === 1) {
      result.push(rows[0]);
      continue;
    }
    conflicts.push({
      kind: 'revision-collision',
      mutationIds: rows.map((row) => row.mutationId).sort(),
      reason: `Server revision ${revision} was assigned to more than one mutation.`,
    });
  }
  return result;
}

function separateBlockedReferences(
  entities: Map<string, SyncEntityState>,
  tombstones: Map<string, SyncTombstone>,
  conflicts: SyncConflict[],
): { materialized: SyncEntityState[]; blocked: SyncEntityState[] } {
  const materialized = new Map(entities);
  const blocked = new Map<string, SyncEntityState>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, entity] of materialized) {
      const missing = entity.references.find((reference) => {
        const targetKey = entityKey(reference.kind, reference.id);
        return !materialized.has(targetKey) || tombstones.has(targetKey);
      });
      if (!missing) continue;
      materialized.delete(key);
      blocked.set(key, entity);
      conflicts.push({
        kind: 'unresolved-reference',
        entityKind: entity.kind,
        entityId: entity.id,
        mutationIds: [entity.createdBy],
        reason: `The entity references unavailable ${missing.kind}:${missing.id}.`,
      });
      changed = true;
    }
  }
  return {
    materialized: [...materialized.values()].map(cloneEntity),
    blocked: [...blocked.values()].map(cloneEntity),
  };
}

function conflict(
  kind: SyncConflictKind,
  envelope: AcceptedSyncEnvelope,
  reason: string,
): SyncConflict {
  return {
    kind,
    entityKind: envelope.mutation.kind,
    entityId: envelope.mutation.id,
    mutationIds: [envelope.mutationId],
    reason,
  };
}

function ruleFor(kind: string): SyncEntityRule | undefined {
  return SYNC_ENTITY_RULES[kind as SyncEntityKind];
}

function isAcceptedEnvelope(value: unknown): value is AcceptedSyncEnvelope {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'wire' in (value as Record<string, unknown>) &&
    'revision' in (value as Record<string, unknown>)
  );
}

function mutationEntityKey(envelope: AcceptedSyncEnvelope): string {
  return entityKey(envelope.mutation.kind, envelope.mutation.id);
}

function compareEnvelope(a: AcceptedSyncEnvelope, b: AcceptedSyncEnvelope): number {
  return (
    a.revision - b.revision ||
    a.deviceId.localeCompare(b.deviceId) ||
    a.mutationId.localeCompare(b.mutationId)
  );
}

function compareCompaction(a: SyncCompactionState, b: SyncCompactionState): number {
  return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.revision - b.revision;
}

function compareTombstone(a: SyncTombstone, b: SyncTombstone): number {
  return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.revision - b.revision;
}

function sortEntities(entities: SyncEntityState[]): SyncEntityState[] {
  return entities.map(cloneEntity).sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
}

function sortConflicts(conflicts: SyncConflict[]): SyncConflict[] {
  const unique = new Map<string, SyncConflict>();
  for (const item of conflicts) {
    const normalized = { ...item, mutationIds: [...item.mutationIds].sort() };
    unique.set(canonicalJson(normalized as unknown as JsonValue), normalized);
  }
  return [...unique.values()].sort((a, b) =>
    canonicalJson(a as unknown as JsonValue).localeCompare(
      canonicalJson(b as unknown as JsonValue),
    ),
  );
}

function dedupeWireEnvelopes(envelopes: JsonObject[]): JsonObject[] {
  const unique = new Map(envelopes.map((wire) => [canonicalJson(wire), cloneJson(wire)]));
  return [...unique.values()].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}

function sumCounterComponents(components: Record<string, number>): number {
  return Object.values(components).reduce((sum, value) => sum + value, 0);
}

function cloneReferences(references: SyncEntityReference[]): SyncEntityReference[] {
  return references
    .map((reference) => ({ ...reference }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

const MANAGED_REFERENCE_KINDS: Partial<Record<SyncEntityKind, SyncEntityKind[]>> = {
  task: ['goal'],
  'goal-ledger-row': ['goal'],
  'foundation-instance': ['if-then-plan'],
  'foundation-entry': ['foundation-instance'],
  'foundation-range': ['foundation-instance'],
  'day-plan-target': ['goal', 'task'],
  'if-then-plan': ['task'],
};

const DERIVED_ENTITY_FIELDS: Partial<Record<SyncEntityKind, string[]>> = {
  task: ['pomos'],
  goal: ['done'],
  'if-then-plan': ['usageCount'],
};

function derivedReferences(
  kind: SyncEntityKind,
  value: JsonObject,
): SyncEntityReference[] {
  const refs: SyncEntityReference[] = [];
  const add = (targetKind: SyncEntityKind, id: JsonValue | undefined) => {
    if ((typeof id === 'string' && id.length > 0) || Number.isSafeInteger(id)) {
      refs.push({ kind: targetKind, id: String(id) });
    }
  };
  switch (kind) {
    case 'task':
    case 'goal-ledger-row':
      add('goal', value.goalId);
      break;
    case 'foundation-instance':
      add('if-then-plan', value.ifThenId);
      break;
    case 'foundation-entry':
    case 'foundation-range':
      add('foundation-instance', value.instanceId);
      break;
    case 'day-plan-target':
      add('goal', value.goalId);
      add('task', value.taskId);
      break;
    case 'if-then-plan':
      add('task', value.taskId);
      break;
    default:
      break;
  }
  return refs;
}

function reconciledReferences(
  kind: SyncEntityKind,
  value: JsonObject,
  explicit: SyncEntityReference[],
  prior: SyncEntityReference[],
): SyncEntityReference[] {
  const managedKinds = new Set(MANAGED_REFERENCE_KINDS[kind] ?? []);
  const retained = (explicit.length ? explicit : prior).filter(
    (reference) => !managedKinds.has(reference.kind as SyncEntityKind),
  );
  const unique = new Map<string, SyncEntityReference>();
  for (const reference of [...retained, ...derivedReferences(kind, value)]) {
    unique.set(entityKey(reference.kind, reference.id), { ...reference });
  }
  return cloneReferences([...unique.values()]);
}

function canonicalCreateBody(envelope: AcceptedSyncEnvelope): string {
  if (envelope.mutation.operation !== 'create') return '';
  return canonicalJson({
    value: envelope.mutation.value,
    references: reconciledReferences(
      envelope.mutation.kind as SyncEntityKind,
      envelope.mutation.value,
      envelope.mutation.references ?? [],
      [],
    ) as unknown as JsonValue,
  });
}

function valueIdentityMatches(
  kind: SyncEntityKind,
  id: string,
  value: JsonObject,
): boolean {
  if (
    value.id !== undefined &&
    !(
      (typeof value.id === 'string' || Number.isSafeInteger(value.id)) &&
      String(value.id) === id
    )
  ) {
    return false;
  }
  if (kind === 'guide-suggestion' && value.momentKey !== undefined) {
    return value.momentKey === id;
  }
  if (
    kind === 'cadence-history' &&
    typeof value.focusMin === 'number' &&
    typeof value.breakMin === 'number'
  ) {
    return id === `${value.focusMin}:${value.breakMin}`;
  }
  if (
    kind === 'foundation-range' &&
    typeof value.instanceId === 'string' &&
    typeof value.from === 'string'
  ) {
    return id === `${value.instanceId}:${value.from}`;
  }
  return true;
}

function compactionIdentityMatches(
  kind: SyncCompactionState['kind'],
  id: string,
  value: JsonObject,
): boolean {
  if (
    kind === 'foundation-archive' &&
    typeof value.instanceId === 'string' &&
    typeof value.monthKey === 'string'
  ) {
    return id === `${value.instanceId}:${value.monthKey}`;
  }
  if (kind === 'day-plan-archive' && typeof value.weekKey === 'string') {
    return id === value.weekKey;
  }
  if (kind === 'history-completed-task' && typeof value.id === 'string') {
    return id === value.id;
  }
  if (
    kind === 'history-hour' &&
    typeof value.calendarDay === 'string' &&
    Number.isSafeInteger(value.hour)
  ) {
    return id === `${value.calendarDay}:${value.hour}` ||
      id.startsWith(`${value.calendarDay}:${value.hour}:`);
  }
  return true;
}

function olderDaySummaryPatch(entity: SyncEntityState, fields: JsonObject): boolean {
  const dayField = entity.kind === 'day-summary'
    ? 'lastFocusDay'
    : entity.kind === 'pre-slump'
      ? 'day'
      : null;
  if (!dayField || !(dayField in fields)) return false;
  const current = entity.value[dayField];
  const incoming = fields[dayField];
  return typeof current === 'string' &&
    (incoming === null || (typeof incoming === 'string' && incoming < current));
}

function olderGreatestMarkerPatch(entity: SyncEntityState, fields: JsonObject): boolean {
  if (
    entity.kind !== 'marker' ||
    !['last-rollover-offer-day', 'last-weekly-review-week'].includes(entity.id) ||
    !('value' in fields)
  ) {
    return false;
  }
  const current = entity.value.value;
  const incoming = fields.value;
  return typeof current === 'string' &&
    (incoming === null || (typeof incoming === 'string' && incoming < current));
}

function cloneEntity(entity: SyncEntityState): SyncEntityState {
  return {
    ...entity,
    value: cloneJson(entity.value),
    fieldRevisions: { ...entity.fieldRevisions },
    references: cloneReferences(entity.references),
  };
}

function cloneCounter(counter: SyncCounterState): SyncCounterState {
  return { ...counter, components: { ...counter.components } };
}

function cloneCompaction(item: SyncCompactionState): SyncCompactionState {
  return {
    ...item,
    value: cloneJson(item.value),
    sourceMutationIds: [...item.sourceMutationIds],
  };
}

/** Stable, review-friendly representation used by algebraic tests and snapshots. */
export function canonicalSyncDocument(document: SyncDocument): string {
  return canonicalJson(document as unknown as JsonValue);
}

/** Retain opaque future envelopes exactly so an older client cannot drop them. */
export function retainedSyncLog(document: SyncDocument): JsonObject[] {
  return document.retainedEnvelopes.map((wire) => cloneJson(wire));
}

/** Exposed for diagnostics/tests without coupling consumers to parse internals. */
export function parseSyncEnvelopeForMerge(
  input: SyncEnvelopeInput,
  currentContentSchemaVersion: number,
): SyncEnvelopeParseResult {
  return isAcceptedEnvelope(input)
    ? { status: 'valid', envelope: input }
    : parseSyncEnvelope(input, currentContentSchemaVersion);
}
