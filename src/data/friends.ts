import type { AnimalKind } from '../engine/pixelpals';

/**
 * How a friend is drawn on the home screen (PLAN 13.9, 13.18).
 *
 * `icon` is the iOS asset-catalog name for that friend's app icon; `null` marks
 * the friend whose art is the app's primary icon, which is what
 * `setAlternateIconName(nil)` restores. `from`/`to` are the icon gradient
 * corners — deeper than the pale card tiles so the sprite still reads at 60pt.
 *
 * Android has no primary/alternate split: every friend is an `<activity-alias>`
 * carrying its own launcher art, and exactly one of them is enabled at a time.
 * `alias` is that alias's short class name (relative to the application id) and
 * `res` is the mipmap base name `gen-icons.mjs` writes for it.
 */
export interface FriendAppIcon {
  icon: string | null;
  alias: string;
  res: string;
  from: string;
  to: string;
}

export interface Friend {
  /** Unique display name — also the value stored in settings.pal. */
  name: string;
  sprite: AnimalKind;
  /** Card tile background (day theme). */
  tile: string;
  /** Card tile background at night — a dusky, hue-matched indigo so tiles sit
      in the night sky instead of being a filtered-down pastel. */
  tileNight: string;
  blurb: string;
  appIcon: FriendAppIcon;
}

// Every friend is available from the start — pick whoever you like. They grow
// levels as you complete focus sessions with them on duty (see palXp).
export const FRIENDS: Friend[] = [
  {
    name: 'Mochi',
    sprite: 'bunny',
    tile: '#fdeef6',
    tileNight: '#46315c',
    blurb: 'your first friend',
    // Mochi wears Bloom's own gradient and is the primary app icon.
    appIcon: {
      icon: null,
      alias: 'BloomMochi',
      res: 'ic_launcher_mochi',
      from: '#3fbfae',
      to: '#215f78',
    },
  },
  {
    name: 'Pudding',
    sprite: 'cat',
    tile: '#f3eefb',
    tileNight: '#3b2f66',
    blurb: 'naps professionally',
    appIcon: {
      icon: 'AppIcon-Pudding',
      alias: 'BloomPudding',
      res: 'ic_launcher_pudding',
      from: '#8f7bea',
      to: '#3f3480',
    },
  },
  {
    name: 'Biscuit',
    sprite: 'duck',
    tile: '#fff7e6',
    tileNight: '#463b5a',
    blurb: 'waddles with purpose',
    appIcon: {
      icon: 'AppIcon-Biscuit',
      alias: 'BloomBiscuit',
      res: 'ic_launcher_biscuit',
      from: '#f2b154',
      to: '#a4522b',
    },
  },
  {
    name: 'Luna',
    sprite: 'owl',
    tile: '#eef4fd',
    tileNight: '#323a6a',
    blurb: 'wise little night owl',
    appIcon: {
      icon: 'AppIcon-Luna',
      alias: 'BloomLuna',
      res: 'ic_launcher_luna',
      from: '#6f8fe0',
      to: '#252f6b',
    },
  },
  {
    name: 'Snappy',
    sprite: 'crab',
    tile: '#ffecec',
    tileNight: '#4c3157',
    blurb: 'pinches with love',
    appIcon: {
      icon: 'AppIcon-Snappy',
      alias: 'BloomSnappy',
      res: 'ic_launcher_snappy',
      from: '#ff9d6e',
      to: '#a83a2e',
    },
  },
  {
    name: 'Coral',
    sprite: 'octopus',
    tile: '#ffeee6',
    tileNight: '#4a3854',
    blurb: 'eight arms, all hugs',
    appIcon: {
      icon: 'AppIcon-Coral',
      alias: 'BloomCoral',
      res: 'ic_launcher_coral',
      from: '#9ec96b',
      to: '#33663f',
    },
  },
];

/**
 * The iOS alternate-icon name for whoever is on duty, or `null` for the primary
 * icon. An unknown name falls back to the first friend, matching
 * `friendByName`, so a stale setting never leaves the home screen mismatched.
 */
export function appIconNameForFriend(name: string): string | null {
  return friendByName(name).appIcon.icon;
}

/**
 * The Android launcher alias for whoever is on duty (PLAN 13.18). There is no
 * "primary" alias to fall back to the way iOS has one: exactly one alias is
 * enabled at a time, so this always names a friend. An unknown name falls back
 * to the first friend, matching `friendByName`.
 */
export function appIconAliasForFriend(name: string): string {
  return friendByName(name).appIcon.alias;
}

export const MAX_LEVEL = 20;

export function friendByName(name: string): Friend {
  return FRIENDS.find((f) => f.name === name) ?? FRIENDS[0];
}

/**
 * Level curve. A friend needs `L*L - 1` cumulative focus sessions to reach
 * level L, so level = floor(sqrt(xp + 1)). Levels 1→2 costs 3, 2→3 costs 5,
 * 3→4 costs 7 … (each level a little harder than the last), capped at MAX_LEVEL.
 */
export function levelFromXp(xp: number): number {
  const raw = Math.floor(Math.sqrt(Math.max(0, xp) + 1));
  return Math.max(1, Math.min(MAX_LEVEL, raw));
}

export interface LevelProgress {
  level: number;
  /** XP earned into the current level. */
  into: number;
  /** XP needed to span the current level (0 at max). */
  span: number;
  /** 0..1 fill toward the next level (1 at max). */
  pct: number;
  maxed: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, span: 0, pct: 1, maxed: true };
  const cur = level * level - 1;
  const next = (level + 1) * (level + 1) - 1;
  const span = next - cur;
  const into = Math.max(0, xp) - cur;
  return { level, into, span, pct: Math.max(0, Math.min(1, into / span)), maxed: false };
}
