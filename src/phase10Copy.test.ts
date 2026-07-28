import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PHASE_TEN_SURFACES = [
  './components/FoundationsCard.tsx',
  './components/DebriefCard.tsx',
  './components/DebriefGoalCredit.tsx',
  './components/RolloverTriageCard.tsx',
  './screens/GoalsScreen.tsx',
  './screens/FocusScreen.tsx',
  './components/WeeklyReview.tsx',
  './screens/HistoryScreen.tsx',
  './insights/paceActual.ts',
  './store/foundations.ts',
  './store/goalLedger.ts',
  './store/dailyTarget.ts',
  './store/goals.ts',
] as const;

const NEVER_SHIP =
  /\b(?:fail(?:ure)?|broke(?:n)?|lazy|wasted|discipline|willpower|guilt(?:y)?|shame|excuse(?:s)?|optimal|proven|detox|you should|be honest|no excuses|we missed you|lost|lose|back to zero|break the chain|protect your streak|sad|sick|hungry|disappointed|gone|overdue|behind|21 day|30 days|66 days|dopamine)\b/gi;

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

function withoutComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * `overdue` remains a private GoalStatus value. PLAN 10.12 bans the word from
 * rendered copy, not from the discriminated union that keeps old data valid.
 */
function removeReviewedInternalTerms(value: string): string {
  return value
    .replace(/'done'\s*\|\s*'overdue'\s*\|\s*'active'/g, '')
    .replace(/status:\s*'overdue'/g, '')
    .replace(/pace\.status\s*===\s*'overdue'/g, '');
}

describe('PLAN 10.12 phase copy guardrail', () => {
  it('ships no Phase 10 placeholder markers', () => {
    const marker = ['PLACEHOLDER', 'COPY'].join('_');
    const markers = PHASE_TEN_SURFACES.flatMap((path) =>
      source(path).includes(marker) ? [path] : [],
    );
    expect(markers).toEqual([]);
  });

  it('keeps the never-ship lexicon out of Phase 10 user-facing source', () => {
    const hits = PHASE_TEN_SURFACES.flatMap((path) => {
      const checked = removeReviewedInternalTerms(withoutComments(source(path)));
      return [...checked.matchAll(NEVER_SHIP)].map(
        (match) => `${path}: ${match[0].toLowerCase()}`,
      );
    });

    expect(hits).toEqual([]);
  });

  it('keeps the evidence, autonomy, and restart qualifiers visible', () => {
    const goals = source('./store/goals.ts');
    const foundations = source('./components/FoundationsCard.tsx');
    const rollover = source('./components/RolloverTriageCard.tsx');
    const debriefCredit = source('./components/DebriefGoalCredit.tsx');
    const observedPace = source('./insights/paceActual.ts');

    expect(goals).toContain('from the date and amount');
    expect(goals).toContain('Want to try that pace?');
    expect(goals).toContain('if today has room');
    expect(foundations).toContain('months, and timing');
    expect(foundations).toContain('worth an experiment');
    expect(foundations).toContain('A gap is just weather');
    expect(rollover).toContain('Yesterday’s plan still has');
    expect(rollover).toContain('Today can start fresh');
    expect(debriefCredit).toContain('Bloom can count the');
    expect(observedPace).toContain('From your recorded goal credits');
    expect(observedPace).toContain('this might land after its date');
  });
});
