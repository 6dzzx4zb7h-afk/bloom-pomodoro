import ActivityKit
import AppIntents
import Foundation
import UserNotifications

/// A bounded, privacy-minimal handoff from a Live Activity intent to Bloom's
/// reducer. LiveActivityIntent runs in the app process, so standard defaults
/// are the app container even though this source is also compiled by the
/// widget extension so SwiftUI can archive its buttons.
@available(iOS 17.0, *)
struct BloomLiveActivityCommand: Codable, Hashable {
    enum Action: String, Codable {
        case pause
        case resume
    }

    let id: String
    let sessionId: String
    let action: Action
    let atMs: Double
    let remainingSeconds: Int
}

@available(iOS 17.0, *)
actor BloomLiveActivityCommandStore {
    static let shared = BloomLiveActivityCommandStore()

    private let defaults = UserDefaults.standard
    private let key = "dev.bloom.pomodoro.live-activity.pending-commands"
    private let cap = 32

    func enqueue(
        sessionId: String,
        action: BloomLiveActivityCommand.Action,
        at: Date,
        remainingSeconds: Int
    ) {
        var commands = pending()
        commands.append(BloomLiveActivityCommand(
            id: UUID().uuidString.lowercased(),
            sessionId: sessionId,
            action: action,
            atMs: at.timeIntervalSince1970 * 1_000,
            remainingSeconds: remainingSeconds
        ))
        save(Array(commands.suffix(cap)))
    }

    func pending() -> [BloomLiveActivityCommand] {
        guard
            let data = defaults.data(forKey: key),
            let decoded = try? JSONDecoder().decode([BloomLiveActivityCommand].self, from: data)
        else {
            return []
        }
        return Array(decoded.suffix(cap))
    }

    func acknowledge(ids: Set<String>) {
        guard !ids.isEmpty else { return }
        save(pending().filter { !ids.contains($0.id) })
    }

    private func save(_ commands: [BloomLiveActivityCommand]) {
        if commands.isEmpty {
            defaults.removeObject(forKey: key)
            return
        }
        guard let data = try? JSONEncoder().encode(commands) else { return }
        defaults.set(data, forKey: key)
    }
}

@available(iOS 17.0, *)
private actor BloomLiveActivityIntentCoordinator {
    static let shared = BloomLiveActivityIntentCoordinator()

    func perform(sessionId: String, action: BloomLiveActivityCommand.Action) async {
        guard let activity = Activity<BloomFocusActivityAttributes>.activities.first(where: {
            $0.attributes.sessionId == sessionId
        }) else {
            return
        }

        let now = Date()
        let current = activity.content.state
        switch action {
        case .pause:
            guard current.phase == .running, current.timerEnd > now else { return }
            let remaining = max(1, Int(ceil(current.timerEnd.timeIntervalSince(now))))
            await BloomLiveActivityCommandStore.shared.enqueue(
                sessionId: sessionId,
                action: .pause,
                at: now,
                remainingSeconds: remaining
            )
            let paused = BloomFocusActivityAttributes.ContentState(
                mode: current.mode,
                phase: .paused,
                timerStart: current.timerStart,
                timerEnd: current.timerEnd,
                pausedRemainingSeconds: remaining,
                completionAlertsEnabled: current.completionAlertsEnabled
            )
            await activity.update(ActivityContent(state: paused, staleDate: nil))
            cancelCompletionAlert()

        case .resume:
            let remaining = current.pausedRemainingSeconds ?? 0
            guard current.phase == .paused, remaining > 0 else { return }
            let deadline = now.addingTimeInterval(TimeInterval(remaining))
            await BloomLiveActivityCommandStore.shared.enqueue(
                sessionId: sessionId,
                action: .resume,
                at: now,
                remainingSeconds: remaining
            )
            let running = BloomFocusActivityAttributes.ContentState(
                mode: current.mode,
                phase: .running,
                timerStart: now,
                timerEnd: deadline,
                pausedRemainingSeconds: nil,
                completionAlertsEnabled: current.completionAlertsEnabled
            )
            await activity.update(ActivityContent(state: running, staleDate: deadline))
            if current.completionAlertsEnabled == true {
                await scheduleCompletionAlert(mode: current.mode, deadline: deadline)
            } else {
                cancelCompletionAlert()
            }
        }
    }

    private func cancelCompletionAlert() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(
            withIdentifiers: ["dev.bloom.pomodoro.timer-complete"]
        )
        center.removeDeliveredNotifications(
            withIdentifiers: ["dev.bloom.pomodoro.timer-complete"]
        )
    }

    private func scheduleCompletionAlert(mode: String, deadline: Date) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            break
        case .notDetermined, .denied:
            cancelCompletionAlert()
            return
        @unknown default:
            cancelCompletionAlert()
            return
        }

        let delay = deadline.timeIntervalSinceNow
        guard delay > 0 else {
            cancelCompletionAlert()
            return
        }

        let content = UNMutableNotificationContent()
        if mode == "tiny" {
            content.title = "Tiny timer finished"
        } else {
            content.title = "Focus timer finished"
        }
        content.body = "Bloom is ready when you are."
        content.sound = UNNotificationSound(
            named: UNNotificationSoundName(rawValue: "BloomCompletion.wav")
        )
        content.threadIdentifier = "bloom-timer"
        content.userInfo = ["deadlineMs": deadline.timeIntervalSince1970 * 1_000]
        content.interruptionLevel = .active

        let request = UNNotificationRequest(
            identifier: "dev.bloom.pomodoro.timer-complete",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: max(1, delay),
                repeats: false
            )
        )
        cancelCompletionAlert()
        try? await center.add(request)
    }
}

@available(iOS 17.0, *)
struct BloomPauseLiveActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause Bloom timer"
    static var description = IntentDescription("Pauses the current Bloom focus timer.")
    static var isDiscoverable: Bool = false

    @Parameter(title: "Session") var sessionId: String

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    init() {}

    func perform() async throws -> some IntentResult {
        await BloomLiveActivityIntentCoordinator.shared.perform(
            sessionId: sessionId,
            action: .pause
        )
        return .result()
    }
}

@available(iOS 17.0, *)
struct BloomResumeLiveActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Continue Bloom timer"
    static var description = IntentDescription("Continues the paused Bloom focus timer.")
    static var isDiscoverable: Bool = false

    @Parameter(title: "Session") var sessionId: String

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    init() {}

    func perform() async throws -> some IntentResult {
        await BloomLiveActivityIntentCoordinator.shared.perform(
            sessionId: sessionId,
            action: .resume
        )
        return .result()
    }
}
