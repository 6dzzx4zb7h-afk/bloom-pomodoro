import type { CSSProperties } from 'react';
import { PixelPal } from '../components/PixelPal';
import { FRIENDS, levelProgress, MAX_LEVEL } from '../data/friends';
import type { useBloom } from '../store/useBloom';

function fmtXp(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function CollectionScreen({ bloom }: { bloom: ReturnType<typeof useBloom> }) {
  const { state, actions } = bloom;
  const { palXp } = state;

  const totalLevels = FRIENDS.reduce((sum, f) => sum + levelProgress(palXp[f.name] ?? 0).level, 0);

  return (
    <div className="screen coll-bg">
      <div className="head">
        <div className="head-title">My little friends</div>
        <div className="head-sub">
          all {FRIENDS.length} unlocked · tap one to bring them along · they level up as you focus
        </div>
      </div>

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
              <div className="coll-name">{f.name}</div>
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
    </div>
  );
}
