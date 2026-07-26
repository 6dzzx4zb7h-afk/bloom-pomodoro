import { describe, expect, it } from 'vitest';

import type { GuideReadState } from '../store/guide';
import type { CompanionEvent, DriftKind } from '../store/companion';
import type { SessionRecord } from '../store/sessions';
import {
  GUIDE_ARTICLE_BY_DRIFT_KIND,
  GUIDE_REPEAT_COOLDOWN_DAYS,
  GUIDE_SUGGESTIONS_PER_WEEK,
  guideArticleForEvidenceKey,
  guideSuggestionFor,
} from './surfacing';

const NOW = new Date('2026-07-15T12:00:00').getTime();
const DAY_MS = 86_400_000;

function record(
  id: string,
  outcome: SessionRecord['outcome'] = 'completed',
): SessionRecord {
  return {
    id,
    startedAt: NOW - 25 * 60_000,
    endedAt: NOW,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome,
    startHour: 11,
    driftEventIds: [`event-${id}`],
  };
}

function drift(sessionId: string, kind: DriftKind): CompanionEvent {
  return {
    id: `event-${sessionId}`,
    sessionId,
    ts: NOW - 60_000,
    min: 12,
    len: 25,
    kind,
    src: 'checkin',
  };
}

function state(patch: Partial<GuideReadState> = {}): GuideReadState {
  return { readAt: {}, suggestions: [], ...patch };
}

describe('contextual Field Guide surfacing', () => {
  it.each([
    ['rabbit', 'parking-lot'],
    ['urge', 'parking-lot'],
    ['wander', 'attention-fades'],
    ['restless', 'breaks-are-fuel'],
    ['external', 'one-minute-reentry'],
  ] as const)('maps %s drift to %s', (kind, articleId) => {
    const session = record(kind);
    const suggestion = guideSuggestionFor({
      kind: 'debrief',
      momentKey: `debrief:${kind}`,
      record: session,
      records: [session],
      events: [drift(kind, kind)],
      workSessionRunning: false,
    }, state(), NOW);

    expect(GUIDE_ARTICLE_BY_DRIFT_KIND[kind]).toBe(articleId);
    expect(suggestion?.articleId).toBe(articleId);
  });

  it('offers a start article after repeated abandons', () => {
    const records = [record('a', 'abandoned'), record('b', 'abandoned'), record('c', 'abandoned')];
    expect(guideSuggestionFor({
      kind: 'debrief',
      momentKey: 'debrief:c',
      record: records[2],
      records,
      events: [],
      workSessionRunning: false,
    }, state(), NOW)?.articleId).toBe('first-pebble');
  });

  it('uses the next start article when the first was read recently', () => {
    const records = [record('a', 'abandoned'), record('b', 'abandoned'), record('c', 'abandoned')];
    expect(guideSuggestionFor({
      kind: 'weekly',
      momentKey: 'weekly:2026-07-13',
      records,
      events: [],
      workSessionRunning: false,
    }, state({ readAt: { 'first-pebble': NOW - DAY_MS } }), NOW)?.articleId).toBe('tiny-start');
  });

  it('enforces the three-per-week budget', () => {
    const session = record('wander');
    const suggestions = Array.from({ length: GUIDE_SUGGESTIONS_PER_WEEK }, (_, index) => ({
      articleId: 'parking-lot' as const,
      surfacedAt: NOW - index * 60_000,
      momentKey: `old:${index}`,
    }));
    expect(guideSuggestionFor({
      kind: 'debrief',
      momentKey: 'debrief:wander',
      record: session,
      records: [session],
      events: [drift('wander', 'wander')],
      workSessionRunning: false,
    }, state({ suggestions }), NOW)).toBeNull();
  });

  it('keeps early Monday inside the prior Guide week at a later study-day boundary', () => {
    const mondayAt0030 = new Date(2026, 6, 13, 0, 30).getTime();
    const sundayEvening = new Date(2026, 6, 12, 20, 0).getTime();
    const session = {
      ...record('boundary-wander'),
      startedAt: mondayAt0030 - 25 * 60_000,
      endedAt: mondayAt0030,
    };
    const suggestions = Array.from({ length: GUIDE_SUGGESTIONS_PER_WEEK }, (_, index) => ({
      articleId: 'parking-lot' as const,
      surfacedAt: sundayEvening - index * 60_000,
      momentKey: `prior-study-week:${index}`,
    }));

    expect(guideSuggestionFor({
      kind: 'debrief',
      momentKey: 'debrief:boundary-wander',
      record: session,
      records: [session],
      events: [{ ...drift('boundary-wander', 'wander'), ts: mondayAt0030 - 60_000 }],
      workSessionRunning: false,
    }, state({ suggestions }), mondayAt0030, 4)).toBeNull();
  });

  it('does not repeat a recently read article and allows it after 30 days', () => {
    const session = record('wander');
    const moment = {
      kind: 'break' as const,
      momentKey: 'break:wander',
      record: session,
      records: [session],
      events: [drift('wander', 'wander')],
      workSessionRunning: false,
    };
    expect(guideSuggestionFor(moment, state({
      readAt: { 'attention-fades': NOW - (GUIDE_REPEAT_COOLDOWN_DAYS - 1) * DAY_MS },
    }), NOW)).toBeNull();
    expect(guideSuggestionFor(moment, state({
      readAt: { 'attention-fades': NOW - GUIDE_REPEAT_COOLDOWN_DAYS * DAY_MS },
    }), NOW)?.articleId).toBe('attention-fades');
  });

  it('returns the same recorded suggestion for the same moment without cascading', () => {
    const session = record('restless');
    const suggestion = guideSuggestionFor({
      kind: 'debrief',
      momentKey: 'debrief:restless',
      record: session,
      records: [session],
      events: [drift('restless', 'restless')],
      workSessionRunning: false,
    }, state({ suggestions: [{
      articleId: 'breaks-are-fuel',
      surfacedAt: NOW,
      momentKey: 'debrief:restless',
    }] }), NOW);
    expect(suggestion?.articleId).toBe('breaks-are-fuel');
  });

  it('has no surfacing path while a work session is running', () => {
    const session = record('rabbit');
    expect(guideSuggestionFor({
      kind: 'debrief',
      momentKey: 'debrief:running',
      record: session,
      records: [session],
      events: [drift('rabbit', 'rabbit')],
      workSessionRunning: true,
    }, state(), NOW)).toBeNull();
  });

  it('deep-links every recipe evidence key to a bundled article', () => {
    expect(guideArticleForEvidenceKey('parking-lot')).toBe('parking-lot');
    expect(guideArticleForEvidenceKey('golden-hours')).toBe('tracking-without-pressure');
  });
});
