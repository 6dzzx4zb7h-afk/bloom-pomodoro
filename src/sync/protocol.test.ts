import { describe, expect, it } from 'vitest';

import {
  MAX_SYNC_ENVELOPE_BYTES,
  SYNC_PROTOCOL,
  acceptPendingSyncEnvelope,
  acceptedEnvelopeToWire,
  createPendingSyncEnvelope,
  newSyncId,
  parseSyncEnvelope,
  serializeAcceptedSyncEnvelope,
  type JsonObject,
  type RandomByteFiller,
} from './protocol';

const fill = (start: number): RandomByteFiller => (bytes) => {
  bytes.forEach((_, index) => {
    bytes[index] = (start + index) & 0xff;
  });
};

describe('PLAN 11.2 sync protocol envelopes', () => {
  it('creates collision-safe random ids without a device-clock component', () => {
    expect(newSyncId('device', fill(0))).toBe('device_AAECAwQFBgcICQoLDA0ODw');
    expect(newSyncId('mutation', fill(16))).toBe('mutation_EBESExQVFhcYGRobHB0eHw');
    expect(newSyncId('device', fill(0))).not.toMatch(/2026|\d{10,}/);
  });

  it('accepts and round-trips unknown envelope and mutation fields exactly', () => {
    const pending = createPendingSyncEnvelope({
      contentSchemaVersion: 34,
      deviceId: newSyncId('device', fill(0)),
      mutationId: newSyncId('mutation', fill(16)),
      mutation: {
        operation: 'create',
        kind: 'task',
        id: 'legacy id with spaces\u0000and escaped data',
        value: { title: 'Keep me', newerNestedField: { future: true } },
      },
    });
    const accepted = acceptPendingSyncEnvelope(pending, 1, 'cursor_1', {
      futureTopLevel: { retained: true },
    });
    const wire = acceptedEnvelopeToWire(accepted);
    const mutation = wire.mutation as JsonObject;
    mutation.futureMutationField = ['also', 'retained'];

    const reparsed = parseSyncEnvelope(wire, 34);

    expect(reparsed.status).toBe('valid');
    if (reparsed.status !== 'valid') return;
    expect(acceptedEnvelopeToWire(reparsed.envelope)).toEqual(wire);
    expect(JSON.parse(serializeAcceptedSyncEnvelope(reparsed.envelope))).toEqual(wire);
  });

  it('preserves a future-schema body without trying to interpret its operation', () => {
    const raw = {
      format: SYNC_PROTOCOL,
      protocolVersion: 1,
      contentSchemaVersion: 35,
      deviceId: 'device_AAECAwQFBgcICQoLDA0ODw',
      mutationId: 'mutation_EBESExQVFhcYGRobHB0eHw',
      baseRevision: 0,
      revision: 1,
      cursor: 'cursor_1',
      mutation: { operation: 'future-operation', opaque: { keep: 'whole' } },
    };

    expect(parseSyncEnvelope(raw, 34)).toEqual({
      status: 'future-schema',
      raw,
      reason: 'A newer Bloom build is needed before this envelope can be applied.',
    });
  });

  it('isolates malformed, over-deep, and oversized input before merge', () => {
    expect(parseSyncEnvelope('{', 34)).toMatchObject({ status: 'invalid' });
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 30; index += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    expect(parseSyncEnvelope(deep, 34)).toMatchObject({
      status: 'invalid',
      reason: 'The sync envelope is not bounded JSON.',
    });
    expect(parseSyncEnvelope('x'.repeat(MAX_SYNC_ENVELOPE_BYTES + 1), 34)).toMatchObject({
      status: 'invalid',
      reason: 'The sync envelope is too large.',
    });
    expect(() =>
      createPendingSyncEnvelope({
        contentSchemaVersion: 34,
        deviceId: newSyncId('device', fill(0)),
        mutationId: newSyncId('mutation', fill(16)),
        mutation: {
          operation: 'create',
          kind: 'task',
          id: 'large',
          value: { text: 'x'.repeat(MAX_SYNC_ENVELOPE_BYTES) },
        },
      }),
    ).toThrow(/too large/);
  });
});
