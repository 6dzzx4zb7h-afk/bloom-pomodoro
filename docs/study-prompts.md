# Bloom’s study prompts

Saved answers stay on this device; some preparation drafts, noted below, are temporary.
The prompts use timer records, entered targets,
and optional companion answers; the app cannot observe whether you were actually studying.
Companion, Planner, Foundations, and goal credit are off by default. Recovery and session
summaries can still appear with Companion off.

## Before studying

**“What will you work on?”** is the optional session target, shown by default
before a fresh Focus, Tiny, or Flow session. Write a small piece of work, such as “answer
5 questions,” or leave it blank and start. Starting saves it with that session;
an unstarted draft is not saved. **Session intention** in Settings shows or hides this field
independently of Companion mode.

**“Plan for distractions”** directly opens an optional if–then planner
before a fresh Focus session. For example: “If I check my phone, then I return to this
paragraph.” Select an existing plan, or enter a cue and action and choose **save & use**.
The plan is saved locally, and starting links it to the session and remembers its task
association. Closing the planner leaves the timer ready; clearing a selection skips that
plan without deleting it. This is a written intention, not an automatic reminder or action.

**“Want to try a tiny reset?”** is a one-time invitation before an idle Focus session.
**Try it next time** enables the ritual; **maybe later** leaves it off. The invitation is
marked seen when offered and does not repeatedly return. The ritual can also be enabled
or disabled in Settings.

**“A tiny reset”** appears when starting a fresh work session with the ritual enabled;
it is off by default. The initial items are phone away, task named, first action named,
and distracting tabs closed. Check them as you do them: the final check starts the timer
immediately. **Skip & start** also starts immediately. The enabled choice and edited item
labels are saved; the checkmarks reset for each session.

**The WOOP reset** appears before fresh Focus only after three consecutive sessions were
explicitly ended early. A completed or interrupted session breaks that run. Bloom asks
for a Wish, Outcome, Obstacle, then an if–then Plan. The first three answers are temporary
reflection; the final plan uses the saved planner above. **Opening move ready** closes
the exercise; starting remains a separate action. Every step can be skipped. An offer
starts a seven-day cooldown, and another early ending must occur before it can return.

Sources: [Focus preparation](../src/screens/FocusScreen.tsx),
[IfThenPlanner](../src/components/IfThenPlanner.tsx), [RitualCard](../src/components/RitualCard.tsx),
[WoopCard](../src/components/WoopCard.tsx), [offer rules](../src/insights/triggers.ts).

## During studying

**“Still with me?” / “Still on [your target]?”** runs only with Companion enabled,
Quiet mode off, and a standard Focus countdown running. The default interval is ten
minutes; Settings offers 3, 5, 10, 15, 20, or 30. Tiny and Flow have no scheduled check-ins.
**Yes, focused** saves that answer; **I drifted** records one drift and opens optional
follow-up questions. **Not now** dismisses the question and skips the next scheduled
check-in. Pausing, ending, or leaving while a check-in is unanswered also withdraws it
and skips the next cycle. Questions do not pile up while away.

**“What pulled you away?”** classifies that already-recorded drift: rabbit hole,
interruption, checking urge, mind wandering, or restlessness. **Skip** leaves it
unclassified. **“Since when, roughly?”** then offers just now, about five or ten minutes,
a custom estimate, or skip. Estimates cannot reach before the session or the latest
focused answer. This is self-report, not attention detection. The following tip can
be closed or lead into the optional breath and next-step exercise described below.
The study timer continues during these questions and exercises.

**“Tiny breath or shoulder roll?”** is the separate pre-slump option, off by default.
It needs Companion on, Quiet mode off, and at least five past Focus sessions
with linked drifts. Bloom uses the median first-drift time and may offer a cue up to two
minutes beforehand. It appears at most once per session and twice per study day, disappears
after 12 seconds, and can be dismissed with **all good** or suppressed with **quiet for
today**. Daily limits and suppression survive reopening. It does not start a break.

**“Park it”** is a button you choose when a Focus, Tiny, or Flow session is open, including
while paused. It saves a thought of up to five words rather than making a task immediately.
The thought returns at a pause or break. **Did it** and **let it go** both remove it;
**make a task** creates a task; **not now** keeps it saved for a later pause. A drift tip
can also offer the same parking action.

**The timer-alert explanation** may appear on iOS after starting or resuming a countdown
with sound enabled when notification permission has not been granted. The timer starts
immediately. **Allow notifications** asks iOS for permission; **not now** closes the
explanation. This invitation is limited to once per app load, so declining may cause it
to return after reopening. Permission itself is managed by the operating system.

With Companion off, no periodic attention questions or pre-slump cues appear. With Quiet
mode on, tab/app returns are recorded silently after the selected away threshold. When
questions are enabled, the return question waits at least 45 seconds, even if the saved
threshold is 15 or 30 seconds. Settings explains both timings.

Sources: [Companion defaults](../src/store/companion.ts),
[live scheduling and answers](../src/store/useCompanion.ts),
[CompanionPrompt](../src/components/CompanionPrompt.tsx),
[pre-slump rules](../src/insights/triggers.ts), [ParkingLot](../src/components/ParkingLot.tsx),
[alert permission](../src/store/useBloom.ts), [Settings](../src/components/SettingsSheet.tsx).

## Returning to a session

**“Your last session was interrupted”** appears when reopening Bloom turns an unfinished
Focus or Tiny countdown into an interrupted record. It restores any saved target, parked
thought, and next step. The next-step field is optional: an example is “open page 4 and read
the first paragraph.” **Resume from here** reopens the same session with its remaining time;
**not now** keeps its interrupted record and permanently dismisses that reminder. Either
choice saves the edited next step. Flow uses separate restoration behavior.
The reminder is hidden while newer work is open, and cannot replace a newer session.
New interruptions preserve the countdown's displayed seconds through reload and resume;
expired timers do not offer a new one-second session.

**“Return to your session”** is different: with Companion and tab detection on, non-quiet
mode asks what happened after at least 45 seconds away from a running Focus or Tiny timer.
A longer selected away threshold takes precedence. **I kept working** counts the time away;
**I drifted** puts that time back on the countdown, logs a drift, and offers optional follow-up
questions; **pause it back** restores the countdown to when you left and pauses it. The timing
choice must be answered and survives reopening. Writing a next step is optional.

Sources: [ResumeCue](../src/components/ResumeCue.tsx), [session restoration](../src/store/sessions.ts),
[return tracking](../src/store/useCompanion.ts), [timer actions](../src/store/useBloom.ts).

## After a session

**“Tiny start complete — keep going for 10 more minutes?”** follows the first 2- or
5-minute Tiny session. That first session is already saved. **Yes, 10 more** starts a
new ten-minute session with the same written target; **done for now** leaves the completed Tiny
session saved and returns to an idle Focus timer. The continuation does not repeatedly
offer another ten minutes or force a break.

**The session debrief** appears after completing or ending a session early. It shows planned
and recorded time, logged drifts, and a short observation. “No drifts logged” means none were
recorded; it does not certify uninterrupted attention. If the session had a target, **done /
partly / not yet** saves your assessment of that target without changing timer credit.
**Repair record**, when offered, opens the existing correction editor.

**Goal credit** appears only when the session belongs to an unfinished goal and the goal-credit
setting is **Ask**. Choose how many of the goal’s units you completed, then **credit** them or
select **not this time**. The initial number comes from the goal’s daily pace, so edit it to
match the actual work. Credit is limited to the amount remaining. **Off** adds no goal credit;
**Auto** adds one unit on completion. The session debrief labels dismissal of pending credit
as **close without goal credit**.
That choice now saves the decline so the same question does not reopen on the next visit.

**“One slow breath”** is an optional restart after ending a session early or classifying a
drift. It runs a 10-second visual breath, then asks for a next step. **Next step now** skips
the wait; **skip** leaves the exercise. Following an early ending, **tiny-start this step**
starts a two-minute Tiny session. During a drift, the timer keeps running throughout;
**save step & close** records your next step and closes the guidance.

Sources: [DebriefCard](../src/components/DebriefCard.tsx),
[goal credit](../src/components/DebriefGoalCredit.tsx), [KindRestart](../src/components/KindRestart.tsx),
[session actions](../src/screens/FocusScreen.tsx).

## Reviews and planning reminders

**Weekly review** summarizes the last seven study days: what seemed to help starts and
recovery, plus an experiment to try. Meaningful pattern analysis requires five eligible
sessions. It can be opened manually from Settings at any time. Automatic presentation waits
for those five sessions and is limited to once per Monday-based study week with no running
timer or unfinished work session. **Try 25/5**, for example, saves 25 minutes of Focus
and five minutes of short break. **Back to…** restores a previous pair. **OK** closes the
review without applying a suggested duration. These observations describe recorded patterns,
not proof that a particular technique caused improvement.

**Field Guide suggestions** link to short articles bundled with Bloom. They may appear in a
debrief, weekly review, or break after a classified drift or several sessions ending early.
Opening one changes no timer or goal. Suggestions are limited to three moments per week;
an article recently read or suggested has a 30-day cooldown. Reading and presentation
markers are saved to keep these recommendations infrequent.

**“Yesterday’s plan”** appears on Goals with Planner enabled when yesterday has an unfinished
goal plan, at most once per study day. **Carry to today** adds the remaining amount to today’s
plan. **Spread it** opens an editable planning draft; confirm that draft to save the new plan.
**Let it rest** adds no work to today and preserves yesterday’s plan and recorded progress.

Sources: [WeeklyReview](../src/components/WeeklyReview.tsx), [weekly analysis](../src/insights/weekly.ts),
[Field Guide rules](../src/insights/surfacing.ts), [rollover choices](../src/screens/GoalsScreen.tsx).
