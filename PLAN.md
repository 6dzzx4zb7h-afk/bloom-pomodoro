# Bloom — Evidence-Informed Iterative Build Plan

This plan turns Bloom's behavioral evidence, product-quality standards, and engineering constraints
into small, independently committable build steps. Each numbered step is sized for one focused
implementation session.

---

## How to use

Paste this exact prompt into Claude Code each session, replacing `X.Y`:

```
Read PLAN.md and docs/product-quality.md. Read docs/science.md when the step changes a
behavior-change mechanism or makes a scientific claim, and docs/voice.md whenever it changes
user-facing copy. Do numbered step X.Y ONLY — nothing else.

Hard constraints (apply to every step, no exceptions):
1. Local-first, with optional network features: no account is required and, after the app shell loads,
   local-only mode makes no application-data requests and sends no user data. The complete core
   app, content, fonts, audio, and other assets bundle locally and work offline. A networked
   capability requires its own numbered step, separate feature-specific opt-in, a documented
   endpoint allowlist and exact data inventory, local-only regression coverage, and precise pause,
   export, and deletion semantics. No CDN/remote fonts, ads, tracking, default behavioral telemetry,
   or remote runtime assets. Optional diagnostics are separately planned, off by default, explicitly
   enabled, minimized, redacted, disclosed before enabling, and contain no behavioral analytics by
   default. Pausing a feature or signing out keeps a complete local copy unless the user explicitly
   removes it from that device.
2. Any change to persisted state bumps the schema version in src/store/useBloom.ts and adds a
   forward migration. Never wipe, orphan, or blindly overwrite existing user data.
3. Warm kawaii voice: the pet suggests and encourages — it never guilts, shames, or moralizes.
4. Respect the "Do NOT build" list in docs/science.md (no punitive streaks, no dead-pet outcomes,
   no "scientifically optimal cadence" claims, no always-on nudging, no dopamine-detox framing,
   no ADHD-treatment claims).
5. Feature skeletons may ship with clearly-marked placeholder copy (PLACEHOLDER_COPY comment);
   final wording lands in the designated copy-pass steps.

Evidence routing: behavioral mechanisms and scientific claims use docs/science.md; voice/copy uses
docs/voice.md; UX/UI, accessibility, privacy, security, reliability, performance, architecture, and
engineering quality use docs/product-quality.md. Ordinary engineering work may say Science: n/a;
never invent a behavioral rationale.

When done: tick only this step's checkbox in PLAN.md; run npm test and npm run build; verify in the
browser preview (npm run dev) plus every applicable docs/product-quality.md acceptance check; and
give me a short summary of what changed and how you verified it.

If blocked, report what you found. Minor implementation differences that preserve this unchecked
step's goal and scope may be reconciled by updating its assumptions, Files, and tests. STOP for user
direction when the difference materially changes product behavior, privacy, persisted data,
security, or the numbered step's scope. Never rewrite completed-step history.
```

Rules of thumb:

- Do exactly one numbered step per implementation run. Do steps in order **within** a phase; phases
  3, 4, 5 can be interleaved after Phase 2 is done, but respect the per-step "Depends on" lines.
- Every step must leave the app shippable (`npm test` and `npm run build` green, no relevant console
  errors) and meet the applicable product-quality acceptance criteria.
- If a step is too big for one run, split it in this file before implementation, then run only one
  of the resulting numbered steps.
- Completed numbered steps are historical records. Never uncheck, rename, or materially rewrite
  them. Apply new requirements prospectively by strengthening unchecked steps or adding a narrowly
  scoped remediation step when no unchecked step owns the gap.

> **Verification status (July 2026):** Checked boxes in Phases 0–5 show that their feature work was
> attempted and landed; they are not, by themselves, proof that the cross-feature behavior is
> complete. A full repository/UI review found lifecycle and integration gaps around auto-start,
> paused timers, cadence changes, session-owned metadata, return prompts, Flow rewards, persistence,
> and date rollover. Those closures are now explicit in 7.4 and Phase 8. Do not describe Phases 0–5
> as verified until those milestones pass. Phase 11 adds optional sync under the local-first
> constraint; it does not weaken any earlier offline, migration, lifecycle, or data-integrity gate.
> `docs/product-quality.md` was adopted prospectively in July 2026. No completed feature is presumed
> to meet that baseline until its relevant open remediation and verification steps pass.

---

## Evidence routing and non-behavioral product quality

- **Behavioral evidence:** `docs/science.md` governs behavior-change mechanisms and user-facing
  scientific claims, including evidence strength and the complete Do-not-build list.
- **Voice and copy:** `docs/voice.md` governs every user-visible string, including scientific
  hedging and non-shaming operational recovery copy.
- **Product quality:** `docs/product-quality.md` governs UX/UI, accessibility, semantics, keyboard,
  touch, screen readers, responsive layouts, safe areas, virtual keyboards, contrast, reduced
  motion, error prevention/recovery, loading/empty/offline/conflict/failure states, performance,
  privacy, security, browser/device verification, architecture changes, and regression testing.
- An unchecked non-behavioral step may use `Science: n/a` plus a `Quality:` citation. Tests,
  measurements, platform guidance, standards, and observed user behavior are legitimate evidence.
  Behavioral-science citations must never be fabricated to justify ordinary engineering work.

## Behavioral design principles (from docs/science.md)

- **Starting**: don't motivate harder — make the first action concrete, tiny, and cued (§Starting, closing paragraph).
- **Staying**: attention sag and mind-wandering are *expected*, not failure; manage fluctuation, don't pretend to eliminate it (§Staying, closing paragraph).
- **Recovering**: the highest-leverage moment is the minute *after* disruption — reduce residue, capture the thought, restore context, restart without shame (§Recovering, closing paragraph).
- **Measurement**: track a small number of behaviors well, reflect them back clearly, never moralize the metrics (§Measurement and motivation, closing paragraph).
- **The pet is the delivery vehicle, not the mechanism**: the timer and insights must work fully without pet care (§Prioritized feature ideas, closing paragraph; §Findings — gamification row).

---

## Phase 0 — Curate the research into build-ready form

### - [x] 0.1 Land the corrected research report as `docs/science.md`

- **Goal:** Commit the corrected report (verified citations, journal-of-record links, provenance notes) as the single in-repo source of truth. Add stable heading anchors (`#starting`, `#staying`, `#recovering`, `#measurement`, `#do-not-build`, `#article-briefs`, `#feature-ranking`) so later steps and code comments can deep-link to it.
- **Science:** The whole report; anchors specifically serve steps 2.4, 6.1 and the copy passes.
- **Files:** `docs/science.md` (new), `README.md` (one line pointing to it).
- **Done when:** File exists, renders cleanly in a markdown preview, every anchor listed above resolves, and the "Do NOT build" table is present verbatim.
- **Depends on:** nothing.

### - [x] 0.2 Distill a voice + guardrails guide as `docs/voice.md`

- **Goal:** A one-page writing guide every later copy step must follow: warm kawaii pet voice; suggests, never guilts; concrete examples of allowed vs. banned phrasings (banned: "you broke your streak", "science proves 25/5 is optimal", "your pet is sad because you failed"; allowed: "That happened. Smallest next step?"). Include the Do-NOT-build list as copy rules.
- **Science:** §Do not build (punitive streaks, extrinsic-control undermining intrinsic motivation — Deci et al. 1999, d ≈ −0.28 to −0.40); §Recovering — self-forgiveness row (Wohl 2010); §Measurement — supportive accountability row (Mohr 2011: benevolent, process-oriented, not controlling).
- **Files:** `docs/voice.md` (new).
- **Done when:** File exists with ≥8 allowed/banned phrase pairs and a checklist future copy steps can be linted against by hand.
- **Depends on:** 0.1.

---

## Phase 1 — Capture better per-session data

> Everything in Phases 2–6 explains itself *from the user's own data*. That data model is built here. This phase touches persisted state, so **every step bumps the schema version with a forward migration**.

### - [x] 1.1 Add the `SessionRecord` model and store slice

- **Goal:** New persisted slice `src/store/sessions.ts`: `SessionRecord { id, startedAt, endedAt, mode: 'focus'|'flow'|'tiny', plannedMin, actualMin, outcome: 'completed'|'abandoned'|'interrupted', startHour, taskId?, goalId?, driftEventIds: string[], targetText? }`. Ring-buffer cap (e.g., last 500 records) to bound localStorage. Bump schema version; migration initializes an empty array for existing users.
- **Science:** §Measurement — progress monitoring row (Harkin et al. 2016: monitoring works best when behavior is *actually recorded*; goal attainment d = 0.40, trim-and-fill d = 0.19).
- **Files:** `src/store/sessions.ts` (new), `src/store/useBloom.ts` (schema version + migration).
- **Done when:** Fresh app and migrated app both boot with the slice present; a manual localStorage inspection shows the new version; no existing keys lost.
- **Depends on:** nothing (can run parallel to Phase 0).

### - [x] 1.2 Write records from the timer lifecycle

- **Goal:** FocusScreen/timer store creates a record at session start and finalizes it on complete/abandon (app close mid-session finalizes as `interrupted` on next boot via a stale-open-record sweep). Flow timer records `mode:'flow'` with `plannedMin` null-equivalent.
- **Science:** Same as 1.1 — recording must be automatic, not self-report, to be reliable.
- **Files:** timer store, `FocusScreen.tsx`, `src/store/sessions.ts`.
- **Done when:** Completing, abandoning, and force-closing mid-session each produce exactly one correctly-shaped record (verify via devtools).
- **Depends on:** 1.1.

### - [x] 1.3 Link Companion drift events to the active session

- **Goal:** When Companion Mode logs a drift/tab-away, stamp it with the active `sessionId`; append the event id to the session's `driftEventIds`. Backfill is impossible — migration just leaves old events unlinked and code treats `sessionId` as optional.
- **Science:** §Staying — mind-wandering row (Zanesco et al. 2024: wandering increases over time-on-task; the report says track *when in the session* drifts occur — early/mid/late — which you already tag; this step ties that tag to session outcomes).
- **Files:** `src/store/companion.ts`, `src/store/sessions.ts`, schema bump + migration.
- **Done when:** A drift triaged during a session appears in that session's `driftEventIds`; drifts outside sessions remain valid with no sessionId.
- **Depends on:** 1.2.

### - [x] 1.4 Pure stats selectors + unit tests

- **Goal:** `src/store/sessionStats.ts` with pure functions over records: `completionRateByPlannedLength()`, `completionRateByStartHour()`, `driftPhaseDistribution()`, `medianMinutesToFirstDrift()`, `abandonStreakInfo()` (recent consecutive abandons — feeds 3.5), plus a `hasEnoughSignal(n)` guard mirroring the one in `computeAttentionPlan()`. Vitest coverage with synthetic fixtures.
- **Science:** §Measurement — feedback row (Krukowski 2024: keep feedback simple and low-frequency → a small set of well-tested stats, not a metrics zoo).
- **Files:** `src/store/sessionStats.ts` (new), `src/store/sessionStats.test.ts` (new).
- **Done when:** All selectors covered by tests including empty/low-data cases; `npm test` green.
- **Depends on:** 1.3.

### - [x] 1.5 Patient check-ins + user-estimated drift onset

- **Goal:** Three changes to Companion check-ins (`useCompanion.ts`). **(a)** Stop auto-dismissing the check-in after 5 s (`CHECKIN_AUTODISMISS_MS`): while the session is running and the user is present, the prompt stays visible (small, non-blocking) until answered. It still withdraws on pause/end/tab-away; a session that ends with it unanswered logs `kind:'skip'` as today, and the "never show two in a row after a skip" rule is kept. **(b)** Record both timestamps on events: `shownAt` (popup time) and `ts` (answer time — answered events already stamp this; keep it) so time-to-answer is analyzable. Keep `min` anchored to shownAt for phase analysis. **(c)** When the user answers "I drifted", after the kind-triage add one optional "since when?" step (chips: *just now · ~5 min · ~10 min · custom*), stored as `estOnsetMin`. Clamp: the estimated onset can never be earlier than the most recent event answered `focused` in this session (or session start if none) — the user's judgment decides *within* that window. Stats selectors (1.4) and insights (2.x) prefer `estOnsetMin` when present, falling back to `min`.
- **Science:** §Measurement — progress monitoring row (recording must be trustworthy: an unanswered 5-second flash under-records real drifts as `skip`); §Staying — mind-wandering row (drift *onset*, not detection time, is the meaningful signal). Onset is inherently self-report — label it an estimate in copy, never fake precision.
- **Files:** `src/store/useCompanion.ts`, `src/store/companion.ts` (event shape; old events without the new fields must still parse), `src/components/CompanionPrompt.tsx`, `src/store/sessionStats.ts`.
- **Done when:** Check-in persists until answered while user is present; pause/end/away still withdraws it; drift-onset estimate is clamped to [last focused answer, now]; time-to-answer is derivable from stored events; legacy events load unchanged.
- **Depends on:** 1.3.

---

## Phase 2 — Insights that explain WHY

### - [x] 2.1 Post-session debrief card (skeleton)

- **Goal:** After a session ends (complete or abandon), FocusScreen shows a dismissible debrief card: planned vs. actual, drift count with early/mid/late chips, outcome — and one slot for a "why" sentence (placeholder for now). Never shown mid-session. Pet delivers it via CompanionPrompt tone, not a modal wall.
- **Science:** §Measurement — progress monitoring row (Harkin 2016: visible recording of behavior, d = 0.40); §Measurement closing paragraph (reflect back clearly, don't moralize).
- **Files:** `src/components/DebriefCard.tsx` (new), `FocusScreen.tsx`.
- **Done when:** Card renders with real record data after any session end; dismisses cleanly; nothing renders while a timer runs.
- **Depends on:** 1.4.

### - [x] 2.2 Rule-based "why" engine for the debrief

- **Goal:** `src/insights/why.ts`: pure function mapping (this session's record + user's aggregate stats) → one explanatory sentence with a cause, e.g. "Both drifts were late-session — attention naturally sags with time on task; a slightly shorter block might fit this task." Each rule returns `{ text, evidenceKey }` where `evidenceKey` points at a science.md anchor / future guide article. Cap: exactly one insight per debrief; a neutral fallback when signal is thin.
- **Science:** §Staying — time-on-task row (vigilance decrement is expected, "prompt before the slump, not after"); §Staying — mind-wandering row; §Recovering — self-forgiveness row (abandoned-session copy must be kind-restart framed, never streak-framed).
- **Files:** `src/insights/why.ts` (new + tests), `DebriefCard.tsx`.
- **Done when:** ≥6 rules with unit tests (late-drift pattern, short-session success, golden-hour match, abandon-kindness, first-drift-timing, low-signal fallback); every rule's copy passes a manual check against `docs/voice.md`.
- **Depends on:** 2.1, 0.2.

### - [x] 2.3 Weekly review card

- **Goal:** A once-per-week card (surfaced on FocusScreen when idle, and from Settings on demand) answering exactly two questions from the data: "What helped you start?" and "What helped you recover?" — plus one suggested experiment for next week. Small numbers, no judgment words, no red/failure styling.
- **Science:** §Measurement — article brief "Why tracking helps and when it turns into pressure" (review with only those two questions, skip judgment); §Measurement — feedback row (simple, low-frequency beats over-engineered dashboards).
- **Files:** `src/components/WeeklyReview.tsx` (new), `src/insights/weekly.ts` (new + tests), FocusScreen, SettingsSheet.
- **Done when:** With ≥5 sessions of fixture data the card shows both answers + one experiment; with less it shows an encouraging "still learning your patterns" state; appears at most once per calendar week automatically.
- **Depends on:** 2.2.

### - [x] 2.4 Make the attention recipe explainable

- **Goal:** Extend `computeAttentionPlan()` so every recommendation carries `{ because: string, evidenceKey: string }` — the *because* cites the user's own numbers ("62% of your drifts are rabbit-holes, mostly mid-session"), the *evidenceKey* links the science (rendered as a tappable "why?" that later deep-links to a guide article after 6.3; until then it opens a plain explainer sheet). No recommendation may appear without a because.
- **Science:** §Measurement — JITAI row (adaptation must be transparent and explainable, not opaque over-personalization); §Prioritized feature ideas rank 8 (pattern-aware reflection).
- **Files:** `src/store/companion.ts` (computeAttentionPlan), focus-patterns card component, `src/insights/why.ts` (shared evidence keys).
- **Done when:** Every rendered recipe line shows its because-sentence; evidence keys resolve; unit tests updated.
- **Depends on:** 2.2.

---

## Phase 3 — STARTING features

> Report ranking: if Bloom does only three things for starting, they are pre-session if–then plans, a tiny-start mode, and a friction-removing ritual (§Starting, closing paragraph).

### - [x] 3.1 If–then plan data model

- **Goal:** Persisted slice for implementation intentions: `IfThenPlan { id, cueType: 'time'|'place'|'emotion'|'obstacle', cueText, actionText, taskId?, usageCount, lastUsedAt }`. Ships with 4 fill-in templates (one per cue type, e.g. "If it's __:__ , then I open ____ and write one ugly sentence"). Schema bump + migration. No UI yet beyond a hidden dev list.
- **Science:** §Starting — implementation intentions row (Gollwitzer & Sheeran 2006 meta-analysis: overall d = 0.65; specifically for failures-to-get-started d = 0.61 — the single best evidence-to-complexity ratio in the report, feature rank #1).
- **Files:** `src/store/ifThen.ts` (new), `src/store/useBloom.ts` (version + migration).
- **Done when:** Slice persists and migrates; templates load; tests for CRUD.
- **Depends on:** Phase 1 complete (records will later log which plan a session used).

### - [x] 3.2 Pre-session if–then planner UI

- **Goal:** Optional one-line step on FocusScreen before starting: pick a saved plan or fill a template (cue + action), skippable with one tap, remembered per task. Session record stores the planId used. Pet frames it as "what's our opening move?" — never as a requirement.
- **Science:** Same as 3.1; §Starting — procrastination-as-mood-regulation row (Sirois & Pychyl 2013: reduce the felt cost of the first two minutes; avoid "be more disciplined" framing).
- **Files:** `src/components/IfThenPlanner.tsx` (new), `FocusScreen.tsx`, `src/store/sessions.ts` (add `ifThenPlanId?` — version bump).
- **Done when:** Full flow works: pick/fill → start session → record links planId; skipping is one tap; zero friction added for users who ignore it.
- **Depends on:** 3.1.

### - [x] 3.3 Tiny-start mode

- **Goal:** A third start option beside focus/flow: a 2- or 5-minute "tiny start". When it completes, the pet offers (never insists) the next rung: "keep going for 10?" — accepting extends seamlessly without a break; declining still counts as a *completed* session and earns normal warmth. Records use `mode:'tiny'`.
- **Science:** §Starting — micro-commitments row (Felkey, Dziadula & Chiang 2023, *Southern Economic Journal* 90(2): students with microcommitments ~2× as likely to engage; marginal effect largest for high procrastinators; report grades this *promising, not settled* — so copy must not oversell); §Starting — article brief "Use a tiny start without lying to yourself" (the ladder: 2 min → 10 min → full session).
- **Files:** timer store, `FocusScreen.tsx`, `src/store/sessions.ts`, XP logic (tiny sessions earn proportional XP — never zero, never penalized).
- **Done when:** Tiny session runs, completes, optionally extends up the ladder; a declined extension still records `completed`; streak/XP treat it as a real session.
- **Depends on:** 1.2.

### - [x] 3.4 Environment reset ritual card

- **Goal:** Optional 15–30-second pre-session checklist card: *phone away · task named · first action named · distracting tabs closed* — user-editable items, persisted; a single satisfying tap-through, then straight into the timer. Off by default; discoverable in Settings and via a one-time gentle pet suggestion.
- **Science:** §Starting — pre-work ritual row (Sonnentag & Kühnel 2016: morning reattachment predicts day-level engagement; Ward et al. 2017: mere phone presence taxes cognition — friction reduction, not motivation speeches); feature rank #7.
- **Files:** `src/components/RitualCard.tsx` (new), `src/store/ritual.ts` (new, version bump), SettingsSheet, FocusScreen.
- **Done when:** Toggle in Settings; when on, card precedes session start and is completable in <30s; items editable; skippable.
- **Depends on:** 1.2.

### - [x] 3.5 WOOP script for repeated start-failures (conditional, gentle)

- **Goal:** If `abandonStreakInfo()` shows ≥3 recent abandons/failed starts, the pet offers — once, dismissible, never repeated within 7 days — a 60-second guided WOOP card: Wish → Outcome → Obstacle → Plan (the Plan step reuses the if–then planner). Entirely optional.
- **Science:** §Starting — mental contrasting row (Wang et al. 2021 meta-analysis: MCII g = 0.336 overall; guided delivery g = 0.465 vs. document-only g = 0.277 — hence a *guided, stepwise* card rather than a text dump); the trigger design respects §Do not build — always-on nudging (low-frequency, explainable).
- **Files:** `src/components/WoopCard.tsx` (new), `src/insights/triggers.ts` (new), `src/store/sessionStats.ts`.
- **Done when:** Fires only on the stat trigger, at most once/7 days, links into 3.2's planner; trigger logic unit-tested.
- **Depends on:** 3.2, 1.4.

---

## Phase 4 — STAYING features

### - [x] 4.1 Adaptive cadence suggestions (never "optimal cadence" claims)

- **Goal:** Keep 25/5 as default. In the attention recipe / weekly review, suggest *experiments* grounded in the user's data: e.g. if median-first-drift ≈ 18 min → "try a 20/5 week"; if long sessions complete fine → offer 40/8 or 50/10. Copy always frames cadence as personal experiment ("compare distraction tags and finish rates, not vibes"), never as science-proven.
- **Science:** §Staying — breaks row (Albulescu et al. 2022 meta-analysis: breaks help; no universally best cadence); §Staying — 25/5 myth row + §Do not build rows on 25/5, 52/17 and 90-minute ultradian claims; §Staying — article brief "Breaks are fuel, not failure" (the two-cadence A/B exercise).
- **Files:** `src/insights/cadence.ts` (new + tests), recipe card, `WeeklyReview.tsx`, timer presets.
- **Done when:** Suggestions derive from real stats with a low-signal fallback; one-tap applies the suggested preset; no copy anywhere claims a cadence is scientifically optimal (grep check).
- **Depends on:** 2.4, 1.4.

### - [x] 4.2 Session target field ("one specific doable thing")

- **Goal:** Optional single-line target when starting ("outline the intro section"), shown quietly during the session and echoed in the debrief ("target: outline the intro — done?"), stored on the record (`targetText`). This is the flow lever: clear goal + immediate feedback.
- **Science:** §Staying — flow row (Fong et al. 2015: challenge–skill balance moderately predicts flow; clear goals and immediate feedback are the actionable antecedents); §Staying — article brief "What flow really needs" (hard enough to matter, small enough to finish in the block).
- **Files:** `FocusScreen.tsx`, `src/store/sessions.ts` (already has `targetText` from 1.1 — wire it), `DebriefCard.tsx`.
- **Done when:** Target set → visible mid-session → debrief asks about it (self-report tap: done / partly / no, stored on record); fully skippable.
- **Depends on:** 2.1.

### - [x] 4.3 Honest soundscape labeling

- **Goal:** Audit the Web-Audio soundscapes: no autoplay ever; each ambient option gets an honest one-line label (e.g. rain/noise: "often better for brainstorming than dense reading"); Settings gains a short "sound & focus" note linking the guide's music article (link activates after 6.3). Since all audio is synthesized there are no lyrics — the guide article carries the lyrics warning for users' own external music.
- **Science:** §Staying — background music row (Cheah et al. 2022 systematic review: effects roughly null on average, masking task/person differences; lyrics often hurt language tasks); §Staying — ambient noise row (Mehta et al. 2012: ~70 dB moderate noise helped creative tasks, 85 dB hurt); §Do not build — forced soundtracks.
- **Files:** sound settings UI, `SettingsSheet.tsx`.
- **Done when:** No autoplay path exists; every soundscape shows its label; copy passes voice.md check.
- **Depends on:** 0.2.

### - [x] 4.4 Chronotype self-tag

- **Goal:** Settings question: "When are you usually sharpest?" → `betterEarlier | betterLater | notSure` (persisted, version bump). Feeds golden/foggy-hours logic as a prior blended with observed `completionRateByStartHour()`, and shapes expectation copy ("evening types fighting 8 a.m. analysis is normal, not weakness").
- **Science:** §Staying — chronotype row (May & Hasher 2023 integrative review: synchrony effects strongest for analytical work and distraction suppression, especially in strong morning/evening types).
- **Files:** `SettingsSheet.tsx`, `src/store/useBloom.ts` (version bump), `src/store/companion.ts` (golden-hours blend).
- **Done when:** Tag persists and migrates; recipe's golden-hours line cites both the tag and observed data in its because-sentence.
- **Depends on:** 2.4.

### - [x] 4.5 Pre-slump gentle check (opt-in, strictly capped)

- **Goal:** Opt-in (default OFF): if the user's data shows a typical first-drift time (e.g. ~min 18), the pet gives one soft, non-blocking breath/stretch cue shortly *before* that point — max once per session, max twice per day, one tap to silence for the day, and the toggle explains exactly why it fires ("based on when your drifts usually start").
- **Science:** §Staying — time-on-task row ("prompt users before the likely slump, not after"); §Measurement — JITAI row (Wang & Miller 2020: promising but heterogeneous; report verdict: *conservative, low-burden, transparent rule engine only*); hard guard from §Do not build — always-on nudging.
- **Files:** `src/insights/triggers.ts`, timer store, `CompanionPrompt`, SettingsSheet.
- **Done when:** Fires only when opted in, only with sufficient signal, respects both caps; the explanation string is visible in Settings; trigger unit-tested.
- **Depends on:** 1.4, 2.4.

### - [x] 4.6 Learned personal cadence: a starting ratio that grows with you

- **Goal:** Turn 4.1's one-off experiment suggestions into a continuously-learned *personal starting point*. `suggestPersonalCadence()` in `src/insights/cadence.ts` blends the user's own signals — `medianMinutesToFirstDrift()`, `completionRateByPlannedLength()`, `driftPhaseDistribution()`, and the 4.4 chronotype tag — into one recommended focus/break pair (e.g. drifts cluster at ~min 16 → start at 15/4; long sessions complete cleanly → current fit is 40/8), always with a `{ because, evidenceKey }` per 2.4. Include a **stretch ladder**: when the user completes ≥ ~80% of sessions at their current length over a rolling window, offer (never auto-apply) the next rung up (+5 min focus, break scaled ~1:5), so the ratio grows as their attention does; a rough patch quietly re-offers a shorter rung with kind, no-failure framing. Recommendation recomputes at most weekly, surfaces only at natural pauses (weekly review, recipe card, settings), one-tap apply, one-tap back to any previous rung. With thin data the answer is always "25/5 is a lovely starting point while I learn your rhythm" (PLACEHOLDER_COPY until the copy pass). Copy rule, greppable in the done-check: the app may say "best fit *for you right now*" and "an experiment" — never "optimal", "ideal", or "what science recommends".
- **Science:** §Staying — breaks row (Albulescu et al. 2022: breaks help, *no universally best cadence* — which is exactly why a personal, data-derived fit is honest where a universal claim would not be); §Staying — time-on-task + mind-wandering rows (Zanesco et al. 2024: drift timing is the signal to fit session length to); §Staying — chronotype row (May & Hasher 2023, as a prior); §Measurement — JITAI row (transparent, low-burden rule engine; recompute weekly, not per-session); §Do not build — the 25/5-optimal, 52/17 and ultradian rows (hard guardrail on the copy).
- **Files:** `src/insights/cadence.ts` (+ tests), `WeeklyReview.tsx`, recipe card, `SettingsSheet.tsx`, timer presets.
- **Done when:** With fixture data the recommendation, its because-sentence, and the stretch/shrink rungs are all derived from the user's own numbers; applying and reverting are one tap each; low-signal state recommends 25/5 with the learning framing; unit tests cover drift-timing fit, stretch trigger, rough-patch shrink, and low-signal; grep for "optimal|ideal|science recommends|scientifically" over user-facing strings returns clean.
- **Depends on:** 4.1, 4.4, 1.4, 2.4.

---

## Phase 5 — RECOVERY features

> The report's core recovery claim: most focus apps stop at timer logic, but the decisive moment is the minute after disruption — reduce residue, capture the thought, restore context, restart without shame (§Recovering, closing paragraph).

### - [x] 5.1 Distraction parking lot

- **Goal:** During a session, a one-tap "park it 🌱" affordance opens a tiny 5-word input; the thought disappears from view and *returns at the next break or session end* (never immediately — that would just be a todo list). Parked items persist (version bump) and can be sent to Tasks or dismissed. Copy frames it as an experiment, not a proven fix.
- **Science:** §Recovering — cognitive offloading row (Risko & Gilbert 2016; Scullin et al. 2018: writing specific to-dos reduced mental carryover; report explicitly grades direct focus-session evidence as *indirect* → honest experimental framing required); feature rank #4; article brief "Use a parking lot for urge-to-check thoughts".
- **Files:** `src/components/ParkingLot.tsx` (new), `src/store/parking.ts` (new, version bump), `FocusScreen.tsx`, break screen.
- **Done when:** Park mid-session (≤2 taps + typing) → item hidden → resurfaces at break/end → send-to-task and dismiss both work; drift log optionally records that a park happened instead of a full drift.
- **Depends on:** 1.3.

### - [x] 5.2 Resume cue card + honest tab-return

- **Goal:** When Companion Mode detects a tab-away/drift and the user returns, show a small re-entry card *before* the ticking timer regains focus: last parked note (if any) · current session target (4.2) · "next concrete action" (one line the user typed at start or mid-session). One tap resumes. Also offered when reopening the app onto an `interrupted` session. **Honest tab-return (adapted from Friction Journal's Focus Guard):** on tab-leave during a running session, capture a timer snapshot (elapsed, remaining, mode, Pomodoro round, session id) onto the session record. If the gap was meaningful (≥ ~45 s — short blips never ask), the re-entry card adds one gentle question with three answers: **"I kept working"** (gap counts as focus), **"I drifted"** (gap logs as a drift event on the session and flows into the normal two-tap triage), or **"pause it back"** (timer restores to the exact snapshot and the gap never enters the focus record). The pending question and snapshot persist, so a reload mid-question resumes it without inventing a second gap; repeated leaves in one session re-capture cleanly.
- **Science:** §Recovering — attention residue row (Leroy 2009: residue from the prior focus impairs the next task) and resumption cues row (Altmann & Trafton 2004: first post-interruption action ~3.8 s vs 1.9 s baseline; external cues available at resumption reduce the lag — lab-only but highly actionable); feature rank #3 ("best science-backed recovery mechanic"). For the tab-return question: §Measurement — progress monitoring row (Harkin 2016 — the wall-clock timer silently counts away-time as focus, feeding false records into every 2.x insight; asking at the moment of return keeps the record honest while the truth is fresh — the same integrity rule as 9.5, applied live instead of repaired later). The answer is user-controlled self-report, never inferred surveillance; a "drifted" answer is data, not failure (§Recovering — self-forgiveness row, Wohl 2010), and the copy must pass docs/voice.md.
- **Files:** `src/components/ResumeCue.tsx` (new), `src/store/companion.ts` (return detection hook), `FocusScreen.tsx`, timer store + `src/store/sessions.ts` (snapshot fields on the record — version bump + migration).
- **Done when:** Tab-away → return shows the card populated from real state; one tap resumes; never appears when nothing was interrupted. Snapshot round-trip verified: "pause it back" restores the exact remaining time and excludes the gap from the record; "I drifted" produces exactly one drift event linked to the session; blips under the threshold never prompt; reload mid-question resumes without double-counting; unit tests cover multiple leaves in one session.
- **Depends on:** 4.2, 5.1.
- **Audit follow-up (July 2026):** The immediate integrity closure has landed: Tiny follows Focus's
  countdown return policy; Flow is explicitly excluded in a tested policy helper; and “I drifted” is
  persisted and linked before optional triage, whose answer updates that same event. A skipped or
  reloaded triage therefore retains exactly one unclassified drift. 8.17 still owns the unified
  surface coordinator, modal truth-decision behavior, and the final user-facing Flow decision.

### - [x] 5.3 Kind-restart micro-intervention

- **Goal:** After an abandoned session or a triaged drift, the pet offers an optional 30–60 s reset: one synthesized breath cycle (Web Audio swell, no assets) → "Noted. Next step is ___?" (one line) → resume/tiny-start button. Never auto-plays; always one tap to skip.
- **Science:** §Recovering — self-forgiveness row (Wohl et al. 2010: self-forgiveness after procrastinating predicted *less* future procrastination; Sirois 2014: self-compassion moderately negatively associated with procrastination); mindfulness row (Verhaeghen 2021: attention gains real but modest, g ≈ 0.29 → keep it short and optional, no meditation-app scope creep); feature rank #6; article brief "After distraction, don't make it worse".
- **Files:** `src/components/KindRestart.tsx` (new), Web Audio synth module, `DebriefCard.tsx` (abandon path), `CompanionPrompt`.
- **Done when:** Offered after abandon + after drift triage; full flow ≤60 s; skip is one tap; the typed next step pre-fills 5.2's resume cue.
- **Depends on:** 2.2, 5.2.

### - [x] 5.4 Soften the streak

- **Goal:** Rework streak presentation to consistency-over-months framing: no loss animation, no guilt copy, no pet sadness tied to missed days. Add a "gentle streak" mechanic (e.g., one free rest day per week that doesn't break it, and a "come back" state that celebrates returning rather than mourning the gap). Persisted streak data migrates losslessly.
- **Science:** §Measurement — habit formation row (Lally et al. 2010: median 66 days to automaticity, range 18–254 → "consistency over months, not 21 days"); §Do not build — punitive streak loss / dead-pet outcomes (guilt and loss-aversion mechanics increase pressure and post-setback avoidance; Deci et al. 1999 on extrinsic control undermining intrinsic motivation); §Measurement — supportive accountability row (coach, not boss).
- **Files:** streak logic in `src/store/useBloom.ts` (version bump + migration), streak UI, pet reaction states.
- **Done when:** Missing a day produces neutral-to-warm copy only; rest-day rule works and is explained in Settings; no red/broken/skull styling anywhere (grep + visual pass); old streak counts survive migration.
- **Depends on:** 0.2.

---

## Phase 6 — The Field Guide (~12 cited articles, contextually surfaced)

### - [x] 6.1 Guide content model + bundled data

- **Goal:** `src/content/guide.ts`: typed array of 12 articles matching the report's in-app briefs — id, `stageTag: 'start'|'stay'|'recover'|'science'`, title, 3–5 key-point paragraphs, one practical exercise, and a `sources` array of citation strings (author-year-journal; no external links required at runtime, so the Guide stays bundled and works in local-only/offline mode — full references live in docs/science.md). Bodies may be PLACEHOLDER_COPY. The 12: first pebble · if-then beats try harder · tiny start · make your desk help you · attention naturally fades · breaks are fuel · what flow needs · music & lyrics · don't make it worse · parking lot · one-minute re-entry · why tracking helps.
- **Science:** §In-app article briefs (all twelve, verbatim structure: stage tag, key points, practical exercise, sources).
- **Files:** `src/content/guide.ts` (new), `src/content/guide.test.ts` (shape validation).
- **Done when:** All 12 entries type-check, each has ≥1 source string and one exercise; a test asserts ids are unique and every `evidenceKey` used by `src/insights/*` maps to a real article.
- **Depends on:** 0.1; ideally after 2.2 so evidence keys exist to map.

### - [x] 6.2 Guide reading UI

- **Goal:** A "Field Guide" section (inside CollectionScreen or a light new screen — follow existing nav patterns): browse by stage tag, read view with title/body/exercise/sources, read-state persisted (version bump) so the pet can suggest unread ones. Calm typography; an article is a 2-minute read.
- **Science:** §Measurement closing paragraph (reflect clearly, don't gamify knowledge — no points for reading).
- **Files:** `src/components/GuideScreen.tsx` (new) or CollectionScreen section, `src/store/guide.ts` (read-state, version bump), navigation.
- **Done when:** All 12 articles browsable and readable offline; read-state persists and migrates.
- **Depends on:** 6.1.

### - [x] 6.3 Contextual surfacing rules

- **Goal:** `src/insights/surfacing.ts`: pure ruleset mapping moments → article suggestions, rendered only at natural pauses (debrief, break, weekly review, recipe "why?" links) — **never during a running session**. Mappings: rabbit-hole drift → parking-lot article; urge → parking lot; wander → attention-fades; restless → breaks-are-fuel; external → re-entry ritual; repeated abandons → first-pebble/tiny-start; recipe lines → their evidenceKey article. Caps: ≤1 suggestion per debrief, ≤3 per week, never repeat a read article within 30 days.
- **Science:** §Measurement — JITAI row (conservative, transparent, low-burden); §Do not build — always-on nudging; §Staying — the drift-kind taxonomy the report endorses for Bloom's tags.
- **Files:** `src/insights/surfacing.ts` (new + tests), `DebriefCard.tsx`, `WeeklyReview.tsx`, recipe card, `CompanionPrompt`.
- **Done when:** Every mapping unit-tested; caps enforced in tests; manual check confirms zero surfacing paths during an active timer; 2.4's "why?" links now deep-link into the guide.
- **Depends on:** 6.2, 2.4, and the drift taxonomy from `companion.ts`.

### - [x] 6.4 Guide copy pass (final wording)

- **Goal:** Replace all PLACEHOLDER_COPY in the 12 articles with final prose written from §In-app article briefs: warm kawaii pet voice per docs/voice.md, honest hedging preserved exactly where the report hedges ("evidence is promising, but most direct studies are in education contexts"), citations kept accurate to docs/science.md.
- **Science:** §In-app article briefs (source text); §Do not build (banned claims checklist); docs/voice.md.
- **Files:** `src/content/guide.ts`.
- **Done when:** No PLACEHOLDER_COPY remains in guide content (grep); spot-check 3 articles against the report's briefs for factual fidelity; every hedge in the briefs survives in the copy.
- **Depends on:** 6.1, 0.2.

---

## Phase 7 — Fast local browser milestone

> **Current delivery scope:** Finish a locally verifiable browser build first. Android/iOS
> packaging, physical-device evidence, app-store work, release tags, Cloudflare deployment, and
> deployed/installed-PWA offline proof are not gates for this milestone. Bloom's local-first
> privacy boundary still applies: the browser build must not send application data or load remote
> runtime assets. Post-milestone work remains listed below so it is deferred honestly rather than
> silently treated as complete.

### - [x] 7.1 Migration test suite

- **Goal:** Vitest suite with a localStorage fixture for *every* schema version shipped during this plan; each fixture runs the full forward-migration chain to latest and asserts: no key loss, streak/XP/pets/tasks/goals intact, new slices initialized. Add a CI-friendly `npm run test:migrations`. **Audit note (July 2026):** the Companion event log persists under its *own* localStorage key with an independent internal version (`LOG_KEY` in `src/store/companion.ts`), outside the main versioned blob — fixtures must cover that key too, or the suite proves less than constraint #2 requires.
- **Science:** Constraint #2 made mechanically enforceable — insight features are worthless if they eat the data they explain (§Measurement — monitoring requires trustworthy records).
- **Files:** `src/store/migrations.test.ts` (new), fixtures dir.
- **Done when:** One fixture per version; suite green; intentionally corrupting a fixture fails the suite (verified once, then reverted).
- **Depends on:** all schema-bumping steps (1.1–6.2).

### - [ ] 7.2 Local-only browser privacy audit

- **Goal:** Prove the fast browser build is local-only: grep the bundle/source for `fetch(`,
  `XMLHttpRequest`, `WebSocket`, and external URLs in `src/`; verify guide content, fonts, images,
  audio, and other runtime assets are bundled locally; inspect a production preview with every
  optional network feature and diagnostic reporter absent or disabled. Enabled network
  capabilities are audited only in their own numbered release steps against their allowlist and
  data inventory.
- **Science:** n/a — privacy and release verification.
- **Quality:** `docs/product-quality.md` — Privacy and security; Browser verification.
- **Files:** none (audit) or a small `scripts/offline-audit.sh`.
- **Done when:** Source and built-output audits find no unapproved network API or remote runtime
  asset; a production-preview smoke over the core screens makes zero application-data requests and
  sends zero user data after the app shell loads. Self-hosted app-shell delivery and service-worker
  update checks are not user-data egress. This milestone does not claim deployed-web or installed-PWA
  offline support; that proof remains in deferred step 8.15.
- **Depends on:** Phases 1–6 and 8.10. Re-run the local-only pass in the release step for each later
  optional network capability.

### - [x] 7.3 Voice & do-not-build copy audit

- **Goal:** Sweep every user-facing string added by this plan against docs/voice.md and §Do not build: no guilt, no shame, no "scientifically optimal", no dead-pet/loss framing, no ADHD-treatment implications (the report's approved boundary sentence — "some people, including some people with ADHD, may find shorter steps and stronger external cues helpful; this app is not medical advice" — may appear in the guide's science article only). Fix violations in the same session.
- **Science:** §Do not build (entire table); §Recovering — self-forgiveness row; docs/voice.md.
- **Files:** any component with copy; `docs/voice.md` (append a "audited on <date>" note).
- **Done when:** Grep list of banned phrases returns clean; a read-through of every new card/screen in the preview passes the voice checklist.
- **Depends on:** 6.4 and all feature phases.

### - [x] 7.4 Timer/session lifecycle invariant suite

- **Goal:** Add executable integration coverage at the reducer/hook boundary instead of relying on
  isolated selector tests and manual localStorage inspection. Cover every work-session entry and
  exit path, with time controlled deterministically. Required invariants: (a) break completion with
  auto-start opens exactly one Focus record before running; (b) changing an unrelated setting while
  Focus/Tiny is paused preserves the exact remaining time; (c) applying a cadence while idle updates
  the next countdown, while an open session keeps its start-time duration; (d) the session owns its
  task id, target, and planned duration even if global selection/settings change mid-run; (e) break
  completion advances round/mode once and never writes a work record; (f) Flow's displayed bank
  preview uses the same rounding rule as the reducer reward, and a short intentionally finished Flow
  session follows the documented streak/XP/task policy; (g) every completed, abandoned, interrupted,
  returned, and auto-started work session finalizes at most once. Add focused component/hook tests for
  the controls that dispatch these transitions; pure helper tests alone do not satisfy this step.
- **Files:** timer reducer extraction or exported test seam from `src/store/useBloom.ts`, hook/component
  tests for `FocusScreen.tsx`, deterministic clock/localStorage fixtures, Vitest config.
- **Done when:** Each invariant has a regression test that fails against its pre-fix behavior and
  passes after the closure; tests exercise Focus, Tiny, Flow, short/long breaks, auto-start, pause,
  settings/cadence edits, task changes, reload, and repeated completion dispatches; no React timing
  warning is ignored; `npm test` and `npm run build` are green.
- **Depends on:** Phase 1 timer/session work. Land the deterministic harness first; every relevant
  Phase 8 closure must add its regression to this suite, and the full suite must pass before release QA.
- **Closed (July 2026):** The deterministic reducer seam now covers Focus, Tiny, Flow, short/long
  breaks, auto-start, pause, settings/cadence/task changes, every exit outcome, return-at-zero races,
  reload sweeps, and repeated finalization. Flow preview/reward share one rounding helper. Real
  `useBloom` + `FocusScreen` tests exercise Start/Pause/Reset, Tiny/Skip, Flow/Finish, return pause,
  and interrupted-session resume controls with deterministic clocks and localStorage.

### - [ ] 7.5 Fast browser QA handoff

- **Goal:** Write `docs/qa.md` with a 10-minute golden-path smoke (ritual → if-then → tiny start →
  grow → drift → park → resume cue → complete → debrief → guide link → weekly review) and a compact
  browser matrix covering keyboard, focus, accessible names, narrow/short viewports, both themes,
  zoom, reduced motion, empty/error/recovery states, and measured startup/interaction performance.
  Run the smoke against a local production preview. Android/iOS packaging, APK/IPA builds, physical
  devices, airplane-mode device checks, upgrade installs, deployment, store submission, and release
  tagging are explicitly outside this milestone.
- **Science:** n/a — accessibility, reliability, and browser verification.
- **Quality:** `docs/product-quality.md` — applicable browser, accessibility, responsive, and
  performance acceptance sections.
- **Files:** `docs/qa.md` (new; link any automated-test guidance that already exists).
- **Done when:** The golden path passes on a local production preview at desktop and 320×568 browser
  viewports; keyboard-only navigation, visible focus, essential accessible names, 200% zoom/reflow,
  both themes, and reduced motion are recorded; `npm run lint` when available, `npm test`,
  `npm run build`, and `git diff --check` are green. Deferred device, deployment, exhaustive visual
  baseline, and installed-offline evidence are listed as deferred, not recorded as passes.
- **Depends on:** 7.1–7.4 and only the Phase 8 fixes exercised by the golden path. Deferred steps
  8.15 and 8.21 do not block this milestone.

---

## Phase 8 — Remediation from the external delivery review (July 2026)

> An external review audited the shipped app. The findings below were verified against this codebase and are real. Steps are independent of Phases 1–7 unless noted; each is one session. Every open remediation step applies the relevant acceptance criteria in `docs/product-quality.md`; use `Science: n/a` unless the step actually changes a behavior-change mechanism or scientific claim. Completed features do not satisfy the new baseline until their relevant remediation and verification steps pass.

### - [x] 8.1 Real submit button on the task add row

- **Goal:** The `+` in the add form is a decorative `<span>` (`TasksScreen.tsx` ~line 200); adding relies on implicit keyboard submit, so touch/mouse users have no visible way to add. Make it a labelled `<button type="submit">`, disabled when the input is blank, with a brief added acknowledgement.
- **Files:** `src/screens/TasksScreen.tsx`, `src/styles.css`.
- **Done when:** Tapping + adds the task; blank input disables it; keyboard submit still works.
- **Closed (July 2026):** The row now has a labelled submit button, blank guard, Enter submit, and a
  polite acknowledgement; production build and the full test suite are green.

### - [x] 8.2 Safe destructive data actions + goal editing

- **Goal:** Task and goal deletion is instant with no confirmation, undo, or recovery, and goals can't be edited after creation (fixing a typo requires deletion). Add an undo toast for deletes; require confirmation only when a goal carries meaningful progress; add an edit action for goal title/date/parts. Settings' "clear focus data" action also needs precise scope and safe semantics: say which session, Companion, cadence-cache, streak, XP, task-credit, and goal-credit data will remain or be removed; confirm before clearing; perform one atomic store update; and do not leave derived insight/cadence caches describing deleted events.
- **Files:** `src/screens/TasksScreen.tsx`, `src/screens/GoalsScreen.tsx`, `src/components/SettingsSheet.tsx`, persistence/store actions.
- **Done when:** Delete → undo restores intact (id, progress); goal with progress asks first; goals editable in place; focus-data clearing has a truthful preview + confirmation, clears the documented dependent data atomically, invalidates derived caches, and has a reload regression test.
- **Closed (July 2026):** Task and goal deletes now offer lossless undo; progressed goals ask before
  removal, and undo restores ids, progress, active-task state, and goal links. Goal editing retains
  its validated inline form. Settings previews the exact focus-history scope, confirms the clear,
  removes session/Companion evidence plus its learned cadence cache in one store action, and keeps
  streak, XP, task credit, goal progress, settings, plans, parking, and Guide reads. Reducer,
  component, persistence/reload, full-suite, build, and browser checks are green.

### - [x] 8.3 Calendar labels and daily task scope roll over correctly

- **Goal:** Date-derived UI is computed only at render, so an app left open across midnight can show stale "due today/tomorrow/overdue," streak, weekly-review, and task labels. Add one shared local-day refresh signal that fires at the next boundary and on `visibilitychange`/foreground. Resolve the current "Today's tasks" mismatch too: tasks persist indefinitely with no day/archive semantics. Either make the list honestly ongoing, or store a completion/day key and roll completed items into History while carrying open items forward; do not silently delete them. Label rolling-24-hour insight windows as "last 24 hours," not "today."
- **Files:** `src/screens/GoalsScreen.tsx`, `src/screens/TasksScreen.tsx`, weekly/insight UI, `src/store/goals.ts` (`goalPace`), shared day-boundary helper; coordinate with 9.2/9.3.
- **Done when:** Advancing across the configured day boundary updates every date-derived label without remount; open tasks carry forward and completed tasks remain recoverable in History (or the list is renamed ongoing); rolling windows are labelled accurately; boundary, foreground, and DST-edge tests pass.
- **Closed (July 2026):** One app-level local-day signal refreshes at the configured boundary and
  on foreground/visibility return. Tasks remains an honest ongoing list (open and completed items
  stay recoverable there), rolling windows say “last 24 hours,” Goals uses calendar-safe pace and
  due labels, and Focus refreshes weekly-review and gentle-streak state without a remount. Boundary,
  foreground, configured-hour, and DST-edge regressions, the full suite, build, and browser checks
  are green.

### - [x] 8.4 Accessible dialog primitive + Settings restructure

- **Goal:** Settings and destructive/decision overlays use incomplete dialog semantics: no reliable `aria-modal`, inert background, initial focus, trap, Escape handling, or focus restoration, and Settings' only close control is at the bottom of a long sheet. Build reusable Sheet/Dialog primitives (persistent top close for sheets), then use them only for interactions that truly block the app: settings, destructive confirmations, and the honest-return decision while timer truth is unresolved. Routine Companion check-ins and tips must remain accessible **non-modal** status/region surfaces that do not steal focus or trap the user. Group Settings into collapsible sections (identity · timer · sound · theme · planner · companion · data).
- **Science:** n/a — accessible interaction semantics and error prevention.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Keyboard, touch, and screen readers; APG dialog pattern.
- **Files:** new `src/components/Sheet.tsx` / `Dialog.tsx`, `src/components/SettingsSheet.tsx`, `CompanionPrompt` and return/resume surfaces.
- **Done when:** True dialogs make the background inert, announce name/description, place and trap focus, close on Escape where safe, and restore the invoker; a close control stays visible; routine check-ins remain reachable but non-modal and never hijack typing. Component tests cover naming, initial focus, Tab/Shift+Tab containment, inert background, Escape policy, restoration, and non-modal Companion behavior; manual keyboard and screen-reader passes succeed.
- **Closed (July 2026):** Shared Dialog and Sheet primitives now portal beside and inert the app,
  announce their title/description, place and trap focus, honor safe Escape/backdrop policy, and
  restore the invoker across nested confirmations. Settings has a sticky top close and seven
  collapsible groups. Settings, goal/history confirmations, and the unresolved return decision use
  the primitives; routine Companion, ritual, parking, WOOP, and interrupted-session cards remain
  non-modal regions. Component regressions plus a keyboard/accessibility-tree browser pass cover
  focus containment/restoration, nested inert state, naming, Escape policy, and non-modal prompts.

### - [x] 8.5 Semantic structure and named controls

- **Goal:** Screens are generic divs — no `main`, no headings; custom task checkboxes expose `role="checkbox"` with no accessible name; the task-select title area is a clickable div with no role/keyboard support; inputs rely on placeholders. Add landmarks and h1/h2 per screen, give checkboxes names containing the task title, make task-select a real button with selected state, add visible labels + inline validation to task/goal forms. Cadence ladder/rung chips also need programmatic names that announce their focus/break pair, current selection, recommendation direction, and apply/revert action instead of exposing decorative numbers alone.
- **Science:** n/a — semantics, form usability, and assistive-technology support.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Keyboard, touch, and screen readers.
- **Files:** all screens, `TasksScreen.tsx`, `GoalsScreen.tsx`, `TabBar.tsx`.
- **Done when:** Screen-reader pass announces screen titles, task names on checkboxes, selection state, and cadence rung purpose/pair; programmatic purpose/state never relies on color or position; no unlabeled form fields or ambiguous numeric controls; automated accessibility checks cover representative screen/form states and are supplemented by a manual screen-reader pass.
- **Closed (July 2026):** Every primary screen now exposes one named `main`, a visible level-one
  heading, and level-two section/card headings where needed. Primary navigation announces the
  current page and controlled screen. Task completion and selection include the task name and
  state; cadence rungs, recommendations, and revert actions announce direction, focus/break pair,
  and purpose. Task/goal/onboarding forms have visible labels, field associations, invalid state,
  and inline recovery copy. Representative component tests and a live browser accessibility-tree
  pass cover primary screens, forms, task state, cadence state, and navigation state.

### - [x] 8.6 Focus-visible system

- **Goal:** styles.css removes outlines in six places and most controls define only hover/active states, so keyboard focus is invisible. Add a high-contrast `:focus-visible` token applied to every interactive element; remove all `outline: none` without a replacement.
- **Science:** n/a — keyboard accessibility.
- **Quality:** `docs/product-quality.md` — Keyboard, touch, and screen readers; WCAG focus visible and focus not obscured.
- **Files:** `src/styles.css`.
- **Done when:** A full keyboard traversal reaches every control in logical order and shows a visible, contrast-safe, unobscured focus indicator; focus remains visible around sticky navigation and overlays; grep for `outline: none` returns only lines paired with a focus-visible replacement.
- **Closed (July 2026):** One theme-aware 3 px `:focus-visible` ring covers native controls plus
  custom checkbox/switch/tabindex controls, and every local `outline: none` suppression is removed.
  The live browser pass inventories enabled controls in DOM/tab order, confirms task controls and
  sticky Settings actions receive the ring, measures the focused overlay control inside the
  viewport, verifies the night-theme ring color, and confirms Escape restores the Settings
  invoker. A rendered keyboard-focus screenshot and clean console supplement the static checks.

### - [ ] 8.7 Reduced motion + animation scheduler

- **Goal:** Sky canvases redraw every frame, each PixelPal runs its own 50 ms interval (six at once on Friends), and nothing honors `prefers-reduced-motion`. Share one scheduler, pause when hidden/obscured, drop decorative frame rates, and freeze or replace decorative animation under reduced motion. Before implementation, record a reproducible Friends-screen baseline and set an explicit callback/frame/main-thread budget for the same fixture; record the production bundle delta and before/after trace.
- **Science:** n/a — reduced-motion accessibility and measured performance.
- **Quality:** `docs/product-quality.md` — Visual hierarchy, readability, contrast, and motion; Perceived and measured performance.
- **Files:** `DaySky.tsx`, `NightSky.tsx`, `PixelPal.tsx`, new shared scheduler module.
- **Done when:** With reduced motion on, nonessential sky/pal motion is static while state remains understandable; a hidden/obscured tab performs zero decorative animation work; one scheduler replaces per-pal intervals; the recorded trace meets the predeclared budget and shows no interaction/Core-Web-Vitals regression under the stated conditions; bundle delta and measurements are saved with verification notes.
- **Progress (July 2026):** One shared scheduler now replaces the sky animation loops and per-pal
  intervals, caps sky/pal draws at 20/15 fps, stops while hidden or offscreen, and renders static
  state-specific frames under reduced motion; the night short-break CSS aurora is frozen too.
  Deterministic lifecycle, seven-canvas budget, sky, and pal tests pass in the full suite. A
  same-snapshot isolated build measured +997 gzip bytes for the animation implementation, within
  the predeclared 1.5 KiB ceiling. The step remains open for the predeclared real-browser
  main-thread/Core Web Vitals trace and timer-control interaction comparison.
- **Progress (July 28, 2026):** A live production preview is now reachable (see 8.8), but it cannot
  supply this trace. The automation browser pane reports `document.visibilityState === "hidden"` for
  the whole scripted session, which suspends `requestAnimationFrame` and `IntersectionObserver` by
  design; the decorative canvases correctly draw zero frames in that state. That confirms the
  "hidden tab performs zero decorative animation work" clause but leaves the *visible*-tab trace
  unobtainable through this harness. Closing 8.7 needs a foregrounded browser session or an
  instrumented in-page frame counter read from a genuinely visible tab.

### - [ ] 8.8 Touch targets and small-screen layouts

- **Goal:** Settings (34 px), steppers (28 px), switches, and delete controls fall below Bloom's
  44×44 CSS px web target; the goal add form crams name + date + parts + button into one row at
  390 px; the Focus screen has no height-based variant and the shell hides overflow (short browser
  viewports clip content). Enlarge hit areas (padding, not icon size), make the goal form two rows
  on narrow viewports, add compact-height breakpoints that shrink the timer ring before hiding
  anything, and set every text input/textarea/select to **≥16 px on narrow viewports**. Onboarding
  must scroll above an emulated virtual keyboard and avoid autofocus that obscures its actions.
- **Science:** n/a — responsive/mobile ergonomics and accessibility.
- **Quality:** `docs/product-quality.md` — Keyboard, touch, and screen readers; Responsive layout,
  and virtual keyboards. Bloom's 44 CSS px web target is a stricter product choice than WCAG 2.2
  AA's target-size floor.
- **Files:** `src/styles.css`, `GoalsScreen.tsx`, `FocusScreen.tsx`, `Onboarding.tsx`.
- **Done when:** All ordinary web touch targets have an effective area ≥44 CSS px with safe
  separation; goal form is usable at 390 px; at 320 CSS px
  and 200% zoom ordinary content reflows without two-dimensional scrolling; Focus fits a 568 px-tall
  browser viewport without clipping controls; no narrow-viewport input is smaller than 16 px;
  onboarding remains fully visible/actionable with an emulated virtual keyboard. Verify at 320×568,
  390×844, short landscape, and 200% zoom in browser tooling; physical iOS/Android evidence is not
  required for the fast milestone.
- **Progress (July 2026):** The first measured slice is in
  `docs/verification/plan-8.8-responsive-2026-07-26.md`: shared sheet/dialog close controls,
  steppers, switches, task delete/add/session-count controls, and mobile form fields now meet the
  44 px/16 px web baselines. The 320×568 task add row now reflows without horizontal overflow
  (input 142×44 px instead of the visibly compressed pre-fix field). The step remains open for
  the documented undersized Focus/Settings controls, goal form, compact-height/safe-area/zoom/
  keyboard matrix and complete target inventory. Physical iOS Safari/Android WebView proof is
  deferred and does not block this browser milestone.
- **Progress (July 28, 2026):** The browser-evidence blocker recorded on July 26 was a preview
  launch-config fault, not a sandbox limitation — `.claude/launch.json` invoked bare `npm`, which is
  absent from the preview spawner's `PATH`. With an absolute Node interpreter the production preview
  binds and boots normally. The first live pass found and fixed two real compact-height geometry
  defects: `.ring-svg` kept its 236 px intrinsic attribute size while `.ring-wrap` shrank to
  164/132 px (ring overflowed by 72 px and sat 36 px off-centre), and `.ring-animal` centred with
  `transform: translate(-50%, -50%)` under a `scale` override, which scales the centring offset and
  left the pet 14.3 px off-centre. Both are fixed and re-measured at 320x568, where the document has
  no horizontal overflow, no interactive target is under 44 x 44 CSS px, and inputs are 16 px. Full
  measurements in `docs/verification/plan-8.8-ring-geometry-2026-07-28.md`. The compact-height,
  safe-area, 200% zoom, and virtual-keyboard matrix cells remain open.

### - [ ] 8.9 Readability over the animated sky

- **Goal:** Low-contrast lavender text sits directly on the moving sky and becomes illegible as clouds pass; several essential labels are 10.5–12.5 px. Put instructional text on stable translucent surfaces or darken it to verified contrast; raise supporting text to a practical minimum (~13 px), reserving smaller type for nonessential metadata. Also add a `@media (prefers-contrast: more)` layer answering the OS "Increase Contrast" accessibility setting: opaque surfaces instead of translucency, stronger borders, full-contrast text — Bloom's pastel palette currently ignores the request entirely.
- **Science:** n/a — visual accessibility and readability.
- **Quality:** `docs/product-quality.md` — Visual hierarchy, readability, contrast, and motion; WCAG contrast, use-of-color, resize, and reflow criteria.
- **Files:** `src/styles.css`, affected screens.
- **Done when:** Measured text and non-text contrast pass at the worst-case sky frame in both themes and across focus/pressed/selected/error states; meaning never relies on color alone; no essential text is below the documented practical minimum; 200% zoom and text-spacing overrides do not clip it; with Increase Contrast/forced colors enabled, surfaces, borders, focus, and state text remain legible. Stable visual-regression fixtures cover both themes and preference modes.

### - [x] 8.10 Self-host the fonts (offline constraint violation — fix now, don't wait for 7.2)

- **Goal:** `index.html` loads Fredoka and Nunito from Google Fonts, violating hard constraint #1 (local-first, no remote runtime fonts) today. Bundle the woff2 files in the repo, `@font-face` them locally, remove the preconnect/link tags.
- **Science:** n/a — offline/privacy engineering, not a behavior-change mechanism.
- **Quality:** `docs/product-quality.md` — Privacy and security; Perceived and measured performance;
  Visual hierarchy and readability. Verify local font loading, fallback behavior, and layout shift.
- **Files:** `index.html`, `src/styles.css` or a fonts CSS module, `public/fonts/`.
- **Done when:** Production build renders correct typography with DevTools network fully blocked; no `fonts.googleapis` anywhere (grep).
- **Depends on:** nothing; makes 7.2 pass on this point.
- **Closed (July 2026):** Fredoka and Nunito variable Latin WOFF2 files and their Open Font License notices
  are bundled under `public/fonts/`, defined with local `@font-face` rules, and preloaded from the
  app origin. Google Fonts stylesheet/preconnect tags are gone. The live browser reports both font
  families ready and inventories exactly two same-origin font resources; the production build,
  external-font grep, full suite, and visual typography check are green.

### - [x] 8.11 Persisted-data validation + storage-error surfacing

- **Goal:** Tasks are cast straight from storage, goals only partially validated (ranges/createdAt unchecked), and storage read/write failures are silently swallowed. Validate and normalize the full persisted schema on load; on unrecoverable corruption or write failure, show one calm, recoverable warning instead of silent data loss. The fallback reader must not let a malformed current `bloom-state` key prevent recovery from a valid legacy key: parse the current key in its own guarded attempt, then try each legacy key independently, migrate the first valid candidate, and preserve the corrupt payload for export/debug rather than overwriting it during the same failed boot. Companion's independent log key needs equivalent version/shape/error coverage.
- **Science:** n/a — data integrity, failure recovery, and accessible status reporting.
- **Quality:** `docs/product-quality.md` — Error prevention, confirmation, undo, and recovery; Loading, empty, offline, conflict, and failure states; Privacy and security.
- **Files:** `src/store/useBloom.ts`, store slices.
- **Done when:** Hand-corrupted localStorage boots to a sane state with a visible, accessibly announced notice and a concrete retry/export/recovery path; corrupt-current + valid-legacy recovers the legacy data; corrupt legacy candidates do not block later valid candidates; write failure is visible and retryable; a failed read/write leaves the last known-good state unchanged atomically; the preserved corrupt payload is never overwritten before export/recovery; valid data is untouched; Companion log corruption is isolated; complements (not replaces) 7.1's migration tests.
- **Progress (July 2026):** Independent guarded reads and regressions now recover a valid legacy blob
  after a corrupt current key and continue past a corrupt first legacy candidate. Full-shape
  validation, corrupt-payload preservation/export, Companion validation, and visible read/write
  recovery remain.

### - [x] 8.12 Credit goal progress from real work (promoted from optional, July 2026 — Phase 10 builds on it)

- **Goal:** Goal progress is only adjusted manually with +/−, disconnected from tasks and focus sessions, so users maintain two progress systems. Session records already carry `goalId` (1.1). Let a task or focus session be linked to a goal, and offer — transparently, with the manual override kept — to advance the goal when linked work completes. Label aggregate progress honestly (parts across goals aren't equal work).
- **Science:** §Staying — flow row (clear goals and immediate feedback); §Measurement — progress
  monitoring and autonomy-preserving feedback. Evidence applies to the feedback mechanism and any
  user-facing claim, not to the linking or record-integrity implementation.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Keyboard, touch, and
  screen-reader support; Error prevention, confirmation, undo, and recovery; component/integration
  testing.
- **Files:** `src/store/goals.ts`, `src/store/sessions.ts`, `GoalsScreen.tsx`, `TasksScreen.tsx`.
- **Done when:** Completing a linked session/task offers or applies a goal tick per user setting;
  manual +/− still works; nothing auto-moves without the user having opted in; linking, unlinking,
  deleted-goal, skip, reload, and exactly-once credit paths have integration coverage; controls expose
  their goal and state and work by keyboard, touch, and screen reader.
- **Depends on:** 1.2.
- **Progress (July 2026):** The recording half landed (schema v20, pass-through migration): tasks
  carry an optional `goalId` chosen from a planner-gated select on the add row, `OpenSession`
  stamps it at session start, and `finalizeSession` writes it onto the `SessionRecord.goalId`
  field reserved since 1.1; deleting a goal unlinks its tasks. Nothing advances a goal
  automatically yet — the offer/apply debrief flow (and 10.2's one-tap credit built on it)
  remains, as does linking from the task edit path (8.2).

### - [ ] 8.13 (Optional, low) Honest onboarding and empty-state polish

- **Goal:** Replace the three realistic seeded starter tasks ("Finish history essay"…) with either a clearly marked, dismissible guided example or a true empty state with one strong call to action. Do not present sample work as user-created data. Reducer/style extraction is not a condition of this UX step; material architecture work belongs in its own numbered step under `docs/product-quality.md`'s architecture-change requirements, while small in-scope refactors remain allowed.
- **Science:** n/a — honest onboarding and empty-state usability.
- **Quality:** `docs/product-quality.md` — Loading, empty, offline, conflict, and failure states; Visual hierarchy, readability, contrast, and motion.
- **Files:** onboarding/task seed or default-state files, `Onboarding.tsx`, `TasksScreen.tsx`, affected styles and tests.
- **Done when:** New users can distinguish example content from their own data or see an honest empty state with one obvious action; dismissing an example does not create or delete real work; keyboard, screen-reader, narrow-layout, migration, and visual-regression fixtures pass.
- **Progress (July 2026):** Fresh installs now persist no sample tasks. Tasks presents one semantic
  empty-state region whose “add your first task” action focuses the real task-name input; focused
  store/hook coverage plus a fresh-origin 320×568 browser accessibility-tree and rendered-layout
  pass confirm the behavior. Existing users retain any historically seeded tasks as their local
  data. The step remains open for the named pinned visual-regression fixture; the manual narrow
  pass does not substitute for a CI-diffable baseline.

### - [x] 8.14 Guard the running timer against accidental resets

- **Goal:** Every control that can discard, finalize, overwrite, or reclassify live timer state needs one shared guard — not just Focus/Short/Long/Tiny mode tabs. Audit and route **Reset, Skip, selecting another active task, switching into/out of Flow, disabling Flow in Settings, applying duration/cadence changes, and navigation actions that replace an unresolved return snapshot** through explicit transition policy. For Focus/Tiny, keep the two-tier mode-switch fix: **(a) false-start grace** — a switch within ~15 s is discarded entirely; **(b) confirmation beyond the grace** — "You're 12 min into this focus — end it and switch?" → **[keep going]** / **[end & switch]**. Reset and Skip must state whether they discard, abandon, or complete; active-task changes must not retag the open session; Flow-off must never orphan a banked/open stopwatch. A confirmed abandon is intentional signal; a stray tap is not.
- **Science:** n/a — error prevention and record integrity, not a behavior-change mechanism.
- **Quality:** `docs/product-quality.md` — Error prevention, confirmation, undo, and recovery; Component, integration, accessibility, and visual regression testing. Accidental actions must not write false `abandoned` records that pollute downstream selectors; the short grace window preserves confirmed session truth. Dialog copy remains protective and non-scolding under `docs/voice.md`.
- **Files:** `src/screens/FocusScreen.tsx`, task/navigation controls, `SettingsSheet.tsx`, `src/store/useBloom.ts` (one transition guard/state machine), `src/store/sessions.ts` if a discard helper is cleaner, reuse 8.4's Dialog primitive.
- **Done when:** The behavior matrix for Mode, Reset, Skip, active-task change, Flow enter/exit/off, cadence/duration edit, and unresolved-return navigation is documented and integration-tested for keyboard and touch; focus placement/restoration and safe Escape/cancel behavior are covered; grace-switch leaves zero record; "keep going" is byte-for-byte state preserving; confirmed actions finalize/discard exactly once; no path orphans `openFocus`, `openFlow`, or a return snapshot; `abandonStreakInfo()` cannot be fed by sub-grace noise.
- **Depends on:** nothing (8.4's primitive is a nice-to-have, not a blocker).

### - [ ] 8.15 (Deferred) Prove deployed-web and installed-PWA offline behavior

- **Milestone status:** Post-milestone; it does not block 7.2 or 7.5.

- **Goal:** Preserve the implemented build-hash-versioned app-shell service worker, then—only when
  web deployment becomes a priority—verify an installed/deployed PWA across offline reload and
  clean service-worker updates. Future Phase 11 auth/sync API requests are opt-in data traffic and
  must never be treated as app-shell assets or required for boot.
- **Science:** n/a — this is hard constraint #1 applied to the web target, found by the July 2026 full audit.
- **Files:** service worker (hand-rolled in `public/` or generated via a Vite PWA plugin), `src/main.tsx`, `vite.config.ts` if a plugin is used.
- **Done when:** After one online visit, a full reload with DevTools network blocked boots the app and every Phase 1–5 feature works; deploying a new build updates cleanly (no stale-cache strand); 7.2's audit passes against the deployed web build, not just the APK.
- **Depends on:** 8.10 (fonts must be local before the shell precache is complete).
- **Progress (July 2026):** The production build now generates a content-hashed, exact app-shell
  precache worker, excludes reserved API/auth namespaces, cleans old Bloom caches, and registers
  only on production web (not Capacitor). Generator/registration tests cover offline navigation,
  cached assets, cache replacement, and network-only routes. A production preview was loaded once,
  its server was stopped, and a full reload booted the Focus screen from cache with persisted local
  state and no console errors. The step remains open for the done-when’s deployed-web update and
  complete Phase 1–5 offline pass.

### - [ ] 8.16 Add a linter, align dependencies/toolchain, and wire both into CI

- **Goal:** The repo has **no ESLint/Prettier config at all**, and until July 2026 CI never ran the test suite (fixed during the audit: `.github/workflows/deploy.yml` now runs `npm test` before build/deploy). With many people and models committing, there is no automated correctness/style gate beyond `tsc`. Add an ESLint flat config (typescript-eslint recommended + react-hooks rules), fix or explicitly justify every finding, add `npm run lint`, and a CI lint step before tests. Also remove the current Vitest transform warnings caused by incompatible/duplicated Vite/plugin resolution: align supported Vite/Vitest/plugin-react versions or give Vitest a standalone config that does not load browser-only React transforms for pure tests. Pin the compatible set and document intentional major-version differences; do not suppress warnings. Align the Actions Node/npm toolchain with dependency engine requirements, regenerate the lockfile with that CI toolchain, and require a pristine CI-version `npm ci` check for every future dependency change. This closes the July 2026 regression where npm 11 accepted the committed lockfile but the Node 20/npm 10 runner rejected it as missing `esbuild@0.28.1` platform packages; the same resolution also introduced Wrangler packages requiring Node 22. The July 2026 hotfix that unblocked deploys pinned `npm@11.17.0` twice — a hardcoded `npm install --global` step in the workflow and `package.json`'s `packageManager` field, which is inert because corepack is never enabled; keep exactly one npm-version source of truth (corepack reading `packageManager`, or the workflow deriving its version from `package.json`) so the two cannot drift.
- **Science:** n/a — engineering hygiene, found by the July 2026 full audit.
- **Files:** `eslint.config.js` (new), `vitest.config.ts` if needed, `package.json`/lockfile, `.github/workflows/deploy.yml`.
- **Done when:** A pristine temporary checkout completes `npm ci`, `npm run lint`, `npm test`, and
  `npm run build` with the exact Node/npm toolchain declared for Actions; the workflow statically
  gates deployment on lint/test/build failure; every resolved package supports the runner's Node
  version; dependency-tree output shows one intentional compatible Vite transform path; the lint
  config is the standard recommended sets, not a hand-tuned rule zoo. The workflow carries no
  npm-version literal duplicated from `package.json` — one pin, read by both CI and local tooling.
  `AGENTS.md` and `CLAUDE.md` keep the same clean CI-version lockfile check as an evergreen rule for
  later dependency changes. Pushing or executing a deployment workflow is not required for the fast
  local milestone.
- **Depends on:** nothing.
- **Progress (July 2026):** `vitest.config.ts` now keeps pure Node tests off the browser React
  transform, removing the prior Vite/esbuild warnings. The latest dependency refresh exposed a
  lockfile-parser/toolchain mismatch in Actions (`npm ci` fails before tests); Node/npm alignment and
  a regenerated lockfile now belong to this step. A July 19 hotfix moved the runner to Node 22 with a
  pinned npm 11.17.0 and recorded `engines`/`packageManager` in the manifest; consolidating that
  duplicate pin (Goal above) remains. ESLint, formatting policy, version alignment,
  dependency pinning, the clean-install gate, and the CI lint gate remain.

### - [x] 8.17 Coordinate interruption, return, parking, and debrief surfaces

- **Goal:** Replace independent booleans for Companion check-ins, tab-return truth, interrupted-session
  resume, returned parking, kind restart, and debrief with one explicit surface-priority coordinator.
  An unresolved honest-return decision owns the timer and blocks conflicting controls; returned
  parking can be snoozed without being silently discarded or permanently gating debrief; saving
  "next concrete action" must occur on both Resume and Not now; ordinary check-ins remain non-modal
  and withdraw when Companion is turned off/Quiet. Navigation must not hide a pending truth decision.
  Tiny follows Focus return semantics. Decide Flow explicitly: implement elapsed/snapshot semantics,
  or document/test why count-up Flow is excluded while still preserving its open record.
- **Science:** n/a — interaction-state coordination, accessibility, and recovery integrity.
- **Quality:** `docs/product-quality.md` — Keyboard, touch, and screen readers; Error prevention, confirmation, undo, and recovery; Loading, empty, offline, conflict, and failure states.
- **Files:** `src/store/useCompanion.ts`, `src/store/useBloom.ts`, `FocusScreen.tsx`, `App.tsx`,
  `ResumeCue.tsx`, `ParkingLot.tsx`, `CompanionPrompt.tsx`; reuse 8.4 primitives.
- **Done when:** A state-transition table and component/hook tests cover priority, focus ownership,
  navigation, reload, Quiet/off, parking snooze, Resume/Not now, repeated leaves, Tiny, and the chosen
  Flow policy plus accessible announcements, failure/reload recovery, and keyboard/touch focus
  ownership; every "I drifted" path writes exactly one linked event even if triage is skipped or
  reloaded; no prompt is lost, duplicated, or able to operate on the wrong session.
- **Depends on:** 5.1–5.3, 8.4; use the 7.4 harness for its integration tests.
- **Progress (July 2026):** Parking “not now” now releases debrief/review without deleting thoughts;
  Resume “not now” saves the edited next action; pending return decisions cannot be hidden through
  bottom navigation; Quiet/off withdraw an open check-in; Tiny return tracking and exactly-one drift
  persistence are tested. The explicit coordinator, inert/modal truth surface, full Flow UX policy,
  priority table, and component/hook matrix remain.

### - [ ] 8.18 Simplify pre-start hierarchy and surface the weekly experiment

- **Goal:** The primary Start action currently appears before optional if-then, target, ritual, and
  first-action inputs, so the screen asks for preparation after presenting the commit action. Define
  one compact pre-start stack: active task → optional session-owned target/first action → optional
  ritual/plan → Start, with progressive disclosure and one clear bypass. Keep the target on the
  `OpenSession` so mid-session global task/settings changes cannot rewrite it. Remove duplicate
  Companion-local intention state or define its distinct purpose. In review/recipe surfaces, render
  the weekly engine's computed `experiment` (currently calculated but replaced by cadence UI), make
  Weekly Review discoverable at an honest cadence, refresh/revert cadence rungs coherently after
  apply, and align all Settings/suggestion duration bounds.
- **Science:** n/a for the hierarchy and integration work; existing cadence mechanisms retain their
  evidence and claims from steps 4.1/4.6.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Responsive layout, safe areas, and virtual keyboards; Visual hierarchy, readability, contrast, and motion.
- **Files:** `FocusScreen.tsx`, `App.tsx`, `SettingsSheet.tsx`, `WeeklyReview.tsx`, cadence engine/cache,
  pre-start components and styles.
- **Done when:** Keyboard, screen-reader, mobile, and first-run tests show one obvious Start path with optional prep
  before it; started sessions retain task/target/planned duration; Weekly Review exposes its real
  experiment and has a discoverable entry condition; cadence controls share one set of bounds,
  invalidate stale suggestions, and apply/revert without mismatching the idle countdown; narrow/wide
  visual-regression fixtures prove hierarchy and progressive disclosure without clipping.
- **Depends on:** 3.2, 3.4, 4.1, 4.2, 4.6, 8.5; use the 7.4 harness for lifecycle tests.
- **Progress (July 2026):** The weekly engine's actual experiment is rendered; cadence bounds now
  match Settings, stale recommendations invalidate after apply/manual duration edits, a fresh idle
  timer adopts the new pair, and open sessions retain their own task/target/planned duration. The
  Companion-local intention mirror was removed in favor of the session-owned target. Pre-start
  ordering/progressive disclosure, responsive/keyboard proof, and review discoverability remain.

### - [x] 8.19 Make insight time windows and evidence inputs trustworthy

- **Goal:** Normalize analytics timestamps before deriving claims. Reject or quarantine events and
  sessions implausibly in the future; use `shownAt` for when a check-in occurred/phase bucketing and
  `ts` only for answer latency; clamp estimated onset to the valid session window. A debrief explaining
  the current session must compute "usual" and golden/foggy-hour baselines from **prior** sessions so
  one current event cannot manufacture its own pattern. Require an explicit minimum sample for
  "usual" language, and keep classified drift-kind denominators separate from skipped/unclassified
  drift events while retaining the latter for honest total counts.
- **Science:** Required only for the resulting behavioral explanations and evidence hedging; use
  `docs/science.md`. Timestamp validation, sample integrity, and test design are `Science: n/a`.
- **Quality:** `docs/product-quality.md` — Privacy and security (input validation); Component,
  integration, accessibility, and visual regression testing. Behavioral claims and hedging still
  trace to `docs/science.md`.
- **Files:** `src/store/companion.ts`, `src/store/sessionStats.ts`, `src/insights/why.ts`, weekly/cadence
  selectors and tests.
- **Done when:** Fixtures cover future timestamps, delayed answers (`shownAt` ≠ `ts`), estimated-onset
  bounds, one-event/no-prior-session cases, and current-session leakage; UI labels match the actual
  rolling/calendar window; no explanatory sentence says "usual" below its documented sample floor.
- **Depends on:** 1.4, 1.5, 2.2, 2.4.
- **Closed (July 2026):** One normalization path now quarantines malformed/future session intervals
  and Companion events before they reach debrief, weekly, cadence, trigger, Guide, or recipe claims.
  Prompt occurrence (`shownAt`, falling back to legacy `ts`) owns rolling windows, time-of-day, and
  linked-session phase; `ts` remains the answer/log time. Estimated onsets are clamped to the
  session window and the latest earlier focused answer. Debrief “usual” and strong-hour claims use
  prior sessions only; “usual” requires three prior drift sessions; unclassified drifts stay in
  total counts but never enter kind-specific denominators. Future, delayed-answer, onset-bound,
  and one-event/current-session-leakage fixtures are green; the existing UI labels the rolling
  24-hour/7-day and study-calendar windows plainly. The full suite and production build are green.

### - [x] 8.20 Record truthful task and goal completion timestamps

- **Goal:** Task and goal cards infer completion/deadline success from current counters and today's
  date, but neither model has a trustworthy completion timestamp. Add `completedAt` (and clear it if
  reopened), migrate old completed items as timestamp-unknown, and base "met/beat the deadline" copy
  only on a known completion time relative to the deadline. Use task completion day keys for 8.3's
  rollover and 9.3's History ledger; never invent historical dates for migrated records.
- **Science:** n/a — calendar accuracy, data integrity, and truthful copy.
- **Quality:** `docs/product-quality.md` — Error prevention, confirmation, undo, and recovery;
  Component, integration, accessibility, and visual regression testing.
- **Files:** task/goal models and migrations, `TasksScreen.tsx`, `GoalsScreen.tsx`, `HistoryScreen.tsx`.
- **Done when:** Completing, reopening, and re-completing record stable timestamps; deadline copy is
  accurate before/on/after the due boundary and neutral when legacy completion time is unknown; task
  history groups by the recorded day; migration and timezone-boundary tests pass losslessly.
- **Depends on:** 7.1, 8.3; supports 9.3.
- **Progress (July 2026):** Unsupported “deadline met/beat” claims were replaced with neutral
  progress copy. Later in July, `completedAt` landed on both models (schema v19, pass-through
  migration): tasks stamp it on check-off and on pomodoro-credited completion (cleared on
  un-check), goals stamp it when the last part is logged (cleared when un-logged) — legacy
  completed items correctly stay timestamp-unknown. Remaining: deadline copy keyed to the known
  completion time, History day-grouping (9.3), and the timezone-boundary fixture tests.

### - [ ] 8.21 (Post-milestone) Cross-screen accessibility, component, and visual regression baseline

- **Milestone status:** Keep adding focused regression tests when touching a screen, but the
  exhaustive cross-screen visual matrix and physical-device evidence do not block 7.5.

- **Goal:** Consolidate and close the cross-screen regression coverage that individual feature steps
  cannot prove. Start with a coverage inventory that reuses and counts the assertions and fixtures
  required by 8.4–8.20; do not duplicate passing coverage, and add only missing screen/state/matrix
  cells. Ensure deterministic fixtures cover every current screen and shared overlay in representative
  normal, empty, dense-data, error, offline, and modal/non-modal states. Complete automated
  accessibility assertions; component/integration coverage for semantics, keyboard/focus,
  touch-equivalent actions, undo, and recovery; and pinned visual
  baselines at small-phone, short-landscape, tablet, and desktop sizes in both themes plus reduced
  motion and increased-contrast modes. Document baseline-update/review rules and wire the suites into
  CI. Automated checks supplement, not replace, a future full keyboard/screen-reader/device matrix.
  If the screen/state inventory cannot fit one run, split this step in `PLAN.md` before implementation.
- **Science:** n/a — accessibility and engineering verification.
- **Quality:** `docs/product-quality.md` — Browser and device verification; Component, integration,
  accessibility, and visual regression testing.
- **Files:** component/screen test files and fixtures, accessibility/visual test setup, pinned browser
  configuration, CI, `docs/testing.md` automated-test and baseline-update guidance (new; 7.5's
  release QA links to it).
- **Done when:** Every current screen and shared sheet/dialog/check-in has representative automated
  accessibility and component coverage; critical undo/recovery/focus paths have integration tests;
  visual diffs fail CI in the pinned environment across the required states/sizes/themes/preferences;
  baseline changes require intentional review; known defects are tracked in open remediation rather
  than accepted by regenerating snapshots; future manual device evidence is recorded here rather
  than required by 7.5.
- **Depends on:** coordinate with 8.4–8.10 and 8.16 so the primitives, visual states, and CI toolchain
  are stable enough to test.

### - [x] 8.22 One clock per decision — stop treating the day-refresh timestamp as the current instant

- **Goal:** 8.3's shared local-day signal refreshes only at the day boundary and on foreground, but
  three consumers treat it as the current instant (July 2026 post-8.3 code review). `WeeklyReview`
  passes it into `computeWeeklyReview`, whose `endedAt <= now` upper bound — dead while the
  parameter defaulted to `Date.now()` — now silently drops any session finished after the last
  refresh: an app kept visible all day can show a review missing that day's sessions or fall back
  to "still learning" despite enough data. `TasksScreen` and `WeeklyReview` stamp
  `cachePersonalCadence(cadence, now)`, so the persisted `computedAt` backdates the cadence cache
  by hours while `SettingsSheet` still stamps a live `Date.now()` — one field written from two
  clocks. And the screens' `shouldRecomputePersonalCadence(memory, now)` staleness check runs on
  the frozen clock while `personalCadenceForSurface` defaults to a live `Date.now()` internally, so
  a screen can display a freshly recomputed recommendation it decided not to cache. Fix by clock
  role: windowing analyses take a fresh instant at computation time (memoized on the day signal so
  they still re-run at the boundary), store actions stamp their own `Date.now()` instead of
  accepting a UI-supplied clock, and every staleness check shares the clock of the computation it
  guards.
- **Science:** n/a — clock-consistency correctness.
- **Quality:** `docs/product-quality.md` — Reliability; the session log is the spine (the review
  must see every recorded session in its window, and `computedAt` must be truthful).
- **Files:** `src/components/WeeklyReview.tsx`, `src/screens/TasksScreen.tsx`,
  `src/components/SettingsSheet.tsx`, `src/store/useBloom.ts` (`cachePersonalCadence`),
  `src/insights/cadence.ts` call sites, tests beside each.
- **Done when:** A regression test proves a session completed after the last day-refresh still
  appears in a weekly review computed in the same render cycle; `computedAt` equals the actual
  computation time at every write site (one code path stamps it); the staleness check and
  `personalCadenceForSurface` share one clock value; suite and build stay green.
- **Depends on:** 8.3 (landed); must land before 8.23.
- **Closed (July 2026):** Weekly and task-window analyses now take a fresh instant when their
  day-keyed memo runs. Every cadence surface shares one captured instant between its cache-staleness
  decision and recommendation, while the store is the only code path that stamps `computedAt`.
  Component and hook regressions cover the same-render post-refresh session and write-time cache
  timestamp; the full suite and production build are green.

### - [x] 8.23 Day rollover belongs to the store — one clock owner, re-render only at the boundary

- **Goal:** The app now runs three parallel clock/foreground mechanisms: `useBloom`'s 250 ms tick +
  `visibilitychange` catch-up, `useCompanion`'s interval + listeners, and 8.3's `useLocalDayRefresh`
  with `visibilitychange` + `focus` listeners whose unconditional `setNow(Date.now())` re-renders
  `App` and the mounted screen on every window focus — twice on foreground, since both listeners
  fire — re-running the O(records + events) insight scans when nothing date-derived changed. The
  `now` prop is hand-threaded into exactly four components while `DebriefCard`, `SettingsSheet`,
  and one `guideSuggestionFor` call inside the already-wired `FocusScreen` still freeze a raw
  `Date.now()`; and `FocusScreen` re-derives the comeback rule inline (`streakAlive` + `dayKeyFor`
  at render, duplicating the `loadState` sweep) while the persisted streak/comeBack fields stay
  stale until the next boot. Move day-rollover detection into the store's existing tick/visibility
  path: a rollover reducer action runs the same sweep `loadState` performs and refreshes an exposed
  `bloom.today` day key (plus `bloom.now` where an instant is genuinely needed), screens read those
  instead of a prop, state updates happen only when the day key actually changes, and the boot path
  and the left-open path become one code path. Retire `useLocalDayRefresh` and the `now` prop
  threading. No persisted-state shape changes — the sweep writes existing fields.
- **Science:** n/a — architecture altitude and render efficiency (July 2026 post-8.3 code review).
- **Quality:** `docs/product-quality.md` — Performance; Reliability. This is a deliberate
  current-architecture change: it consolidates clocks instead of adding a fourth mechanism.
- **Files:** `src/store/useBloom.ts` (rollover action, `today` exposure),
  `src/store/useLocalDayRefresh.ts` (retire), `src/App.tsx`, `src/screens/FocusScreen.tsx` (drop
  the inline `showComeBack` derivation), `src/screens/TasksScreen.tsx`, `src/screens/GoalsScreen.tsx`,
  `src/components/WeeklyReview.tsx`, `src/components/DebriefCard.tsx`,
  `src/components/SettingsSheet.tsx`, lifecycle tests.
- **Done when:** Crossing the boundary (or foregrounding across it) updates every date-derived
  label and runs the streak sweep exactly once, with the chip and the persisted state agreeing and
  no view-layer copy of the comeback formula left; alt-tabbing without a day change triggers no
  state update and no `now`-keyed memo recompute (asserted in a hook/component test); date-derived
  UI reads `bloom.today`/`bloom.now`, and each remaining `Date.now()` in screens/components is
  individually justified; 8.3's boundary, foreground, configured-hour, and DST regressions still
  pass.
- **Depends on:** 8.22 must land first — narrowing re-renders to day changes makes any remaining
  frozen-instant misuse strictly worse. Coordinate with 9.2 (the boundary hour will live in
  settings) and 8.17 (surface coordination touches the same screens).
- **Closed (July 2026):** `useBloom` now owns the local-day boundary timer and foreground catch-up,
  exposes runtime-only `today`/`now` signals, and applies the same gentle-streak sweep on boot and
  live rollover. Same-day foreground checks return the identical state object; screens no longer
  receive an app-threaded clock or re-derive comeback state. Lifecycle coverage proves boundary,
  foreground, configured-hour, persisted comeback, date-label, and no-op re-render behavior; the
  day-key suite retains its DST coverage. The full suite, production build, and browser preview are
  green with no relevant console output.

### - [x] 8.24 Goals day-math consolidation

- **Goal:** `daysLeft` re-implements whole-day diffing with a `dayKeyFor` → `parseDue` → `Date.UTC`
  round-trip beside the noon-anchored `daysBetween` that `dayKey.ts`'s own header designates for
  key-to-key arithmetic (it lives in `src/store/streak.ts`), and `GoalsScreen`'s date-input `min`
  wraps the shared clock in `todayStr(new Date(now))` — a number→Date→number detour around
  `dayKeyFor` (July 2026 post-8.3 code review). Reduce `daysLeft` to
  `daysBetween(dayKeyFor(now, dayStartHour), due) + 1` and pass the day key to `min` directly;
  behavior is unchanged.
- **Science:** n/a — reuse and simplification.
- **Quality:** `docs/product-quality.md` — engineering quality: one implementation per concept.
- **Files:** `src/store/goals.ts`, `src/screens/GoalsScreen.tsx`, `src/store/goals.test.ts`.
- **Done when:** One day-diff implementation remains for key arithmetic; the existing goals/dayKey
  boundary and DST tests pass unchanged; no user-visible change.
- **Depends on:** nothing; coordinate with 9.2 so the boundary hour keeps a single resolution point.

---

## Phase 9 — Own your record (measurement integrity & data stewardship, July 2026)

> These close the feature gap with the Friction Journal app. Behavior-change mechanisms and scientific
> claims in this phase are vetted against `docs/science.md`; data stewardship, interaction design,
> reliability, and engineering use `docs/product-quality.md` and may say `Science: n/a`. Vetted and
> **rejected**: a stats-heavy analytics dashboard (fails the "metrics zoo" warning — weekly review +
> recipe already carry the insight duty) and unlimited session editing (undermines record trust; only
> the clamped, labeled repair in 9.5 survives). Optional cloud sync is isolated in Phase 11; 9.4 remains
> the account-free portability and recovery baseline.

### - [x] 9.1 Evidence addendum for measurement-integrity features

- **Goal:** Append a short, honestly-graded section to `docs/science.md` (new anchor `#measurement-integrity`) covering the evidence 9.5/9.6 rest on: **proximal subgoals** (Bandura & Schunk 1981, *J. Personality and Social Psychology* 41(3): proximal goals raised self-efficacy and intrinsic interest in self-directed learning; Locke & Latham 2002, *American Psychologist*: specific goals outperform vague ones); **planning fallacy** (Buehler, Griffin & Ross 1994, *JPSP* 67(3): people underestimate completion times; feedback from past actuals improves calibration); **recall bias in retrospective self-report** (grounds for why 9.5's repairs are labeled estimates). Grade each claim's evidence type per the report's convention, and follow the verification note's rule: open the primary paper before quoting a number.
- **Science:** The report's own methodology (§How to read this report — graded claims, honest hedging). No new behavior-change mechanism or user-facing scientific claim may cite behavioral evidence that is not in the repo's behavioral source of truth. Non-behavioral quality work uses `docs/product-quality.md`.
- **Files:** `docs/science.md`.
- **Done when:** Anchor resolves; each claim has an evidence grade and at least one full citation; a provenance sentence in the verification-note style is included.
- **Depends on:** 0.1.

### - [x] 9.2 Custom study-day boundary

- **Goal:** Settings question: "When does your day roll over?" → `dayStartHour` (default midnight; presets 00:00 / 03:00 / 05:00, custom hour). One shared `dayKeyFor(ts)` helper; **every** daily computation routes through it — streak, sessions-today, weekly-review windows, per-day grouping in stats — while raw records keep exact timestamps. Version bump + migration; changing the boundary re-derives summaries losslessly from raw records.
- **Science:** n/a — user-controlled calendar semantics and data accuracy, not a behavior-change mechanism.
- **Quality:** `docs/product-quality.md` — Error prevention, confirmation, undo, and recovery; Component, integration, accessibility, and visual regression testing. The raw record remains unchanged and the chosen boundary re-derives every daily view consistently.
- **Files:** `SettingsSheet.tsx`, `src/store/useBloom.ts` (version bump + migration), `src/store/sessions.ts` / `sessionStats.ts` (dayKey helper), streak logic.
- **Done when:** A 00:30 session counts toward the previous study day in streak, history grouping, and weekly review; changing the boundary re-derives all summaries without touching raw records; unit tests cover boundary edges (session at boundary−1 min, at boundary, DST transition).
- **Depends on:** 1.4; must land before 9.3.
- **Progress (July 2026):** The consolidation half landed: `src/store/dayKey.ts` now exports
  `dayKeyFor(ts, dayStartHour = 0)` with boundary/month/year/DST unit tests, and the four
  timestamp→day call sites (`dayStr` in useBloom, `localDayKey` in insights/triggers, `todayStr`
  in goals, the weekly-review `weekKey` rendering) route through it at the default boundary —
  zero behavior change, no schema change. Remaining: the settings question, the `dayStartHour`
  persistence + migration, and re-deriving streak/summaries through the chosen boundary. Caution
  for that wiring half (July 2026 post-8.3 code review): resolve the hour once where the day signal
  lives (8.23's `bloom.today`) and hand leaves already-resolved day keys — the hour currently
  threads through leaf signatures (`daysLeft`/`goalPace`/`dueLabel`/`nextDayBoundaryAt`) that all
  still receive the default, while `todayStr` takes no hour at all, so per-call-site wiring would
  let the Goals date-input `min` split from its due labels.
- **Closed (July 2026):** Settings now owns a persisted, normalized midnight/03:00/05:00/custom
  boundary (schema v23 with an append-only v22→v23 migration). The store resolves one study-day
  signal for screens and uses the configured boundary for timer completion, streak/pre-slump
  summaries, weekly windows and Guide caps, Companion prompts, goal labels, and session-day grouping;
  changing it re-derives the observable streak tail without changing a raw record.
  Boundary−1/boundary, 00:30-previous-day, early-Monday weekly/Guide, migration, Settings integration,
  deterministic America/New_York spring/fall DST, full-suite, build, and fresh-browser checks are
  green.

### - [ ] 9.3 History ledger screen

- **Goal:** A browsable record of past study days — a **calm ledger, not an analytics dashboard**. Sessions grouped by study day (9.2): each day row shows focus minutes, session count, drifts, recoveries, and completed-task count; expanding a day shows session cards (mode, planned vs actual, outcome, target, drift-phase chips, parked-thought count) plus task completions recorded by 8.20; load-more paging. Open tasks carried across days remain in the active list and are not duplicated as completions. Deliberately **no new aggregate metrics** beyond what `sessionStats` already computes. Also replace the silent 500-record ring-buffer drop: archive older records to a compact slice instead of discarding — a user's history must never silently truncate.
- **Science:** §Measurement — progress monitoring row (Harkin 2016: d = 0.40 on attainment; works when behavior is *physically recorded and reflected back* — 1.2 built the recording half, this is the reflecting half; the row's design implication says the dashboard should "highlight behavior patterns, not just time totals"); §Measurement — feedback row (Krukowski 2024: simple, low-frequency feedback; hence a ledger and a hard cap on derived metrics); §Article brief "Why tracking helps and when it turns into pressure" (no judgment words, no red/failure styling anywhere).
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Responsive layout, safe areas, and virtual keyboards; Loading, empty, offline, conflict, and failure states; regression testing.
- **Files:** `src/screens/HistoryScreen.tsx` (new), `TabBar.tsx`, task model, `src/store/sessions.ts` (archive slice, version bump), `sessionStats.ts`.
- **Done when:** Fixture data renders grouped days with correct session/task summaries; semantic headings/lists and paging controls work by keyboard and screen reader; empty, loading/paging, large-history, and failure states are responsive and recoverable; carried-open and reopened tasks are not misreported as completed; no derived metric appears that doesn't already exist in `sessionStats`; archive path unit-tested (records past the cap survive); component and narrow/wide visual-regression fixtures pass; all copy passes docs/voice.md. If this exceeds one session, split UI and archive-storage into sub-steps before implementation.
- **Depends on:** 9.2, 1.4, 8.20.

### - [x] 9.4 Data export & import

- **Goal:** Settings → "Your data": one-tap **JSON export** of the entire persisted state (schema-version stamped; *entire* includes the Companion event log's separate localStorage key — see the 7.1 audit note) and a **CSV export** of session records; **import** validates the file, migrates older-schema files forward through the existing migration chain (a v12 file is treated like v12 localStorage), previews what it holds ("this backup has X sessions, Y tasks, Z goals"), then merges by stable id — never a blind overwrite — after automatically backing up the current state. Large files show accessible progress and allow cancellation before the atomic commit; any validation, migration, or merge failure leaves current state unchanged and offers a recovery/export path.
- **Science:** n/a — offline data stewardship and recovery; no behavior-change claim.
- **Quality:** `docs/product-quality.md` — Error prevention, confirmation, undo, and recovery; Loading, empty, offline, conflict, and failure states; Privacy and security. Export/import stays fully offline, works without an account, and becomes Phase 11's validated envelope/merge baseline.
- **Files:** `src/store/exportImport.ts` (new + tests), `SettingsSheet.tsx`; reuses 7.1's version fixtures.
- **Done when:** Export → wipe localStorage → import round-trips losslessly (automated test); importing an older-schema export migrates forward correctly; malformed, oversized, canceled, and injected merge-failure fixtures produce a calm accessible result and zero state change; progress never becomes a blank or infinite wait; the CSV opens in a spreadsheet with sane columns; the canonical validated envelope and stable-id merge helpers are reusable by Phase 11 without making export/import depend on an account or network.
- **Depends on:** 1.1; strengthened by 7.1 and 8.11 (not blocked by them).
- **Closed (July 2026):** Settings → Data exports one schema-stamped JSON envelope containing the
  complete main store and separate Companion log, plus a formula-neutralized session CSV. Import
  streams with bounded live progress/cancel, validates every persisted row plus Companion
  version/enums/timing, migrates old main blobs through the localStorage chain while retaining the
  source schema in preview, and merges stable ids without overwriting collisions or truncating
  combined logs at local caps. Both live keys commit behind a recovery envelope; injected write and
  rollback failures retain it and report their actual recovery state. Round-trip-after-wipe, v12,
  malformed/oversized/canceled, row/version/enum, collision/cap, streamed cancellation,
  rollback-failure, CSV, and Settings status/progress fixtures pass. A live browser invalid-file
  pass announced “Nothing changed” in the status region with both recovery actions reachable; the
  full suite, migration suite, production build, and diff check are green.

### - [ ] 9.5 Session repair & retroactive drift notes

- **Goal:** From History (9.3) or the debrief, let the user fix a wrong record: adjust the end time or outcome of an `interrupted`/recent session within **clamped bounds** (cannot exceed the wall-clock gap; cannot overlap another session), or add a retroactive drift note ("was away ~20 min around 3pm"). Repaired fields set `edited: true` and render with the same **estimate label** 1.5 established for `estOnsetMin`. Insights prefer repaired values; **XP, confetti, and streak are never retroactively granted** — records serve truth, celebrations serve the moment, and this removes any incentive to flatter the record. Repair is offered only at natural pauses (reopening onto an interrupted session, History row) — never a nag.
- **Science:** §Measurement — progress monitoring row (a force-closed laptop logging `interrupted` for a genuinely finished session is *false data* that then feeds every 2.x insight); 1.5's precedent (self-report is labeled an estimate — never fake precision); §Recovering — self-forgiveness row (Wohl 2010: false "failures" the user cannot correct create exactly the shame→avoidance loop Phase 5 exists to prevent); recall-bias entry in the 9.1 addendum (why edits are clamped and labeled, and automatic capture stays primary).
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Keyboard, touch, and
  screen-reader support; Error prevention, confirmation, undo, and recovery; Responsive layout;
  component/integration/visual regression testing.
- **Files:** `src/store/sessions.ts` (version bump: `edited`/estimate flags), `HistoryScreen.tsx`, `DebriefCard.tsx`, `sessionStats.ts` (respect repaired values).
- **Done when:** Repair flow is ≤3 taps; clamps enforced and unit-tested; a repaired session shows its
  estimate label in History and debrief; validation/cancel/failure paths preserve the prior record and
  offer recovery; the flow is operable by keyboard, touch, and screen reader at narrow and wide sizes;
  component fixtures cover valid, clamped, labeled, canceled, and error states; a test proves no XP
  path exists from repair; stats reflect repaired values.
- **Depends on:** 9.3, 1.5, 9.1.

### - [ ] 9.6 Today's slice — a daily target with planned vs actual

- **Goal:** Optional per-day target: pick a goal (or task) and set "today: N parts" — the pace math in `goals.ts` *suggests* N, the user decides (a target you chose yourself, per supportive accountability). A quiet chip on FocusScreen ("today: 2/3 lectures"); linked sessions/tasks advance it through 8.12's crediting; the debrief echoes it; the weekly review gains **one calibration line** from planned-vs-actual history ("you usually plan 5 and land 3 — planning 3 might feel better"). Planned/actual pairs persist (version bump). A missed target renders neutral-warm ("2 of 3 — that's real progress"), never as failure.
- **Science:** §Staying — flow row (Fong et al. 2015: clear, specific, finishable goals with immediate feedback — this generalizes 4.2's session target to the day); §Measurement — progress monitoring row (Harkin 2016) and feature rank 8 (pattern-aware reflection); 9.1 addendum: proximal subgoals build self-efficacy and intrinsic interest (Bandura & Schunk 1981), specific beats vague (Locke & Latham 2002), and the calibration line is the planning-fallacy correction (Buehler 1994) — the most evidence-backed part of the step, not an optional garnish. Guardrails: §Do not build (metrics never moralized) and docs/voice.md on all missed-target copy.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Keyboard, touch, and
  screen-reader support; Responsive layout and virtual keyboards; Error prevention and recovery;
  component/integration/visual regression testing.
- **Files:** `src/store/dailyTarget.ts` (new + tests), `FocusScreen.tsx` (chip), `DebriefCard.tsx`, `WeeklyReview.tsx`, `GoalsScreen.tsx` (link affordance).
- **Done when:** Full loop works on fixtures (set target → linked session credits it → debrief echoes
  → weekly calibration line appears with ≥2 weeks of data); target entry, editing, skip, invalid input,
  reload, and recovery are covered; controls and progress state work by keyboard, touch, and screen
  reader with the virtual keyboard open and at narrow/wide sizes; representative empty, active,
  complete, and error visual states pass; the feature is entirely skippable with zero added friction; missed-target
  copy passes voice.md; grep for "behind|failed|missed!" over user-facing strings returns clean.
- **Depends on:** 9.1, 8.12, 4.2, 2.3.

---

## Phase 10 — Plans that meet the day & foundational habits (July 2026)

> This phase closes the last two gaps against the Friction Journal survey — a planning pipeline that turns "23 parts by Aug 2" into a day the timer understands, and a small set of daily foundational habits — but as redesigns on Bloom's spine, not ports. What we keep from Friction Journal because it is genuinely right: frozen per-day snapshots ("older records keep their original targets" — history is never re-scored), a **signed delta ledger** so edits and deletions reconcile instead of desyncing, the **kind over-entry clamp** (crediting the remainder with a soft note, never an error), **derived read-only integrated tracking** computed from verified session records (structurally tamper-proof, no dual-write drift), natural-key one-entry-per-day upserts, **`enoughData` guards** before any trend sentence speaks, and week-ahead planning (kept in 10.4 — without FJ's overdue queue). What we deliberately fix: its dual task/resource counters become one append-only ledger with derived actuals; its three stacked post-session dialogs become one inline row in the existing debrief; its per-item "carry to today" overdue queue becomes one calm triage card; its naive `remaining ÷ daysLeft` pace becomes an observed-throughput outlook; its unlogged-day-scores-0% grading becomes "absence is no entry, never a miss"; its hidden-month-scored-as-zero tracking window becomes explicit active ranges; and its unknown-type→"dua" coercion becomes a drop. Everything routes through what Bloom already owns — `goals.ts` pace math, 9.6's daily target, 8.12's session crediting, 9.2's `dayKeyFor`, the session log, the gentle streak, `ifThen.ts`, the weekly review, and the companion voice — instead of duplicating any of it.
>
> Vetted and **rejected** before inclusion: a 30-template habit catalog / metrics zoo (Krukowski 2024: "avoid over-engineering dashboards with too many metrics"; Phase 9 already rejected a stats dashboard on this ground — we ship four curated focus-adjacent foundations plus one custom slot and one derived, hard cap three manual active); weight / nutrition / water / meal / sleep / body tracking (medical-adjacent scope creep, voice rule 10 and the ADHD do-not-build row, zero backing in docs/science.md — Bloom tracks focus-supporting behaviors, not health metrics); prayer/spiritual tracking (FJ's salah system) — out of scope: Bloom tracks focus-supporting behaviors, FJ itself walls spiritual data off from its productivity stats ("never changes your productivity statistics", a separate store), and replicating it would import the special-casing FJ's own code treats as exceptional — a user who wants it keeps a dedicated tool; any "digital detox" template (verbatim banned framing — the evidenced behavior ships as "phone in another room", Ward 2017, never the d-word); count/duration/measurement tracker types for habits (manual foundations are binary-only — the target is "done", which deletes the quantity UIs and per-amount snapshot machinery in one move, per the report's closing principle to track a small number of behaviors well); a plan→resource→task hierarchy (a Bloom `Goal` with a unit label is FJ's *resource*; FJ's plan level — several resources grouped under one end/exam date with aggregate progress — is deliberately dropped: each goal carries its own due date, and cross-goal aggregation is dashboard territory Phase 9 rejected, while a resource layer would re-create the two-parallel-counters desync FJ reconciles by hand); per-goal insight filtering and per-plan focus/friction metric panels (FJ's `openPlanInsights`) — rejected under Phase 9's dashboard rejection; the weekly review remains the single, global reflection surface; percentage/range amount-entry modes (the Friction Journal itself collapses everything to units at save time — we collect one number, prefilled); overdue badges, red states, accumulating overdue queues, and countdown urgency (never-ship styling, loss-aversion family — unfinished plans get one calm carry/spread/rest choice, then become plain history); straight-line "expected %" pace verdicts with arbitrary ±5 bands (replaced by descriptive arithmetic over the user's own recorded actuals — the planning-fallacy correction, Buehler 1994 via the 9.1 addendum); "% consistency" headlines that score unlogged days as 0 (mirrors, not grades — forgetting to log is not not-doing, and the model cannot tell the difference so it must not grade it; counts, never percentages); freely backfillable habit history (Phase 9's unlimited-editing rejection stands — only a labeled yesterday-grace survives, per 9.5's clamped-repair precedent); "build a habit in 21/30 days" progress UI (explicit never-ship, Lally 2010 — all duration copy is months-scale, high-variance); per-habit reminders or any push (always-on-nudging ban; the JITAI evidence is heterogeneous and often underpowered — the 2025 mental-health-specific review found only slight effects, g = 0.15, per the report's verification note — so every foundations surface is pull-only, and the single in-app restart offer is capped and self-explaining); rewards or pet care gated on habit completion (Deci 1999, d = −0.36 — the pet celebrates any check-off; nothing is withheld for a miss); and a second growth-tree organism (Bloom already has a pet; splitting the metaphor across two creatures dilutes both — the pet's existing reactions do the celebrating).
>
> **Schema coordination note (binding for every 10.x step):** several open Phase 8/9 steps also bump `SCHEMA_VERSION`, so no 10.x step may hardcode a version number. The rule is always relative: read the then-current `SCHEMA_VERSION = N`, set it to `N + 1`, and append `MIGRATIONS[N]` (upgrading a v_N blob to v_N+1), annotated `// PLAN 10.x`. Field-optional additions still bump, with a pass-through migration and a comment saying why (v4→5 / v7→8 / v11→12 / v16→17 precedents). Every new slice ships a total `sanitizeX(raw: unknown)` normalizer wired into `withDefaults`, with a `.test.ts` beside it.
>
> **Product-quality baseline (binding for every 10.x UI step):** apply the relevant criteria in
> `docs/product-quality.md` for semantics, keyboard/touch/screen-reader equivalence, responsive and
> virtual-keyboard layouts, contrast and motion preferences, state coverage, error recovery, measured
> performance, and component/integration/accessibility/visual regression tests. `docs/science.md`
> remains binding only for the behavior-change mechanisms and scientific claims named in each step.
>
> **Open-step interactions (read before starting):** all day bucketing in this phase MUST go through 9.2's `dayKeyFor` — never another midnight-hardcoded helper (several ad-hoc ones existed; the consolidation half of 9.2 was extracted to `src/store/dayKey.ts` in July 2026, and 9.2 proper adds the setting + migration). 10.3–10.5 **extend** 9.6's daily target and 10.2 builds on 8.12's `OpenSession.goalId` carry — extensions, never forks; **Phase 10 promotes 8.12 from its "(Optional)" status to load-bearing.** Pace and calibration copy beyond plain descriptive arithmetic is blocked on **9.1**'s evidence addendum (Buehler, Bandura & Schunk, Locke & Latham). 8.3's day-rollover signal carries 10.5 and 10.8. **9.3**'s HistoryScreen is the only home for per-day habit history rows (10.11 extends it; nothing here builds a parallel history surface), and 9.3's archive shape gains a per-day completed-session-count requirement from 10.7's derived foundation. If one of those steps lands with a minor implementation difference that preserves the same goal and scope, update this unchecked step's assumptions, Files, and tests before continuing. Stop for user direction when the difference materially changes product behavior, privacy, persisted data, security, or the numbered step's scope.

### - [x] 10.1 Goal units + one progress ledger

- **Goal:** Make goal progress a record, not a counter — the auditable spine 10.2–10.6 credit, carry, and calibrate against. **(a) Units:** `Goal` gains optional `unit?: string` (trimmed, 1–16 chars; absent → copy renders "parts"); the add form gains one optional "counted in…" input, placeholder "parts" — no new required field. Every surface renders amounts as `"{n} of {total} {unit}"` with no singular/plural transformation, so the Friction Journal's naive `s`-stripping bug is structurally impossible (helper text asks for a word that reads well with any number). **(b) Ledger:** new React-free module `src/store/goalLedger.ts`: `GoalCredit = { id, goalId, delta, source: 'manual' | 'session' | 'carryover', sessionId?, dayKey, at }`. Field rules, exactly: `id` mirrors the `newSessionId` maker pattern in `sessions.ts`; `goalId` typed to match `Goal.id` exactly (check `goals.ts` — do not invent a parallel id scheme); `delta` a signed non-zero integer (negative allowed for corrections/undo), clamped so the derived total stays in range; `dayKey` written via `dayKeyFor(Date.now())` only, re-validated on load against `/^\d{4}-\d{2}-\d{2}$/` (invalid → row dropped); `source: 'carryover'` reserved for migration seeds and compaction baselines. **Derivation invariant (the point of the step):** `goal.done === clamp(Σ deltas for that goal, 0, goal.target)` — `done` stays persisted as a denormalized cache but is recomputed from the ledger by the sanitizer on every load (the Friction Journal's stored-never-trusted `completionPercentage` pattern). The `logGoal` reducer case in `useBloom.ts` is rewritten to append a `source:'manual'` row and re-derive; `removeGoal` drops the goal's rows (session records keep their `goalId` snapshot, so history stays legible — the FJ deletion lesson). **Cap without loss:** `GOAL_LEDGER_CAP = 1000`; past it, `compactGoalLedger` folds the oldest rows into one `source:'carryover'` baseline row per goal — but it never folds rows whose `dayKey` falls within the last 84 days (10.3's daily-pair retention window, which also covers 10.6's 28-day outlook window); if the cap is exceeded entirely by recent rows, the cap yields, not the window (keep the rows). Unit tests prove Σ per goal is unchanged **and** that per-day derived actuals and 10.6's `observedLanding` inputs are identical before and after compaction (never the session log's silent drop; 9.3 set that precedent). **Migration:** bump `SCHEMA_VERSION`; `MIGRATIONS[N]` seeds one carryover row per existing goal with `done > 0`, so the invariant holds from day one and no user's progress moves by even one part. `sanitizeGoalLedger(raw, goals)` drops malformed and orphaned rows and re-derives every `done`. If this exceeds one session, split (a) units and (b) ledger+migration into sub-steps per the rules of thumb.
- **Science:** n/a for the ledger, migration, sanitizer, and data-integrity architecture. Existing
  progress-monitoring and flow evidence applies only to the user-facing goal-unit/progress presentation;
  it does not justify the engineering design.
- **Quality:** `docs/product-quality.md` — Error prevention, confirmation, undo, and recovery;
  Privacy and security; Component, integration, accessibility, and visual regression testing.
- **Files:** `src/store/goalLedger.ts` (new) + `goalLedger.test.ts` (new), `src/store/goals.ts` (unit field) + `goals.test.ts` (new), `src/store/useBloom.ts` (`PersistedShape`, `BloomState`, version bump + seeding migration, `logGoal`/`removeGoal` cases, `withDefaults` wiring), `src/screens/GoalsScreen.tsx` (unit input + "X of Y unit" rendering).
- **Done when:** `npm test` covers: seed migration preserves every existing `done` exactly (v_N fixture blob migrates losslessly); manual +/− round-trips through the ledger; clamp at `[0, target]` holds under negative and oversized deltas, recording the *applied* delta, not the requested one; compaction preserves per-goal sums and the 84-day window; sanitizer drops invalid dayKeys and orphaned rows; a goal without a unit renders exactly as today. `npm run build` green.
- **Depends on:** 9.2 (dayKeyFor), 1.1; coordinates with 8.2 (edit surface) and 8.20 (a goal reaching `target` sets `completedAt` there).

### - [x] 10.2 One-tap session→goal credit in the debrief

- **Goal:** Close the loop 8.12 opens — with **one** inline row, never a second modal, never a third (fixing the Friction Journal's three-stacked-dialogs ending). Arming: a 1-tap goal-link affordance (on the 10.4 strip once it lands; until then a small link on the goal card) stamps `goalId` onto `OpenSession` via 8.12's field for the next session start; the armed state is transient reducer state, not persisted; tap again disarms. **Precedence rule (binding):** on session start, a transiently armed goal overrides the active task's persisted goal link for that session only; with no armed goal, the task link applies; disarming clears only the transient state. `removeGoal` also clears a matching `armedGoalId`; a session finalized with a `goalId` whose goal no longer exists or is already done shows no row and writes nothing (the sanitizer already drops orphaned rows). When a finalized work session carries a `goalId` and the goal isn't done, the existing debrief (4.2) gains one inline row — "Move {goal}?" with a stepper prefilled to `min(goalPace(goal).perDay || 1, remaining)`, a credit button, and a skip button. Crediting appends exactly one `source:'session'` ledger row with the session's id and `dayKeyFor(session end)` — which also advances any 10.3 daily-target actual, because actuals are derived from this same ledger. **Kind clamp:** an entry above `remaining` credits the remainder with a soft one-line note ("counted the {n} that were left") — never an error state. **Skip** writes nothing, costs nothing, and can never re-ask: the debrief renders **at most once** per session, so no recorded-flag machinery is needed (the FJ `studyProgressRecorded` gate existed because its modal could reopen; Bloom's doesn't). A session whose debrief never surfaced (finalized while the screen was unmounted) is simply creditable via manual +/− — no recovery queue, no added machinery. Manual +/− and session credit share one write path and one clamp (10.1), so they can never double-count differently.
- **Science:** §Staying — flow row (Fong et al. 2015, meta-analysis: clear goals *with immediate feedback* — the credit line is the feedback half of 4.2's session target, generalized to the goal); §Measurement — progress monitoring row (Harkin 2016: recording tends to help — the permitted hedge); §Measurement — feedback row (Krukowski 2024: simple, low-frequency — exactly one question, only in the surface the user already sees, no push anywhere).
- **Files:** `src/components/DebriefCard.tsx`, `src/store/useBloom.ts` (transient `armedGoalId` + credit action/reducer case — no schema change beyond 8.12's own), `src/store/goalLedger.ts` (reuse the append helper), `src/screens/GoalsScreen.tsx` (arm affordance).
- **Done when:** Fixture flow passes: arm → start → complete → debrief shows the row once → one tap writes exactly one ledger row with `sessionId` and correct `dayKey`; the precedence rule (armed beats task link, disarm restores it) is unit-tested; over-entry clamps and shows the soft note; skip leaves zero entries and zero re-asks; a goal-less session shows no row; every interaction ≤1 tap; all new strings pass docs/voice.md; `npm run build` green.
- **Depends on:** 10.1, 8.12, 4.2, 9.2.

### - [x] 10.3 Day plan model — extend 9.6's daily target, frozen snapshots, derived actuals

- **Goal:** Grow `src/store/dailyTarget.ts` (9.6's module — same slice, same file, no parallel model) from one target into a small day plan: up to `DAY_PLAN_CAP = 3` goal-linked targets per study day — **the cap counts goal-linked targets only; a 9.6 task-linked target coexists outside the cap.** Targets may be created for any day from today through `goal.due` (10.4 exposes this). `DailyTarget = { id, dayKey (via dayKeyFor), goalId, plannedAmount (integer 1–99, clamped ≤ goal remaining), snapshot: { title ≤80, unit ≤16 }, createdAt, carriedFromDayKey?: string }`. The `snapshot` is frozen at creation so a target stays readable after its goal is edited or deleted (the Friction Journal's `targetSnapshot`/`studyContext` integrity idea, kept whole). **Actuals are never stored:** `targetActual(target, ledger) = clamp(Σ 10.1 deltas for that goalId on that dayKey, 0, plannedAmount)` — the derived pattern, which structurally eliminates the task-counter-vs-resource-counter desync the Friction Journal reconciles by hand; one source of truth, no reconciliation path to miss. Editing `plannedAmount` is allowed for today's targets only; lowering below the derived actual soft-clamps planned to actual (no error dialog). `carriedFromDayKey` (regex-validated) marks a carried target so 10.6's calibration can distinguish "planned fresh" from "carried". **History without unbounded growth:** keep 84 days of daily pairs; older pairs compact into weekly `{ weekKey, plannedSum, actualSum }` rows persisted as `dailyTargetArchive: WeeklyPair[]` alongside the targets array in `PersistedShape`, so calibration keeps its inputs forever — compaction preserves both sums (unit test; never a silent prune). Task-linked single targets stay exactly as 9.6 shipped them; this step generalizes the goal-linked case only. **Migration:** bump `SCHEMA_VERSION`; `MIGRATIONS[N]` lifts a 9.6 single target into a one-element array losslessly.
- **Science:** 9.1 addendum — proximal subgoals (Bandura & Schunk 1981: day-sized goals raise self-efficacy) and specific-beats-vague (Locke & Latham 2002) — cited in copy only after 9.1 lands; §Staying — flow row (Fong et al. 2015: finishable goals + immediate feedback — the derived actual *is* the immediate feedback); §Measurement — feedback row (Krukowski 2024, mixed evidence: hence the hard cap of 3, one number per target, no entry modes — the Friction Journal itself converts percentages and ranges to units at save; we collect one number).
- **Files:** `src/store/dailyTarget.ts` + `dailyTarget.test.ts`, `src/store/useBloom.ts` (version bump + migration, `addDailyTarget` / `editDailyTarget` / `dismissDailyTarget` reducer cases).
- **Done when:** Tests prove: cap of 3 enforced on goal-linked targets and a task-linked target coexists; snapshot survives goal deletion; derived actual tracks ledger events and clamps both ends; soft-clamp on lowering; pair compaction preserves both sums; the 9.6→10.3 migration keeps an existing single target identical in meaning; a session credited at `dayStartHour − 1 min` counts to the prior study day. Build green. No UI in this step.
- **Depends on:** 9.6, 9.2, 10.1.

### - [ ] 10.4 Day plan UI — two taps from suggestion to plan

- **Goal:** Zero-navigation answer to "what should I do today," living where the user already is. **GoalsScreen** gains a "Today" section at the top (planner-gated like the rest of the screen): each target renders title, `actual/planned unit` text, a quiet progress bar (derived actual), and an edit affordance. The add flow is deliberately two interactions (fixing the Friction Journal's five-field modal): tap "plan today" on a goal card → one number input **prefilled with `goalPace()`'s suggested per-day amount** → confirm. The flow's date defaults to today but accepts any day up to `goal.due` (10.3's model already keys targets by day) — a future-day target simply appears in the Today section when its day arrives; there is deliberately **no "upcoming" list to tend**, so week-ahead planning exists without FJ's overdue-pile failure mode. No mode selector, no percentage, no range. **FocusScreen**, directly under the task row **while idle only** (the running screen stays clean; 9.6's quiet chip covers in-session display): one strip — `🌱 {goal title} · {done} of {target} {unit} · today {actual}/{planned}` — 0 taps to read, 1 tap arms crediting (10.2's affordance moves here), tap again disarms; tapping its label navigates to Goals. With multiple targets the strip shows the armed target if any, else the least-complete one, and a small chevron advances to the next — **no timed rotation; the strip never moves on its own.** The **debrief echo** lists each target the session's credit touched (one line each, max 3). The whole surface is skippable: no target set → FocusScreen renders identically to before this step; strip absent when `settings.planner` is off or no goal exists. Coordinate placement with 8.18's pre-start hierarchy so nothing new lands above the start button. All new strings `PLACEHOLDER_COPY`, already passing voice rules 2/3/6/10.
- **Science:** §Staying — flow row (Fong et al. 2015: the strip is the immediate-feedback half of the day-scale target 9.6 defines); §Measurement — feedback row (Krukowski 2024: one chip, one section, no new screen and no dashboard).
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Keyboard, touch, and screen-reader
  support; Responsive layout; Visual hierarchy; Loading, empty, and failure states; regression testing.
- **Files:** `src/screens/GoalsScreen.tsx`, `src/screens/FocusScreen.tsx` (strip), `src/components/DebriefCard.tsx` (echo).
- **Done when:** On fixtures: plan a target in two interactions with the pace prefill; a future-day target renders on its day and never before; run a credited session; strip and Today section update from the derived actual without any stored counter; debrief echoes it; with no targets, FocusScreen renders identically to before; every strip interaction ≤1 tap and nothing animates unprompted; progress semantics, focus order, keyboard and screen-reader operation, small-screen/virtual-keyboard layout, and representative component/visual states pass; `npm run build` green, no console errors.
- **Depends on:** 10.2, 10.3; coordinates with 8.18.

### - [x] 10.5 Rollover triage — carry, spread, or let it rest (never an overdue pile)

- **Goal:** The triage the Friction Journal never built (its overdue items pile up behind one-by-one clicks). Offer condition, exactly: on boot and on 8.3's day-refresh signal, offer only when `lastRolloverOfferDay !== dayKeyFor(now)` **and** yesterday's targets have derived actual < planned; showing the card sets `lastRolloverOfferDay` (persisted — version bump + pass-through migration annotated `PLAN 10.5`). The Today section then shows one calm dismissible card — never a modal, never red, never a badge: "{n} {unit} from yesterday's plan didn't happen. Carry it, spread it, or let it rest." (`PLACEHOLDER_COPY`; data-fired → basis stated in the string, per checklist item 8). The card carries a small footer stating its own cap in plain words — "shows at most once a day" — per voice.md's visible-cap guardrail (mirroring how 10.10 surfaces its cap in the picker sheet). Three buttons: **Carry to today** (creates a today target for the remainder, `carriedFromDayKey` set, clamped to goal remaining); **Spread it** (opens the 10.4 add flow prefilled with `goalPace()`'s recomputed per-day amount over the days left — pure existing arithmetic from `goals.ts`, the redistribute affordance the Friction Journal's data supported but never used; the math suggests, the user confirms); **Let it rest** (dismisses; the planned-vs-actual pair stays in history untouched — **past pairs are never mutated**; yesterday's record keeps saying "1 of 3" forever, the snapshot integrity guarantee generalized). Only yesterday ever prompts; older unfinished targets are already plain history. Dismissing costs nothing and triggers no follow-up. A past-due goal gets 10.6's shrink-or-move offer instead — no separate escalation.
- **Science:** §Recovering — self-forgiveness row (Wohl et al. 2010; Sirois 2014: kind restart framing after a shortfall predicts less future avoidance — "let it rest" is a first-class option, not a failure path; restart framing is mandatory here, not decorative); 9.1 addendum — planning fallacy (Buehler 1994: resizing against actuals is calibration, not quitting — copy stays descriptive arithmetic until 9.1 lands); §Do not build — punitive loss framing (an accumulating overdue list is loss-aversion UI; excluded by construction).
- **Files:** `src/store/dailyTarget.ts` (pure `rolloverOffers(targets, todayKey)` + tests), `src/screens/GoalsScreen.tsx`, `src/screens/FocusScreen.tsx` (strip-mount check), `src/store/useBloom.ts` (`lastRolloverOfferDay` — version bump + pass-through migration annotated `PLAN 10.5`).
- **Done when:** Fixture rollover produces exactly one card with three working actions and none the same study day; the cap footer is visible on the card; a two-day-old unfinished target shows nothing; carry sets `carriedFromDayKey` and clamps at goal remaining; "let it rest" never re-offers and leaves history intact; a `dayStartHour` 03:00 boundary test passes; grep of new strings for `red|overdue|behind|fail` returns clean; build green.
- **Depends on:** 10.3, 10.4, 8.3, 9.2.

### - [x] 10.6 Outlook from your own throughput — guarded, descriptive, one surface each

- **Goal:** Replace calendar-division guesswork with the user's demonstrated pace — the single most useful thing the Friction Journal never did with its own data. Three read-only lines, all pure functions, each behind an `enoughData` guard, each descriptive arithmetic with its basis stated in the string. **(a) Goal-card outlook:** `observedLanding(ledger, goal, now)` in `src/insights/paceActual.ts` — mean positive credited amount per distinct active dayKey over the last 28 days (`source:'carryover'` rows excluded — they aren't dated behavior); returns `null` unless ≥3 distinct dayKeys carry positive credit, and the UI shows nothing on `null` (no "insufficient data" nag — silence, matching `goalPace`'s existing silent-when-unhelpful discipline). Renders one passive line on the goal card: "At the pace you've recorded (about 2 {unit} a day), this lands around {date}." If the projection falls after `due`, append the invitation "Based on your pace so far, this might land after its date. Shrink it, or move the date?" with 8.2's edit affordance — never a badge, a color state, or a prompt outside the card. When `enoughData` is true this line supersedes `goalPace`'s suggestion (one pace surface total, not two); never a percentage, never "ahead/behind" labels, no ±5 verdict band (FJ's arbitrary judgment band is exactly what we're not building). Recomputed on render only; insights read the ledger, never write. **(b) Effort translation** on 10.4's add form — the median credited amount per session **for that goal**: median over `source:'session'` rows for that goal within the same 28-day window as (a), guard ≥3 such rows; when it clears, show "3 lectures is about 2 of your usual sessions."; otherwise nothing renders (FJ computed "needed per day" from nothing; we only speak from the record). **(c) Weekly calibration** — extend 9.6's calibration line to the day plan: when ≥3 days last week had targets, one sentence inside 2.3's review comparing Σ planned vs Σ derived actual ("You planned 12 and recorded 9 — planning 9 might feel better."), with carried targets distinguished via `carriedFromDayKey`.
- **Science:** 9.1 addendum — planning fallacy (Buehler, Griffin & Ross 1994: people underestimate completion times; feedback from past actuals improves calibration — (a) and (c) are exactly that correction; **this step must not start before 9.1 lands**); §Measurement — feedback row (Krukowski 2024: format evidence mixed, no single winner → one line per surface, low frequency, never pushed); §Measurement — progress monitoring design implication (Harkin 2016: highlight behavior patterns, not just time totals); feature rank 8 (weekly reflection, "Very strong" — why (c) lives in the review and nowhere else, per Phase 9's dashboard rejection).
- **Files:** `src/insights/paceActual.ts` (new) + `paceActual.test.ts` (new), `src/store/goalLedger.ts` (median-per-session helper + tests), `src/insights/weekly.ts` + `weekly.test.ts`, `src/screens/GoalsScreen.tsx`, `src/components/WeeklyReview.tsx`.
- **Done when:** Tests prove every guard: 2 active days → `null` and none of the three lines; 3 days → a projection; carryover rows excluded; the per-goal median ignores other goals' rows; projection date arithmetic exact across a month boundary and a `dayStartHour` boundary; exactly one pace line ever renders per goal; no string contains a percentage or a verdict word (grep `behind|late|off track|should` clean); review length budget unchanged; entirely absent when the planner toggle is off; build green.
- **Depends on:** 9.1 (blocking), 10.1, 10.2, 10.3, 2.3, 8.2.

### - [x] 10.7 Foundations — data model (four curated, one custom, one derived)

- **Goal:** New React-free module `src/store/foundations.ts` — the habits data layer, deliberately small. **Catalog** (`FOUNDATION_CATALOG`, frozen const, never persisted): exactly four manual templates, each `{ type, name, description, tinyVersion, evidenceNote }` — `phone-away` ("phone in another room before the first session"), `desk-reset` ("clear the desk before starting"), `tiny-start` ("one two-minute start on the hardest thing"), `tomorrow-note` ("write tomorrow's first move before stopping") — plus one `custom` slot (user-named, ≤24 chars) and one **integrated** type `focused-work` ("finished at least one session" — derived, never stored, never manually editable). **Every manual foundation is binary** — done/not, one tap; no counts, durations, amounts, targets, or measurements: that single decision deletes the survey app's quantity UIs and per-amount target-snapshot machinery in one move (the target is "done", so history can never be re-scored). Types, exactly: `FoundationInstance = { id: 'fnd-' + type (one instance per type, natural id), type, customName?, enabled, order ≥ 0, ranges: { from: dayKey, to?: dayKey }[] (active periods — disabling closes the open range, re-enabling opens a new one; days outside ranges are never rendered or counted, fixing FJ's hidden-month-scored-as-zero bug), ifThenId?: string, lastRestartOfferDayKey?: string, createdAt }`. `FoundationEntry = { id: instanceId + ':' + dayKey (natural key — one entry per instance-day; all writes are upserts by id, which makes 9.4 import merges collision-free by construction), instanceId, dayKey (via dayKeyFor only, load-validated against /^\d{4}-\d{2}-\d{2}$/, invalid → dropped), recordedAt, late?: boolean }` — **presence means done; absence means "no entry", never a miss, never 0%** (forgetting to log ≠ not doing; the model cannot express the difference so it must not grade it). Hard cap `FOUNDATION_ACTIVE_CAP = 3` manual enabled at once (the derived one doesn't count) — the anti-metrics-zoo line, enforced in the sanitizer, the reducer, and the UI. **Growth bound:** entries capped at 1200; overflow compacts the oldest whole months into `FoundationMonthSummary = { instanceId, monthKey: 'YYYY-MM', doneDays }` in a `foundationArchive` array — compaction preserves counts (unit test; never a silent drop). The month archive is **stewardship-only**: it preserves counts for export/merge integrity (hard constraint #2) and is deliberately never rendered — long-range views are excluded under Phase 9's dashboard rejection, not deferred; do not invent a chart for it. **Derived selector:** `derivedFoundationDone(records, dayKey)` uses a record-level predicate `sessionCountsTowardDay(record)` **extracted into `sessions.ts` as part of this step** — today the which-sessions-count policy lives implicitly at the `bumpStreak` call sites in `useBloom.ts`, so route those call sites through the new predicate so the streak and the derived foundation genuinely share one policy; a fixture test asserts the derived selector agrees with the reducer's streak decision on the same records. No entry row is ever written for `focused-work`: the reducer refuses toggles for integrated instances (not just the UI), and the sanitizer strips any persisted entry for an integrated type. **Sanitizer** `sanitizeFoundations(raw: unknown)` is total: unknown `type` → instance **dropped**, never coerced to another type (explicitly not FJ's unknown→"dua" bug); entries deduped by id keeping newest `recordedAt`; more than 3 manual enabled → keep the 3 with lowest `order`; dangling `ifThenId` cleared. Entry deletion allowed for today and yesterday only. Add `settings.foundations: boolean` (default **false** — opt-in, mirroring `settings.planner`). **Migration:** bump `SCHEMA_VERSION`; pass-through `MIGRATIONS[N]` with a comment (new optional slice; `withDefaults` supplies `{ instances: [], entries: [], archive: [] }`). Reducer actions `toggleFoundationDay`, `setFoundationEnabled`, `reorderFoundation`, `renameCustomFoundation` join the `Action` union with creators in the memoized `actions` object. No salah analog, no weight, no meals, no water — see the phase preamble's rejected list. If this exceeds one session, split types+sanitizer+migration and compaction+derived-selector into sub-steps per the rules of thumb.
- **Science:** §Measurement — progress monitoring row (Harkin 2016, meta-analysis: recording tends to help — monitoring frequency d = 1.98, attainment d = 0.40); habit-formation rows (Lally 2010 + Singh 2024: median 66 days, range 18–254 — no field, cap, or copy in this model may imply a habit "completes"); Krukowski 2024 + the report's closing principle ("track a small number of behaviors well… avoid making the metrics feel moralized") are the direct authority for the four-template catalog, binary-only tracking, and the 3-active cap. Per-template traces: Ward 2017 phone-presence + Sonnentag & Kühnel 2016 (moderate, diary/lab — soft framing, no pooled effect quoted) for `phone-away`/`desk-reset`; Felkey 2023 microcommitments (single field study — "worth an experiment" is the only permitted hedge) for `tiny-start`; Gollwitzer & Sheeran 2006 (d = 0.61 for starting) plus the parking-lot offloading precedent (5.1) for `tomorrow-note`.
- **Files:** `src/store/foundations.ts` (new) + `foundations.test.ts` (new), `src/store/sessions.ts` (extract `sessionCountsTowardDay`), `src/store/useBloom.ts` (`PersistedShape`, `BloomState`, settings default, version bump + pass-through migration, actions/reducer, `withDefaults` wiring, route `bumpStreak` call sites through the shared predicate).
- **Done when:** Tests cover every rule by name: toggle idempotent per day through `dayKeyFor`; 4th-manual-enable refused; ranges across disable/re-enable (a hidden month yields zero counted days); yesterday-delete allowed, older refused; month compaction preserves `doneDays` exactly; derived selector agrees with the reducer's streak decision on shared fixtures, including a 23:30 finish with `dayStartHour: 3`; no reducer action can write a `focused-work` entry (refusal asserted); sanitizer drops unknown types and survives garbage/truncated blobs; a v_N fixture migrates forward with zero data change. Build green. No UI in this step.
- **Depends on:** 9.2 (blocking — no foundation day-math may hardcode midnight), 5.4, 1.2; slice pattern per 1.1/3.1.

### - [ ] 10.8 Foundations card — one tap, where idle moments already live

- **Goal:** One compact surface, no new screen, no modal in the daily path. Settings gains a "Daily foundations" toggle (off by default, one-sentence explanation, no upsell). When on, `src/components/FoundationsCard.tsx` renders at the top of TasksScreen, above the ongoing list: one row of ≤4 chips — glyph + name + today's state (hollow bud outline → filled leaf when done). **Tap = toggle, exactly 1 tap**, `aria-pressed`, announced via the existing live-region pattern. Header is a descriptive count, never a percentage: "2 of 3 tended today 🌱" (`PLACEHOLDER_COPY`). The derived `focused-work` chip renders read-only with the caption "counted from your finished sessions" (basis stated, checklist 8) — no toggle element exists on it structurally. All writes go through one reducer path that resolves today via `dayKeyFor` and re-resolves on 8.3's local-day refresh signal and `visibilitychange`, so a card left open across the boundary rolls to the new day. A "tend" button (also the empty state's only affordance — "Tiny daily things that feed focus. Plant up to three." `PLACEHOLDER_COPY`) opens the picker sheet built on 8.4's accessible dialog: the catalog with enable/disable, custom rename, ↑/↓ reorder, and the cap line on a 4th manual enable — "Three at a time — small and steady beats a big dashboard." (`PLACEHOLDER_COPY`). **Disable ≠ delete** — disabling hides the chip, keeps entries and archive, and the sheet says so. **Echo surface:** during breaks, the same chip row (same component, prop-driven) renders under the parking lot — the natural idle moment, following 5.1's break placement — so checking a foundation never interrupts work. **Zero prompts anywhere:** no check-in asks about foundations, no companion nag, no notification; the surface waits to be touched. The pet (when Companion Mode is on) may do its existing happy bounce on any check-off; nothing is ever withheld for a miss, and everything works with Companion off.
- **Science:** §Measurement — progress monitoring row (Harkin 2016: physically recording the behavior tends to help — the whole card is the recording affordance, made one tap); §Measurement — feedback row (Krukowski 2024: counts, no scores, no chart on this card); §Do not build — always-on nudging (a surface that never speaks first; the JITAI evidence is deliberately left unused here) and no red/failure styling; Deci et al. 1999 (celebration acknowledges the act, gates nothing).
- **Files:** `src/components/FoundationsCard.tsx` (new), picker sheet component (new), `src/screens/TasksScreen.tsx`, the break branch of `src/screens/FocusScreen.tsx` (beside the parking lot), `src/components/SettingsSheet.tsx`, `src/store/useBloom.ts` (no schema change — 10.7 landed the shape).
- **Done when:** With the setting off, TasksScreen renders identically to before; in `npm run dev`, a check-off persists across reload (`bloom-state` devtools inspection); a 23:50 check with `dayStartHour` 03:00 lands on the intended study day; the derived chip renders no button element; the 4th enable is calmly refused with the cap copy; disable keeps history; both surfaces render the same state; touch targets meet 8.8's minimum; no percentage or red styling anywhere; all strings `PLACEHOLDER_COPY` and pre-checked against the never-ship lexicon; build green, no console errors.
- **Depends on:** 10.7, 8.3, 8.4; break placement per 5.1.

### - [x] 10.9 Two weeks of dots — consistency shown, never guarded (+ yesterday grace)

- **Goal:** Tapping a chip's **name** (not its toggle area) expands the card into that foundation's detail: a 14-day dot row — filled leaf = recorded day, hollow bud = active-but-no-entry, faint dot = outside active ranges — three visually distinct states, none red, none labeled a miss; plus **one density line** from pure `foundationDensity(instance, entries, todayKey)`: "9 of the last 14 days — steady is the whole game." (`PLACEHOLDER_COPY`; a count, never a percentage, never a chain). The window is `min(14, days since adoption)` and counts only days inside active ranges — a freshly adopted or long-hidden foundation is never measured against days before or outside its own tracking window (the FJ tracking-window bug, fixed by construction). **Yesterday grace:** yesterday's dot (only) is tappable to add or remove a late check — 9.5's clamped-repair precedent applied to habits: the entry is stored with `late: true`, renders a small "added later" label, and **no celebration, pet reaction, or streak effect fires from a late add** (tested), mirroring 9.5's no-retroactive-reward rule. Older days are not editable — a forgotten log stops being an unappealable zero without opening the record to self-deception. No month grid, no chart, no percentage anywhere; this card stays the only foundations-specific view (9.3's HistoryScreen gets its day chips in 10.11).
- **Science:** §Measurement — habit-formation row (Lally et al. 2010; Singh 2024: median 66 days to automaticity, range 18–254 — density-over-a-window framing, months-scale copy, never a countdown); §Do not build — punitive streak loss (consistency may be shown, never guarded); §Recovering — self-forgiveness row (Wohl 2010: gaps get welcome-back framing, never mourning); 9.5 precedent (labeled repair, no retroactive reward).
- **Files:** `src/components/FoundationsCard.tsx`, `src/store/foundations.ts` (`foundationDensity` + late-entry helper + tests).
- **Done when:** Selector fixtures: a hidden month renders faint, uncounted days; density counts recorded days only within active ranges and the window clamps to the adoption day; late add sets `late: true` and a test proves no celebration path executes; grep of new strings for `streak|%|chain` plus the never-ship list returns clean; build green.
- **Depends on:** 10.7, 10.8, 5.4 (styling precedent), 9.5 (repair precedent).

### - [x] 10.10 Cue anchors and gentle restart

- **Goal:** Two integrations, both invitation-only, wiring foundations into the phase's strongest evidence. **(a) Anchor a foundation to a cue:** in the picker sheet, each active manual foundation gets an "anchor it" affordance (1 tap) opening the **existing** if–then create flow (`IfThenPlanner`) prefilled — `actionText` = the foundation's action phrase from its catalog entry, `cueType` defaulting to `time`, and the `cueText` field focused so the user supplies their own anchor ("after coffee", "when I sit down"). Saving goes through the existing `ifThen.ts` CRUD — the cap of 20 and its existing at-cap message apply unchanged. The plan's id lands in `FoundationInstance.ifThenId` (field shipped in 10.7 — no new bump); the chip then shows the cue as small subtext ("after coffee"); checking the foundation bumps the linked plan's `usageCount`; a deleted plan degrades gracefully (sanitize clears the dangling id, subtext disappears). Whole flow ≤3 taps, zero new UI systems. **(b) Gap restart:** pure `gapRestartOffer(entries, instance, todayKey)` — when a manual foundation has ≥3 consecutive unrecorded *active* days since its last entry, its card (never a prompt, notification, or check-in) shows one inline restart line with a tiny-version button showing the template's `tinyVersion` text; tapping it records today's normal entry. Capped once per gap via `lastRestartOfferDayKey` (field shipped in 10.7), re-offered only after a new entry and a new gap; the offer states its basis in the string ("it's been a few days since the last record") and the cap is visible in the picker sheet, per the voice guardrail; dismissing costs nothing and triggers no follow-up. Copy uses restart framing ("A gap is just weather. Want the two-minute version?" — `PLACEHOLDER_COPY`); tiny-version strings hedge at "worth an experiment" level.
- **Science:** §Starting — implementation intentions row (Gollwitzer & Sheeran 2006, meta-analysis: d = 0.65 overall / d = 0.61 for starting — the strongest evidence in this phase, and `ifThen.ts` is the existing evidenced home; "tends to help" is the permitted hedge); §Recovering — self-forgiveness rows (Wohl 2010; Sirois 2014: kind restart is mandatory framing, not garnish); §Starting — microcommitments (Felkey 2023, single field study: the tiny version is promising, not settled); §Measurement — JITAI row (heterogeneous, often underpowered; the 2025 mental-health-specific review found only slight effects, g = 0.15, per the report's verification note → card-only, capped, self-explaining, never a push).
- **Files:** `src/components/FoundationsCard.tsx` (picker affordance + subtext + restart line), `src/store/foundations.ts` (`gapRestartOffer` + dangling-id sanitize + tests), `src/store/ifThen.ts` (reuse only — no shape change).
- **Done when:** Prefill correct; ≤3 taps end-to-end; the at-cap path shows the existing message and creates nothing; dangling `ifThenId` sanitized to `undefined` on load (test); a 3-day gap shows exactly one offer, at most once per gap across reloads, re-shown only after a new entry and a new gap; the tiny button writes a normal entry; skipping changes no state; all surfaces work with Companion Mode off; build green.
- **Depends on:** 10.8, 10.9, 3.1, 3.2, 5.3 (restart-copy precedent).

### - [x] 10.11 In the record — History chips, one weekly line, stewardship proofs

- **Goal:** Reflection lives only in existing surfaces, and the new slices become first-class citizens of Phase 9's data-stewardship guarantees. **(a) History (9.3):** each day row in HistoryScreen gains a small chip line — foundations recorded that study day (including the derived `focused-work`) and goal-credit totals from the ledger ("+3 lectures toward {goal}"); days with nothing recorded show nothing — no empty slots, no dashes, nothing that reads as a miss; zero new aggregate metrics beyond `sessionStats`. **(b) Weekly review (2.3 — the only sanctioned home for period comparison; Phase 9's dashboard rejection stands):** at most one foundations sentence from pure `foundationsWeekLine(instances, entries, weekKey)` — emitted only when some foundation has ≥3 recorded days this week; the previous-week comparison appears only when both weeks clear the guard (the FJ `enoughData` floor, kept; its percentage grading, dropped); with several qualifying foundations, the most-recorded one is chosen so the line never becomes a list (ties break by lowest instance `order`); counts, never percent change, and the sentence has the **same shape whether the number went up or down** (the mirror rule): "Phone-away on 5 days this week (3 last week) — both count." (`PLACEHOLDER_COPY`). **(c) Stewardship proofs (9.4):** the ledger, foundations instances/entries/archive, and day-plan targets ride the `bloom-state` export automatically — this step adds the tests: extend the round-trip test (export → wipe → import → equal after sanitize); prove merge-by-stable-id per slice — ledger rows union by `id` then every `goal.done` is re-derived (invariant preserved); foundation entries merge by natural key `instanceId:dayKey` with newest `recordedAt` winning (a dedupe, not a conflict, by construction); importing an older backup produces no duplicates and no resurrection of compacted months (entry rows for months already present in `foundationArchive` are dropped — documented + tested); a pre-Phase-10 backup fixture (schema < the 10.1 bump) migrates exactly as localStorage would (added to 7.1's fixture set). If this exceeds one session, split (a)+(b) reflection surfaces and (c) stewardship proofs into sub-steps per the rules of thumb.
- **Science:** §Measurement — progress monitoring design implication (Harkin 2016: highlight behavior patterns, not just time totals; weekly reflection at feature rank 8, "Very strong"); feedback row (Krukowski 2024: one line, low frequency); habit-formation row (Lally 2010: the weekly line never projects a finish line for a habit). The stewardship half claims no behavior change — it operationalizes hard constraint #2 (never wipe or orphan user data).
- **Files:** `src/insights/weekly.ts` + `weekly.test.ts`, `src/screens/HistoryScreen.tsx`, `src/components/WeeklyReview.tsx`, `src/store/foundations.ts` / `goalLedger.ts` (merge helpers + tests), 9.4's export/import module + tests, 7.1 fixture set.
- **Done when:** Below-guard fixtures produce no line and no chips; above-guard fixtures produce the exact expected sentence; up-week and down-week fixtures produce structurally identical sentences; the tie-break is unit-tested; a week with zero foundations data renders the review identically to pre-10.11; the round-trip test is green including all new slices; an older-backup import migrates and merges without duplicates, resurrections, or a changed per-goal ledger sum; History chips render from fixtures with no new derived metric; build green.
- **Depends on:** 9.3, 9.4, 2.3, 10.1, 10.7; 7.1 fixtures.

### - [x] 10.12 Phase 10 copy pass & voice audit

- **Goal:** Replace every `PLACEHOLDER_COPY` string introduced in 10.2–10.11 with final wording that passes the full docs/voice.md checklist. Specific hedging obligations, fixed by the evidence map: Harkin-backed recording lines may say "tends to help"; Felkey-backed strings (tiny versions, `tiny-start`) say "worth an experiment"-class language; Lally-backed strings speak in "months, and it varies" — the literal digits "21", "30 days", "66 days" never appear in UI copy (66 is a citation, not a promise); pace and outlook lines stay descriptive arithmetic plus invitation ("might land around…", "Shrink it, or move the date?"), matched to 9.1's grades; every data-fired string (rollover card, outlook line, gap offer, weekly lines) states its data basis inside the string; miss-adjacent copy uses restart framing ("Yesterday didn't happen. Today can."; "A gap is just weather."); the pet suggests and celebrates, never leverages its own feelings. Run the never-ship grep over **every user-facing string rendered by Phase-10-touched components** (not just newly added strings): `fail|broke|lazy|wasted|discipline|willpower|guilt|shame|excuse|optimal|proven|detox|you should|be honest|no excuses|we missed you|lost|lose|back to zero|break the chain|protect your streak|sad|sick|hungry|disappointed|gone|overdue|behind|21 day|dopamine` — stems (guilt, excuse, lose) deliberately catch variants; pet-state and common-word terms (sad/sick/hungry/disappointed/gone, lose, behind) flag their hits for manual review rather than blanket failure. Wire the grep into `npm test` as a copy-lint so regressions can't ship silently. This pass also reworks the **pre-existing** `dueLabel` chip string "overdue" (`src/store/goals.ts`) into voice-safe wording (e.g. "past its date") — the `GoalStatus` enum value may stay; the user-facing string may not — since GoalsScreen is a Phase-10 surface and the lint would rightly catch it. Any pairs worth keeping are appended (never rewritten) into voice.md's examples.
- **Science:** docs/voice.md is binding for every user-visible string; evidence hedging matched row-by-row to the confidence grades in docs/science.md and the 9.1 addendum (§How to read this report); Deci 1999 and the Do-not-build rows as negative constraints on celebration and prompt copy — this step is the enforcement pass for the phase's premise.
- **Files:** every Phase 10 surface file (`FoundationsCard.tsx`, picker sheet, `DebriefCard.tsx`, `GoalsScreen.tsx`, `FocusScreen.tsx`, `WeeklyReview.tsx`, `HistoryScreen.tsx`, copy constants in `foundations.ts`/`goalLedger.ts`/`dailyTarget.ts`), the copy-lint test file (new), `src/store/goals.ts` (`dueLabel` rework), `docs/voice.md` (append-only, if warranted).
- **Done when:** `grep -rn "PLACEHOLDER_COPY" src/` shows no Phase 10 markers; the copy-lint test is green and wired into `npm test`; no user-facing "overdue" string remains on Phase-10 surfaces; a manual read-through against the 10-point checklist and the 13 allowed/banned pairs is recorded in the step's progress note; build green.
- **Depends on:** 10.2–10.11, 0.2 (last step of the phase).

Open-step gates, stated plainly: **9.2**'s `dayKeyFor` is load-bearing for every step here (its consolidation half landed July 2026 as `src/store/dayKey.ts`; the setting + migration remain 9.2 proper); **9.6 + 8.12** gate 10.2/10.3 — Phase 10's planning steps are extensions of those two, not alternatives, and 8.12 is hereby promoted from optional to load-bearing; **9.1** blocks 10.6 outright (and keeps 10.5's copy descriptive until it lands); **8.3**'s rollover signal carries 10.5 and 10.8; **9.3/9.4** gate 10.11, and 9.3's archive shape gains a per-day completed-session-count requirement from 10.7's derived foundation. Reconcile minor same-goal differences by updating the affected unchecked step's assumptions, Files, and tests. Stop for user direction only when the difference materially changes product behavior, privacy, persisted data, security, or step scope.

### July 26, 2026 implementation evidence

- **Closed in this pass:** 8.11, 8.12, 8.14, 8.17, 8.20, 10.1–10.3, 10.5–10.7,
  and 10.9–10.12. Evidence includes schema fixtures through main v30 and Companion v4,
  reducer/hook/component lifecycle coverage, the Phase 10 copy lint, 498 passing tests,
  a green production build, and a clean `git diff --check`.
- **Implemented but intentionally left unchecked pending the deferred live visual/browser
  evidence in their own done-when clauses:** 8.8, 8.9, 8.18, 9.3, 9.5, 9.6, 10.4, and
  10.8. The 9.3 store work now atomically archives records displaced past the 500-record
  live cap into boundary-rebucketable hourly summaries and retains cleared completed-task
  timestamps; History renders those summaries instead of claiming truncation.
- **9.5 follow-up closed during this pass:** retroactive drift repairs retain both estimated
  onset and estimated duration in the independently versioned Companion v4 log; repaired
  records remain excluded from retroactive XP, streak, celebration, and goal-credit replay.
- **Browser evidence blocker:** the production preview could not bind a local port in the
  managed sandbox, its approval retry was rejected by the environment usage limit, and the
  existing in-app-browser origin was policy-blocked. No checkmark above relies on a claimed
  live browser pass.

---

## Phase 11 — Optional accounts & cross-device sync (local-first, opt-in)

> **Current milestone status:** Entire phase deferred. Accounts, networking, cross-device behavior,
> and real-device sync QA are not part of the fast local browser milestone.
>
> Sync is an optional data-stewardship layer, never a gate around Bloom. A fresh install and every
> existing user remain local-only by default. Signing in and enabling upload are two separate,
> explicit choices. Until both happen, no user data leaves the device; after opt-in, only documented,
> allowlisted auth/sync endpoints may receive traffic. The app shell and every core feature keep
> working offline, export/import remains available without an account, and remote state is never the
> only copy. Pausing sync, signing out, deleting the cloud copy, and deleting local data are distinct
> actions. Sync makes no focus or behavior-change claim.
>
> Phase 11 is the first planned network capability, not blanket permission for later ones. Every future
> network feature needs its own numbered step, feature-specific opt-in, endpoint allowlist, sent-data
> inventory, local-only regression coverage, and pause/export/deletion semantics. Diagnostic reporting
> requires a separate numbered step and explicit enablement; payloads must be minimized, redacted, and
> disclosed before enabling, with no behavioral analytics by default.
>
> **First-release scope:** sync finalized records and durable user-created state, including the main
> `bloom-state` slices, the separate Companion log, History archives, and Phase 10 ledgers/plans.
> Device consent/account metadata, credentials, corrupt-payload diagnostics, live or paused
> `openFocus`/`openFlow`, timer return snapshots, and other unresolved in-session UI stay device-local.
> A future live-timer handoff must be an explicit ownership transfer; no device may silently take over
> or finalize another device's timer.

### - [ ] 11.1 Sync contract, privacy model, and architecture decision

- **Goal:** Write `docs/sync.md` as the binding design before adding a request to runtime code. Specify the exact synchronized and device-local fields; account identity and provider choice; documented endpoint allowlist; transport and at-rest encryption; whether payloads are end-to-end encrypted and how a second device recovers keys; per-user authorization; device ids; versioned envelopes; server-issued cursors/revisions (never device-clock last-write-wins); tombstone retention; quotas; backups; account switching; device revocation; cloud deletion; operational logging with no focus-content payloads; and the first-release exclusion of live timer state. Include state diagrams for local-only → signed-in/no-upload → sync-enabled → paused/signed-out, plus a data-flow and threat model.
- **Science:** n/a — privacy, security, architecture, and user data stewardship.
- **Quality:** `docs/product-quality.md` — Privacy and security; Architecture changes; Error prevention,
  confirmation, undo, and recovery.
- **Files:** `docs/sync.md` (new), `README.md` (link from the roadmap note), privacy/deployment documentation if the chosen architecture needs it.
- **Done when:** The document resolves provider/hosting, encryption/key recovery, retention/deletion, endpoint allowlist, schema compatibility, and conflict rules for every persisted slice; states exactly what the service can and cannot read; covers lost device/key, account A→B, long-offline device, old/new client, and remote outage cases; and receives a security/privacy review before implementation. No production network call lands in this step.
- **Depends on:** 8.11, 9.4, and the persisted slices intended for the first synced release (currently through 10.11). If those shapes differ when this starts, update the contract before code.

### - [ ] 11.2 Sync-safe envelope, mutation log, and deterministic merge engine

- **Goal:** Build the network-free sync core around 9.4's validated export envelope. Give each installation a device-local id and each durable mutation a collision-safe id plus an authoritative revision/cursor; add tombstones and per-slice conflict rules so replays are idempotent and merges are deterministic. Append-only session/ledger data unions by stable id; revisions and repairs supersede explicitly; deletes beat stale offline edits for the documented retention window; scalar settings use field-level revisions; references never orphan; unknown newer-schema fields survive an older client's round-trip. Sync-enabled/account metadata stays in a separate device-local store and is never itself synced. Preserve every existing id during migration and never seed fake historical timestamps.
- **Science:** n/a — deterministic merge and data-integrity engineering.
- **Quality:** `docs/product-quality.md` — Privacy and security; Error prevention, confirmation, undo,
  and recovery; Component and integration testing.
- **Files:** new `src/sync/` pure protocol/merge modules + tests, persisted models and sanitizers, `src/store/useBloom.ts` (relative schema bump + forward migration), 7.1 migration fixtures, 9.4 export/import helpers.
- **Done when:** Algebraic tests cover idempotence, commutativity, deterministic replay, duplicate delivery, concurrent create/edit/delete, delete-vs-long-offline-edit with no resurrection, stable-id collision, Companion's separate log, archives/compaction, corrupt input isolation, unknown-field preservation, and schema skew. A two-device fixture merges without losing any valid record, and the full core is still network-free.
- **Depends on:** 11.1, 7.1, 9.4, and 10.11's stewardship shape.

### - [ ] 11.3 Optional account service, encrypted sync API, and authorization

- **Goal:** Implement the account and storage service selected in 11.1 behind a small adapter. Authentication creates access to an account but does **not** enable upload; the first upload requires separate client consent in 11.4. Enforce per-user/per-device authorization on every object, versioned encrypted envelopes, server-issued cursors, replay protection, rate/size limits, tombstone retention, device revocation, remote-export, and complete cloud/account deletion. Keep credentials out of `localStorage` (secure HttpOnly web sessions or platform-appropriate secure storage), never log decrypted focus content or secrets, and prevent one account from reading another's ciphertext or metadata.
- **Science:** n/a — security, privacy, authorization, and service reliability.
- **Quality:** `docs/product-quality.md` — Privacy and security; Loading, offline, conflict, and failure
  states; Browser and device verification.
- **Files:** backend/API package selected by `docs/sync.md`, client auth/sync adapter, local development emulator or fake server, contract and authorization tests, deployment/secrets documentation.
- **Done when:** Contract tests prove cross-account isolation, revoked-device denial, expired-session recovery, replay rejection, payload/size validation, remote export, cloud-only deletion, and account deletion; server logs contain no focus-content payloads or encryption keys; local-only builds do not instantiate the adapter or make a request.
- **Depends on:** 11.1, 11.2.

### - [ ] 11.4 Account, consent, sync status, and device controls

- **Goal:** Add a Settings section that begins with two equally valid states: “Local only” and optional “Sync across devices.” Sign-in never blocks onboarding or core use and never uploads by itself. Enabling sync shows a concise first-upload inventory (sessions, tasks, goals, settings, Companion log, archives), the privacy/encryption summary from 11.1, and a confirm step. Provide last-sync/status, manual sync, pause/resume, sign out (local copy kept), device list/revoke, encrypted recovery flow, cloud export, delete cloud copy, and delete account. Switching from account A to B first creates an offline backup, then requires an explicit merge/keep-separate decision; it may never silently upload A's local data into B. Errors and conflicts use calm, precise copy and never imply local-only is unsafe.
- **Science:** n/a — consent UX, privacy controls, and recoverable account state.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Error prevention, confirmation,
  undo, and recovery; Loading, offline, conflict, and failure states; Privacy and security.
- **Files:** `SettingsSheet.tsx`, reusable 8.4 Sheet/Dialog primitives, new account/sync components, `docs/voice.md` if additional reviewed pairs are warranted.
- **Done when:** With no account the app behaves and renders as before; sign-in alone sends no Bloom data; first upload cannot occur without the inventory consent; every destructive scope is distinct and confirmed; sign-out/pause preserve the full local copy; account switching cannot cross-contaminate datasets; loading, signed-in/no-upload, pending, paused, offline, conflict, expired-auth, failure, retry, cancellation, and recovery states are truthful and testable; keyboard, touch, screen-reader, responsive-layout, and copy-checklist passes succeed.
- **Depends on:** 8.4, 11.1, 11.3.

### - [ ] 11.5 Offline queue and bidirectional cross-device sync client

- **Goal:** Wire durable local mutations into an encrypted outbox and implement pull → decrypt → validate/migrate → deterministic merge → push with server cursors, bounded retry/backoff, cancellation, and crash-safe acknowledgements. Sync at natural lifecycle points (explicit “sync now,” foreground, and a debounced durable mutation) only while enabled; core actions never wait on the network. On first enable, make a 9.4 local backup before merging remote data. All 8.2 clear/delete paths emit tombstones. A remote outage, airplane mode, background throttling, duplicate response, or app kill leaves the queue recoverable. The service worker must never cache auth/API responses. Finalized data appears on the user's other enabled devices; first-release live/paused timers remain owned by the originating device and are never uploaded.
- **Science:** n/a — local-first transport and reliability engineering.
- **Quality:** `docs/product-quality.md` — Loading, offline, conflict, and failure states; Perceived and
  measured performance; Privacy and security; integration testing.
- **Files:** `src/sync/` client/outbox modules + tests, store mutation seams, app foreground/connectivity hooks, service-worker exclusions from 8.15, sync status UI from 11.4.
- **Done when:** Fake-server integration tests cover two devices editing online/offline, duplicate/reordered delivery, crash between upload and acknowledgement, retry after days offline, cursor reset/full resync, tombstone expiry without resurrection, schema mismatch, account revocation, and remote outage. Every local action remains immediate, queued changes survive reload, and eventual convergence preserves all valid finalized records.
- **Depends on:** 11.2–11.4, 8.15.

### - [ ] 11.6 Multi-device privacy, isolation, recovery, and release QA

- **Goal:** Add `npm run test:sync` and a documented multi-device matrix covering desktop web, mobile web/iPadOS Safari, and Android (native iOS is not implied). Exercise first opt-in, second-device recovery, simultaneous offline edits, clock skew/timezone/day-boundary differences, schema upgrades in both orders, long-offline return, reinstall, token expiry, device revoke, account A→B, cloud export/deletion, sign-out, and local-only continuation. Re-run 7.1–7.4, the 7.2 network-blocked pass, and production build. Audit the enabled path so only the documented auth/sync allowlist is contacted, no user data appears in logs/URLs/analytics, API responses are absent from caches, and encrypted payload confidentiality matches `docs/sync.md`.
- **Science:** n/a — release verification for user ownership, privacy, accessibility, reliability,
  performance, and record integrity.
- **Quality:** `docs/product-quality.md` — the full applicable release matrix, including accessibility,
  browser/device, network/failure, performance, security, integration, and visual-regression checks.
- **Files:** sync integration/E2E tests, `docs/qa.md`, `docs/sync.md`, CI, deployment/privacy documentation.
- **Done when:** Two real devices converge after online and offline edits with no lost/duplicated/resurrected records; a local-only fresh install and a signed-out former sync user both complete the entire app flow in airplane mode; disabling sync stops application-data requests without deleting local data; revocation and deletion behave exactly as described; security/privacy review findings are closed; `npm run test:sync`, `npm test`, and `npm run build` are green.
- **Depends on:** 11.5, 7.1–7.4, 8.11, 8.15.

---

## Phase 12 — Interface clarity and audio simplification (July 2026)

### - [x] 12.1 Align responsive surfaces, simplify Settings, and keep one completion chime

- **Goal:** Correct the visible cross-screen alignment drift on narrow, short, and wide viewports;
  reorganize Settings into seven clear collapsible groups (You · Timer lengths · Sessions · Your
  day · Companion · Appearance · Your data); and remove ambient/background audio, previews, and
  the breath swell. Keep the optional warm timer-finish chime and its background notification
  exactly where people expect it under Sessions — removing the Sound section must not make a saved
  completion cue disappear.
- **Science:** n/a — `docs/product-quality.md` responsive-layout, hierarchy, accessibility,
  local-first, and regression standards; `docs/voice.md` for the revised labels and help text.
- **Files:** `src/styles.css`, `src/components/SettingsSheet.tsx`,
  `src/components/KindRestart.tsx`, `src/engine/audio.ts`, `src/engine/breath.ts`,
  `src/store/useBloom.ts`, migration/import tests and fixtures, README/docs.
- **Done when:** All primary screen content shares one centered reading column on wide screens and
  remains reachable on short screens; Settings shows the seven named groups with aligned rows,
  controls, and card boundaries in day/night themes; no ambient picker or ambient runtime path
  remains; the completion chime still plays after user activation when Ring when done is enabled;
  v30→v31 drops `bgSound` while preserving `sound`; focused migration/Settings/lifecycle coverage,
  `npm test`, `npm run build`, and responsive browser QA pass.

### - [x] 12.2 Center the mode bar and give the ring pet breathing room

- **Goal:** Correct the production Focus-screen geometry shown at wide desktop scale: the 44 px
  mode buttons currently overflow their 42 px bar and place every label below the visual center,
  while the ring pet sits high and fills too much of the inner disc. Make the bar tall enough to
  contain its touch targets, center every label on both axes, and reduce/center the pet without
  changing timer behavior or shrinking its progress ring.
- **Science:** n/a — `docs/product-quality.md` alignment, touch-target, responsive-layout, and
  visual-regression standards.
- **Files:** `src/styles.css`, `src/screens/FocusScreen.tsx`.
- **Done when:** Focus/Tiny/Short/Long (and optional Flow) share one measured vertical center at
  phone, short-height, and wide breakpoints; each tab retains a ≥44 px target; the pet is centered
  with visibly even space inside the disc; `npm test`, `npm run build`, and browser QA against the
  reported wide composition pass.

---

## Phase 13 — Native iOS wrapper

### - [x] 13.1 Add and verify the Capacitor iOS app

- **Goal:** Package the existing local-first web app as a native iOS app through the same Capacitor
  boundary used by Android. Keep one React/store implementation, bundle the production web assets
  into the app, and give contributors repeatable sync/open commands without implying App Store or
  physical-device release readiness.
- **Science:** n/a — platform packaging and build reliability.
- **Quality:** `docs/product-quality.md` — Local-first and offline behavior; Responsive layout and
  touch; Browser and device verification; Privacy and security; Build and release reproducibility.
- **Files:** `package.json`, `package-lock.json`, `capacitor.config.ts`, `ios/`,
  `scripts/gen-icons.mjs`, `README.md`.
- **Done when:** The Capacitor iOS package is pinned to the repository's Capacitor major; `npm run
  ios:sync` rebuilds and copies the local bundle; `npm run ios:open` opens the generated Xcode
  project; the app uses Bloom's identifier, name, colors, and icon; a code-signing-free generic
  iOS Simulator build succeeds; `npm test`, `npm run build`, a clean CI-version `npm ci`, and
  `git diff --check` are green. App Store signing/submission and real-device accessibility,
  notifications, safe-area, background-timer, and airplane-mode checks remain explicitly deferred.
- **Closed (August 2026):** Added the Capacitor 7.6.8 Swift Package Manager project, Bloom native
  art, repeatable sync/open scripts, and contributor instructions. A code-signing-free generic
  iOS Simulator build succeeded and the installed app rendered its first-run screen on an iPhone
  17 Pro Simulator. Clean Node 22/npm 11.17.0 `npm ci`, all 502 tests, the production build, and
  `git diff --check` passed.

### - [x] 13.2 Replace the iOS bottom navigation with the system Liquid Glass tab bar

- **Goal:** Replace Bloom's web-rendered bottom navigation inside the iOS wrapper with a real UIKit
  `UITabBar`. Keep the single Capacitor web view and React store as the content/state owner, bridge
  tab selection in both directions, and let the system own the floating rail, interactive selection
  lens, material, motion, accessibility adaptations, and OS-specific appearance. Use Bloom tint only
  for the selected destination; do not draw or simulate Liquid Glass in CSS.
- **Science:** n/a — native platform navigation and interaction quality.
- **Quality:** `docs/product-quality.md` — Architecture changes; Accessibility and semantics;
  Responsive layout and touch; Reduced motion/transparency/contrast; Browser and device
  verification; Component and integration testing. Apple's Liquid Glass guidance reserves glass for
  the navigation/control layer and discourages custom backgrounds or indiscriminate use in content.
- **Files:** `docs/ios-liquid-glass.md` (new), `src/App.tsx`, a small typed native-navigation adapter
  under `src/native/`, focused tests, `src/styles.css`, `ios/App/App/BloomBridgeViewController.swift`
  (new), the iOS storyboard/Xcode project, `README.md`.
- **Done when:** iOS uses one native floating tab rail with Focus, Tasks, History, optional Goals,
  and Friends; tapping a destination uses the system's moving Liquid Glass selection lens and updates
  React exactly once; React-driven navigation, guarded navigation, theme changes, onboarding
  visibility, and planner enable/disable update the native bar; the selected item has a restrained
  Bloom tint while unselected items remain system-adaptive; VoiceOver receives native tab semantics;
  Reduced Motion, Reduced Transparency, and Increased Contrast remain system-owned; browser and
  Android keep the accessible web bar; there is no duplicate iOS bar. An iOS 26 Simulator build and
  visual/interaction smoke, `npm test`, `npm run build`, `npm run ios:sync`, and `git diff --check`
  pass. iOS 27's refreshed system appearance is verified when Xcode 27 and its runtime are installed.
- **Depends on:** 13.1.
- **Closed (August 2026):** Replaced the iOS web bar with a standalone native `UITabBar` over the
  single Capacitor web view and added a typed two-way `BloomNavigation` bridge. UIKit owns the
  floating rail, selected tint, interactive Liquid Glass lens and transition; no custom glass
  material or animation is drawn in CSS. An iPhone 17 Pro Simulator on iOS 26.5 showed one native
  rail and successfully moved from Focus to Friends while updating React. Guard rejection,
  onboarding/theme/Goals configuration, invalid native events, and stale-wrapper web fallback are
  handled at the bridge boundary. Xcode 26.6 compiled the Swift controller against the iOS 26.5 SDK;
  all 504 tests, the production build, Capacitor sync, and `git diff --check` passed. iOS 27 visual
  verification remains intentionally deferred to 13.6 because Xcode 27 is not installed.

### - [x] 13.3 Build native Liquid Glass segmented rails and fit Focus without scrolling

- **Goal:** Replace the Focus/Tiny/Short/Long/Flow and Friends/Field Guide rails with compact
  standalone `UITabBar` controls on iOS 26 and later—the same system class as Bloom's lower rail—so
  UIKit owns an identical Liquid Glass capsule and moving selection lens. Keep the compact upper
  controls text-only so mode and section labels remain quiet and immediately legible.
  Keep reducer/local React state authoritative and retain `UISegmentedControl` as the pre-iOS-26
  fallback. Rebalance the fresh Focus composition so its header, mode rail, pet, timer, preparation
  card, and transport controls fit together on supported portrait phone heights without page
  scrolling or tab-bar overlap. Remove the touch-triggered desktop focus outline from the
  session-target field without weakening visible keyboard focus on browser/Android.
- **Science:** n/a — native platform controls and interaction quality.
- **Quality:** `docs/product-quality.md` — Architecture changes; Accessibility and semantics; Error
  prevention and recovery; Reduced motion/transparency/contrast; integration testing.
- **Files:** native bridge/controller, typed web adapter, `FocusScreen.tsx`, `CollectionScreen.tsx`,
  focused tests, `src/styles.css`, `docs/ios-liquid-glass.md`.
- **Done when:** UIKit renders the iOS 26/27 rail, lensing, interaction response, and moving system
  selection lens without custom material or animation; mode and collection-section events remain
  authoritative and exactly-once; rejected mode changes restore the native selection; modal surfaces
  never sit behind an interactive native overlay; web/Android controls remain; measured 402×874,
  390×844, and 375×667 portrait layouts have no Focus scroll range or obscured controls while input
  focus can still accommodate the keyboard; the full timer lifecycle invariant suite and native
  iOS 26 Simulator interaction matrix pass. iOS 27, physical-device, iPad, and assistive-technology
  coverage stays in 13.6.
- **Depends on:** 13.2 and 7.4.
- **Closed (August 2026):** Replaced both web selector rails on iOS 26.5 with compact, text-only
  standalone `UITabBar` controls and retained `UISegmentedControl` before iOS 26. UIKit now owns the
  rail material and moving selection lens without a custom background, blur, mask, or animation;
  the iPhone 17 Pro Simulator visibly moved the lens from Focus to Long. Native mode changes still
  pass through the timer transition guard, and opening either Settings or the portaled Tend daily
  foundations dialog removes both native rails until the modal closes. The fresh Focus composition
  measured with no scroll range at 402×874, 390×844, and 375×667, while input focus can restore
  keyboard scrolling and no longer receives the touch-triggered outer outline. Native bridge and
  modal-ownership regression tests, the full test/build suite, Capacitor sync, an Xcode iOS 26.5
  Simulator build, live interaction smoke, a clean Node 22/npm 11.17 `npm ci` plus test/build, and
  `git diff --check` passed. iOS 27 and the wider physical-device/accessibility matrix remain in
  13.6.

### - [x] 13.4a Replace the iOS Settings glyph and boolean controls with UIKit controls

- **Goal:** Replace the Focus screen's Unicode gear with an SF Symbol in a standard native glass
  `UIButton`, and replace every hand-rolled boolean switch visible in the current iOS Settings and
  foundations picker with a real `UISwitch`. Keep the existing web layout as the measured slot and
  browser/Android fallback; all native events still dispatch exactly once through React and the
  reducer. Hide native controls whenever their web slot is clipped, scrolled away, inert, covered by
  another modal, or unmounted. Do not move non-boolean fields or data operations in this slice.
- **Science:** n/a — native platform controls, accessibility, and state integrity.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Error prevention and
  recovery; Architecture changes; Privacy and security; responsive/scroll lifecycle; integration
  testing.
- **Files:** `BloomBridgeViewController.swift`, typed native-control adapter/wrapper, every current
  `.switch` call site, Focus Settings affordance, focused tests, `docs/ios-liquid-glass.md`.
- **Done when:** `gearshape.fill` resolves at runtime before the native Settings button replaces the
  fallback; every current boolean switch call site uses the shared native-aware wrapper; UIKit owns
  touch, VoiceOver switch semantics, tint, and iOS appearance; scroll/modal/unmount cleanup leaves no
  floating native control; stale or malformed native events cannot mutate state; browser/Android
  retain accessible web controls; focused tests, full test/build, Capacitor sync, Xcode build, live
  Simulator inspection, and `git diff --check` pass.
- **Depends on:** 13.2, 8.4, 8.11.
- **Closed (August 2026):** Replaced the U+2699 text gear with a runtime-guarded
  `gearshape.fill` in a standard iOS 26 glass `UIButton` and an inline SVG web fallback. Routed all
  13 current hand-rolled switch call sites through one native-aware React wrapper and real UIKit
  `UISwitch` instances while keeping React/reducer state authoritative and browser/Android controls
  intact. The bridge validates identifiers, labels, finite frames, and exact boolean events; UI
  events are not retained for a later mount. Resize, nested-scroll, modal/inert, offscreen, and
  unmount observation hides or removes native controls. A Simulator pass found and fixed an
  `aria-hidden` fallback feedback loop before release. The iPhone 17e iOS 26.5 Simulator visibly
  rendered the glass SF Symbol and accessible native switches, and the user confirmed switch
  interaction. Focused native-control tests pass 19 cases; the full suite passes 58 files/562 tests,
  `npm run build`, `npx cap sync ios`, a code-signing-free Xcode 26.5 Simulator build, live
  install/launch/interaction, and `git diff --check` pass. The wider physical-device, iPad, iOS 27,
  Dynamic Type, and assistive-technology matrix remains in 13.6.

### - [x] 13.4b Present Settings natively from a React-owned form snapshot

- **Goal:** Give iOS a real Settings sheet — a native presentation containing a native form — without
  duplicating Bloom's copy, product logic, or persistence in Swift. React stays the single source of
  truth and emits a typed, validated *form snapshot* (sections of typed rows); the native layer is a
  generic renderer with no product knowledge that returns typed actions. This is the seam 13.14
  established was necessary: controls inside a scrolling web sheet cannot be native overlays, so the
  whole sheet has to become native at once. Cover the sections that are plain control rows — You,
  Sessions, Your day, Companion, Appearance. Timer lengths and Your data become native disclosure
  rows that open the existing web sheet scoped to that one section, so no control is lost while
  13.4c and 13.4d migrate them. Browser and Android keep the complete web sheet untouched.
- **Science:** n/a — native platform controls, accessibility, and state integrity.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Error prevention and
  recovery; Architecture changes; Privacy and security; integration testing.
- **Files:** `src/native/iosSettings.ts`, native Settings presentation/form views,
  `src/components/SettingsSheet.tsx`, focused tests, `docs/ios-liquid-glass.md`.
- **Done when:** iOS presents one native Settings sheet and never a duplicate web sheet behind it;
  every listed section's controls are native and semantically correct; all mutations still flow
  through the reducer exactly once; malformed snapshots and stale actions cannot cross the bridge or
  mutate state; dismissing by button, swipe, or programmatic close all settle in the same state;
  day/night follows the app; browser and Android are unchanged; test, build, Capacitor sync, and
  Simulator checks pass.
- **Depends on:** 13.4a, 13.14.
- **Closed (August 2026):** 13.4b as originally written covered seven sections, roughly fifty
  controls, and the import state machine; it was split into 13.4b/13.4c/13.4d before implementation
  so the riskiest data paths land last. The seam avoids a second copy of Settings in Swift: React
  emits a validated snapshot of typed rows and `BloomSettingsPlugin` renders it as a generic SwiftUI
  `Form` with no product knowledge, so every string still lives under `docs/voice.md` and a new
  setting needs no Swift change. Steppers are real `UIStepper` views because SwiftUI's `Stepper`
  cannot disable one arrow at a time. Two findings are recorded in `docs/ios-liquid-glass.md`: the
  sheet carries an explicit `appearance` rather than inheriting the system theme, after it rendered
  dark over a day-sky app on a dark-mode device; and booleans cross as a string-encoded `checked`
  key, after a Swift `Bool` in a `JSObject` failed to arrive as a JavaScript boolean and made every
  native switch a silent no-op while string-valued controls worked. Verified on an iPhone 13 Pro Max
  iOS 26.5 Simulator: one native sheet with no web sheet behind it; native text field, segmented
  control, menu picker, switches, steppers, notes, and disclosure rows; conditional rows appearing
  as React re-sends the snapshot; actions reaching the reducer and persisting; the scoped web detail
  opening and returning; and the sheet following Bloom's night mode. One known loss: the pet's wave
  when Companion mode turns on has no native equivalent yet. `npm test` (62 files, 601 tests),
  `npm run build`, `npx cap sync ios`, and an Xcode 26.6 Simulator build pass. Physical-device,
  VoiceOver, and Dynamic Type coverage stays with 13.6.

### - [x] 13.4c Render Timer lengths natively

- **Goal:** Move the cadence surface into the native form: the learned-cadence card with its
  reasoning line and three rungs, the one-tap history, the manual preset grid, and the three duration
  steppers. Extend the 13.4b row vocabulary rather than teaching Swift what a cadence is — the
  recommendation, its copy, and its staleness rule stay in `insights/cadence.ts`.
- **Science:** the cadence card's claims already trace to `docs/science.md`; this step moves
  presentation only and must not restate or strengthen them.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; UX/UI correctness;
  integration testing.
- **Files:** `src/native/iosSettings.ts`, native form row views, `src/components/SettingsSheet.tsx`,
  focused tests.
- **Done when:** The Timer lengths disclosure row is gone and the section renders natively; applying
  a preset, a history rung, or the recommendation still routes through `onApplyCadence`; the
  already-set state is conveyed without relying on the ♡ glyph alone; steppers respect their min,
  max, and step; VoiceOver announces each rung and preset as the web version does.
- **Depends on:** 13.4b.
- **Closed (August 2026):** The section needed two additions to the 13.4b vocabulary, both small
  and both reusable. A `values` row shows read-only figures side by side and carries a spoken label
  per item, so VoiceOver announces "shorter: 20 minutes focus, 4 minutes break" instead of reading
  "20 slash 4" out of a run-together sentence. And `selected` may now be empty, because the preset
  control genuinely has no selection when the user's own lengths match no pair — the same state the
  web grid showed by pressing none of them. `insights/cadence.ts` is untouched: the recommendation,
  its reasoning line, its rungs, and its staleness rule all still come from there. The already-set
  cadence is conveyed by disabling the apply row rather than by the ♡ alone. Verified on an iPhone
  13 Pro Max iOS 26.5 Simulator: the learned card, ladder, disabled apply row, preset segmented
  control, and three `UIStepper` rows all render; choosing 40/8 applied the cadence, recomputed the
  ladder, re-enabled "try 25/5 ♡", and made Previous rungs appear as 25/5 entered history; stepping
  Focus to 45 min left the preset control correctly showing nothing selected. `npm test` (63 files,
  609 tests), `npm run build`, `npx cap sync ios`, and an Xcode 26.6 Simulator build pass.

### - [ ] 13.4d Run Your data through native document, share, and alert presentations

- **Goal:** Migrate the highest-risk section last: JSON/CSV export through a share sheet, import
  through `UIDocumentPickerViewController`, the read/prepare/save state machine with its cancel and
  recovery paths, and clearing focus data behind a native destructive confirmation. Persistence,
  parsing, merging, and migration stay exactly where they are — the native layer only picks files,
  presents progress and outcomes, and confirms destructive intent.
- **Science:** n/a — data stewardship and platform presentations.
- **Quality:** `docs/product-quality.md` — Error prevention and recovery; Privacy and security;
  Architecture changes; migration/integration testing.
- **Files:** native document/share/alert presentations, `src/native/iosSettings.ts`,
  `src/components/SettingsSheet.tsx`, `src/store/exportImport.ts` seam only if required, focused and
  migration tests.
- **Done when:** The Your data disclosure row is gone; export produces the same bytes as the web
  path; import runs the same parse/prepare/commit path with cancellation, storage-failure recovery,
  and the safety backup intact; a destructive clear cannot happen without explicit native
  confirmation; no user data reaches any file or presentation the user did not choose; migration and
  import fixtures pass unchanged.
- **Depends on:** 13.4b, 9.x data-stewardship steps that touch the same fixtures.

### - [ ] 13.5 Adopt native iOS presentations and selectively glass remaining chrome

- **Goal:** Inventory Bloom's dialogs, sheets, menus, buttons, sliders, text fields, and contextual
  actions. Use native presentations and standard controls where they materially improve behavior;
  use `UIGlassEffect`/SwiftUI `glassEffect` only for important custom chrome that has no standard
  equivalent. Leave content cards, the pet, timer visualization, and decorative sky in the content
  layer instead of glazing the whole app.
- **Science:** n/a — platform consistency and restrained visual hierarchy.
- **Quality:** `docs/product-quality.md` — Accessibility; Responsive layout; Reduced motion,
  transparency, and contrast; Performance; Architecture changes; visual regression.
- **Files:** `docs/ios-liquid-glass.md`, native presentation/bridge code, affected React components,
  focused tests and verification evidence.
- **Done when:** The inventory records a native/keep-web decision for every interactive surface;
  implemented native presentations preserve cancellation, focus return, destructive confirmations,
  and exactly-once actions; no nested or decorative glass clutter ships; browser/Android behavior
  remains unchanged; the full release matrix passes.
- **Depends on:** 13.2–13.4b.

### - [ ] 13.6 iOS 26/27 Liquid Glass release QA

- **Goal:** Verify the native navigation/control layer on real iPhone and iPad classes across iOS 26
  and 27, including the refreshed 2027 appearance compiled with Xcode 27. Cover touch, VoiceOver,
  Switch Control, Dynamic Type, Reduced Motion, Reduced Transparency, Increased Contrast, day/night,
  rotation/window resizing, keyboard, background timer/completion cue, and airplane-mode operation.
- **Science:** n/a — native release verification.
- **Quality:** `docs/product-quality.md` — the full applicable accessibility, device, privacy,
  reliability, performance, and visual-regression matrix.
- **Files:** `docs/qa.md`, iOS verification evidence, native/UI tests and CI where practical.
- **Done when:** The system glass rail and controls adapt correctly on both OS generations without
  custom visual imitation; no content is obscured; all events remain exactly-once; core use remains
  offline; regressions are closed and the native plus web/Android suites pass.
- **Depends on:** 13.2–13.5 and availability of Xcode 27 plus iOS 27 test devices/runtimes.

### - [x] 13.7 Declare the current iOS export-compliance status

- **Goal:** Declare the current native build's encryption status accurately without adding
  cryptography solely to alter App Store Connect's questionnaire. Keep the declaration narrow so a
  future sync, authentication, secure-storage, or cryptography dependency requires a fresh audit.
- **Science:** n/a — release compliance and configuration accuracy.
- **Quality:** `docs/product-quality.md` — Privacy and security; Build and release reproducibility.
- **Files:** `ios/App/App/Info.plist`, `PLAN.md`.
- **Done when:** The bundled runtime and native dependency audit finds no non-exempt encryption;
  `ITSAppUsesNonExemptEncryption` is Boolean `false`; the source plist and built app plist validate;
  a code-signing-free iOS Simulator build and `git diff --check` pass.
- **Depends on:** 13.1.
- **Closed (August 2026):** Audited Bloom's runtime dependencies and the Capacitor iOS package,
  declared that the current build uses no non-exempt encryption, and validated the declaration in
  both the source and built app property lists. This declaration does not remove the developer's
  responsibility to reassess export compliance when the app's encryption use changes.

### - [ ] 13.8 Show active focus sessions with ActivityKit Live Activities

- **Goal:** Add a local-only ActivityKit Live Activity for an active work session, with concise Lock
  Screen, Dynamic Island, StandBy, watch, and system presentations. The existing reducer remains the
  lifecycle authority; the native bridge mirrors start, pause, resume, mode, and terminal state into
  one Activity. Use a system timer interval so the displayed clock advances without per-second bridge
  traffic. Do not add APNs, a server, tracking, or a new runtime network path.
- **Science:** n/a — glanceable native timer state and background continuity.
- **Quality:** `docs/product-quality.md` — Architecture changes; Privacy and security; Local-first and
  offline behavior; Accessibility; Background/interrupt lifecycle; Error prevention and recovery;
  Performance; integration and device testing. Apple recommends Live Activities for bounded tasks
  with a clear start/end and requires them to end with the underlying activity.
- **Files:** a WidgetKit/ActivityKit extension and shared attributes, Xcode project/entitlements and
  app plist, native bridge/controller, typed web adapter, timer lifecycle integration/tests,
  `docs/ios-liquid-glass.md`, release QA evidence.
- **Done when:** Starting eligible Focus/Tiny work creates at most one Live Activity when the system
  permits it; countdown text remains wall-clock accurate while the app is backgrounded; pause,
  resume, completion, skip, reset, abandon, relaunch recovery, and data clear reconcile exactly once;
  stale activities end; disabled/unavailable ActivityKit fails quietly with disclosed local behavior;
  all compact/minimal/expanded/Lock Screen presentations are accessible and reveal no target text by
  default; airplane-mode, background, simulator/device, lifecycle, test, and build checks pass.
- **Depends on:** 7.4, 8.3, 8.4, 13.1.
- **Implementation evidence (August 2026):** Added a shared ActivityKit attributes model, a
  WidgetKit extension covering Lock Screen and every Dynamic Island family, an availability-guarded
  Capacitor bridge, and reducer-owned Focus/Tiny lifecycle reconciliation. The system-rendered timer
  advances without per-second bridge calls; pause/resume, terminal cleanup, relaunch sweep, foreground
  retry, data clear, and user-dismissal behavior have focused coverage. System UI receives only an
  opaque session identifier, mode, phase, and clock data — never task text — and the implementation
  adds no server, APNs, or runtime network path. `npm test` passes 60 files/576 tests, `npm run build`,
  `npx cap sync ios`, plist validation, and `git diff --check` pass. A code-signing-free App build
  successfully embedded and validated the extension before the final stale-state/accessibility
  refinement; a fresh post-refinement Xcode build was blocked before compilation by the sandboxed
  Simulator/SPM environment. Physical-device signing plus Lock Screen, Dynamic Island, StandBy,
  background, airplane-mode, and accessibility checks remain for user verification, so this step
  stays open.
- **Device verification (August 7, 2026):** The Live Activity renders on the Lock Screen of the
  user's iPhone with the correct mode label and a live countdown, confirming the mirror and the
  system-rendered clock. Two findings came out of that run, both tracked as their own steps rather
  than reopened here: the presentation is visually thin for the space it occupies, and it is
  read-only — there is no way to pause, resume, or advance from it (13.19). A third gap surfaced
  from the same session: Companion check-ins cannot reach a person whose phone is locked, because
  `useCompanion.ts` schedules them on a JS interval that explicitly returns while `document.hidden`
  (13.20). This step's own done-when list stays limited to Dynamic Island, StandBy, airplane-mode,
  and accessibility observation.

### - [x] 13.9 An app icon for each friend, following whoever is on duty

- **Goal:** Give every friend their own iOS app icon and put the on-duty friend on the home screen.
  Mochi the bunny is the primary icon, so the other five ship as bundled alternates. Draw each icon
  from the same sprite grid the app renders, so a friend's home-screen face and their in-app face
  cannot drift. The reducer stays the authority on who is on duty; the bridge only mirrors that
  choice. Web and Android keep the blossom mark — neither platform can swap a launcher icon at
  runtime without relaunching the app.
- **Science:** n/a — platform icon capability and visual identity.
- **Quality:** `docs/product-quality.md` — Local-first and offline behavior; Privacy and security;
  Error prevention and recovery; Build and release reproducibility; integration and device testing.
- **Files:** `src/engine/spriteData.ts`, `src/engine/pixelpals.ts`, `src/data/friends.ts`,
  `scripts/gen-icons.mjs`, `ios/App/App/Assets.xcassets/AppIcon*.appiconset`,
  `ios/App/App/BloomAppIconPlugin.swift`, `ios/App/App/BloomBridgeViewController.swift`,
  `ios/App/App.xcodeproj/project.pbxproj`, `src/native/iosAppIcon.ts`, `src/App.tsx`, focused tests.
- **Done when:** Every friend has a generated 1024px icon set and each alternate is declared to the
  app target in both build configurations; a Release build emits `CFBundleAlternateIcons` for all
  five alternates and passes store validation; choosing a friend changes the home-screen icon and
  choosing Mochi restores the primary one; re-selecting the friend already shown asks iOS for no
  change, so no redundant system alert appears; icons carry no alpha channel; the change makes no
  network request and stays a quiet no-op on web, Android, and any system without alternate icons;
  test, build, Capacitor sync, and Simulator checks pass.
- **Depends on:** 13.1.
- **Closed (August 2026):** Extracted the sprite grids into a dependency-free `spriteData.ts` that
  both the app and the icon generator read, so the six icons are drawn from the shipped art rather
  than redrawn by hand. `gen-icons.mjs` now writes one appiconset per friend — their own gradient, a
  soft blossom watermark, and their sprite at whole-pixel cell sizes — flattened to drop the alpha
  channel. `BloomAppIconPlugin` mirrors `settings.pal` onto `setAlternateIconName`, skipping the
  call when the requested icon is already showing and resolving quietly when iOS refuses (which it
  does while backgrounded); `App.tsx` reconciles on mount and on each return to the foreground. A
  Release build for the iPhone 17 Pro Simulator passed `-validate-for-store` and emitted all five
  alternates plus their loose icon files; on the running Simulator the icon followed Snappy → Luna →
  Mochi, including the primary-icon path, and survived a device reboot. `npm test` (52 files, 518
  tests) plus two new native suites, `npm run build`, `npx cap sync ios`, and `git diff --check`
  passed. Alternate icons are iOS-only: Android and the PWA keep the blossom mark.

### - [x] 13.10 Icon appearances, and stop cropping the native mode rail

- **Goal:** Two fixes to what iOS draws for Bloom. First, give every friend icon the dark and tinted
  appearances iOS composites against its own backdrop, so a dark home screen no longer shows a bright
  pastel tile punched through it. Second, stop handing the native mode rail a frame shorter than its
  own layout needs — `sizeThatFits` on a `UITabBar` reserves the bottom safe-area inset because a tab
  bar normally sits at the screen's bottom edge, and this rail floats mid-screen.
- **Science:** n/a — platform icon appearances and native control metrics.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Reduced motion/transparency/
  contrast; Error prevention and recovery; integration and device testing.
- **Files:** `scripts/gen-icons.mjs`, `ios/App/App/Assets.xcassets/AppIcon*.appiconset`,
  `ios/App/App/BloomBridgeViewController.swift`, `src/native/iosTabs.ts`,
  `src/screens/FocusScreen.tsx`, focused tests.
- **Done when:** Every icon set compiles with light, dark, and tinted art and the dark/tinted images
  carry no background; the rail's frame is the height UIKit reports minus the safe-area inset, never
  a fixed ceiling; that height is reported back so the web slot reserves the same room and converges
  in one step; a rail that cannot be placed reports inactive so the accessible web rail returns;
  test, build, Capacitor sync, and Simulator checks pass.
- **Depends on:** 13.3, 13.9.
- **Closed (August 2026):** Instrumenting the bridge on an iPhone 13 mini Simulator showed the web
  slot asking for 52pt while `sizeThatFits` reported 83pt — 49pt of items plus the 34pt home-indicator
  inset. The old `min(systemHeight, 58)` therefore clamped every modern iPhone, and once a device's
  items needed more than 58pt they were laid out for a taller bar and then cropped: labels cut off
  along the bottom edge with the selection lens floating above them, as reported from TestFlight.
  The bridge now subtracts the safe-area inset (49pt on that device), never caps the result, and
  returns the height it used; `FocusScreen` reserves it on the slot and the exchange converges in one
  round. For icons, `actool` accepts only `luminosity: dark` and `luminosity: tinted` — it silently
  drops any other appearance value, including `clear`, so the iOS 26 Clear/Liquid Glass treatment
  would need an Icon Composer `.icon` bundle and is not attempted here. A Release build compiled
  `UIAppearanceDark` and `ISAppearanceTintable` for all six sets. `npm test` (52 files, 518 tests),
  `npm run build`, `npx cap sync ios`, an Xcode Release Simulator build, live rail inspection, and
  `git diff --check` passed.

### - [x] 13.11 Deliver reliable local iOS timer completion alerts

- **Goal:** Mirror each active Focus, Tiny, Short, or Long countdown into one native local
  notification so the finish cue still arrives after Bloom is backgrounded, locked, or suspended.
  Keep the reducer as the only timer/session authority: native delivery never completes or writes a
  session record. Reconcile one stable pending request on every deadline change and cancel it on
  pause, reset, skip, mode change, completion, and sound-off. Ask for notification
  permission in context through a skippable primer, keep the existing synthesized foreground chime,
  and bundle a deterministic rendering of that cue for native delivery. Do not add APNs, a server,
  tracking, a background-execution mode, Time Sensitive/Critical Alert entitlement, or a runtime
  network path.
- **Science:** n/a — reliable user-configured timer feedback and native background lifecycle.
- **Quality:** `docs/product-quality.md` — Local-first and offline behavior; Accessibility and
  semantics; Error prevention and recovery; Privacy and security; Background/interrupt lifecycle;
  Build and release reproducibility; component and integration testing.
- **Files:** native UserNotifications bridge and app delegate, typed web adapter and tests,
  `useBloom.ts` lifecycle integration/tests, Settings permission/status copy, shared cue data and
  generated bundled sound, iOS project resources, `README.md`, `docs/ios-liquid-glass.md`.
- **Done when:** With Ring when done on and notification permission granted, exactly one pending
  native request matches the reducer-owned deadline; start/resume/re-timing replaces it rather than
  accumulating requests; pause/reset/skip/mode change/completion/sound-off cancels it;
  denied/skipped/unavailable permission leaves the complete timer usable and reports precisely that
  only the foreground chime remains. The foreground produces one Bloom chime with no duplicate
  system banner/sound; background/locked delivery uses the bundled Bloom cue, respects ordinary iOS
  silent/Focus controls, reveals no task text, and makes no network request. A notification can say
  that the timer finished but never claims that the reducer recorded a completed session. Focused
  lifecycle/adapter/copy/asset tests, the full test/build suite, Capacitor sync, an Xcode Simulator
  build, a locked/background Simulator smoke, airplane-mode inspection, and `git diff --check` pass;
  physical-device silent-switch/Focus/force-quit evidence remains explicitly recorded for 13.6.
- **Depends on:** 7.4, 8.4, 13.1.
- **Implementation evidence (August 2026):** Added the reducer-to-`UNUserNotificationCenter` mirror,
  a process-local foreground/background delivery handshake, a stable request identifier, an
  in-context and skippable permission explainer, system-setting recovery copy, and a deterministic
  3.04-second bundled rendering of the existing foreground chime. Focused lifecycle, race,
  delivery-disposition, permission, modal-ownership, copy, and asset coverage passes; `npm test`
  passes 56 files/546 tests, `npm run build`, `npx cap sync ios`, a code-signing-free Xcode 26.5
  Simulator build, built-bundle audio/plist inspection, app install/launch, and `git diff --check`
  pass. Simulator privacy automation rejected notification authorization with `Operation not
  permitted`, and the available Computer Use route timed out against Simulator, so actual locked
  system delivery remains intentionally unchecked for user/device verification rather than being
  claimed from an injected push payload.
- **Closed (August 7, 2026) — on the user's direction, with the record kept honest:** The user
  closed this step after 13.12's device run. Recorded precisely: AlarmKit's prominent alarm was
  confirmed on device through Silent Mode, an active Focus, and a locked screen, and 13.12's
  handoff means the notification path is deliberately withheld whenever that alarm is authorized —
  so on iOS 26+ the finish cue this step exists to guarantee is demonstrably arriving. What was
  **not** independently observed is the notification path *in isolation* (alarm permission off,
  phone locked, bundled Bloom cue playing) — the check that covers pre-26 systems and anyone who
  declines alarm authorization. That observation belongs to 13.6's release matrix; this step is
  closed on the user's call rather than on that evidence, and the distinction is recorded here so a
  later reader is not misled about what was proven.

### - [x] 13.12 Use AlarmKit for prominent finish alarms on supported iOS versions

- **Goal:** On iOS and iPadOS 26 or later, let a person who keeps **Ring when done** on authorize
  AlarmKit so every bounded Focus, Tiny, Short, and Long countdown can finish with a prominent
  system alarm even through Silent Mode or an active Focus. Flow remains excluded because it has no
  predetermined finish. Keep the reducer as the only session authority: stopping the system alarm
  silences it but never writes or upgrades a Bloom session record. Reuse the 13.8 widget extension
  for AlarmKit's countdown presentation, and show only one system countdown surface rather than a
  separate AlarmKit activity beside Bloom's generic Live Activity. On older systems, denied
  authorization, or an AlarmKit scheduling error, retain 13.11's ordinary local-notification and
  foreground-chime fallback without duplicate sounds or banners. Add no APNs, server, analytics,
  background-execution mode, or Critical Alert entitlement.
- **Science:** n/a — reliable, explicitly authorized system timer feedback.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Privacy and security;
  Local-first and offline behavior; Permission and interruption lifecycle; Error prevention and
  recovery; Build and release reproducibility; integration and physical-device testing.
- **Files:** AlarmKit metadata/presentation in the 13.8 widget extension, native alarm bridge and
  `NSAlarmKitUsageDescription`, typed adapter, reducer lifecycle reconciliation and tests,
  Settings/primer permission and fallback copy, `docs/ios-liquid-glass.md`, release QA evidence.
- **Done when:** A first explicit authorization action explains that prominent alarms can sound
  through Silent Mode and Focus; authorization is requested once by the system and remains
  reversible in iOS Settings. Exactly one AlarmKit alarm mirrors the current reducer-owned deadline;
  pause/resume, reset, skip, mode change, auto-advance, completion, sound-off, relaunch recovery, and
  data clear reconcile idempotently. All four bounded countdown modes alert; Flow never schedules an
  alarm. AlarmKit owns the countdown/alert presentation on supported authorized systems, while the
  13.8 generic activity and 13.11 notification remain nonduplicating fallbacks elsewhere. The custom
  Bloom cue is bundled locally, no task or target text appears in system UI, airplane mode keeps the
  complete path working, and denied/unavailable states say precisely which ordinary fallback remains.
  Focused authorization/race/lifecycle/copy tests, the full test/build suite, Capacitor sync, Xcode
  Simulator compilation, physical-device locked/Silent/Focus checks, and `git diff --check` pass.
- **Depends on:** 7.4, 8.4, 13.1, 13.8, 13.11.
- **Implementation evidence (August 2026):** Added an availability-guarded AlarmKit bridge over one
  fixed alarm identity, a `BloomAlarmMetadata` type shared with the 13.8 widget extension, an
  `AlarmAttributes` presentation reusing that extension, a typed adapter, and reducer-owned
  reconciliation. Ownership is one flag: while an authorized alarm holds the current deadline the
  13.11 notification is cancelled and the 13.8 activity is ended, so one finish never makes two
  sounds or two countdown surfaces. The AlarmKit countdown deliberately ships no pause button —
  pausing cancels the alarm and hands the surface back to the reducer-driven activity rather than
  creating a second place a session can be paused. Ordinary reconciliation never silences a ringing
  alarm; only a replacement or the confirmed data clear does, because the reducer closes the session
  within 250 ms of the deadline. Completion consults the bridge and skips Bloom's chime only when an
  alarm for that exact deadline is genuinely alerting, so one stopped early still leaves a cue.
  Authorization is explicit, one-time, system-owned, and reversible in iOS Settings; no persisted
  state changed, so no schema bump. Flow never schedules an alarm. System UI receives only the
  bounded mode and clock data, the cue is the bundled `BloomCompletion.wav`, and the change adds no
  APNs, server, background mode, or Critical Alert entitlement. An iPhone 17 Pro iOS 26.5 Simulator
  run exposed one defect that only a running system shows: the generic activity was created and
  dismissed again ~260 ms later at every start, because ownership was unknown until the native answer
  returned — a visible second countdown flashing into the Dynamic Island. Ownership is now a
  three-state value keyed to the exact snapshot, so an authorized alarm holds the surface across that
  round trip; the notification deliberately keeps the opposite bias, since a duplicate pending
  request cancelled seconds later is smaller than a finish with no cue. A regression test covers
  both directions. `npm test` passes 65 files/635 tests, `npm run build`, `npx cap sync ios`, plist
  validation, and `git diff --check` pass; Xcode 26.6 code-signing-free Debug and Release Simulator
  builds of the app and extension succeed against the iOS 26.5 SDK with no new warnings, and `otool`
  confirms AlarmKit is weak-linked in both so pre-26 systems still launch. On that Simulator the app
  installed and launched, the real iOS authorization alert appeared carrying
  `NSAlarmKitUsageDescription`, granting it flipped the Settings note to its authorized wording,
  starting Focus scheduled the fixed alarm identity with a wake date matching the reducer deadline,
  ActivityKit created exactly one activity of the `AlarmAttributes<BloomAlarmMetadata>` type targeting
  Bloom's own widget, no generic activity was created at all, and the Lock Screen showed a single
  Bloom countdown with no task text. A Simulator still cannot demonstrate ringing through Silent
  Mode, through an active Focus, or on a locked physical device, so that evidence remains for
  user/device verification and this step stays open.
- **Device verification (August 7, 2026):** On the user's own iPhone the AlarmKit finish alarm fires
  as designed. The user separately observed that no local notification arrived on the same finish;
  that is 13.11's cue being handed over, not a defect — `useBloom.ts`'s
  `enabled: state.settings.sound && alarmOwnsCue !== true` deliberately withholds the notification
  while an authorized alarm holds the deadline, which is exactly the never-two-sounds rule this step
  specifies.
- **Closed (August 7, 2026):** The user confirmed on their own iPhone that the finish alarm rings
  through Silent Mode, through an active Focus, and on a locked device — the three observations no
  Simulator can produce, and the entire reason this step exists on top of 13.11. With the
  Simulator-side authorization, scheduling, single-activity, and weak-linking evidence above, every
  done-when condition is now met.

### - [x] 13.13 Draw the upper rails with the control that fits a mid-screen slot

- **Goal:** Stop rendering the Focus mode rail and the Friends/Field Guide rail with a standalone
  `UITabBar`. On iOS 26 a tab bar draws itself as a floating capsule inset inside its own bounds and
  reserves the bottom safe area, because a tab bar is a bottom-anchored, full-width control — placed
  mid-screen it renders narrower than its measured slot and crops its own labels along the bottom
  edge, which is what TestFlight devices show. Use `UISegmentedControl` on every iOS version: it is
  the control Apple provides for exactly this job, it fills the frame it is given, and iOS 26 gives
  it the same Liquid Glass sliding selection indicator. Keep the measured-slot bridge, the
  reducer-authoritative selection, the exactly-once events, and the web/Android rails unchanged.
- **Science:** n/a — native control metrics and platform-appropriate control selection.
- **Quality:** `docs/product-quality.md` — UX/UI correctness; Accessibility and semantics; Error
  prevention and recovery; integration and device testing.
- **Files:** `ios/App/App/BloomBridgeViewController.swift`, `docs/ios-liquid-glass.md`, focused tests.
- **Done when:** No standalone `UITabBar` remains outside the bottom navigation; the rail occupies
  the full measured slot width with no label cropping at the default and larger system text sizes;
  the height the control reports is the height the web slot reserves and the exchange still
  converges in one round; an unplaceable rail still reports inactive so the accessible web rail
  returns; mode and section changes still pass the transition guard exactly once; test, build,
  Capacitor sync, and Simulator checks pass, with the physical-device check recorded.
- **Depends on:** 13.3, 13.10.
- **Closed (August 2026):** The reported TestFlight rail was both narrower than its slot and cropped
  along the bottom of its labels — the signature of an iOS 26 `UITabBar` drawing its floating capsule
  inset inside a mid-screen frame. 13.10 had treated the symptom as a metric to negotiate and
  subtracted the root view's bottom safe-area inset from `sizeThatFits`; that measured correctly on
  one Simulator and still shipped a crop to hardware, because what a detached tab bar bakes into that
  number is not stable across position, iOS version, and text size. Both rails are now one
  `UISegmentedControl` on every iOS version, which removed the second `UITabBar`, its delegate
  branch, and the safe-area arithmetic entirely. The height handshake stays as a floor rather than a
  correction. On an iPhone 13 Pro Max iOS 26.5 Simulator the mode rail renders full-slot-width with
  all four labels intact, grows cleanly to five when Flow is enabled, keeps the Liquid Glass lens,
  and is unchanged at the largest accessibility text size; selecting Short still passed the
  transition guard and moved the reducer once. Friends/Field Guide renders the same way. `npm test`
  (60 files, 574 tests), `npm run build`, `npx cap sync ios`, and an Xcode 26.6 Simulator build pass.
  Physical-device confirmation stays with 13.6.

### - [x] 13.14 Return the Settings and foundations switches to the web layer

- **Goal:** Stop overlaying `UISwitch` instances on the web Settings sheet and daily-foundations
  dialog. Both live in DOM scroll containers, and a native view positioned from JavaScript-measured
  rects cannot track WKWebView scrolling: the scroll is composited off the main thread while the
  frame updates arrive a frame or more later, so each switch visibly drifts out of its row. Render
  the existing accessible web switch on iOS as it already ships on browser and Android, and remove
  the `switch` kind from the auxiliary-control bridge so the pattern cannot return by accident. The
  Settings glyph keeps its native `UIButton`: it sits in fixed header chrome, not in a scroller.
  Real `UISwitch` semantics return with 13.4b's native Settings presentation, where the switches
  live inside a UIKit sheet instead of on top of a scrolling web page.
- **Science:** n/a — native/web composition limits and interaction quality.
- **Quality:** `docs/product-quality.md` — UX/UI correctness; Accessibility and semantics;
  Architecture changes; responsive/scroll lifecycle; integration testing.
- **Files:** `src/components/SystemSwitch.tsx`, `src/native/iosTabs.ts`,
  `ios/App/App/BloomBridgeViewController.swift`, focused tests, `docs/ios-liquid-glass.md`.
- **Done when:** Every switch scrolls locked to its row on a physical iPhone; no `UISwitch` or
  `switch` control kind remains in the bridge or the native controller; switch state, VoiceOver
  switch semantics, disabled state, and reducer mutations are unchanged on every platform; no
  orphaned native control survives an unmount; test, build, Capacitor sync, and Simulator checks
  pass, with the physical-device scroll check recorded.
- **Depends on:** 13.4a.
- **Closed (August 2026):** 13.4a's `UISwitch` overlay could not have worked in a scrolling sheet:
  WKWebView composites scrolling off the main thread while the JavaScript-measured frame arrives a
  frame or more later, so each native switch trailed its row. `SystemSwitch` now renders only the
  accessible web switch it already shipped on browser and Android, and the `switch` kind is gone from
  both the TypeScript bridge and the controller, along with `BloomNativeSwitch` and its tint and
  teardown paths. The Settings glyph keeps its native `UIButton` because it sits in fixed header
  chrome. `nativeId` stays on the props as the stable control identity for 13.4b. On the iPhone 13
  Pro Max iOS 26.5 Simulator every switch stayed locked to its row through a scroll — including one
  clipping with its own row at the sheet's edge, which an overlay cannot do — and toggling Flow timer
  still reached the reducer and added the Flow segment to the rail. Focused tests now prove the
  bridge is never called; `npm test` (60 files, 574 tests), `npm run build`, `npx cap sync ios`, and
  an Xcode 26.6 Simulator build pass. Physical-device confirmation stays with 13.6.

### - [x] 13.15 Say what actually happens on a phone

- **Goal:** Bloom's Companion notices when you leave and come back. The wording for that was written
  for a browser tab, and it followed the app onto iPhone and iPad, where there are no tabs. Name the
  event for the device it happened on, and — more importantly — stop handing a phone a suggestion it
  cannot follow: "try fullscreen or a separate desktop for sessions" is not an available action
  there. Keep one behavioural mechanism and one evidence trail; only the words change.
- **Science:** the leave-and-return suggestion keeps its existing `docs/science.md` evidence key,
  because the behaviour change it recommends — make leaving a real trip rather than one flick — is
  the same on both surfaces. No new claim is introduced.
- **Quality:** `docs/product-quality.md` — UX/UI correctness; `docs/voice.md` for every new string.
- **Files:** `src/content/platformWords.ts`, `src/store/companion.ts`,
  `src/components/SettingsSheet.tsx`, `src/screens/TasksScreen.tsx`, focused tests.
- **Done when:** No user-visible string says "tab" on a Capacitor surface; the leave/return switch,
  the Flow subtitle, the clear-history scope, the Focus Patterns count, and the attention suggestion
  all read correctly on phone and in a browser; the suggestion's evidence key is unchanged; browser
  wording is untouched; test and build pass.
- **Depends on:** 13.4b.
- **Closed (August 2026):** The reported worry was that leave/return could not be measured on a
  phone. It can: `visibilitychange` fires when an iOS app backgrounds, and `useCompanion` measures
  time away against the wall clock on return rather than running a timer while hidden, so the
  feature is sound and only its vocabulary was wrong. `wordsFor(surface)` is a pure lookup and
  `computeAttentionPlan` takes the surface alongside its existing context argument, so the insight
  layer stays testable. On a Capacitor surface the switch reads "Notice when you leave", Flow is a
  "mode" rather than a "tab", counts read "3 quiet moments away", and the suggestion offers setting
  the phone down or turning on a Focus instead of fullscreen and a second desktop. A test asserts no
  app-surface string contains "tab". `npm test` and `npm run build` pass. Still browser-worded and
  left for a copy pass: the Field Guide's "distracting tabs closed" in `src/content/guide.ts`.

### - [x] 13.16 Float the upper rail on real Liquid Glass

- **Goal:** The mode rail is the correct control since 13.13, but a
  `UISegmentedControl` draws its own opaque track, so sitting a few hundred points above the system
  tab bar it read as flat plastic against the glass. Give it the real material — a `UIGlassEffect`
  the rail floats on — without reintroducing 13.13's cropped labels, and without Bloom drawing any
  material of its own.
- **Science:** n/a — platform material and control appearance.
- **Quality:** `docs/product-quality.md` — UX/UI correctness; Reduced motion/transparency/contrast
  (the system adapts the effect, so no Bloom-drawn substitute may bypass it).
- **Files:** `ios/App/App/BloomBridgeViewController.swift`, `docs/ios-liquid-glass.md`.
- **Done when:** The rail renders the system glass material on iOS 26 and later and the selected
  segment keeps its own indicator; labels are still uncropped at every text size; pre-iOS-26 is
  unchanged; hiding, clearing, and re-showing the rail leaves nothing behind; build and Simulator
  checks pass.
- **Depends on:** 13.13.
- **Closed (August 2026):** The rail is now a `UISegmentedControl` inside a `UIVisualEffectView`
  carrying `UIGlassEffect`, with only the control's own `backgroundColor` cleared so the sky
  refracts through. One wrong turn is worth recording: also blanking the control's `.normal`
  background image cleared the *selected* segment's indicator too, so every mode looked identically
  unselected — worse than the flat look being fixed. Clearing just the view's fill keeps the system
  lens. Glass and control are hidden and fronted together, so no orphan survives a mode switch or a
  modal. Verified on an iPhone 13 Pro Max iOS 26.5 Simulator: stars visible through the rail, the
  selected capsule intact, labels uncropped, and the material matching the tab bar below it.
- **Depends on:** 13.13.

### - [x] 13.17 Fold optional session prep so the transport always fits

- **Goal:** A fresh Focus screen stacked the task chip, the session target, the opening move, and the
  environment reset above the transport controls, and with the ritual on the Start button slid under
  the native tab bar. Keep the session target on the screen — naming one doable thing is the part
  with a behaviour-change reason behind it — and fold the rest behind one row that opens in a tap.
- **Science:** the session target stays visible precisely because `docs/science.md` supports
  implementation-intention prompting; nothing that fold hides carries a stronger claim than the
  target it keeps.
- **Quality:** `docs/product-quality.md` — UX/UI correctness; Accessibility and semantics
  (`aria-expanded`/`aria-controls`); responsive layout.
- **Files:** `src/screens/FocusScreen.tsx`, `src/styles.css`, lifecycle test.
- **Done when:** The collapsed state fits with the transport clear of the tab bar; the fold is a
  labelled control with correct expanded state; a surface that takes the screen (WOOP) is never
  hidden by it; the expanded state also fits, and scrolls where it cannot; the fresh-session
  ordering test still proves task → target → prep → Start once expanded.
- **Depends on:** 13.3, 13.13.
- **Closed (August 2026):** Collapsed is the default and shows the chip, the target, and one
  "a little more prep · optional" row. Expanding restores the previous content in the same order,
  tightens its spacing, and scrolls if a shorter phone still needs it. WOOP forces the fold open so
  it can never hide a surface that owns the screen. The lifecycle ordering test now taps the fold
  first and additionally asserts the prep is absent before it does. Verified on an iPhone 13 Pro Max
  iOS 26.5 Simulator with the ritual enabled — the state that produced the reported clipping — and
  the transport is fully clear in both the collapsed and expanded states.

### - [ ] 13.18 One command channel from system UI back to the reducer

- **Goal:** Make it possible for a control in system UI (Live Activity button, Dynamic Island
  button, notification action) to reach the reducer **without ever becoming a second timer
  authority**. A `LiveActivityIntent` performs in the app's process and the system will launch a
  suspended app in the background to run it — but Bloom's reducer lives in the WebView, whose JS is
  suspended at that moment, so the intent cannot call it synchronously. Add instead a durable,
  timestamped command queue in the App Group container: the intent appends
  `{ id, kind, sessionId, occurredAt }` and returns; the web layer drains the queue on resume,
  `visibilitychange`, and boot, and the reducer replays each command **against the wall clock it
  carries**, not against the time it was read. Bloom's timer is already `endsAt`-based, so a pause
  recorded at `T` reconstructs exactly as `remaining = endsAt − T` no matter how much later the
  WebView wakes — replay is lossless by construction, which is precisely why this design keeps one
  authority instead of creating two. Commands are idempotent by `id` (a replayed or duplicated queue
  entry is a no-op), are dropped when `sessionId` no longer matches the open session, and are
  bounded so a queue left by a killed process can never grow without limit or resurrect a session
  the boot sweep already closed as `interrupted`. The native layer may render an **optimistic**
  presentation immediately so the button feels instant, but it never writes a `SessionRecord`,
  never computes its own remaining time, and is corrected by the reducer's next mirror. No UI ships
  in this step, and no persisted app state changes — the queue is transport, not user data, so no
  `SCHEMA_VERSION` bump. This is a material architecture decision (a new inbound path to the
  reducer): write the ADR.
- **Science:** n/a — native lifecycle, process boundaries, and state authority.
- **Quality:** `docs/product-quality.md` — Architecture changes (ADR); Background/interrupt
  lifecycle; Error prevention and recovery; Privacy and security; Local-first and offline behavior;
  integration testing. 13.12's evidence records the standing rule this step must not break: never
  create a second place a session can be paused.
- **Files:** ADR, App Group command queue (native writer + Capacitor reader), `src/native/` typed
  adapter and tests, `src/store/useBloom.ts` drain/replay integration and tests,
  `docs/ios-liquid-glass.md`.
- **Done when:** A command enqueued while the WebView is suspended replays exactly once on resume
  with its recorded timestamp, producing the same reducer state as if the action had happened live;
  duplicate and replayed ids are no-ops; a command for a stale `sessionId` is dropped; a queue that
  survives force-quit does not revive a session the boot sweep closed; the queue is bounded and
  corrupt entries are discarded without throwing; no command path can write or upgrade a
  `SessionRecord`; the full test/build suite, Capacitor sync, an Xcode Simulator build, and
  `git diff --check` pass.
- **Depends on:** 7.4, 13.1, 13.8.
- **Implementation evidence (August 2026):** Added `docs/adr/0001-native-command-channel.md`, a
  durable bounded queue (`BloomCommandQueue.swift`, compiled into both the app and the widget
  extension so 13.19's shared intents can write to it), a Capacitor bridge exposing
  drain/acknowledge/clear plus a `#if DEBUG` producer, a total typed adapter, and reducer-owned
  replay. `toggle` gained an optional `at`, and every `Date.now()` inside that case now reads it, so
  a press recorded on a locked screen produces exactly the state that pressing it live would have —
  proven directly: pausing with twenty minutes left yields `remaining === 1200` no matter when the
  drain runs, and a resume lands its deadline on the press instant so time spent asleep still counts
  against the session. Delivery is at-least-once with acknowledgement separate from reading, so a
  crash between applying and acknowledging re-delivers rather than loses; replay is idempotent by
  `id`, drops commands whose `sessionId` is gone (a queue surviving force-quit cannot revive a
  session the boot sweep closed), ignores a command asking for the state the timer is already in
  rather than inverting it, and tracks a projected running state through a multi-command drain so a
  pause and a resume read together apply in press order. No command path writes or upgrades a
  `SessionRecord` (asserted). The confirmed data clear drops pending intent. Storage is the app's own
  container rather than an App Group, since `LiveActivityIntent` performs in the app's process — the
  ADR records the exact future trigger that would force an App Group. No persisted state changed, so
  `SCHEMA_VERSION` is unchanged. `npm test` passes 67 files/664 tests (29 new), `npm run build`,
  `npx cap sync ios`, and `git diff --check` pass; a code-signing-free Xcode 26.6 Debug Simulator
  build against the iOS 26.5 SDK succeeds with the extension embedded and validated, and object
  files confirm the plugin compiled into the app target and the queue into both. **Still open:** no
  command has yet made the real trip from a suspended process, because nothing produces one until
  13.19's intents exist — the `#if DEBUG` producer is a seam for that verification, not a substitute
  for it. This step closes when 13.19 exercises it end to end on a device.

### - [ ] 13.19 A Live Activity worth looking at, with controls that work

- **Goal:** Two fixes to the same surface, done together because controls change the layout. **(a)
  Presentation:** the current Lock Screen row is a glyph, "Bloom", a mode word, and a clock in a lot
  of empty space. Give it real hierarchy — the on-duty friend's glyph, the mode, a quiet elapsed
  progress indicator, and the clock as the clear focal point — across the Lock Screen, all three
  Dynamic Island families, and StandBy. Keep 13.8's privacy line exactly: no task text, no session
  target, ever. **(b) Controls:** add **pause/resume** as `Button(intent:)` over 13.18's channel, in
  the Lock Screen presentation and the expanded Dynamic Island. Pause/resume is safe here because it
  is reversible and losing a tap costs nothing. **Skip/advance is not** — it ends a session, and
  8.14 already established that Bloom guards a running timer against accidental destruction, so a
  skip control ships **only** in the expanded Dynamic Island (never the Lock Screen glance, never
  the compact or minimal families) or not at all if device testing shows it is easy to hit by
  accident. The AlarmKit countdown from 13.12 continues to ship **no** controls: when an alarm owns
  the surface the session is seconds from its deadline, and 13.12's reasoning against a second pause
  site still holds there. Pressing a control updates the activity optimistically and the reducer
  reconciles on wake. All strings `PLACEHOLDER_COPY` against `docs/voice.md`.
- **Science:** n/a — platform presentation and control affordances.
- **Quality:** `docs/product-quality.md` — UX/UI correctness; Accessibility and semantics (every
  control labelled and reachable by VoiceOver and Switch Control); Reduced motion, transparency, and
  contrast; Visual hierarchy; Error prevention and recovery; visual regression and device testing.
- **Files:** `ios/App/BloomLiveActivity/BloomLiveActivityWidget.swift`,
  `ios/App/Shared/BloomLiveActivityAttributes.swift`, App Intent definitions, `src/native/
  iosLiveActivity.ts` and tests, `src/store/useBloom.ts` lifecycle tests, `docs/ios-liquid-glass.md`.
- **Done when:** Pausing from the Lock Screen with Bloom force-backgrounded produces exactly one
  paused session whose remaining time matches the moment the button was pressed, not the moment the
  app woke; resume restores the same session; double-tapping a control cannot open two sessions or
  double-apply; the activity still ends on completion, skip, reset, abandon, relaunch recovery, and
  data clear; every presentation family renders correctly at the largest Dynamic Type size, in light
  and dark, with Reduced Transparency and Increased Contrast on; VoiceOver reaches and correctly
  labels each control; no task or target text appears anywhere; iOS versions without interactive
  Live Activities fall back to the read-only presentation; suite, build, Capacitor sync, Simulator
  build, and device check pass.
- **Depends on:** 13.8, 13.18; respects 8.14 and 13.12's single-pause-site rule.
- **Implementation evidence (August 2026):** Rebuilt the Lock Screen presentation around the clock as
  focal point — friend glyph in a tinted circle, mode name over a status line, a large rounded
  monospaced-digit clock, and a system-advanced `ProgressView(timerInterval:)` — and gave the
  expanded Dynamic Island the same progress bar plus a labelled control. Added `BloomPauseIntent` and
  `BloomResumeIntent` as `LiveActivityIntent`s in `Shared/`, compiled into both targets, writing to
  13.18's queue and then optimistically redrawing the activity so the button feels instant. Both are
  `isDiscoverable = false`: they serve one button on one Live Activity, and exposing them to
  Shortcuts would create a way to drive the timer from outside the app. **Skip is deliberately not
  shipped.** It ends a session and writes a record, 8.14 guards a running timer against accidental
  destruction, and a Lock Screen control cannot be confirmed — so the step's own "or not at all"
  branch applies pending the device check. Pause is safe precisely because a mis-tap undoes itself.
  The ADR's optimistic-render clause was corrected in the same change: it previously claimed the
  native layer "computes nothing", and the redraw does re-apply one `timerEnd − pressedAt`
  subtraction. It now states the real boundary — same arithmetic, same published inputs, no clock or
  state of its own — because the honest constraint is what makes it safe, not the overclaim.
  `npm test` passes 67 files/664 tests, `npm run build`, `npx cap sync ios`, and `git diff --check`
  pass; a code-signing-free Xcode 26.6 Debug Simulator build against the iOS 26.5 SDK succeeds with
  **no warnings**, both intents compile into the app and extension targets, and `Metadata.appintents`
  now lists `BloomPauseIntent` and `BloomResumeIntent` for both — the registration that was absent
  before this step. On an iPhone 17 Pro iOS 26.5 Simulator the app installed and launched, starting
  Focus created exactly one activity of `BloomFocusActivityAttributes` targeting Bloom's own widget,
  and the Lock Screen rendered the new layout with the glyph, mode, status line, clock, progress bar,
  and pause button, revealing no task text. Across two screenshots the countdown advanced 24→23 and
  the progress bar visibly filled with no app traffic, confirming both system-driven surfaces.
  **Compact Dynamic Island follow-up (same day, from user device feedback):** the compact
  presentation stretched far wider than its content, with a large empty span between the glyph and
  the clock. Cause: `Text(timerInterval:)` reserves layout width for the widest value it can reach,
  and `showsHours: true` was passed unconditionally, so every session reserved room for an hours
  component that only a session over an hour can ever show — while the leading glyph had no frame at
  all. `showsHours` is now asked for only when the interval genuinely reaches an hour, the glyph is
  pinned to 14pt, and the compact clock gets exactly the width its own format needs (40pt for mm:ss,
  58pt for h:mm:ss). **That first attempt was declared fixed on one screenshot and was wrong.**
  Watching the same build over a longer run showed the island back at full status-bar width with a
  shorter clock string than the frame that had looked tight — width rising while content shrank,
  which ruled out the content as its cause. iOS gives an active timer activity the full status-bar
  width whatever the compact regions ask for, so shrinking them could never have worked: the defect
  was never the pill's width, it was the empty span inside it. The leading slot now carries a short
  state word beside the glyph — "Focus"/"Tiny", "Paused", "Done" — and the gap is gone. Re-verified
  on a clean install across two frames 25 seconds apart, both steady: `🍃 Focus · 24:23`, with the
  status bar's own clock, Wi-Fi, and battery visible again beside a pill at roughly 59% of the
  screen. The `showsHours` and glyph-frame changes are kept — over-reserving width for an hours
  component that never appears is a real bug — but they were not what the user reported.
  **That run also resolved the earlier open question:** the compact clock rendered `24:38` with
  seconds intact, so the `23:––` seen before was the pending "Allow Live Activities from Bloom?"
  consent prompt, **not** a width or font problem. The defensive 42pt→34pt reduction is kept because
  it costs nothing and leaves room for `1:04:59`, but it was not the fix and the earlier regression
  risk is retired.
  **One thing remains unproven and is not claimed:** no button has been pressed end to end, because
  injected taps cannot reach controls in system UI on Simulator — so 13.18's channel still has not
  carried a command from a suspended process. That belongs to the device pass, and 13.18 stays open
  until it lands.

### - [ ] 13.20 Ask the check-in where the person actually is

- **Goal:** A Companion check-in currently cannot reach a locked phone at all: `useCompanion.ts`
  arms it on a JS interval that returns early while `document.hidden`, so backgrounding the app
  silently suspends the question. Deliver it natively instead, in the surface that is already on
  screen. **Live Activity path:** at the scheduled mark the activity shows the check-in state —
  the question plus **Yes** / **Not really** buttons (`PLACEHOLDER_COPY`, `docs/voice.md` rules 2
  and 3: it asks, it never grades) — and answering returns it to the ordinary countdown. **A hard
  platform constraint shapes this and must be settled before implementation:** a suspended app
  cannot update its own Live Activity, and APNs is forbidden by hard constraint #1, so the question
  cannot simply be pushed at the right second. The intended mechanism is the activity's `staleDate`
  set to the next check-in mark — the one system-driven re-render available without app execution —
  with the answering intent's background window used to set the following mark. **Verify that on a
  device before building the rest**; if it does not hold, the notification path below becomes the
  only path and this step ships that alone rather than inventing background execution. **Notification
  path** (also the fallback when Live Activities are off, unsupported, or unanswered): the same
  question as a local notification with the same two actions and **no sound and no
  interruption-level escalation** — a check-in must never be as loud as a finish, and never wakes a
  phone that a finish alarm would be entitled to wake. Answers travel over 13.18's channel and land
  in the existing companion event log with their recorded timestamp, so a late-drained answer is
  timed correctly. Every existing check-in rule is preserved unchanged: opt-in only, the strict cap,
  never-two-in-a-row, and an unanswered check-in logged as `skip` — the honest reading of "not now"
  the model already uses. This adds no schema change if the event shape suffices; if a delivery
  channel must be recorded, bump `SCHEMA_VERSION` with an appended migration.
- **Science:** `docs/science.md` §Measurement — check-ins are already the 1.5/4.5 mechanism; this
  step changes only where the question is delivered, and adds no new behavioral claim. §Do not
  build — always-on nudging: the cap, the opt-in, and the silence are what keep this a question and
  not a nag, so none of them may be relaxed to make native delivery easier.
- **Quality:** `docs/product-quality.md` — Accessibility and semantics; Privacy and security (the
  question reveals no task or target text); Local-first and offline behavior; Permission and
  interruption lifecycle; Error prevention and recovery; integration and device testing.
- **Files:** native check-in scheduling and notification actions, Live Activity check-in state and
  intents, `src/store/useCompanion.ts` (native scheduling seam), `src/store/useBloom.ts`,
  `src/native/` adapters and tests, Settings copy, `docs/ios-liquid-glass.md`.
- **Done when:** The `staleDate` mechanism is device-verified or explicitly recorded as unavailable
  before any dependent code lands; with the app locked, an armed check-in reaches the user through
  whichever path is proven, and answering it appends exactly one correctly-timed companion event;
  the notification carries no sound and no elevated interruption level; an unanswered check-in logs
  `skip` and honours never-two-in-a-row; the cap cannot be exceeded by combining native and
  in-app delivery; Companion off, quiet mode, and Flow sessions schedule nothing at all; no task or
  target text appears in any system surface; denied notification permission degrades to today's
  in-app behavior with copy saying precisely that; suite, build, Capacitor sync, Simulator build,
  and device check pass.
- **Depends on:** 1.5, 4.5, 13.18, 13.19 (Live Activity path only).

## Step dependency sketch

```
0.1 → 0.2
1.1 → 1.2 → 1.3 → 1.4
        1.3 → 1.5
1.4 → 2.1 → 2.2 → 2.3
        2.2 → 2.4
Phase 3: 3.1 → 3.2 → 3.5   |  3.3, 3.4 after 1.2
Phase 4: 4.1 ← (1.4, 2.4)  |  4.2 ← 2.1  |  4.3 ← 0.2  |  4.4 ← 2.4  |  4.5 ← (1.4, 2.4)  |  4.6 ← (4.1, 4.4)
Phase 5: 5.1 ← 1.3 → 5.2 ← 4.2 → 5.3     |  5.4 ← 0.2
Phase 6: 6.1 ← (0.1, 2.2) → 6.2 → 6.3 ← 2.4 → 6.4 ← 0.2
Phase 7: 7.4 harness after Phase 1; relevant Phase 8 fixes add regressions → 7.1–7.4 all pass → 7.5 fast browser QA
Phase 8: independent unless noted  |  8.10 → 7.2  |  8.15 deployed-offline proof deferred  |  8.17 ← (5.1–5.3, 8.4)  |  8.18 ← (3.2, 3.4, 4.1, 4.2, 4.6, 8.5)  |  8.20 ← (7.1, 8.3)  |  8.12 ← 1.2  |  8.16 anytime  |  8.21 post-milestone and not a 7.5 gate
Phase 9: 9.1 ← 0.1  |  9.2 ← 1.4 → 9.3 ← 8.20 → 9.5 ← (1.5, 9.1)  |  9.4 ← 1.1  |  9.6 ← (9.1, 8.12, 4.2, 2.3)
Phase 10: 10.1 ← (9.2, 1.1) → 10.2 ← (10.1, 8.12, 4.2, 9.2)  |  10.3 ← (9.6, 9.2, 10.1)  |  (10.2, 10.3) → 10.4 → 10.5 ← (8.3, 9.2)  |  10.6 ← (9.1 blocking, 10.1–10.3, 2.3, 8.2)
          10.7 ← (9.2, 5.4, 1.2) → 10.8 ← (8.3, 8.4, 5.1) → 10.9 ← (9.5, 5.4) → 10.10 ← (3.1, 3.2, 5.3)  |  10.11 ← (9.3, 9.4, 2.3, 10.1, 10.7, 7.1 fixtures)  |  10.12 last ← (10.2–10.11, 0.2)
Phase 11: 11.1 ← (8.11, 9.4, synced release slices through 10.11) → 11.2 ← (7.1, 9.4, 10.11) → 11.3  |  11.4 ← (8.4, 11.1, 11.3)  |  11.5 ← (11.2–11.4, 8.15) → 11.6 ← (7.1–7.4, 8.11, 8.15)
Phase 12: 12.1 ← (8.4, 8.8, 8.9, 4.3, 5.3)  →  12.2
Phase 13: 13.1 ← existing Capacitor 7 Android wrapper and local production build → 13.2 → 13.3 → 13.4a → 13.4b → 13.5 → 13.6  |  13.7 ← 13.1  |  13.8 ← (7.4, 8.3, 8.4, 13.1)  |  13.11 ← (7.4, 8.4, 13.1) → 13.12 → 13.6  |  13.13 ← (13.3, 13.10) → 13.16  |  13.14 ← 13.4a → 13.4b → (13.4c, 13.4d, 13.15) → 13.5  |  13.17 ← (13.3, 13.13)
          13.18 ← (7.4, 13.1, 13.8) → 13.19 → 13.6  |  13.20 ← (1.5, 4.5, 13.18, 13.19)
```

## What this plan deliberately does NOT include (per §Do not build)

Punitive streaks or pet-death mechanics · "25/5 (or 52/17, or 90-min cycles) proven by science" copy · dopamine-detox framing · ego-depletion messaging · multitasking training · always-on or unexplainable nudging · forced audio · anything implying ADHD diagnosis or treatment · mandatory accounts · sync required for core use · ads/tracking or default behavioral telemetry · remote fonts, CDN dependencies, or remote runtime assets.
