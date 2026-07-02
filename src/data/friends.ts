import type { AnimalKind } from '../engine/pixelpals';

export interface Friend {
  /** Unique display name — also the value stored in settings.pal. */
  name: string;
  sprite: AnimalKind;
  /** Card tile background. */
  tile: string;
  blurb: string;
}

// Every friend is available from the start — pick whoever you like. They grow
// levels as you complete focus sessions with them on duty (see palXp).
export const FRIENDS: Friend[] = [
  { name: 'Mochi', sprite: 'bunny', tile: '#fdeef6', blurb: 'your first friend' },
  { name: 'Pudding', sprite: 'cat', tile: '#f3eefb', blurb: 'naps professionally' },
  { name: 'Biscuit', sprite: 'duck', tile: '#fff7e6', blurb: 'waddles with purpose' },
  { name: 'Cloud', sprite: 'bunny', tile: '#eef4fd', blurb: 'soft and unbothered' },
  { name: 'Maple', sprite: 'cat', tile: '#fdeef6', blurb: 'sweet but scratchy' },
  { name: 'Sunny', sprite: 'duck', tile: '#fff7e6', blurb: 'morning person' },
];

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
