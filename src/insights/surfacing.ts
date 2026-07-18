/**
 * Contextual Field Guide surfacing (PLAN 6.3).
 *
 * Pure, conservative rules only: a caller describes a natural pause and this
 * module may return one bundled article. React components own rendering and
 * persistence; this file never reads storage or the clock itself.
 */

import {
  GUIDE_ARTICLE_ID_BY_EVIDENCE_KEY,
  type GuideArticleId,
} from '../content/guide';
import type { EvidenceKey } from './why';
import { driftsForRecord } from './why';
import {
  type CompanionEvent,
  type DriftKind,
  isDriftEvent,
} from '../store/companion';
import type { GuideReadState } from '../store/guide';
import type { SessionRecord } from '../store/sessions';
import { abandonStreakInfo } from '../store/sessionStats';

export const GUIDE_SUGGESTIONS_PER_WEEK = 3;
export const GUIDE_REPEAT_COOLDOWN_DAYS = 30;
const DAY_MS = 86_400_000;

export const GUIDE_ARTICLE_BY_DRIFT_KIND: Record<DriftKind, GuideArticleId> = {
  rabbit: 'parking-lot',
  urge: 'parking-lot',
  wander: 'attention-fades',
  restless: 'breaks-are-fuel',
  external: 'one-minute-reentry',
};

export type GuideSurfacingMoment =
  | {
      kind: 'debrief' | 'break';
      momentKey: string;
      record: SessionRecord;
      records: SessionRecord[];
      events: CompanionEvent[];
      workSessionRunning: boolean;
    }
  | {
      kind: 'weekly';
      momentKey: string;
      records: SessionRecord[];
      events: CompanionEvent[];
      workSessionRunning: boolean;
    };

export interface GuideSuggestion {
  articleId: GuideArticleId;
  reason: string;
  momentKey: string;
}

/** Recipe explanations use the same stable evidence-key destination map. */
export function guideArticleForEvidenceKey(key: EvidenceKey): GuideArticleId {
  return GUIDE_ARTICLE_ID_BY_EVIDENCE_KEY[key];
}

function mondayStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function reasonForDrift(kind: DriftKind): string {
  switch (kind) {
    case 'rabbit':
      return 'That drift became a rabbit hole. This short note may fit.';
    case 'urge':
      return 'An urge to check showed up. This short note may fit.';
    case 'wander':
      return 'Your mind wandered in that session. This short note may fit.';
    case 'restless':
      return 'Restlessness showed up in that session. This break note may fit.';
    case 'external':
      return 'Something outside interrupted that session. This re-entry note may fit.';
  }
}

function latestClassifiedDrift(events: CompanionEvent[]): CompanionEvent & { kind: DriftKind } | null {
  const classified = events.filter(
    (event): event is CompanionEvent & { kind: DriftKind } =>
      isDriftEvent(event) && event.kind in GUIDE_ARTICLE_BY_DRIFT_KIND,
  );
  return classified.length
    ? classified.reduce((latest, event) => event.ts > latest.ts ? event : latest)
    : null;
}

function candidatesFor(
  moment: GuideSurfacingMoment,
): Array<{ articleId: GuideArticleId; reason: string }> {
  if (abandonStreakInfo(moment.records).streak >= 3) {
    return [
      {
        articleId: 'first-pebble',
        reason: 'A few starts ended early. Want one small next-step note?',
      },
      {
        articleId: 'tiny-start',
        reason: 'A few starts ended early. A tiny-start note may fit.',
      },
    ];
  }

  const drift = moment.kind === 'weekly'
    ? latestClassifiedDrift(moment.events)
    : latestClassifiedDrift(driftsForRecord(moment.record, moment.events));
  if (!drift) return [];

  return [{
    articleId: GUIDE_ARTICLE_BY_DRIFT_KIND[drift.kind],
    reason: reasonForDrift(drift.kind),
  }];
}

/**
 * Select at most one article for a natural pause.
 *
 * Existing moment records are stable across reducer re-renders, preventing a
 * just-recorded suggestion from cascading into a second suggestion. Recently
 * read or surfaced articles rest for 30 days, and the global weekly budget is
 * three persisted moments.
 */
export function guideSuggestionFor(
  moment: GuideSurfacingMoment,
  state: GuideReadState,
  now: number,
): GuideSuggestion | null {
  if (moment.workSessionRunning || !Number.isFinite(now) || now < 0) return null;

  const existing = state.suggestions.find((item) => item.momentKey === moment.momentKey);
  if (existing) {
    const readAt = state.readAt[existing.articleId];
    if (readAt !== undefined && now - readAt < GUIDE_REPEAT_COOLDOWN_DAYS * DAY_MS) {
      return null;
    }
    const candidate = candidatesFor(moment).find((item) => item.articleId === existing.articleId);
    return candidate ? { ...candidate, momentKey: moment.momentKey } : null;
  }

  const weekStart = mondayStart(now);
  const shownThisWeek = state.suggestions.filter(
    (item) => item.surfacedAt >= weekStart && item.surfacedAt <= now,
  ).length;
  if (shownThisWeek >= GUIDE_SUGGESTIONS_PER_WEEK) return null;

  const cooldown = GUIDE_REPEAT_COOLDOWN_DAYS * DAY_MS;
  const candidate = candidatesFor(moment).find(({ articleId }) => {
    const readAt = state.readAt[articleId];
    if (readAt !== undefined && now - readAt < cooldown) return false;
    const lastSuggestion = [...state.suggestions]
      .reverse()
      .find((item) => item.articleId === articleId);
    return !lastSuggestion || now - lastSuggestion.surfacedAt >= cooldown;
  });

  return candidate ? { ...candidate, momentKey: moment.momentKey } : null;
}
