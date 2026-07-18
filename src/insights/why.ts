/**
 * Rule-based "why" engine for the post-session debrief (PLAN 2.2).
 *
 * One pure function: (this session's record + the user's own history) → one
 * explanatory sentence with a cause. Exactly one insight per debrief — the
 * rules below are checked in priority order and the first match wins, with a
 * neutral "still learning" fallback when the signal is thin (docs/science.md
 * #measurement: keep feedback simple and low-frequency — Krukowski 2024).
 *
 * Every rule returns `{ text, evidenceKey }`; the evidenceKey names the
 * science.md section (and future Field Guide article, PLAN 6.x) the claim
 * rests on. Copy follows docs/voice.md: hedged to match the evidence,
 * restart-framed after an abandon, never a grade.
 */

import type { SessionRecord } from '../store/sessions';
import {
  type CompanionEvent,
  driftOnsetMin,
  isDriftEvent,
  phaseOf,
} from '../store/companion';
import {
  completionRateByStartHour,
  hasEnoughSignal,
  medianMinutesToFirstDrift,
} from '../store/sessionStats';

export type WhyEvidenceKey =
  | 'kind-restart'
  | 'attention-fades'
  | 'breaks-are-fuel'
  | 'golden-hours'
  | 'tiny-start'
  | 'still-learning'
  | 'if-then'
  | 'desk-help'
  | 'parking-lot';

/**
 * The shared evidence vocabulary (PLAN 2.4): the debrief's why-engine and the
 * attention recipe both stamp their claims with these keys, so one map — and
 * later one Field Guide article per key (6.1–6.3) — serves every "why?" link.
 */
export type EvidenceKey = WhyEvidenceKey;

/**
 * Where each key's evidence lives. Until the Field Guide ships (6.1–6.3)
 * these resolve to science.md anchors; the guide's article ids will map onto
 * the same keys so debrief and recipe "why?" links can deep-link later.
 */
export const WHY_EVIDENCE_ANCHORS: Record<WhyEvidenceKey, string> = {
  'kind-restart': 'docs/science.md#recovering',
  'attention-fades': 'docs/science.md#staying',
  'breaks-are-fuel': 'docs/science.md#staying',
  'golden-hours': 'docs/science.md#staying',
  'tiny-start': 'docs/science.md#starting',
  'still-learning': 'docs/science.md#measurement',
  'if-then': 'docs/science.md#starting',
  'desk-help': 'docs/science.md#starting',
  'parking-lot': 'docs/science.md#recovering',
};

/*
 * PLACEHOLDER_COPY — the plain "why?" explainer sheet shown before the Field
 * Guide exists (2.4 → replaced by guide deep-links in 6.3; final wording lands
 * in the 6.4/7.3 copy passes). Each entry is a two-minute-read-shorter answer:
 * what the evidence says, hedged exactly as hard as docs/science.md hedges.
 */
export const EVIDENCE_EXPLAINERS: Record<EvidenceKey, { title: string; text: string }> = {
  'kind-restart': {
    title: 'a kind restart works better',
    text: 'in one study, people who forgave themselves after procrastinating procrastinated less the next time (Wohl 2010). self-criticism can push a task further away; a soft restart can bring it closer.',
  },
  'attention-fades': {
    title: 'attention naturally fades',
    text: 'focus reliably sags with time on task, and mind-wandering grows as the minutes pass (Zanesco 2024). a slump partway through is the normal shape of attention, not a flaw in yours.',
  },
  'breaks-are-fuel': {
    title: 'breaks help attention recover',
    text: 'the research says breaks help — and that there is no single perfect work/break ratio for everyone (Albulescu 2022). the useful move is fitting breaks to where your own focus actually bends.',
  },
  'golden-hours': {
    title: 'time-of-day patterns are clues',
    text: 'research calls a chronotype-and-time match the synchrony effect, but results are mixed (May, Hasher & Healey 2023; Chauhan 2025). your recent sessions can suggest a time worth testing, not prove a fixed personal peak.',
  },
  'tiny-start': {
    title: 'tiny starts are real starts',
    text: 'starting is often the emotionally expensive part. in one study, very small commitments made students nearly twice as likely to engage (Felkey 2023) — promising, not settled, and gentle to try.',
  },
  'still-learning': {
    title: 'why i wait for more signal',
    text: 'small numbers mislead — one rough afternoon is not a pattern. i only point at things your own data has shown a few times, so early on i mostly listen.',
  },
  'if-then': {
    title: '“if x, then y” beats “try harder”',
    text: 'concrete if–then plans meaningfully improve follow-through, especially with getting started (Gollwitzer & Sheeran 2006). planning the cue matters as much as planning the goal.',
  },
  'desk-help': {
    title: 'let the desk do some of the work',
    text: 'focus is partly environmental: a phone merely in view taxes attention (Ward 2017), and a short settling-in ritual predicts better engagement with the day’s work (Sonnentag & Kühnel 2016).',
  },
  'parking-lot': {
    title: 'park it, then come back',
    text: 'writing an intrusive thought down can move it out of your head and into the world (Risko & Gilbert 2016). for focus sessions this is worth an experiment, not a certainty.',
  },
};

export interface WhyInsight {
  text: string;
  evidenceKey: WhyEvidenceKey;
}

/* Rule thresholds — small and legible on purpose. */

/** A session needs this many drifts before a "pattern" claim about them. */
const LATE_RULE_MIN_DRIFTS = 2;
/** How close (minutes) this session's first drift must sit to the median. */
const FIRST_DRIFT_TOLERANCE_MIN = 5;
/** A personal "usual" needs several prior sessions that actually contained a drift. */
const FIRST_DRIFT_MIN_PRIOR_SESSIONS = 3;
/** Samples an hour bucket needs before it can be called a strong hour. */
const GOLDEN_MIN_SAMPLES = 3;
/** Completion rate an hour bucket needs to count as a strong hour. */
const GOLDEN_MIN_RATE = 0.7;
/** Planned length at or under this reads as a deliberately small session. */
const SHORT_SESSION_MAX_MIN = 15;

/**
 * The drift events triaged during one session — either 1.3 link direction
 * (event → sessionId, or record → driftEventIds) counts. Pure twin of the
 * loader-bound helper DebriefCard used before 2.2.
 */
export function driftsForRecord(
  record: SessionRecord,
  events: CompanionEvent[],
): CompanionEvent[] {
  const linked = new Set(record.driftEventIds);
  return events.filter(
    (e) =>
      isDriftEvent(e) &&
      (e.sessionId === record.id || (e.id != null && linked.has(e.id))),
  );
}

function fmtHour(h: number): string {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/**
 * The debrief's one "why" sentence. `allRecords` and `allEvents` are the full
 * session log and companion event log — the record itself may (and normally
 * does) appear in `allRecords`.
 */
export function whyFor(
  record: SessionRecord,
  allRecords: SessionRecord[],
  allEvents: CompanionEvent[],
): WhyInsight {
  const drifts = driftsForRecord(record, allEvents);
  const priorRecords = allRecords.filter((r) => r.id !== record.id);

  // 1) Abandon-kindness: a session that ended early always gets the kind
  //    restart, never analysis (docs/science.md#recovering — Wohl 2010:
  //    self-forgiveness predicts less future procrastination).
  if (record.outcome === 'abandoned') {
    return {
      text: 'that happened — no note taken. smallest next step, when you’re ready?',
      evidenceKey: 'kind-restart',
    };
  }

  // 2) Late-drift pattern: most of this session's drifts came near the end
  //    (docs/science.md#staying — attention sags with time on task; prompt
  //    before the slump, not after).
  if (drifts.length >= LATE_RULE_MIN_DRIFTS) {
    const late = drifts.filter((d) => phaseOf(driftOnsetMin(d), d.len) === 'late').length;
    if (late > drifts.length / 2) {
      return {
        text: 'your drifts came late — attention naturally fades with time on task. a slightly shorter block might fit this task.',
        evidenceKey: 'attention-fades',
      };
    }
  }

  const enough = hasEnoughSignal(priorRecords.length);

  // 3) First-drift timing: this session's first drift landed where the
  //    user's drifts usually start — a rhythm worth planning breaks around
  //    (docs/science.md#staying — breaks help; fit them to the person).
  //    "Your usual" must come from prior sessions only: a median that
  //    includes this session's own drift would fabricate a pattern from a
  //    single data point.
  if (enough && drifts.length > 0) {
    const priorDriftSessions = priorRecords.filter(
      (prior) => driftsForRecord(prior, allEvents).length > 0,
    ).length;
    const median = medianMinutesToFirstDrift(priorRecords, allEvents);
    const first = Math.min(...drifts.map(driftOnsetMin));
    if (
      priorDriftSessions >= FIRST_DRIFT_MIN_PRIOR_SESSIONS &&
      median != null &&
      Math.abs(first - median) <= FIRST_DRIFT_TOLERANCE_MIN
    ) {
      return {
        text: `your first wander came near minute ${Math.round(first)} — right around your usual. a break just before that point could be worth a try.`,
        evidenceKey: 'breaks-are-fuel',
      };
    }
  }

  // 4) Golden-hour match: this completed session started in an hour that
  //    usually completes for this person (docs/science.md#staying —
  //    chronotype / time-of-day synchrony effects).
  if (enough && record.outcome === 'completed') {
    // The session being explained cannot make its own hour look stronger.
    const byHour = completionRateByStartHour(priorRecords);
    const b = byHour.find((x) => x.hour === record.startHour);
    if (b && b.total >= GOLDEN_MIN_SAMPLES && b.rate >= GOLDEN_MIN_RATE) {
      return {
        text: `this matched a stronger start time in your recent record — ${b.completed} of ${b.total} prior sessions around ${fmtHour(record.startHour)} finished.`,
        evidenceKey: 'golden-hours',
      };
    }
  }

  // 5) Short-session success: a small block, fully done — starting small is
  //    a real strategy, not a lesser session (docs/science.md#starting —
  //    micro-commitments; promising, not settled, so the copy stays hedged).
  if (
    record.outcome === 'completed' &&
    (record.mode === 'tiny' ||
      (record.plannedMin != null && record.plannedMin <= SHORT_SESSION_MAX_MIN))
  ) {
    return {
      text: 'short and fully bloomed — this one counts. small blocks can make starting feel lighter.',
      evidenceKey: 'tiny-start',
    };
  }

  // 6) Low-signal / no-pattern fallback: neutral and warm, never invented.
  return {
    text: 'no big pattern this time — i’m still learning your rhythm, one session at a time.',
    evidenceKey: 'still-learning',
  };
}
