import type { AnimalKind } from '../engine/pixelpals';

export interface Friend {
  /** Unique display name — also the value stored in settings.pal. */
  name: string;
  sprite: AnimalKind;
  /** Total completed focus sessions needed to unlock this friend. */
  threshold: number;
  /** Card tile background. */
  tile: string;
  blurb: string;
}

export const FRIENDS: Friend[] = [
  { name: 'Mochi', sprite: 'bunny', threshold: 0, tile: '#fdeef6', blurb: 'your first friend' },
  { name: 'Pudding', sprite: 'cat', threshold: 5, tile: '#f3eefb', blurb: 'naps professionally' },
  { name: 'Biscuit', sprite: 'duck', threshold: 12, tile: '#fff7e6', blurb: 'waddles with purpose' },
  { name: 'Cloud', sprite: 'bunny', threshold: 25, tile: '#eef4fd', blurb: 'soft and unbothered' },
  { name: 'Maple', sprite: 'cat', threshold: 40, tile: '#fdeef6', blurb: 'sweet but scratchy' },
  { name: 'Sunny', sprite: 'duck', threshold: 60, tile: '#fff7e6', blurb: 'morning person' },
];

export function friendByName(name: string): Friend {
  return FRIENDS.find((f) => f.name === name) ?? FRIENDS[0];
}

export function unlockedFriends(sessions: number): Friend[] {
  return FRIENDS.filter((f) => sessions >= f.threshold);
}
