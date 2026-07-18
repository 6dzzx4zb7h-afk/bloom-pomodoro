import { GUIDE_ARTICLES, type GuideArticleId } from '../content/guide';

/**
 * Persisted Field Guide reading state (PLAN 6.2).
 *
 * Timestamps keep the state useful for PLAN 6.3's future, capped surfacing
 * rules without turning reading into points, progress, or a streak.
 */
export interface GuideReadState {
  readAt: Partial<Record<GuideArticleId, number>>;
  /** Persisted presentation log for PLAN 6.3's weekly and cooldown caps. */
  suggestions: GuideSuggestionMarker[];
}

export interface GuideSuggestionMarker {
  articleId: GuideArticleId;
  surfacedAt: number;
  /** Stable natural-pause identity, e.g. `debrief:s-123`. */
  momentKey: string;
}

export const EMPTY_GUIDE_READ_STATE: GuideReadState = { readAt: {}, suggestions: [] };

const GUIDE_SUGGESTION_LOG_CAP = 100;

const GUIDE_ARTICLE_IDS = new Set<string>(
  GUIDE_ARTICLES.map((article) => article.id),
);

export function isGuideArticleId(value: unknown): value is GuideArticleId {
  return typeof value === 'string' && GUIDE_ARTICLE_IDS.has(value);
}

/** Keep only bundled article ids with finite, non-negative epoch timestamps. */
export function sanitizeGuideReadState(raw: unknown): GuideReadState {
  if (!raw || typeof raw !== 'object') return EMPTY_GUIDE_READ_STATE;

  const value = raw as { readAt?: unknown };
  const readAt: GuideReadState['readAt'] = {};
  if (value.readAt && typeof value.readAt === 'object') {
    for (const [id, timestamp] of Object.entries(value.readAt)) {
      if (
        isGuideArticleId(id) &&
        typeof timestamp === 'number' &&
        Number.isFinite(timestamp) &&
        timestamp >= 0
      ) {
        readAt[id] = Math.floor(timestamp);
      }
    }
  }

  const suggestionsByMoment = new Map<string, GuideSuggestionMarker>();
  if (Array.isArray((raw as { suggestions?: unknown }).suggestions)) {
    for (const item of (raw as { suggestions: unknown[] }).suggestions) {
      if (!item || typeof item !== 'object') continue;
      const marker = item as Record<string, unknown>;
      if (
        !isGuideArticleId(marker.articleId) ||
        typeof marker.surfacedAt !== 'number' ||
        !Number.isFinite(marker.surfacedAt) ||
        marker.surfacedAt < 0 ||
        typeof marker.momentKey !== 'string' ||
        !marker.momentKey.trim() ||
        marker.momentKey.length > 120
      ) continue;
      const normalized: GuideSuggestionMarker = {
        articleId: marker.articleId,
        surfacedAt: Math.floor(marker.surfacedAt),
        momentKey: marker.momentKey,
      };
      const previous = suggestionsByMoment.get(normalized.momentKey);
      if (!previous || normalized.surfacedAt > previous.surfacedAt) {
        suggestionsByMoment.set(normalized.momentKey, normalized);
      }
    }
  }
  const suggestions = [...suggestionsByMoment.values()]
    .sort((a, b) => a.surfacedAt - b.surfacedAt)
    .slice(-GUIDE_SUGGESTION_LOG_CAP);
  return { readAt, suggestions };
}

/** Opening an article is the deliberately lightweight definition of read. */
export function markGuideArticleRead(
  state: GuideReadState,
  id: GuideArticleId,
  at: number,
): GuideReadState {
  if (!Number.isFinite(at) || at < 0) return state;
  const readAt = Math.floor(at);
  if (state.readAt[id] === readAt) return state;
  return { ...state, readAt: { ...state.readAt, [id]: readAt } };
}

/** Record a rendered contextual suggestion once per natural pause. */
export function markGuideArticleSuggested(
  state: GuideReadState,
  articleId: GuideArticleId,
  momentKey: string,
  surfacedAt: number,
): GuideReadState {
  const key = momentKey.trim();
  if (
    !key ||
    key.length > 120 ||
    !Number.isFinite(surfacedAt) ||
    surfacedAt < 0 ||
    state.suggestions.some((item) => item.momentKey === key)
  ) return state;
  return {
    ...state,
    suggestions: [...state.suggestions, {
      articleId,
      momentKey: key,
      surfacedAt: Math.floor(surfacedAt),
    }].slice(-GUIDE_SUGGESTION_LOG_CAP),
  };
}
