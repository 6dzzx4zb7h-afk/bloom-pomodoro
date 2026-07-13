/**
 * The optional environment reset that happens before a fresh work session.
 * Completion is intentionally transient UI state; only the user's enabled
 * choice and editable item labels are persisted here.
 */

export interface RitualItem {
  id: string;
  text: string;
}

export interface RitualSettings {
  enabled: boolean;
  /** Prevents the one-time gentle suggestion from becoming an ongoing nudge. */
  suggestionSeen: boolean;
  items: RitualItem[];
}

export const RITUAL_ITEM_MAX_LENGTH = 60;
export const RITUAL_ITEM_CAP = 6;

export const DEFAULT_RITUAL: RitualSettings = {
  enabled: false,
  suggestionSeen: false,
  items: [
    { id: 'phone', text: 'phone away' },
    { id: 'task', text: 'task named' },
    { id: 'first-action', text: 'first action named' },
    { id: 'tabs', text: 'distracting tabs closed' },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanItem(raw: unknown): RitualItem | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.text !== 'string') return null;
  const id = raw.id.trim().slice(0, 40);
  const text = raw.text.trim().slice(0, RITUAL_ITEM_MAX_LENGTH);
  return id && text ? { id, text } : null;
}

/** Parse stored ritual data without discarding valid user-edited items. */
export function sanitizeRitual(raw: unknown): RitualSettings {
  if (!isRecord(raw)) return { ...DEFAULT_RITUAL, items: DEFAULT_RITUAL.items.map((item) => ({ ...item })) };

  const items = Array.isArray(raw.items)
    ? raw.items.map(cleanItem).filter((item): item is RitualItem => Boolean(item)).slice(0, RITUAL_ITEM_CAP)
    : [];

  return {
    enabled: raw.enabled === true,
    suggestionSeen: raw.suggestionSeen === true,
    items: items.length
      ? items
      : DEFAULT_RITUAL.items.map((item) => ({ ...item })),
  };
}

export function updateRitualItem(items: RitualItem[], id: string, text: string): RitualItem[] {
  const nextText = text.trim().slice(0, RITUAL_ITEM_MAX_LENGTH);
  if (!nextText) return items;
  return items.map((item) => (item.id === id ? { ...item, text: nextText } : item));
}
