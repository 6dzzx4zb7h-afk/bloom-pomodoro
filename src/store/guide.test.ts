import { describe, expect, it } from 'vitest';

import {
  EMPTY_GUIDE_READ_STATE,
  markGuideArticleRead,
  markGuideArticleSuggested,
  sanitizeGuideReadState,
} from './guide';

describe('Field Guide read state', () => {
  it('starts empty and records a bundled article without adding a score', () => {
    const read = markGuideArticleRead(
      EMPTY_GUIDE_READ_STATE,
      'first-pebble',
      1_752_660_000_000,
    );

    expect(read).toEqual({
      readAt: { 'first-pebble': 1_752_660_000_000 },
      suggestions: [],
    });
    expect(Object.keys(read)).toEqual(['readAt', 'suggestions']);
  });

  it('is idempotent for the same article and timestamp', () => {
    const once = markGuideArticleRead(
      EMPTY_GUIDE_READ_STATE,
      'attention-fades',
      1_752_660_000_000,
    );

    expect(
      markGuideArticleRead(once, 'attention-fades', 1_752_660_000_000),
    ).toBe(once);
  });

  it('drops unknown ids and malformed timestamps without disturbing valid reads', () => {
    expect(
      sanitizeGuideReadState({
        readAt: {
          'first-pebble': 1_752_660_000_000.9,
          'not-bundled': 123,
          'tiny-start': -1,
          'parking-lot': 'yesterday',
        },
      }),
    ).toEqual({ readAt: { 'first-pebble': 1_752_660_000_000 }, suggestions: [] });
  });

  it('survives garbage and truncated shapes', () => {
    expect(sanitizeGuideReadState(null)).toEqual(EMPTY_GUIDE_READ_STATE);
    expect(sanitizeGuideReadState([])).toEqual(EMPTY_GUIDE_READ_STATE);
    expect(sanitizeGuideReadState({ readAt: null })).toEqual(
      EMPTY_GUIDE_READ_STATE,
    );
  });

  it('records one contextual suggestion per pause and keeps read markers intact', () => {
    const read = markGuideArticleRead(
      EMPTY_GUIDE_READ_STATE,
      'first-pebble',
      1_752_660_000_000,
    );
    const suggested = markGuideArticleSuggested(
      read,
      'parking-lot',
      'debrief:s-1',
      1_752_660_100_000,
    );

    expect(suggested).toEqual({
      readAt: { 'first-pebble': 1_752_660_000_000 },
      suggestions: [{
        articleId: 'parking-lot',
        momentKey: 'debrief:s-1',
        surfacedAt: 1_752_660_100_000,
      }],
    });
    expect(markGuideArticleSuggested(
      suggested,
      'attention-fades',
      'debrief:s-1',
      1_752_660_200_000,
    )).toBe(suggested);
  });

  it('sanitizes suggestion markers and keeps the newest duplicate moment', () => {
    expect(sanitizeGuideReadState({
      readAt: {},
      suggestions: [
        { articleId: 'parking-lot', momentKey: 'break:s-1', surfacedAt: 20 },
        { articleId: 'attention-fades', momentKey: 'break:s-1', surfacedAt: 10 },
        { articleId: 'not-bundled', momentKey: 'break:s-2', surfacedAt: 30 },
        { articleId: 'tiny-start', momentKey: '', surfacedAt: 40 },
      ],
    })).toEqual({
      readAt: {},
      suggestions: [
        { articleId: 'parking-lot', momentKey: 'break:s-1', surfacedAt: 20 },
      ],
    });
  });
});
