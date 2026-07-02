import { PixelPal } from '../components/PixelPal';
import { FRIENDS } from '../data/friends';
import type { useBloom } from '../store/useBloom';

export function CollectionScreen({ bloom }: { bloom: ReturnType<typeof useBloom> }) {
  const { state, actions } = bloom;
  const { sessions } = state;

  const unlocked = FRIENDS.filter((f) => sessions >= f.threshold);
  const next = FRIENDS.find((f) => sessions < f.threshold);
  const toNext = next ? next.threshold - sessions : 0;

  return (
    <div className="screen coll-bg">
      <div className="head">
        <div className="head-title">My little friends</div>
        <div className="head-sub">
          {unlocked.length} of {FRIENDS.length} unlocked · tap a friend to bring them along
        </div>
      </div>

      <div className="coll-grid">
        {FRIENDS.map((f) => {
          const isUnlocked = sessions >= f.threshold;
          const onDuty = state.settings.pal === f.name;
          if (!isUnlocked) {
            return (
              <div className="coll-card locked" key={f.name}>
                <div className="coll-tile q">?</div>
                <div className="coll-name locked">???</div>
                <div className="coll-meta locked">unlock at {f.threshold} sessions</div>
              </div>
            );
          }
          return (
            <button
              className={`coll-card pick${onDuty ? ' duty' : ''}`}
              key={f.name}
              onClick={() => actions.patchSettings({ pal: f.name })}
              aria-pressed={onDuty}
            >
              {onDuty && <span className="duty-badge">on duty</span>}
              <div className="coll-tile" style={{ background: f.tile }}>
                <PixelPal sprite={f.sprite} mode="idle" scale={3} size={64} />
              </div>
              <div className="coll-name">{f.name}</div>
              <div className="coll-meta">{f.blurb}</div>
            </button>
          );
        })}
      </div>

      <div className="coll-footer">
        <span className="coll-heart">&#9825;</span>
        <div style={{ flex: 1 }}>
          {next ? (
            <>
              <div className="coll-foot-title">
                {toNext} session{toNext === 1 ? '' : 's'} to your next friend
              </div>
              <div className="coll-foot-sub">who could it be?</div>
            </>
          ) : (
            <>
              <div className="coll-foot-title">You've met everyone!</div>
              <div className="coll-foot-sub">keep blooming &#9825;</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
