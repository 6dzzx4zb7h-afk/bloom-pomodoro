import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GUIDE_ARTICLES,
  type GuideArticleId,
  type GuideStageTag,
} from '../content/guide';
import type { useBloom } from '../store/useBloom';

type GuideFilter = 'all' | GuideStageTag;

const FILTERS: readonly { id: GuideFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'start', label: 'Starting' },
  { id: 'stay', label: 'Staying' },
  { id: 'recover', label: 'Recovering' },
  { id: 'science', label: 'Science' },
];

const STAGE_LABELS: Record<GuideStageTag, string> = {
  start: 'Start',
  stay: 'Stay',
  recover: 'Recover',
  science: 'Science',
};

export function GuideScreen({
  bloom,
  openArticleId = null,
  onOpenArticleHandled,
}: {
  bloom: ReturnType<typeof useBloom>;
  openArticleId?: GuideArticleId | null;
  onOpenArticleHandled?: () => void;
}) {
  const { state, actions } = bloom;
  const [filter, setFilter] = useState<GuideFilter>('all');
  const [selectedId, setSelectedId] = useState<GuideArticleId | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const articleHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusIdRef = useRef<GuideArticleId | null>(null);
  const articleButtonRefs = useRef<
    Partial<Record<GuideArticleId, HTMLButtonElement | null>>
  >({});

  const articles = useMemo(
    () =>
      filter === 'all'
        ? GUIDE_ARTICLES
        : GUIDE_ARTICLES.filter((article) => article.stageTag === filter),
    [filter],
  );
  const selected = GUIDE_ARTICLES.find((article) => article.id === selectedId);

  useEffect(() => {
    if (!openArticleId) return;
    actions.markGuideArticleRead(openArticleId);
    setSelectedId(openArticleId);
    onOpenArticleHandled?.();
  }, [actions, onOpenArticleHandled, openArticleId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (selectedId) {
      articleHeadingRef.current?.focus({ preventScroll: true });
      return;
    }
    const returnId = returnFocusIdRef.current;
    if (returnId) {
      articleButtonRefs.current[returnId]?.focus();
      returnFocusIdRef.current = null;
    }
  }, [selectedId]);

  const openArticle = (id: GuideArticleId) => {
    returnFocusIdRef.current = id;
    actions.markGuideArticleRead(id);
    setSelectedId(id);
  };

  if (selected) {
    return (
      <section
        ref={scrollRef}
        className="guide-screen"
        aria-label="Field Guide article"
      >
        <button
          type="button"
          className="guide-back"
          aria-label="Back to Field Guide"
          onClick={() => setSelectedId(null)}
        >
          <span aria-hidden="true">←</span> Field Guide
        </button>

        <article className="guide-article">
          <div className="guide-card-top">
            <span className={`guide-stage stage-${selected.stageTag}`}>
              {STAGE_LABELS[selected.stageTag]}
            </span>
            <span className="guide-reading-time">short read</span>
          </div>
          <h2 ref={articleHeadingRef} tabIndex={-1}>
            {selected.title}
          </h2>

          <div className="guide-copy">
            {selected.keyPoints.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <aside className="guide-exercise">
            <h3>Want to try it?</h3>
            <p>{selected.practicalExercise}</p>
          </aside>

          <div className="guide-sources">
            <h3>Sources</h3>
            <ul>
              {selected.sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section ref={scrollRef} className="guide-screen" aria-label="Field Guide">
      <div className="guide-intro">
        <h2>Small notes for focus</h2>
        <span>Twelve quiet reads, bundled for offline moments.</span>
        <span>Bloom offers at most three a week. Each note rests for 30 days.</span>
      </div>

      <div
        className="guide-filters"
        role="group"
        aria-label="Browse guide by stage"
      >
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item.id}
            className="guide-filter"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="guide-list">
        {articles.map((article) => {
          const read = state.guideRead.readAt[article.id] !== undefined;
          return (
            <button
              type="button"
              className="guide-card"
              key={article.id}
              ref={(node) => {
                articleButtonRefs.current[article.id] = node;
              }}
              onClick={() => openArticle(article.id)}
              aria-label={`${article.title}, ${STAGE_LABELS[article.stageTag]}, short read${read ? ', read' : ''}`}
            >
              <span className="guide-card-top">
                <span className={`guide-stage stage-${article.stageTag}`}>
                  {STAGE_LABELS[article.stageTag]}
                </span>
                {read && <span className="guide-read">Read</span>}
              </span>
              <span className="guide-card-title">{article.title}</span>
              <span className="guide-card-meta">short read · opens offline</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
