import { describe, expect, it } from 'vitest';

import {
  GUIDE_ARTICLES,
  GUIDE_ARTICLE_ID_BY_EVIDENCE_KEY,
  GUIDE_STAGE_TAGS,
} from './guide';
import {
  WHY_EVIDENCE_ANCHORS,
  type EvidenceKey,
} from '../insights/why';

const EXPECTED_IDS = [
  'first-pebble',
  'if-then',
  'tiny-start',
  'desk-help',
  'attention-fades',
  'breaks-are-fuel',
  'flow-needs',
  'music-and-lyrics',
  'kind-restart',
  'parking-lot',
  'one-minute-reentry',
  'tracking-without-pressure',
] as const;

const NEVER_SHIP =
  /\b(fail|failure|failed|broke|broken|lazy|wasted|discipline|willpower|guilty|shame|excuses|optimal|proven|detox|lost|lose)\b|you should|back to zero|break the chain|protect your streak|we missed you/i;

describe('Field Guide content', () => {
  it('bundles exactly the twelve PLAN 6.1 article briefs', () => {
    expect(GUIDE_ARTICLES.map((article) => article.id)).toEqual(EXPECTED_IDS);
  });

  it('gives every article a valid, complete offline shape', () => {
    for (const article of GUIDE_ARTICLES) {
      expect(GUIDE_STAGE_TAGS).toContain(article.stageTag);
      expect(article.title.trim()).toBe(article.title);
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(article.keyPoints.length).toBeLessThanOrEqual(5);
      expect(article.practicalExercise.trim().length).toBeGreaterThan(0);
      expect(article.sources.length).toBeGreaterThanOrEqual(1);

      for (const paragraph of article.keyPoints) {
        expect(paragraph.trim()).toBe(paragraph);
        expect(paragraph.length).toBeGreaterThan(0);
      }
      for (const source of article.sources) {
        expect(source).toMatch(/\(\d{4}\), .+/);
        expect(source).not.toMatch(/https?:\/\//);
      }

      const runtimeText = [
        article.title,
        ...article.keyPoints,
        article.practicalExercise,
        ...article.sources,
      ].join(' ');
      expect(runtimeText).not.toMatch(/https?:\/\//);
      expect(runtimeText).not.toMatch(NEVER_SHIP);
    }
  });

  it('uses unique article ids', () => {
    const ids = GUIDE_ARTICLES.map((article) => article.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the report stage distribution', () => {
    const counts = Object.fromEntries(
      GUIDE_STAGE_TAGS.map((tag) => [
        tag,
        GUIDE_ARTICLES.filter((article) => article.stageTag === tag).length,
      ]),
    );
    expect(counts).toEqual({ start: 4, stay: 4, recover: 3, science: 1 });
  });

  it('maps every evidence key to a real guide article', () => {
    const evidenceKeys = Object.keys(WHY_EVIDENCE_ANCHORS) as EvidenceKey[];
    const mappedKeys = Object.keys(GUIDE_ARTICLE_ID_BY_EVIDENCE_KEY).sort();
    const articleIds = new Set(GUIDE_ARTICLES.map((article) => article.id));

    expect(mappedKeys).toEqual([...evidenceKeys].sort());
    for (const key of evidenceKeys) {
      expect(articleIds.has(GUIDE_ARTICLE_ID_BY_EVIDENCE_KEY[key])).toBe(true);
    }
  });

  it('includes the approved medical boundary exactly once', () => {
    const boundary =
      'Some people, including some people with ADHD, may find shorter steps and stronger external cues helpful; this app is not medical advice.';
    const occurrences = GUIDE_ARTICLES.flatMap((article) => article.keyPoints).filter(
      (paragraph) => paragraph === boundary,
    );
    expect(occurrences).toHaveLength(1);
    expect(
      GUIDE_ARTICLES.find((article) =>
        article.keyPoints.some((paragraph) => paragraph === boundary),
      ),
    ).toMatchObject({ id: 'tracking-without-pressure', stageTag: 'science' });
  });
});
