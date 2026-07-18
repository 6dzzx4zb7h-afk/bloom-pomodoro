import { GUIDE_ARTICLES, type GuideArticleId } from '../content/guide';

export function GuideSuggestion({
  articleId,
  reason,
  onOpen,
}: {
  articleId: GuideArticleId;
  reason: string;
  onOpen: (id: GuideArticleId) => void;
}) {
  const article = GUIDE_ARTICLES.find((item) => item.id === articleId);
  if (!article) return null;

  return (
    <button
      type="button"
      className="guide-suggestion"
      onClick={() => onOpen(articleId)}
      aria-label={`Open Field Guide article: ${article.title}`}
    >
      <span className="guide-suggestion-kicker">Field Guide · short read</span>
      <span className="guide-suggestion-reason">{reason}</span>
      <span className="guide-suggestion-title">
        {article.title} <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}
