# Bloom voice & copy guardrails

*Every user-facing string added by PLAN.md steps must pass this page (plan step 0.2). Evidence grounding: [science.md](science.md) — [§do-not-build](science.md#do-not-build), [§recovering](science.md#recovering) (self-forgiveness row), [§measurement](science.md#measurement) (supportive accountability row).*

## The voice in one breath

Bloom's pet is a small warm friend who sits **beside** you — never a boss, a coach with a clipboard, or a disappointed parent. It suggests, wonders, and celebrates. It treats drifting attention as weather ("a wander blew through"), not as sin. It is honest about evidence: it says "worth a try", never "science proves". And everything it offers can be skipped in one tap, with no commentary about the skip.

Why this is a hard rule and not a vibe (see science.md):

- Controlling rewards can **undermine** intrinsic motivation (Deci, Koestner & Ryan 1999: d ≈ −0.28 to −0.40 depending on reward contingency), and controlling pressure carries the same risk (science.md §measurement, §do-not-build).
- Self-forgiveness after procrastinating **predicted less** future procrastination in Wohl et al. 2010, and self-compassion shows a moderate negative link with procrastination (Sirois 2014). Kindness after a setback is strategic, not soft.
- Support helps adherence when it feels benevolent, trustworthy, and process-oriented — a helpful coach, not a boss (Mohr et al. 2011).

## The 10-point copy checklist (string-level)

Lint every new user-facing string by hand. Every answer must be "yes" — and when an item's trigger doesn't apply to the string (no setback, no data-fired prompt, no metric), that item counts as "yes".

1. **Invites, doesn't command.** Offers and questions ("want to…?", "we could…"); never orders, never "you should".
2. **Zero guilt vocabulary.** Nothing from the never-ship lexicon below; no "only/just" used to diminish ("only 2 sessions").
3. **Setbacks get restart framing.** If the string responds to an abandon, drift, or missed day: acknowledge without judgment, then offer a smallest next step. Template: "That happened. Smallest next step?"
4. **Metrics are mirrors, not grades.** If the string reports numbers: neutral or warm, no "good day / bad day", no grading the user — and no praising the *absence* of drifts (celebrate recoveries instead; science.md §measurement reflects back starts, completions, and recoveries).
5. **Hedges match the evidence.** Claims carry the same confidence as science.md: strong meta-analysis → "tends to help"; promising or thin → "worth an experiment"; never "proven", "optimal", "guaranteed".
6. **The pet's feelings are never leverage.** The pet is never described as sad, sick, hungry, disappointed, or gone because of anything the user did or didn't do. Coming back always gets a glad welcome.
7. **Autonomy is visible.** Optional things read as optional ("if you like", "skip anytime").
8. **Explains itself.** If the prompt fires from data, the string itself says why in plain words ("based on when your drifts usually start").
9. **Small words, short lines.** Sentences of roughly 12 words or fewer; at most one emoji per message; no invented diminutives and no cooing at the user. "Mochi did a happy bounce" is warm; "Mochi wuvs your focus!" is babytalk.
10. **No medical territory.** Nothing implies diagnosing or treating anything. The approved ADHD boundary sentence (see below) appears verbatim in exactly one place in user-facing copy: the Field Guide article tagged stage `science` ("Why tracking helps and when it turns into pressure", step 6.1). Guardrail docs (this page, science.md) may quote it to define the rule.

### Feature-level guardrails (reviewed per feature, not per string)

- No red / failure / broken styling on metrics, streaks, or setbacks.
- Skipping any offer costs nothing and triggers no follow-up.
- Every automated prompt has a frequency cap, stated where the user can see it (e.g. its Settings toggle).
- Sound never autoplays.

## Allowed vs. banned phrasings

| # | Moment | ✗ Banned | ✓ Allowed |
|---|--------|----------|-----------|
| 1 | Session abandoned | "You broke your streak." | "That happened. Smallest next step?" |
| 2 | Suggesting a cadence | "Science proves 25/5 is optimal." | "25/5 is a comfy default. Want to try 20/5 this week and compare?" |
| 3 | Missed a day | "Your pet is sad because you failed." | "You're back! Mochi did a happy bounce. Where were we?" |
| 4 | Streak after a gap | "Streak lost. Back to zero." | "Welcome back — consistency is a months game, and you're still playing. Tiny session to warm up?" |
| 5 | User tags a drift mid-session | "Distracted again? Focus!" | "A wander blew through 🌱 Park the thought, or drift back when ready?" |
| 6 | Helping the user start | "Stop procrastinating and just start." | "Starting is the heavy part. Want to plant a tiny 2-minute seed?" |
| 7 | Daily reflection | "You only did 2 sessions." | "Two sessions today. You found your way back fast after that first wander." |
| 8 | Tiny session ends, offering more | "Don't stop now or you'll lose your momentum!" | "Keep going for 10? Either way, this one counts — fully bloomed." |
| 9 | XP and rewards | "Finish 3 more sessions to feed Mochi!" | "Mochi cheers every finish, tiny ones included." |
| 10 | Sharing a data insight | "Your focus is terrible after lunch." | "Your data hints mornings are your golden hours — afternoons might like lighter tasks." |
| 11 | User returns after days away | "We missed you! Don't abandon your pet again." | "Hi again! Pick something small and cozy to start?" |
| 12 | Describing a soundscape | "Focus music, scientifically tuned for deep work." | "Calm music — many folks like it for routine work; silence is great too." |

Note on #5: the allowed copy is a **reply to a drift the user tagged themselves**. A prompt the app fires from data must additionally satisfy checklist item 8 (state its basis in the string) and carry a frequency cap per the feature-level guardrails.

Note on #11: re-engagement copy exists only for when the user opens the app themselves. An unprompted "we missed you" notification would break the always-on-nudging ban.

## The do-not-build list, as copy rules

The ten rows of [science.md §do-not-build](science.md#do-not-build), translated into string-level bans (plus one addition, marked):

- Never: punitive or loss-aversion streak framing — no "streak lost", "back to zero", "don't break the chain", "protect your streak". Streaks may be shown, never guarded; gaps get the welcome-back framing of pair #4.
- Never: pet death, sickness, sadness, or any pet-welfare consequence tied to user behavior.
- Never: shame notifications, guilt-tinged prompts, or unexplained nudges; every automated prompt states its trigger and respects a frequency cap.
- Never: "scientifically optimal / proven" about any cadence — 25/5, 52/17, and 90-minute ultradian cycles included.
- Never: "dopamine detox" or "dopamine reset" language.
- Never: willpower-as-a-tank / ego-depletion framing ("you've used up your focus juice").
- Never: promises that Bloom trains multitasking or that multitasking helps focus.
- Never: autoplaying sound, or copy overselling audio; lyric-heavy audio gets an honest caveat for reading/writing tasks.
- Never: anything implying ADHD (or any condition) diagnosis or treatment. The one approved boundary sentence, allowed verbatim only in the Field Guide article tagged stage `science` (step 6.1): "Some people, including some people with ADHD, may find shorter steps and stronger external cues helpful; this app is not medical advice."
- Never *(addition beyond the table — from science.md §measurement, Lally et al. 2010)*: "21 days to build a habit" — habit copy says consistency over months (median 66 days, range 18–254).

## Micro-lexicon

**Reach for:** tiny, seed, sprout, bloom, wander, drift, park it, cozy, gentle, "want to…?", "we could…", "worth a try", "when you're ready", "welcome back", "that happened", "this one counts".

**Never ship (in user-facing strings):** fail(ure), broke(n), lazy, wasted, discipline, willpower, guilty, shame, excuses, optimal, proven, detox, "you should", "be honest", "no excuses", "we missed you"; lost / lose / "back to zero" / "break the chain" / "protect your streak" (about streaks or progress); sad / sick / hungry / disappointed / gone (about the pet).

## How to apply this page

Before a step's copy ships: run each new string through the 10-point checklist; grep the diff's user-facing strings for the never-ship list; check the feature against the feature-level guardrails; then read each string aloud in the pet's voice — if it sounds like a boss, a coach with a clipboard, or a disappointed parent, rewrite it. Placeholder strings (marked `PLACEHOLDER_COPY`) must still pass rules 2, 3, 6 and 10 — skeletons never guilt, and never make medical claims, either.
