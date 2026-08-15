import type { SessionOutcome, SessionRecord } from './sessions';

export const SESSION_REPAIR_RECENT_MS = 7 * 86_400_000;

export type SessionRepairAdjustment =
  | 'session-start'
  | 'wall-clock-cap'
  | 'next-session';

export type SessionRepairError =
  | 'invalid-window'
  | 'invalid-end'
  | 'existing-overlap'
  | 'invalid-drift'
  | 'save-failed';

export interface RetroactiveDriftEstimate {
  onsetAt: number;
  durationMin: number;
}

export interface SessionRepairBounds {
  earliestEndAt: number;
  latestEndAt: number;
  nextSessionId?: string;
}

export interface SessionRepairProposal {
  /** The repaired record only; reward, streak, and XP state are intentionally absent. */
  record: SessionRecord;
  adjustments: SessionRepairAdjustment[];
  retroactiveDrift?: RetroactiveDriftEstimate;
}

/** Calm, explicit feedback for a repair that may have been clamped. */
export function sessionRepairSavedMessage(
  adjustments: readonly SessionRepairAdjustment[],
): string {
  if (adjustments.includes('next-session')) {
    return 'Repair saved as an estimate. Its end time stops at the next session.';
  }
  if (adjustments.includes('wall-clock-cap')) {
    return 'Repair saved as an estimate. Its end time stops at the last captured return.';
  }
  if (adjustments.includes('session-start')) {
    return 'Repair saved as an estimate. Its end time was kept at the session start.';
  }
  return 'Repair saved as an estimate.';
}

export type SessionRepairResult =
  | { ok: true; proposal: SessionRepairProposal }
  | { ok: false; error: SessionRepairError };

export function isSessionRepairEligible(
  record: SessionRecord,
  now: number,
  recentMs = SESSION_REPAIR_RECENT_MS,
): boolean {
  return (
    Number.isFinite(now) &&
    now >= record.endedAt &&
    (record.outcome === 'interrupted' || now - record.endedAt <= recentMs)
  );
}

/** Last observed wall-clock instant a repair may truthfully reach. */
export function sessionRepairWallClockEndAt(record: SessionRecord): number {
  return Math.max(
    record.endedAt,
    record.returnSnapshot?.returnedAt ?? record.endedAt,
  );
}

/**
 * Resolve the end-time window without guessing how long the app was absent.
 * The caller supplies the last wall-clock instant that could be truthful;
 * the next session start narrows that cap so records can never overlap.
 */
export function sessionRepairBounds(
  record: SessionRecord,
  records: readonly SessionRecord[],
  wallClockEndAt: number,
): SessionRepairBounds | null {
  if (
    !Number.isFinite(record.startedAt) ||
    !Number.isFinite(wallClockEndAt) ||
    wallClockEndAt < record.startedAt
  ) return null;

  const next = records
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        Number.isFinite(candidate.startedAt) &&
        candidate.startedAt >= record.startedAt,
    )
    .sort(
      (a, b) =>
        a.startedAt - b.startedAt ||
        a.endedAt - b.endedAt ||
        a.id.localeCompare(b.id),
    )[0];
  const latestEndAt = Math.min(wallClockEndAt, next?.startedAt ?? wallClockEndAt);
  if (latestEndAt < record.startedAt) return null;
  return {
    earliestEndAt: record.startedAt,
    latestEndAt,
    ...(next ? { nextSessionId: next.id } : {}),
  };
}

function roundedMinutes(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

export function proposeSessionRepair(input: {
  record: SessionRecord;
  records: readonly SessionRecord[];
  wallClockEndAt: number;
  endedAt: number;
  outcome: SessionOutcome;
  retroactiveDrift?: RetroactiveDriftEstimate;
}): SessionRepairResult {
  const { record, records, wallClockEndAt } = input;
  const bounds = sessionRepairBounds(record, records, wallClockEndAt);
  if (!bounds) return { ok: false, error: 'invalid-window' };
  if (!Number.isFinite(input.endedAt)) return { ok: false, error: 'invalid-end' };

  const overlapsAtStart = records.some(
    (candidate) =>
      candidate.id !== record.id &&
      Number.isFinite(candidate.startedAt) &&
      Number.isFinite(candidate.endedAt) &&
      candidate.startedAt < record.startedAt &&
      candidate.endedAt > record.startedAt,
  );
  if (overlapsAtStart) return { ok: false, error: 'existing-overlap' };

  const endedAt = Math.max(
    bounds.earliestEndAt,
    Math.min(bounds.latestEndAt, input.endedAt),
  );
  const adjustments: SessionRepairAdjustment[] = [];
  if (input.endedAt < bounds.earliestEndAt) adjustments.push('session-start');
  if (input.endedAt > bounds.latestEndAt) {
    adjustments.push(
      bounds.nextSessionId &&
      bounds.latestEndAt <= records.find((item) => item.id === bounds.nextSessionId)!.startedAt &&
      bounds.latestEndAt < wallClockEndAt
        ? 'next-session'
        : 'wall-clock-cap',
    );
  }

  let retroactiveDrift: RetroactiveDriftEstimate | undefined;
  if (input.retroactiveDrift) {
    const drift = input.retroactiveDrift;
    if (
      !Number.isFinite(drift.onsetAt) ||
      !Number.isFinite(drift.durationMin) ||
      drift.durationMin <= 0 ||
      drift.onsetAt < record.startedAt ||
      drift.onsetAt > endedAt ||
      drift.onsetAt + drift.durationMin * 60_000 > endedAt
    ) {
      return { ok: false, error: 'invalid-drift' };
    }
    retroactiveDrift = {
      onsetAt: drift.onsetAt,
      durationMin: roundedMinutes(drift.durationMin),
    };
  }

  const wallMinutes = roundedMinutes((endedAt - record.startedAt) / 60_000);
  const actualMin =
    record.plannedMin == null
      ? wallMinutes
      : Math.min(wallMinutes, Math.max(0, record.plannedMin));
  return {
    ok: true,
    proposal: {
      record: {
        ...record,
        endedAt,
        actualMin,
        outcome: input.outcome,
        resumeCuePending:
          input.outcome === 'interrupted' ? record.resumeCuePending : undefined,
      },
      adjustments,
      ...(retroactiveDrift ? { retroactiveDrift } : {}),
    },
  };
}
