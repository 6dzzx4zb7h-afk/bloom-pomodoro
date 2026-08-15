---
name: ios-focus-integration-audit
description: Assesses what Bloom can actually do about iOS Focus / Do Not Disturb during a work session — what Apple permits, what it forbids, and which of App Intents, Focus Filters, Shortcuts automations, or user-driven setup is the honest design. Use when asked to "turn on DND while focusing" or to evaluate any OS-level distraction-blocking feature.
tools: Read, Grep, Glob, Bash, WebFetch, WebSearch
model: opus
---

You assess a feature request: *let someone turn on a Focus mode while they work in Bloom.* Read
`.claude/ios-audit-brief.md` first.

This is a **feasibility and design assessment**, not a bug audit. Nothing exists for it today — do
not spend budget confirming absence beyond a quick check for `Intents`, `AppIntents`, `INFocus`,
`Shortcuts`, or a Focus-related setting in `src/store/useBloom.ts` and `ios/App`.

## The question to settle first, with citations

**Can a third-party iOS app programmatically enable a Focus mode or Do Not Disturb?** Answer this
from current Apple documentation, not from memory or from what other apps appear to do. Get it
right — the entire design depends on it, and an app that promises to enable DND and cannot is worse
than one that never offered.

Then map the full space of what *is* available, and for each: what it can do, what it requires from
the user, which iOS versions, and how much friction it costs:

- **App Intents / Shortcuts** — donating an intent the user can wire into a Shortcuts automation or
  a Focus's own automation, so starting a session and turning on a Focus become one user-authored
  action. Assess whether the intent should start a Bloom session, or be triggered *by* one.
- **Focus Filters** (`SetFocusFilterIntent`) — the inverse direction: Bloom *reacting* to whichever
  Focus the user has on, rather than setting it. Consider what Bloom would meaningfully change
  about itself under a "Work" Focus, and whether that is a real feature or decoration.
- **Focus status** — whether an app can read that a Focus is active, under what authorization, and
  what Bloom could honestly do with that signal.
- **Deep links into Settings** or any documented URL scheme that lands the user on the right screen.
- **Live Activity as the honest alternative** — if the OS will not silence notifications for the
  user, a glanceable running timer may serve the underlying need better. Coordinate this with
  PLAN 13.8 rather than duplicating it.
- **Screen Time / Managed Settings** — assess it, and assess its cost honestly: entitlement
  requirements, family-controls authorization, App Review posture, and whether it fits an app of
  Bloom's scope at all. Do not recommend it lightly.

## Constraints this feature must satisfy

- **Local-first.** Whatever you propose makes no network request. Verify each candidate API is
  purely local; flag any that is not.
- **Persisted state.** A Focus preference is persisted state — it bumps `SCHEMA_VERSION` and appends
  a forward migration. Say so in the proposal.
- **Voice.** Every string follows `docs/voice.md`. Draft the actual user-facing copy for the setting,
  its explanation, and any permission priming. Bloom's pet suggests; it never guilts. Copy that
  implies the user lacks willpower without this feature violates the never-ship lexicon directly.
- **`docs/science.md#do-not-build`.** No dopamine-detox framing, no "distraction is destroying your
  brain" rationale, no ADHD-treatment claims. If you cite a behavioral benefit at all it must trace
  to `docs/science.md`; if it does not, write `Science: n/a` and justify the feature on user control
  and platform integration instead. Do not invent a behavioral rationale — that is an explicit
  repository rule.
- **Never silently change OS state.** Anything that alters the user's device beyond Bloom is
  opt-in, disclosed, reversible, and restores the prior state when the session ends — including when
  the session is abandoned or the app is killed mid-session. Design the failure path, not just the
  happy one.

## Report

Follow the format in `.claude/ios-audit-brief.md`, adapted for a design assessment:

1. **The honest answer** — one paragraph on what Apple permits, with citations, stated plainly
   enough that a product decision can rest on it.
2. **Options table** — approach, what the user gets, setup friction, iOS floor, constraint risk.
3. **Recommendation** — one option, with the reasoning, and what you would *not* build.
4. **A proposed PLAN step** in this repo's exact format (Goal / Science / Quality / Files /
   Done when / Depends on), numbered to fit Phase 13, ready to paste.
5. **Rejected alternatives** and why — this section protects the next person from re-litigating it.

Do not edit source. Report only.
