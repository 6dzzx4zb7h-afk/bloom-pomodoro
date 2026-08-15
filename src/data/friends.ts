import type { AnimalKind } from '../engine/pixelpals';

/**
 * How a friend is drawn on the home screen (PLAN 13.9).
 *
 * `icon` is the iOS asset-catalog name for that friend's app icon; `null` marks
 * the friend whose art is the app's primary icon, which is what
 * `setAlternateIconName(nil)` restores. `from`/`to` are the icon gradient
 * corners — deeper than the pale card tiles so the sprite still reads at 60pt.
 */
export interface FriendAppIcon {
  icon: string | null;
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
    // Mochi keeps Bloom's blossom gradient and is the primary app icon.
    appIcon: { icon: null, from: '#ffb0d4', to: '#c79fe6' },
  },
  {
    name: 'Pudding',
    sprite: 'cat',
    tile: '#f3eefb',
    tileNight: '#3b2f66',
    blurb: 'naps professionally',
    appIcon: { icon: 'AppIcon-Pudding', from: '#b98ef0', to: '#6f5bd4' },
  },
  {
    name: 'Biscuit',
    sprite: 'duck',
    tile: '#fff7e6',
    tileNight: '#463b5a',
    blurb: 'waddles with purpose',
    appIcon: { icon: 'AppIcon-Biscuit', from: '#f6a86a', to: '#d96f8f' },
  },
  {
    name: 'Luna',
    sprite: 'owl',
    tile: '#eef4fd',
    tileNight: '#323a6a',
    blurb: 'wise little night owl',
    appIcon: { icon: 'AppIcon-Luna', from: '#7fa6e8', to: '#4f57bd' },
  },
  {
    name: 'Snappy',
    sprite: 'crab',
    tile: '#ffecec',
    tileNight: '#4c3157',
    blurb: 'pinches with love',
    appIcon: { icon: 'AppIcon-Snappy', from: '#ff9ec4', to: '#cf4b7e' },
  },
  {
    name: 'Coral',
    sprite: 'octopus',
    tile: '#ffeee6',
    tileNight: '#4a3854',
    blurb: 'eight arms, all hugs',
    appIcon: { icon: 'AppIcon-Coral', from: '#ffc2dd', to: '#ad63a6' },
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
