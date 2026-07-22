import { useEffect, useState, type CSSProperties } from 'react';
import { GuideScreen } from '../components/GuideScreen';
import type { GuideArticleId } from '../content/guide';
import { PixelPal } from '../components/PixelPal';
import { FRIENDS, levelProgress, MAX_LEVEL } from '../data/friends';
import type { useBloom } from '../store/useBloom';

function fmtXp(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function CollectionScreen({
  bloom,
  guideArticleId = null,
  onGuideArticleHandled,
}: {
  bloom: ReturnType<typeof useBloom>;
  guideArticleId?: GuideArticleId | null;
  onGuideArticleHandled?: () => void;
}) {
  const { state, actions } = bloom;
  const { palXp } = state;
  const [section, setSection] = useState<'friends' | 'guide'>('friends');

  useEffect(() => {
    if (guideArticleId) setSection('guide');
  }, [guideArticleId]);

  const totalLevels = FRIENDS.reduce((sum, f) => sum + levelProgress(palXp[f.name] ?? 0).level, 0);

  return (
    <main className="screen coll-bg" id="collection-screen" aria-labelledby="collection-heading">
      <div className="head">
        <h1 className="head-title" id="collection-heading">
          {section === 'friends' ? 'My little friends' : 'Field Guide'}
        </h1>
        <div className={`head-sub${section === 'guide' ? ' guide-head-sub' : ''}`}>
          {section === 'friends'
            ? `all ${FRIENDS.length} unlocked · tap one to bring them along · they level up as you focus`
            : 'short notes for starting, staying, and finding your way back'}
        </div>
      </div>

      <div
        className="collection-switch"
        role="group"
        aria-label="Collection sections"
      >
        <button
          type="button"
          className="collection-switch-btn"
          aria-pressed={section === 'friends'}
          onClick={() => setSection('friends')}
        >
          Friends
        </button>
        <button
          type="button"
          className="collection-switch-btn"
          aria-pressed={section === 'guide'}
          onClick={() => setSection('guide')}
        >
          Field Guide
        </button>
      </div>

      {section === 'guide' ? (
        <GuideScreen
          bloom={bloom}
          openArticleId={guideArticleId}
          onOpenArticleHandled={onGuideArticleHandled}
        />
      ) : (
        <>
          <div className="coll-grid">
            {FRIENDS.map((f) => {
              const xp = palXp[f.name] ?? 0;
              const prog = levelProgress(xp);
              const onDuty = state.settings.pal === f.name;
              return (
                <button
                  className={`coll-card pick${onDuty ? ' duty' : ''}`}
                  key={f.name}
                  onClick={() => actions.patchSettings({ pal: f.name })}
                  aria-pressed={onDuty}
                >
                  {onDuty && <span className="duty-badge">on duty</span>}
                  <span className="lvl-badge">Lv {prog.level}</span>
                  <div
                    className="coll-tile"
                    style={{ '--tile-day': f.tile, '--tile-night': f.tileNight } as CSSProperties}
                  >
                    <PixelPal sprite={f.sprite} mode="idle" scale={3} size={64} />
                  </div>
                  <h2 className="coll-name">{f.name}</h2>
                  <div className="coll-meta">{f.blurb}</div>
                  <div className="lvl-bar" aria-hidden="true">
                    <span className="lvl-bar-fill" style={{ width: `${Math.round(prog.pct * 100)}%` }} />
                  </div>
                  <div className="lvl-xp">
                    {prog.maxed
                      ? `max level · ${fmtXp(xp)} focus XP`
                      : `${fmtXp(prog.into)}/${prog.span} XP to Lv ${prog.level + 1}`}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="coll-footer">
            <span className="coll-heart">&#9825;</span>
            <div style={{ flex: 1 }}>
              <div className="coll-foot-title">
                {totalLevels} total level{totalLevels === 1 ? '' : 's'} across your friends
              </div>
              <div className="coll-foot-sub">
                {totalLevels >= FRIENDS.length * MAX_LEVEL
                  ? 'everyone maxed — you legend ♥'
                  : 'focus with each of them to help them grow'}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
