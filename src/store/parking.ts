/**
 * Distraction parking lot (PLAN 5.1).
 *
 * Thoughts stay hidden while their session is open, then become available at
 * that session's next natural pause. Everything is local and deliberately
 * small: this is a soft experiment, not a claim that parking always works.
 */

export const PARKING_WORD_LIMIT = 5;
export const PARKING_TEXT_MAX = 80;
const MAX_PARKED_THOUGHTS = 50;

export interface ParkedThought {
  id: string;
  text: string;
  parkedAt: number;
  sessionId: string;
  /** Null while hidden; stamped when the owning session ends. */
  revealedAt: number | null;
}

let parkingCounter = 0;

function newParkingId(now = Date.now()): string {
  parkingCounter = (parkingCounter + 1) % 1000;
  return `p-${now.toString(36)}-${parkingCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Final stored text: compact whitespace, at most five words and 80 chars. */
export function normalizeParkingText(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, PARKING_WORD_LIMIT)
    .join(' ')
    .slice(0, PARKING_TEXT_MAX);
}

/** Input-friendly limiter that keeps a trailing space while the user types. */
export function limitParkingDraft(raw: string): string {
  const clipped = raw.slice(0, PARKING_TEXT_MAX);
  const words = clipped.trim().split(/\s+/).filter(Boolean);
  return words.length <= PARKING_WORD_LIMIT
    ? clipped
    : words.slice(0, PARKING_WORD_LIMIT).join(' ');
}

export function sanitizeParkedThoughts(raw: unknown): ParkedThought[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ParkedThought => {
      if (!item || typeof item !== 'object') return false;
      const x = item as Partial<ParkedThought>;
      return (
        typeof x.id === 'string' &&
        typeof x.text === 'string' &&
        Boolean(normalizeParkingText(x.text)) &&
        typeof x.parkedAt === 'number' &&
        Number.isFinite(x.parkedAt) &&
        typeof x.sessionId === 'string' &&
        (x.revealedAt === null ||
          (typeof x.revealedAt === 'number' && Number.isFinite(x.revealedAt)))
      );
    })
    .map((item) => ({ ...item, text: normalizeParkingText(item.text) }))
    .slice(-MAX_PARKED_THOUGHTS);
}

export function addParkedThought(
  items: ParkedThought[],
  text: string,
  sessionId: string,
  now = Date.now(),
): ParkedThought[] {
  const normalized = normalizeParkingText(text);
  if (!normalized || !sessionId) return items;
  return [
    ...items,
    {
      id: newParkingId(now),
      text: normalized,
      parkedAt: now,
      sessionId,
      revealedAt: null,
    },
  ].slice(-MAX_PARKED_THOUGHTS);
}

/** Reveal only thoughts belonging to the session that just ended. */
export function revealParkedThoughts(
  items: ParkedThought[],
  sessionId: string | undefined,
  now = Date.now(),
): ParkedThought[] {
  if (!sessionId) return items;
  let changed = false;
  const next = items.map((item) => {
    if (item.sessionId !== sessionId || item.revealedAt !== null) return item;
    changed = true;
    return { ...item, revealedAt: now };
  });
  return changed ? next : items;
}

/** Entering any break is a natural pause, including a paused Flow session. */
export function revealAllParkedThoughts(
  items: ParkedThought[],
  now = Date.now(),
): ParkedThought[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.revealedAt !== null) return item;
    changed = true;
    return { ...item, revealedAt: now };
  });
  return changed ? next : items;
}

export function removeParkedThought(items: ParkedThought[], id: string): ParkedThought[] {
  return items.filter((item) => item.id !== id);
}
