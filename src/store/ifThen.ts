/**
 * If–then plans (implementation intentions) — data layer.
 *
 * Types and pure helpers for the starting toolkit's plan slice: "If <cue>,
 * then <action>". No React in here; state lives in useBloom so plans persist
 * with the rest of the app. Plans are deliberately tiny — one cue, one
 * action — because the evidence is for pre-deciding the moment of starting,
 * not for elaborate planning (docs/science.md §Starting: Gollwitzer &
 * Sheeran 2006, d = 0.65 overall, d = 0.61 for failures-to-get-started).
 *
 * The planner UI (PLAN 3.2) lets a session pick one of these; the session
 * record then stores the planId used, so later insights can say which plans
 * actually get sessions started.
 */

export type CueType = 'time' | 'place' | 'emotion' | 'obstacle';

export interface IfThenPlan {
  id: string;
  cueType: CueType;
  /** The "if" half — a concrete cue, e.g. "it's 9:00 and coffee is poured". */
  cueText: string;
  /** The "then" half — one small concrete action, e.g. "open the doc and write one ugly sentence". */
  actionText: string;
  /** Task this plan usually starts, if any. */
  taskId?: number;
  /** Sessions started with this plan (bumped by the planner in 3.2). */
  usageCount: number;
  /** Epoch ms of the last session that used it; null when never used. */
  lastUsedAt: number | null;
  /** Epoch ms when the plan was written. */
  createdAt: number;
}

export const CUE_TYPES: CueType[] = ['time', 'place', 'emotion', 'obstacle'];

/**
 * Fill-in starters, one per cue type. The blanks keep the user in charge of
 * the specifics — a template is scaffolding, never a prescription
 * (docs/voice.md: suggest, don't assign).
 */
export interface IfThenTemplate {
  cueType: CueType;
  cueHint: string;
  actionHint: string;
}

export const IF_THEN_TEMPLATES: IfThenTemplate[] = [
  {
    cueType: 'time',
    cueHint: "it's __:__ and I've poured my drink",
    actionHint: 'I open ____ and write one ugly sentence',
  },
  {
    cueType: 'place',
    cueHint: 'I sit down at ____',
    actionHint: 'I put my phone out of reach and start a tiny session',
  },
  {
    cueType: 'emotion',
    cueHint: 'I notice I’m dreading ____',
    actionHint: 'I do just the first two minutes and see how it feels',
  },
  {
    cueType: 'obstacle',
    cueHint: 'I catch myself opening ____ instead',
    actionHint: 'I close it and press start before deciding anything else',
  },
];

/** Keep the list small enough to pick from at a glance. */
export const IF_THEN_PLAN_CAP = 20;

const CUE_TEXT_MAX = 120;
const ACTION_TEXT_MAX = 120;

let idCounter = 0;

/** Unique-enough id for a local, single-user list. */
export function newPlanId(now = Date.now()): string {
  idCounter = (idCounter + 1) % 1000;
  return `p-${now.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Append a new plan from user input. Pure. Returns the list unchanged when
 * the input is blank or the list is full — callers surface "full" copy
 * themselves; the data layer just refuses quietly.
 */
export function addIfThenPlan(
  plans: IfThenPlan[],
  input: { cueType: CueType; cueText: string; actionText: string; taskId?: number },
  now = Date.now(),
): IfThenPlan[] {
  const cueText = input.cueText.trim().slice(0, CUE_TEXT_MAX);
  const actionText = input.actionText.trim().slice(0, ACTION_TEXT_MAX);
  if (!cueText || !actionText) return plans;
  if (!CUE_TYPES.includes(input.cueType)) return plans;
  if (plans.length >= IF_THEN_PLAN_CAP) return plans;
  const plan: IfThenPlan = {
    id: newPlanId(now),
    cueType: input.cueType,
    cueText,
    actionText,
    taskId: input.taskId,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
  };
  return [...plans, plan];
}

/** Edit a plan's text/cue/task in place. Pure; unknown ids are a no-op. */
export function updateIfThenPlan(
  plans: IfThenPlan[],
  id: string,
  patch: Partial<Pick<IfThenPlan, 'cueType' | 'cueText' | 'actionText' | 'taskId'>>,
): IfThenPlan[] {
  return plans.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p, ...patch };
    next.cueText = (typeof next.cueText === 'string' ? next.cueText : p.cueText)
      .trim()
      .slice(0, CUE_TEXT_MAX);
    next.actionText = (typeof next.actionText === 'string' ? next.actionText : p.actionText)
      .trim()
      .slice(0, ACTION_TEXT_MAX);
    // An edit that blanks a half, or picks a bogus cue, keeps the old value.
    if (!next.cueText) next.cueText = p.cueText;
    if (!next.actionText) next.actionText = p.actionText;
    if (!CUE_TYPES.includes(next.cueType)) next.cueType = p.cueType;
    return next;
  });
}

/** Remove a plan. Pure. */
export function removeIfThenPlan(plans: IfThenPlan[], id: string): IfThenPlan[] {
  return plans.filter((p) => p.id !== id);
}

/** A session just started with this plan — bump its usage. Pure. */
export function markIfThenPlanUsed(
  plans: IfThenPlan[],
  id: string,
  now = Date.now(),
): IfThenPlan[] {
  return plans.map((p) =>
    p.id === id ? { ...p, usageCount: p.usageCount + 1, lastUsedAt: now } : p,
  );
}

function isValidPlan(r: unknown): r is IfThenPlan {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    CUE_TYPES.includes(x.cueType as CueType) &&
    typeof x.cueText === 'string' &&
    x.cueText.trim().length > 0 &&
    typeof x.actionText === 'string' &&
    x.actionText.trim().length > 0 &&
    (x.taskId === undefined || typeof x.taskId === 'number') &&
    typeof x.usageCount === 'number' &&
    Number.isFinite(x.usageCount) &&
    x.usageCount >= 0 &&
    (x.lastUsedAt === null || (typeof x.lastUsedAt === 'number' && Number.isFinite(x.lastUsedAt))) &&
    typeof x.createdAt === 'number' &&
    Number.isFinite(x.createdAt)
  );
}

/**
 * Load-time guard: whatever is in storage, come back with a well-formed,
 * capped list. Malformed entries are dropped individually rather than wiping
 * the whole array.
 */
export function sanitizeIfThenPlans(raw: unknown): IfThenPlan[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidPlan).slice(0, IF_THEN_PLAN_CAP);
}
