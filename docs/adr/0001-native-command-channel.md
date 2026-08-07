# ADR 0001 — A timestamped command channel from system UI to the reducer

- **Status:** Accepted (August 2026)
- **Step:** PLAN 13.18
- **Supersedes / superseded by:** none

## Context

PLAN 13.19 and 13.20 need controls in system UI — a pause button on the Live Activity, a check-in
answer on the Lock Screen. Today every one of Bloom's surfaces is inside the WebView, and
`useBloom.ts`'s reducer is the single authority for the timer and the session log.

Two platform facts constrain the design:

1. A `LiveActivityIntent` performs **in the app's process**, and iOS will launch a suspended app in
   the background to run it. So a Lock Screen button can reach native Bloom code.
2. That native code cannot reach the reducer. The WebView's JavaScript is suspended along with the
   app, so there is nothing to call. By the time JS resumes, an arbitrary amount of time has passed.

The obvious implementations are both wrong for this codebase:

- **Let native own the timer while suspended.** This creates a second timer authority, which is
  precisely what PLAN 13.12 refused when it shipped its AlarmKit countdown with no pause button.
  Two authorities means two answers to "how much time is left", and the session log stops being
  trustworthy.
- **Wake the WebView to handle the press.** There is no supported way to do this. Background
  execution on iOS is a ~30-second completion window, `BGTaskScheduler` at a system-chosen time, or
  a background mode Bloom is forbidden (by PLAN 13.11/13.12) and Apple is likely to reject.

## Decision

Native code **records intent**; the reducer **decides what it means**.

An intent appends `{ id, kind, sessionId, occurredAt }` to a durable queue and returns immediately.
The web layer drains that queue on boot, on `visibilitychange`, and on app resume, and the reducer
replays each command **against the wall clock the command carries**, not the clock at the moment it
was read.

This works because Bloom's timer is already wall-clock based rather than tick-counted: a run stores
an `endsAt` epoch timestamp and derives `remaining`. A pause recorded at `T` therefore reconstructs
exactly as `remaining = endsAt − T`, and a resume at `T` as `endsAt = T + remaining × 1000`,
however much later the WebView actually wakes. **Replay is lossless, not approximate** — which is
the whole reason this design can add an inbound path without adding a second authority.

Supporting rules:

- **Idempotent by `id`.** A command may be delivered more than once (delivery and acknowledgement
  are separate calls, deliberately); applying it twice is a no-op.
- **At-least-once, never at-most-once.** `drain()` does not remove; the web layer acknowledges after
  applying. A crash between the two re-delivers rather than loses.
- **Dropped on `sessionId` mismatch.** A command for a session that no longer exists is discarded,
  so a queue surviving a force-quit can never revive a session the boot sweep already closed as
  `interrupted`.
- **Bounded.** The queue holds at most 32 commands. Every command is a physical tap that itself
  wakes the app to drain, so reaching the cap means something is already wrong; the cap exists so a
  pathological state cannot grow without limit.
- **Never a writer of record.** No command path writes or upgrades a `SessionRecord`. Commands
  express intent; the ordinary reducer transitions do the rest.

### Storage: app container, not an App Group

The queue lives in `UserDefaults.standard` in the app's own container. Because `LiveActivityIntent`
performs in the app's process, the intent can write there directly, and Bloom needs no App Group
entitlement and no provisioning change.

An App Group becomes necessary the moment the **widget extension's own process** needs to read or
write this queue — for example if a future step renders widget content from Bloom state rather than
from `ActivityAttributes`. That is a deliberate future trigger, recorded here so the next person
knows why the simpler thing was chosen and exactly when it stops being sufficient.

## Consequences

**Good.** One timer authority survives. The reducer's existing transitions handle system-UI input
with no parallel logic. No entitlement, no provisioning churn, no background mode, no server — the
local-first constraint is untouched. The queue is transport, not user data, so no `SCHEMA_VERSION`
bump and nothing new to export, migrate, or delete.

**Costs.** A control's effect on Bloom's own state is not immediate: it lands when the WebView next
runs. 13.19 covers this by rendering the Live Activity optimistically so the button still feels
instant, with the reducer's next mirror as the correction. That optimistic render is a display
concession, and it is allowed exactly because it computes nothing — it never derives remaining time
of its own.

**Risk accepted.** A command applied late is applied with its original timestamp, so a user who
pauses and immediately force-quits gets the correct paused time on next launch, but the session is
briefly "running" in stored terms until then. The boot sweep's `interrupted` handling already
covers the case where it never resumes.
