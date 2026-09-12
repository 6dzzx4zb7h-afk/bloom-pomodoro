import Foundation
import ActivityKit
import AppIntents

/// PLAN 13.19 — the controls on the Live Activity.
///
/// These conform to `LiveActivityIntent`, so iOS performs them in the *app's*
/// process and will launch a suspended app in the background to do it. Even
/// then the WebView's JavaScript is not running, so an intent cannot call the
/// reducer. It records intent on PLAN 13.18's queue and returns; the reducer
/// replays it against the recorded instant when JS next wakes.
///
/// Nothing here decides anything. No session is opened, closed, or recorded,
/// and no elapsed time is invented — the optimistic redraw below re-uses the
/// deadline the reducer already published rather than tracking its own clock.
enum BloomTimerCommand {
    static func record(kind: String, sessionId: String, at: Date) {
        BloomCommandQueue.append(
            BloomCommand(
                id: UUID().uuidString,
                kind: kind,
                sessionId: sessionId,
                occurredAt: at.timeIntervalSince1970 * 1000
            )
        )
    }

    /// Redraw the activity immediately so the button feels instant.
    ///
    /// This is a display concession, not a second authority: it applies the
    /// same `timerEnd - pressedAt` arithmetic to the same values the reducer
    /// published, so it cannot disagree with the reducer's own answer — and the
    /// reducer's next mirror overwrites it regardless.
    static func redraw(sessionId: String, paused: Bool, at: Date) async {
        for activity in Activity<BloomFocusActivityAttributes>.activities
        where activity.attributes.sessionId == sessionId {
            let state = activity.content.state
            guard state.phase != .finished else { continue }
            let next: BloomFocusActivityAttributes.ContentState
            if paused {
                guard state.phase == .running else { continue }
                next = .init(
                    mode: state.mode,
                    phase: .paused,
                    timerStart: state.timerStart,
                    timerEnd: state.timerEnd,
                    pausedRemainingSeconds: max(
                        0,
                        Int(state.timerEnd.timeIntervalSince(at).rounded(.up))
                    )
                )
            } else {
                guard state.phase == .paused else { continue }
                let remaining = max(0, state.pausedRemainingSeconds ?? 0)
                next = .init(
                    mode: state.mode,
                    phase: .running,
                    timerStart: at,
                    timerEnd: at.addingTimeInterval(TimeInterval(remaining)),
                    pausedRemainingSeconds: nil
                )
            }
            // Move the already-enabled ordinary notification with this same
            // published clock while JavaScript is suspended. The shared
            // transport rejects stale session/deadline/paused-time snapshots.
            if paused {
                await BloomCompletionAlertTransport.shared.pause(
                    sessionId: sessionId,
                    deadlineMs: state.timerEnd.timeIntervalSince1970 * 1_000,
                    remainingSeconds: next.pausedRemainingSeconds ?? 0,
                    at: at
                )
            } else {
                await BloomCompletionAlertTransport.shared.resume(
                    sessionId: sessionId,
                    remainingSeconds: state.pausedRemainingSeconds ?? 0,
                    deadline: next.timerEnd
                )
            }
            // A resumed timer can reach zero before the WebView wakes again.
            // Keep the same deadline-based stale state as reducer snapshots,
            // so the system withdraws transport controls when time runs out.
            await activity.update(ActivityContent(
                state: next,
                staleDate: paused ? nil : next.timerEnd
            ))
        }
    }
}

/// PLAN 13.19 — the same two controls on PLAN 13.12's AlarmKit surface.
///
/// On a phone with alarms authorized this is the presentation people actually
/// see: an authorized alarm ends the generic activity and owns the countdown.
/// The controls therefore have to exist on both, or they effectively do not
/// exist at all.
///
/// These additionally pause AlarmKit's own countdown, because this surface's
/// state belongs to AlarmKit and cannot be redrawn the way the generic activity
/// can. The reducer still decides: the recorded command is what changes the
/// session when the WebView next runs.
#if canImport(AlarmKit)
import AlarmKit

@available(iOS 26.0, *)
enum BloomAlarmTransport {
    static func apply(paused: Bool) {
        guard let id = UUID(uuidString: BloomAlarm.identifier) else { return }
        if paused {
            try? AlarmManager.shared.pause(id: id)
        } else {
            try? AlarmManager.shared.resume(id: id)
        }
    }
}

@available(iOS 26.0, *)
struct BloomAlarmPauseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause Bloom timer"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Session")
    var sessionId: String

    init() {}
    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let pressedAt = Date()
        BloomTimerCommand.record(kind: "pause", sessionId: sessionId, at: pressedAt)
        BloomAlarmTransport.apply(paused: true)
        return .result()
    }
}

@available(iOS 26.0, *)
struct BloomAlarmResumeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Resume Bloom timer"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Session")
    var sessionId: String

    init() {}
    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let pressedAt = Date()
        BloomTimerCommand.record(kind: "resume", sessionId: sessionId, at: pressedAt)
        BloomAlarmTransport.apply(paused: false)
        return .result()
    }
}
#endif

struct BloomPauseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause Bloom timer"
    /// Not a Shortcuts action. This exists to serve one button on one Live
    /// Activity, and offering it as an automation would create a way to drive
    /// the timer from outside the app entirely.
    static var isDiscoverable: Bool = false

    @Parameter(title: "Session")
    var sessionId: String

    init() {}
    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let pressedAt = Date()
        BloomTimerCommand.record(kind: "pause", sessionId: sessionId, at: pressedAt)
        await BloomTimerCommand.redraw(sessionId: sessionId, paused: true, at: pressedAt)
        return .result()
    }
}

struct BloomResumeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Resume Bloom timer"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Session")
    var sessionId: String

    init() {}
    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let pressedAt = Date()
        BloomTimerCommand.record(kind: "resume", sessionId: sessionId, at: pressedAt)
        await BloomTimerCommand.redraw(sessionId: sessionId, paused: false, at: pressedAt)
        return .result()
    }
}
