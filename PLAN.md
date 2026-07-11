# Bloom — Evidence-Based Iterative Build Plan

This plan turns the findings in `docs/science.md` (the corrected "Science of Focus for Bloom" report) into small, independently committable build steps. Each step is sized for **one focused Claude Code session**.

---

## How to use

Paste this exact prompt into Claude Code each session, replacing `X.Y`:

```
Read PLAN.md and docs/science.md. Do step X.Y ONLY — nothing else.

Hard constraints (apply to every step, no exceptions):
1. Offline-first: no network calls, no remote fonts/CDNs; all content is bundled in the repo.
2. Any change to persisted state bumps the schema version in src/store/useBloom.ts and adds a
   forward migration. Never wipe or orphan existing user data.
3. Warm kawaii voice: the pet suggests and encourages — it never guilts, shames, or moralizes.
4. Respect the "Do NOT build" list in docs/science.md (no punitive streaks, no dead-pet outcomes,
   no "scientifically optimal cadence" claims, no always-on nudging, no dopamine-detox framing,
   no ADHD-treatment claims).
5. Feature skeletons may ship with clearly-marked placeholder copy (PLACEHOLDER_COPY comment);
   final wording lands in the designated copy-pass steps.

When done: tick the step's checkbox in PLAN.md, verify in the browser preview (npm run dev),
and give me a short summary of what changed and how you verified it.

If the step is blocked, or the real codebase differs from what PLAN.md assumes, STOP and tell me
what you found instead of improvising.
```

Rules of thumb:

- Do steps in order **within** a phase; phases 3, 4, 5 can be interleaved after Phase 2 is done, but respect the per-step "Depends on" lines.
- Every step must leave the app shippable (`npm run build` green, no console errors).
- If a step turns out to be too big for one session, split it and add the new sub-steps to this file before continuing.

---

## Global design principles (from docs/science.md)

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

### - [ ] 1.2 Write records from the timer lifecycle

- **Goal:** FocusScreen/timer store creates a record at session start and finalizes it on complete/abandon (app close mid-session finalizes as `interrupted` on next boot via a stale-open-record sweep). Flow timer records `mode:'flow'` with `plannedMin` null-equivalent.
- **Science:** Same as 1.1 — recording must be automatic, not self-report, to be reliable.
- **Files:** timer store, `FocusScreen.tsx`, `src/store/sessions.ts`.
- **Done when:** Completing, abandoning, and force-closing mid-session each produce exactly one correctly-shaped record (verify via devtools).
- **Depends on:** 1.1.

### - [ ] 1.3 Link Companion drift events to the active session

- **Goal:** When Companion Mode logs a drift/tab-away, stamp it with the active `sessionId`; append the event id to the session's `driftEventIds`. Backfill is impossible — migration just leaves old events unlinked and code treats `sessionId` as optional.
- **Science:** §Staying — mind-wandering row (Zanesco et al. 2024: wandering increases over time-on-task; the report says track *when in the session* drifts occur — early/mid/late — which you already tag; this step ties that tag to session outcomes).
- **Files:** `src/store/companion.ts`, `src/store/sessions.ts`, schema bump + migration.
- **Done when:** A drift triaged during a session appears in that session's `driftEventIds`; drifts outside sessions remain valid with no sessionId.
- **Depends on:** 1.2.

### - [ ] 1.4 Pure stats selectors + unit tests

- **Goal:** `src/store/sessionStats.ts` with pure functions over records: `completionRateByPlannedLength()`, `completionRateByStartHour()`, `driftPhaseDistribution()`, `medianMinutesToFirstDrift()`, `abandonStreakInfo()` (recent consecutive abandons — feeds 3.5), plus a `hasEnoughSignal(n)` guard mirroring the one in `computeAttentionPlan()`. Vitest coverage with synthetic fixtures.
- **Science:** §Measurement — feedback row (Krukowski 2024: keep feedback simple and low-frequency → a small set of well-tested stats, not a metrics zoo).
- **Files:** `src/store/sessionStats.ts` (new), `src/store/sessionStats.test.ts` (new).
- **Done when:** All selectors covered by tests including empty/low-data cases; `npm test` green.
- **Depends on:** 1.3.

---

## Phase 2 — Insights that explain WHY

### - [ ] 2.1 Post-session debrief card (skeleton)

- **Goal:** After a session ends (complete or abandon), FocusScreen shows a dismissible debrief card: planned vs. actual, drift count with early/mid/late chips, outcome — and one slot for a "why" sentence (placeholder for now). Never shown mid-session. Pet delivers it via CompanionPrompt tone, not a modal wall.
- **Science:** §Measurement — progress monitoring row (Harkin 2016: visible recording of behavior, d = 0.40); §Measurement closing paragraph (reflect back clearly, don't moralize).
- **Files:** `src/components/DebriefCard.tsx` (new), `FocusScreen.tsx`.
- **Done when:** Card renders with real record data after any session end; dismisses cleanly; nothing renders while a timer runs.
- **Depends on:** 1.4.

### - [ ] 2.2 Rule-based "why" engine for the debrief

- **Goal:** `src/insights/why.ts`: pure function mapping (this session's record + user's aggregate stats) → one explanatory sentence with a cause, e.g. "Both drifts were late-session — attention naturally sags with time on task; a slightly shorter block might fit this task." Each rule returns `{ text, evidenceKey }` where `evidenceKey` points at a science.md anchor / future guide article. Cap: exactly one insight per debrief; a neutral fallback when signal is thin.
- **Science:** §Staying — time-on-task row (vigilance decrement is expected, "prompt before the slump, not after"); §Staying — mind-wandering row; §Recovering — self-forgiveness row (abandoned-session copy must be kind-restart framed, never streak-framed).
- **Files:** `src/insights/why.ts` (new + tests), `DebriefCard.tsx`.
- **Done when:** ≥6 rules with unit tests (late-drift pattern, short-session success, golden-hour match, abandon-kindness, first-drift-timing, low-signal fallback); every rule's copy passes a manual check against `docs/voice.md`.
- **Depends on:** 2.1, 0.2.

### - [ ] 2.3 Weekly review card

- **Goal:** A once-per-week card (surfaced on FocusScreen when idle, and from Settings on demand) answering exactly two questions from the data: "What helped you start?" and "What helped you recover?" — plus one suggested experiment for next week. Small numbers, no judgment words, no red/failure styling.
- **Science:** §Measurement — article brief "Why tracking helps and when it turns into pressure" (review with only those two questions, skip judgment); §Measurement — feedback row (simple, low-frequency beats over-engineered dashboards).
- **Files:** `src/components/WeeklyReview.tsx` (new), `src/insights/weekly.ts` (new + tests), FocusScreen, SettingsSheet.
- **Done when:** With ≥5 sessions of fixture data the card shows both answers + one experiment; with less it shows an encouraging "still learning your patterns" state; appears at most once per calendar week automatically.
- **Depends on:** 2.2.

### - [ ] 2.4 Make the attention recipe explainable

- **Goal:** Extend `computeAttentionPlan()` so every recommendation carries `{ because: string, evidenceKey: string }` — the *because* cites the user's own numbers ("62% of your drifts are rabbit-holes, mostly mid-session"), the *evidenceKey* links the science (rendered as a tappable "why?" that later deep-links to a guide article after 6.3; until then it opens a plain explainer sheet). No recommendation may appear without a because.
- **Science:** §Measurement — JITAI row (adaptation must be transparent and explainable, not opaque over-personalization); §Prioritized feature ideas rank 8 (pattern-aware reflection).
- **Files:** `src/store/companion.ts` (computeAttentionPlan), focus-patterns card component, `src/insights/why.ts` (shared evidence keys).
- **Done when:** Every rendered recipe line shows its because-sentence; evidence keys resolve; unit tests updated.
- **Depends on:** 2.2.

---

## Phase 3 — STARTING features

> Report ranking: if Bloom does only three things for starting, they are pre-session if–then plans, a tiny-start mode, and a friction-removing ritual (§Starting, closing paragraph).

### - [ ] 3.1 If–then plan data model

- **Goal:** Persisted slice for implementation intentions: `IfThenPlan { id, cueType: 'time'|'place'|'emotion'|'obstacle', cueText, actionText, taskId?, usageCount, lastUsedAt }`. Ships with 4 fill-in templates (one per cue type, e.g. "If it's __:__ , then I open ____ and write one ugly sentence"). Schema bump + migration. No UI yet beyond a hidden dev list.
- **Science:** §Starting — implementation intentions row (Gollwitzer & Sheeran 2006 meta-analysis: overall d = 0.65; specifically for failures-to-get-started d = 0.61 — the single best evidence-to-complexity ratio in the report, feature rank #1).
- **Files:** `src/store/ifThen.ts` (new), `src/store/useBloom.ts` (version + migration).
- **Done when:** Slice persists and migrates; templates load; tests for CRUD.
- **Depends on:** Phase 1 complete (records will later log which plan a session used).

### - [ ] 3.2 Pre-session if–then planner UI

- **Goal:** Optional one-line step on FocusScreen before starting: pick a saved plan or fill a template (cue + action), skippable with one tap, remembered per task. Session record stores the planId used. Pet frames it as "what's our opening move?" — never as a requirement.
- **Science:** Same as 3.1; §Starting — procrastination-as-mood-regulation row (Sirois & Pychyl 2013: reduce the felt cost of the first two minutes; avoid "be more disciplined" framing).
- **Files:** `src/components/IfThenPlanner.tsx` (new), `FocusScreen.tsx`, `src/store/sessions.ts` (add `ifThenPlanId?` — version bump).
- **Done when:** Full flow works: pick/fill → start session → record links planId; skipping is one tap; zero friction added for users who ignore it.
- **Depends on:** 3.1.

### - [ ] 3.3 Tiny-start mode

- **Goal:** A third start option beside focus/flow: a 2- or 5-minute "tiny start". When it completes, the pet offers (never insists) the next rung: "keep going for 10?" — accepting extends seamlessly without a break; declining still counts as a *completed* session and earns normal warmth. Records use `mode:'tiny'`.
- **Science:** §Starting — micro-commitments row (Felkey, Dziadula & Chiang 2023, *Southern Economic Journal* 90(2): students with microcommitments ~2× as likely to engage; marginal effect largest for high procrastinators; report grades this *promising, not settled* — so copy must not oversell); §Starting — article brief "Use a tiny start without lying to yourself" (the ladder: 2 min → 10 min → full session).
- **Files:** timer store, `FocusScreen.tsx`, `src/store/sessions.ts`, XP logic (tiny sessions earn proportional XP — never zero, never penalized).
- **Done when:** Tiny session runs, completes, optionally extends up the ladder; a declined extension still records `completed`; streak/XP treat it as a real session.
- **Depends on:** 1.2.

### - [ ] 3.4 Environment reset ritual card

- **Goal:** Optional 15–30-second pre-session checklist card: *phone away · task named · first action named · distracting tabs closed* — user-editable items, persisted; a single satisfying tap-through, then straight into the timer. Off by default; discoverable in Settings and via a one-time gentle pet suggestion.
- **Science:** §Starting — pre-work ritual row (Sonnentag & Kühnel 2016: morning reattachment predicts day-level engagement; Ward et al. 2017: mere phone presence taxes cognition — friction reduction, not motivation speeches); feature rank #7.
- **Files:** `src/components/RitualCard.tsx` (new), `src/store/ritual.ts` (new, version bump), SettingsSheet, FocusScreen.
- **Done when:** Toggle in Settings; when on, card precedes session start and is completable in <30s; items editable; skippable.
- **Depends on:** 1.2.

### - [ ] 3.5 WOOP script for repeated start-failures (conditional, gentle)

- **Goal:** If `abandonStreakInfo()` shows ≥3 recent abandons/failed starts, the pet offers — once, dismissible, never repeated within 7 days — a 60-second guided WOOP card: Wish → Outcome → Obstacle → Plan (the Plan step reuses the if–then planner). Entirely optional.
- **Science:** §Starting — mental contrasting row (Wang et al. 2021 meta-analysis: MCII g = 0.336 overall; guided delivery g = 0.465 vs. document-only g = 0.277 — hence a *guided, stepwise* card rather than a text dump); the trigger design respects §Do not build — always-on nudging (low-frequency, explainable).
- **Files:** `src/components/WoopCard.tsx` (new), `src/insights/triggers.ts` (new), `src/store/sessionStats.ts`.
- **Done when:** Fires only on the stat trigger, at most once/7 days, links into 3.2's planner; trigger logic unit-tested.
- **Depends on:** 3.2, 1.4.

---

## Phase 4 — STAYING features

### - [ ] 4.1 Adaptive cadence suggestions (never "optimal cadence" claims)

- **Goal:** Keep 25/5 as default. In the attention recipe / weekly review, suggest *experiments* grounded in the user's data: e.g. if median-first-drift ≈ 18 min → "try a 20/5 week"; if long sessions complete fine → offer 40/8 or 50/10. Copy always frames cadence as personal experiment ("compare distraction tags and finish rates, not vibes"), never as science-proven.
- **Science:** §Staying — breaks row (Albulescu et al. 2022 meta-analysis: breaks help; no universally best cadence); §Staying — 25/5 myth row + §Do not build rows on 25/5, 52/17 and 90-minute ultradian claims; §Staying — article brief "Breaks are fuel, not failure" (the two-cadence A/B exercise).
- **Files:** `src/insights/cadence.ts` (new + tests), recipe card, `WeeklyReview.tsx`, timer presets.
- **Done when:** Suggestions derive from real stats with a low-signal fallback; one-tap applies the suggested preset; no copy anywhere claims a cadence is scientifically optimal (grep check).
- **Depends on:** 2.4, 1.4.

### - [ ] 4.2 Session target field ("one specific doable thing")

- **Goal:** Optional single-line target when starting ("outline the intro section"), shown quietly during the session and echoed in the debrief ("target: outline the intro — done?"), stored on the record (`targetText`). This is the flow lever: clear goal + immediate feedback.
- **Science:** §Staying — flow row (Fong et al. 2015: challenge–skill balance moderately predicts flow; clear goals and immediate feedback are the actionable antecedents); §Staying — article brief "What flow really needs" (hard enough to matter, small enough to finish in the block).
- **Files:** `FocusScreen.tsx`, `src/store/sessions.ts` (already has `targetText` from 1.1 — wire it), `DebriefCard.tsx`.
- **Done when:** Target set → visible mid-session → debrief asks about it (self-report tap: done / partly / no, stored on record); fully skippable.
- **Depends on:** 2.1.

### - [ ] 4.3 Honest soundscape labeling

- **Goal:** Audit the Web-Audio soundscapes: no autoplay ever; each ambient option gets an honest one-line label (e.g. rain/noise: "often better for brainstorming than dense reading"); Settings gains a short "sound & focus" note linking the guide's music article (link activates after 6.3). Since all audio is synthesized there are no lyrics — the guide article carries the lyrics warning for users' own external music.
- **Science:** §Staying — background music row (Cheah et al. 2022 systematic review: effects roughly null on average, masking task/person differences; lyrics often hurt language tasks); §Staying — ambient noise row (Mehta et al. 2012: ~70 dB moderate noise helped creative tasks, 85 dB hurt); §Do not build — forced soundtracks.
- **Files:** sound settings UI, `SettingsSheet.tsx`.
- **Done when:** No autoplay path exists; every soundscape shows its label; copy passes voice.md check.
- **Depends on:** 0.2.

### - [ ] 4.4 Chronotype self-tag

- **Goal:** Settings question: "When are you usually sharpest?" → `betterEarlier | betterLater | notSure` (persisted, version bump). Feeds golden/foggy-hours logic as a prior blended with observed `completionRateByStartHour()`, and shapes expectation copy ("evening types fighting 8 a.m. analysis is normal, not weakness").
- **Science:** §Staying — chronotype row (May & Hasher 2023 integrative review: synchrony effects strongest for analytical work and distraction suppression, especially in strong morning/evening types).
- **Files:** `SettingsSheet.tsx`, `src/store/useBloom.ts` (version bump), `src/store/companion.ts` (golden-hours blend).
- **Done when:** Tag persists and migrates; recipe's golden-hours line cites both the tag and observed data in its because-sentence.
- **Depends on:** 2.4.

### - [ ] 4.5 Pre-slump gentle check (opt-in, strictly capped)

- **Goal:** Opt-in (default OFF): if the user's data shows a typical first-drift time (e.g. ~min 18), the pet gives one soft, non-blocking breath/stretch cue shortly *before* that point — max once per session, max twice per day, one tap to silence for the day, and the toggle explains exactly why it fires ("based on when your drifts usually start").
- **Science:** §Staying — time-on-task row ("prompt users before the likely slump, not after"); §Measurement — JITAI row (Wang & Miller 2020: promising but heterogeneous; report verdict: *conservative, low-burden, transparent rule engine only*); hard guard from §Do not build — always-on nudging.
- **Files:** `src/insights/triggers.ts`, timer store, `CompanionPrompt`, SettingsSheet.
- **Done when:** Fires only when opted in, only with sufficient signal, respects both caps; the explanation string is visible in Settings; trigger unit-tested.
- **Depends on:** 1.4, 2.4.

### - [ ] 4.6 Learned personal cadence: a starting ratio that grows with you

- **Goal:** Turn 4.1's one-off experiment suggestions into a continuously-learned *personal starting point*. `suggestPersonalCadence()` in `src/insights/cadence.ts` blends the user's own signals — `medianMinutesToFirstDrift()`, `completionRateByPlannedLength()`, `driftPhaseDistribution()`, and the 4.4 chronotype tag — into one recommended focus/break pair (e.g. drifts cluster at ~min 16 → start at 15/4; long sessions complete cleanly → current fit is 40/8), always with a `{ because, evidenceKey }` per 2.4. Include a **stretch ladder**: when the user completes ≥ ~80% of sessions at their current length over a rolling window, offer (never auto-apply) the next rung up (+5 min focus, break scaled ~1:5), so the ratio grows as their attention does; a rough patch quietly re-offers a shorter rung with kind, no-failure framing. Recommendation recomputes at most weekly, surfaces only at natural pauses (weekly review, recipe card, settings), one-tap apply, one-tap back to any previous rung. With thin data the answer is always "25/5 is a lovely starting point while I learn your rhythm" (PLACEHOLDER_COPY until the copy pass). Copy rule, greppable in the done-check: the app may say "best fit *for you right now*" and "an experiment" — never "optimal", "ideal", or "what science recommends".
- **Science:** §Staying — breaks row (Albulescu et al. 2022: breaks help, *no universally best cadence* — which is exactly why a personal, data-derived fit is honest where a universal claim would not be); §Staying — time-on-task + mind-wandering rows (Zanesco et al. 2024: drift timing is the signal to fit session length to); §Staying — chronotype row (May & Hasher 2023, as a prior); §Measurement — JITAI row (transparent, low-burden rule engine; recompute weekly, not per-session); §Do not build — the 25/5-optimal, 52/17 and ultradian rows (hard guardrail on the copy).
- **Files:** `src/insights/cadence.ts` (+ tests), `WeeklyReview.tsx`, recipe card, `SettingsSheet.tsx`, timer presets.
- **Done when:** With fixture data the recommendation, its because-sentence, and the stretch/shrink rungs are all derived from the user's own numbers; applying and reverting are one tap each; low-signal state recommends 25/5 with the learning framing; unit tests cover drift-timing fit, stretch trigger, rough-patch shrink, and low-signal; grep for "optimal|ideal|science recommends|scientifically" over user-facing strings returns clean.
- **Depends on:** 4.1, 4.4, 1.4, 2.4.

---

## Phase 5 — RECOVERY features

> The report's core recovery claim: most focus apps stop at timer logic, but the decisive moment is the minute after disruption — reduce residue, capture the thought, restore context, restart without shame (§Recovering, closing paragraph).

### - [ ] 5.1 Distraction parking lot

- **Goal:** During a session, a one-tap "park it 🌱" affordance opens a tiny 5-word input; the thought disappears from view and *returns at the next break or session end* (never immediately — that would just be a todo list). Parked items persist (version bump) and can be sent to Tasks or dismissed. Copy frames it as an experiment, not a proven fix.
- **Science:** §Recovering — cognitive offloading row (Risko & Gilbert 2016; Scullin et al. 2018: writing specific to-dos reduced mental carryover; report explicitly grades direct focus-session evidence as *indirect* → honest experimental framing required); feature rank #4; article brief "Use a parking lot for urge-to-check thoughts".
- **Files:** `src/components/ParkingLot.tsx` (new), `src/store/parking.ts` (new, version bump), `FocusScreen.tsx`, break screen.
- **Done when:** Park mid-session (≤2 taps + typing) → item hidden → resurfaces at break/end → send-to-task and dismiss both work; drift log optionally records that a park happened instead of a full drift.
- **Depends on:** 1.3.

### - [ ] 5.2 Resume cue card

- **Goal:** When Companion Mode detects a tab-away/drift and the user returns, show a small re-entry card *before* the ticking timer regains focus: last parked note (if any) · current session target (4.2) · "next concrete action" (one line the user typed at start or mid-session). One tap resumes. Also offered when reopening the app onto an `interrupted` session.
- **Science:** §Recovering — attention residue row (Leroy 2009: residue from the prior focus impairs the next task) and resumption cues row (Altmann & Trafton 2004: first post-interruption action ~3.8 s vs 1.9 s baseline; external cues available at resumption reduce the lag — lab-only but highly actionable); feature rank #3 ("best science-backed recovery mechanic").
- **Files:** `src/components/ResumeCue.tsx` (new), `src/store/companion.ts` (return detection hook), `FocusScreen.tsx`.
- **Done when:** Tab-away → return shows the card populated from real state; one tap resumes; never appears when nothing was interrupted.
- **Depends on:** 4.2, 5.1.

### - [ ] 5.3 Kind-restart micro-intervention

- **Goal:** After an abandoned session or a triaged drift, the pet offers an optional 30–60 s reset: one synthesized breath cycle (Web Audio swell, no assets) → "Noted. Next step is ___?" (one line) → resume/tiny-start button. Never auto-plays; always one tap to skip.
- **Science:** §Recovering — self-forgiveness row (Wohl et al. 2010: self-forgiveness after procrastinating predicted *less* future procrastination; Sirois 2014: self-compassion moderately negatively associated with procrastination); mindfulness row (Verhaeghen 2021: attention gains real but modest, g ≈ 0.29 → keep it short and optional, no meditation-app scope creep); feature rank #6; article brief "After distraction, don't make it worse".
- **Files:** `src/components/KindRestart.tsx` (new), Web Audio synth module, `DebriefCard.tsx` (abandon path), `CompanionPrompt`.
- **Done when:** Offered after abandon + after drift triage; full flow ≤60 s; skip is one tap; the typed next step pre-fills 5.2's resume cue.
- **Depends on:** 2.2, 5.2.

### - [ ] 5.4 Soften the streak

- **Goal:** Rework streak presentation to consistency-over-months framing: no loss animation, no guilt copy, no pet sadness tied to missed days. Add a "gentle streak" mechanic (e.g., one free rest day per week that doesn't break it, and a "come back" state that celebrates returning rather than mourning the gap). Persisted streak data migrates losslessly.
- **Science:** §Measurement — habit formation row (Lally et al. 2010: median 66 days to automaticity, range 18–254 → "consistency over months, not 21 days"); §Do not build — punitive streak loss / dead-pet outcomes (guilt and loss-aversion mechanics increase pressure and post-setback avoidance; Deci et al. 1999 on extrinsic control undermining intrinsic motivation); §Measurement — supportive accountability row (coach, not boss).
- **Files:** streak logic in `src/store/useBloom.ts` (version bump + migration), streak UI, pet reaction states.
- **Done when:** Missing a day produces neutral-to-warm copy only; rest-day rule works and is explained in Settings; no red/broken/skull styling anywhere (grep + visual pass); old streak counts survive migration.
- **Depends on:** 0.2.

---

## Phase 6 — The Field Guide (~12 cited articles, contextually surfaced)

### - [ ] 6.1 Guide content model + bundled data

- **Goal:** `src/content/guide.ts`: typed array of 12 articles matching the report's in-app briefs — id, `stageTag: 'start'|'stay'|'recover'|'science'`, title, 3–5 key-point paragraphs, one practical exercise, and a `sources` array of citation strings (author-year-journal; no external links required at runtime since we're offline — full references live in docs/science.md). Bodies may be PLACEHOLDER_COPY. The 12: first pebble · if-then beats try harder · tiny start · make your desk help you · attention naturally fades · breaks are fuel · what flow needs · music & lyrics · don't make it worse · parking lot · one-minute re-entry · why tracking helps.
- **Science:** §In-app article briefs (all twelve, verbatim structure: stage tag, key points, practical exercise, sources).
- **Files:** `src/content/guide.ts` (new), `src/content/guide.test.ts` (shape validation).
- **Done when:** All 12 entries type-check, each has ≥1 source string and one exercise; a test asserts ids are unique and every `evidenceKey` used by `src/insights/*` maps to a real article.
- **Depends on:** 0.1; ideally after 2.2 so evidence keys exist to map.

### - [ ] 6.2 Guide reading UI

- **Goal:** A "Field Guide" section (inside CollectionScreen or a light new screen — follow existing nav patterns): browse by stage tag, read view with title/body/exercise/sources, read-state persisted (version bump) so the pet can suggest unread ones. Calm typography; an article is a 2-minute read.
- **Science:** §Measurement closing paragraph (reflect clearly, don't gamify knowledge — no points for reading).
- **Files:** `src/components/GuideScreen.tsx` (new) or CollectionScreen section, `src/store/guide.ts` (read-state, version bump), navigation.
- **Done when:** All 12 articles browsable and readable offline; read-state persists and migrates.
- **Depends on:** 6.1.

### - [ ] 6.3 Contextual surfacing rules

- **Goal:** `src/insights/surfacing.ts`: pure ruleset mapping moments → article suggestions, rendered only at natural pauses (debrief, break, weekly review, recipe "why?" links) — **never during a running session**. Mappings: rabbit-hole drift → parking-lot article; urge → parking lot; wander → attention-fades; restless → breaks-are-fuel; external → re-entry ritual; repeated abandons → first-pebble/tiny-start; recipe lines → their evidenceKey article. Caps: ≤1 suggestion per debrief, ≤3 per week, never repeat a read article within 30 days.
- **Science:** §Measurement — JITAI row (conservative, transparent, low-burden); §Do not build — always-on nudging; §Staying — the drift-kind taxonomy the report endorses for Bloom's tags.
- **Files:** `src/insights/surfacing.ts` (new + tests), `DebriefCard.tsx`, `WeeklyReview.tsx`, recipe card, `CompanionPrompt`.
- **Done when:** Every mapping unit-tested; caps enforced in tests; manual check confirms zero surfacing paths during an active timer; 2.4's "why?" links now deep-link into the guide.
- **Depends on:** 6.2, 2.4, and the drift taxonomy from `companion.ts`.

### - [ ] 6.4 Guide copy pass (final wording)

- **Goal:** Replace all PLACEHOLDER_COPY in the 12 articles with final prose written from §In-app article briefs: warm kawaii pet voice per docs/voice.md, honest hedging preserved exactly where the report hedges ("evidence is promising, but most direct studies are in education contexts"), citations kept accurate to docs/science.md.
- **Science:** §In-app article briefs (source text); §Do not build (banned claims checklist); docs/voice.md.
- **Files:** `src/content/guide.ts`.
- **Done when:** No PLACEHOLDER_COPY remains in guide content (grep); spot-check 3 articles against the report's briefs for factual fidelity; every hedge in the briefs survives in the copy.
- **Depends on:** 6.1, 0.2.

---

## Phase 7 — Verification & release

### - [ ] 7.1 Migration test suite

- **Goal:** Vitest suite with a localStorage fixture for *every* schema version shipped during this plan; each fixture runs the full forward-migration chain to latest and asserts: no key loss, streak/XP/pets/tasks/goals intact, new slices initialized. Add a CI-friendly `npm run test:migrations`.
- **Science:** Constraint #2 made mechanically enforceable — insight features are worthless if they eat the data they explain (§Measurement — monitoring requires trustworthy records).
- **Files:** `src/store/migrations.test.ts` (new), fixtures dir.
- **Done when:** One fixture per version; suite green; intentionally corrupting a fixture fails the suite (verified once, then reverted).
- **Depends on:** all schema-bumping steps (1.1–6.2).

### - [ ] 7.2 Offline audit

- **Goal:** Prove the offline claim: grep the bundle/source for `fetch(`, `XMLHttpRequest`, `WebSocket`, external URLs in `src/`; verify all guide content, fonts and audio are bundled (audio is synthesized — assert no audio asset imports appeared); run the production build with DevTools network-blocked and exercise every new screen.
- **Science:** Constraint #1; also §Do not build — an offline app cannot quietly become a telemetry app.
- **Files:** none (audit) or a small `scripts/offline-audit.sh`.
- **Done when:** Zero network requests in a full manual pass over debrief, weekly review, planner, tiny-start, ritual, parking lot, resume cue, kind restart, guide.
- **Depends on:** Phases 1–6.

### - [ ] 7.3 Voice & do-not-build copy audit

- **Goal:** Sweep every user-facing string added by this plan against docs/voice.md and §Do not build: no guilt, no shame, no "scientifically optimal", no dead-pet/loss framing, no ADHD-treatment implications (the report's approved boundary sentence — "some people, including some people with ADHD, may find shorter steps and stronger external cues helpful; this app is not medical advice" — may appear in the guide's science article only). Fix violations in the same session.
- **Science:** §Do not build (entire table); §Recovering — self-forgiveness row; docs/voice.md.
- **Files:** any component with copy; `docs/voice.md` (append a "audited on <date>" note).
- **Done when:** Grep list of banned phrases returns clean; a read-through of every new card/screen in the preview passes the voice checklist.
- **Depends on:** 6.4 and all feature phases.

### - [ ] 7.4 QA script + Android release

- **Goal:** Write `docs/qa.md` (10-minute manual smoke script covering the golden path: ritual → if-then → tiny start → grow → drift → park → resume cue → complete → debrief → guide link → weekly review). Then `npm run build`, `npx cap sync android`, build the APK, run the script on a device including airplane-mode and an upgrade-install over the previous APK (migration proof on-device). Tag the release.
- **Science:** n/a — ship it.
- **Files:** `docs/qa.md` (new), android build artifacts.
- **Done when:** Script passes on web preview and on-device; upgrade install preserves all data; release tagged.
- **Depends on:** 7.1–7.3.

---

## Step dependency sketch

```
0.1 → 0.2
1.1 → 1.2 → 1.3 → 1.4
1.4 → 2.1 → 2.2 → 2.3
        2.2 → 2.4
Phase 3: 3.1 → 3.2 → 3.5   |  3.3, 3.4 after 1.2
Phase 4: 4.1 ← (1.4, 2.4)  |  4.2 ← 2.1  |  4.3 ← 0.2  |  4.4 ← 2.4  |  4.5 ← (1.4, 2.4)  |  4.6 ← (4.1, 4.4)
Phase 5: 5.1 ← 1.3 → 5.2 ← 4.2 → 5.3     |  5.4 ← 0.2
Phase 6: 6.1 ← (0.1, 2.2) → 6.2 → 6.3 ← 2.4 → 6.4 ← 0.2
Phase 7: after everything above
```

## What this plan deliberately does NOT include (per §Do not build)

Punitive streaks or pet-death mechanics · "25/5 (or 52/17, or 90-min cycles) proven by science" copy · dopamine-detox framing · ego-depletion messaging · multitasking training · always-on or unexplainable nudging · forced audio · anything implying ADHD diagnosis or treatment.
