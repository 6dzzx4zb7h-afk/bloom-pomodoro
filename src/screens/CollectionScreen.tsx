import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GuideScreen } from '../components/GuideScreen';
import type { GuideArticleId } from '../content/guide';
import { PixelPal } from '../components/PixelPal';
import { FRIENDS, levelProgress, MAX_LEVEL } from '../data/friends';
import type { useBloom } from '../store/useBloom';
import {
  configureNativeIOSSegment,
  hideNativeIOSSegment,
  isNativeCollectionSection,
  isNativeIOSTabsPlatform,
  listenForNativeIOSSegmentSelection,
  observeNativeControlFrame,
  type NativeControlFrame,
} from '../native/iosTabs';

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
  const [nativeSectionReady, setNativeSectionReady] = useState(false);
  const nativeSectionSlotRef = useRef<HTMLDivElement>(null);
  const nativeSectionFrameRef = useRef<NativeControlFrame | null>(null);
  const nativeSectionSelectionRef = useRef<(value: string) => void>(() => undefined);

  useEffect(() => {
    if (guideArticleId) setSection('guide');
  }, [guideArticleId]);

  const configureNativeSectionControl = useCallback((frame = nativeSectionFrameRef.current) => {
    if (!frame) return Promise.resolve({ active: false });
    return configureNativeIOSSegment({
      kind: 'collectionSections',
      items: [
        { id: 'friends', title: 'Friends' },
        { id: 'guide', title: 'Field Guide' },
      ],
      selected: section,
      enabled: true,
      visible: true,
      frame,
    });
  }, [section]);

  nativeSectionSelectionRef.current = (value) => {
    if (isNativeCollectionSection(value)) setSection(value);
  };

  useEffect(() => {
    if (!isNativeIOSTabsPlatform()) return;

    let disposed = false;
    let listener: Awaited<ReturnType<typeof listenForNativeIOSSegmentSelection>> | null = null;
    void listenForNativeIOSSegmentSelection(({ kind, value }) => {
      if (kind === 'collectionSections') nativeSectionSelectionRef.current(value);
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => {
        if (!disposed) setNativeSectionReady(false);
      });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
      void hideNativeIOSSegment('collectionSections');
    };
  }, []);

  useEffect(() => {
    if (!isNativeIOSTabsPlatform() || !nativeSectionSlotRef.current) return;

    let disposed = false;
    const stopObserving = observeNativeControlFrame(nativeSectionSlotRef.current, (frame) => {
      nativeSectionFrameRef.current = frame;
      void configureNativeSectionControl(frame)
        .then(({ active }) => {
          if (!disposed) setNativeSectionReady(active);
        })
        .catch(() => {
          if (!disposed) setNativeSectionReady(false);
        });
    });
    return () => {
      disposed = true;
      stopObserving();
    };
  }, [configureNativeSectionControl]);

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
        ref={nativeSectionSlotRef}
        className={`collection-switch${nativeSectionReady ? ' native-segment-slot-ready' : ''}`}
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
                  aria-label={`${f.name}, ${onDuty ? 'on duty, ' : ''}level ${prog.level}. ${f.blurb}`}
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
