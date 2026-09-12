import Foundation
import UserNotifications

enum BloomCompletionAlert {
    static let requestIdentifier = "dev.bloom.pomodoro.timer-complete"
    static let soundName = "BloomCompletion.wav"
    static let deliveryState = BloomCompletionAlertDeliveryState()
}

/// Process-local delivery handshake between AppDelegate and the Capacitor
/// plugin. A terminated process never reaches React completion (the boot sweep
/// records interruption), so persistence here would create a second timer
/// authority rather than improving delivery.
final class BloomCompletionAlertDeliveryState {
    private struct Record {
        let deadlineMs: Double
        var systemOwned: Bool
        var foregroundSuppressed: Bool
    }

    private let lock = NSLock()
    private var record: Record?
    private var applicationIsActive = false

    var appIsActive: Bool {
        lock.lock()
        defer { lock.unlock() }
        return applicationIsActive
    }

    func noteAppBecameActive() {
        lock.lock()
        applicationIsActive = true
        lock.unlock()
    }

    func replace(deadlineMs: Double, appIsActive: Bool) {
        lock.lock()
        record = Record(
            deadlineMs: deadlineMs,
            systemOwned: !appIsActive,
            foregroundSuppressed: false
        )
        lock.unlock()
    }

    func clear(deadlineMs: Double) {
        lock.lock()
        if matches(record, deadlineMs: deadlineMs) {
            record = nil
        }
        lock.unlock()
    }

    func noteAppBecameNonActive(atMs: Double) {
        lock.lock()
        applicationIsActive = false
        if var current = record, atMs <= current.deadlineMs + 1_000 {
            current.systemOwned = true
            record = current
        }
        lock.unlock()
    }

    func notePresentation(deadlineMs: Double, foregroundSuppressed: Bool) {
        lock.lock()
        var current = matches(record, deadlineMs: deadlineMs)
            ? record!
            : Record(deadlineMs: deadlineMs, systemOwned: false, foregroundSuppressed: false)
        if foregroundSuppressed {
            current.foregroundSuppressed = true
        } else {
            current.systemOwned = true
        }
        record = current
        lock.unlock()
    }

    func noteResponse(deadlineMs: Double) {
        lock.lock()
        var current = matches(record, deadlineMs: deadlineMs)
            ? record!
            : Record(deadlineMs: deadlineMs, systemOwned: true, foregroundSuppressed: false)
        current.systemOwned = true
        record = current
        lock.unlock()
    }

    /// A due request must remain system-owned while Bloom is not active. This
    /// closes the short window where WKWebView can tick in the background and
    /// otherwise cancel the only audible cue before iOS presents it.
    func shouldRemovePendingForCancellation(nowMs: Double, appIsActive: Bool) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if var current = record,
           current.deadlineMs <= nowMs + 1_000,
           !appIsActive {
            current.systemOwned = true
            record = current
            return false
        }
        record = nil
        return true
    }

    func consume(deadlineMs: Double) -> String {
        lock.lock()
        defer { lock.unlock() }
        guard let current = record, matches(current, deadlineMs: deadlineMs) else {
            return "none"
        }
        record = nil
        if current.foregroundSuppressed {
            return "foreground-suppressed"
        }
        if current.systemOwned {
            return "background-system"
        }
        return "none"
    }

    private func matches(_ value: Record?, deadlineMs: Double) -> Bool {
        guard let value else { return false }
        return abs(value.deadlineMs - deadlineMs) < 1
    }
}

struct BloomCompletionResumeNotice {
    let sessionId: String
    let title: String
    let body: String
    let remainingSeconds: Int
}

struct BloomCompletionAlertMutation {
    var scheduled = false
    var reason: String? = nil
}

/// The system boundary is injectable so cancellation, permission changes and
/// an add still in flight can be exercised without producing real alerts.
protocol BloomCompletionAlertCenter: Sendable {
    func canSchedule() async -> Bool
    func add(_ request: UNNotificationRequest) async throws
    func removePending() async
    func removeDelivered() async
}

private struct BloomSystemCompletionAlertCenter: BloomCompletionAlertCenter {
    func canSchedule() async -> Bool {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional || status == .ephemeral
    }

    func add(_ request: UNNotificationRequest) async throws {
        try await UNUserNotificationCenter.current().add(request)
    }

    func removePending() async {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [BloomCompletionAlert.requestIdentifier]
        )
    }

    func removeDelivered() async {
        UNUserNotificationCenter.current().removeDeliveredNotifications(
            withIdentifiers: [BloomCompletionAlert.requestIdentifier]
        )
    }
}

/// One notification template accompanies the reducer's current work session.
/// It is transport, like BloomCommandQueue: no task data, session records or
/// independent clock. UserDefaults lives in the backup-excluded app Library.
/// A native Pause retains the exact content; Resume only moves its trigger to
/// the deadline computed from the already-published Activity state.
actor BloomCompletionAlertTransport {
    static let shared = BloomCompletionAlertTransport(center: BloomSystemCompletionAlertCenter())
    private static let storageKey = "dev.bloom.pomodoro.completion-alert.transport"

    private struct Record: Codable {
        let sessionId: String
        let content: Data
        let deadlineMs: Double?
        let remainingSeconds: Int?
    }

    private let center: any BloomCompletionAlertCenter
    private let defaults: UserDefaults
    private let now: @Sendable () -> Date
    private var tail: Task<Void, Never>?
    private var latestTicket: UUID?

    init(
        center: any BloomCompletionAlertCenter,
        defaults: UserDefaults = .standard,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.center = center
        self.defaults = defaults
        self.now = now
    }

    // Actor isolation alone does not serialize operations across `await add`.
    // This queue also orders app cancellation against a background AppIntent.
    private func serialized(
        _ operation: @escaping () async -> BloomCompletionAlertMutation
    ) async -> BloomCompletionAlertMutation {
        let previous = tail
        let ticket = UUID()
        latestTicket = ticket
        let task = Task {
            await previous?.value
            return await operation()
        }
        tail = Task { _ = await task.value }
        let result = await task.value
        if latestTicket == ticket { tail = nil }
        return result
    }

    func schedule(
        sessionId: String?, deadlineMs: Double, title: String, body: String, appIsActive: Bool
    ) async -> BloomCompletionAlertMutation {
        await serialized {
            await self.scheduleNow(
                sessionId: sessionId, deadlineMs: deadlineMs,
                content: Self.content(title: title, body: body), appIsActive: appIsActive
            )
        }
    }

    func cancel(
        resumeNotice: BloomCompletionResumeNotice?, appIsActive: Bool
    ) async -> BloomCompletionAlertMutation {
        await serialized {
            await self.cancelNow(resumeNotice: resumeNotice, appIsActive: appIsActive)
        }
    }

    func pause(sessionId: String, deadlineMs: Double, remainingSeconds: Int, at: Date) async {
        _ = await serialized {
            guard let record = self.read(), record.sessionId == sessionId,
                  let tracked = record.deadlineMs, abs(tracked - deadlineMs) < 1,
                  deadlineMs > at.timeIntervalSince1970 * 1_000,
                  remainingSeconds > 0 else { return .init(reason: "stale") }
            await self.center.removePending()
            BloomCompletionAlert.deliveryState.clear(deadlineMs: deadlineMs)
            self.write(Record(sessionId: sessionId, content: record.content,
                              deadlineMs: nil, remainingSeconds: remainingSeconds))
            return .init()
        }
    }

    func resume(sessionId: String, remainingSeconds: Int, deadline: Date) async {
        _ = await serialized {
            guard let record = self.read(), record.sessionId == sessionId,
                  record.deadlineMs == nil, record.remainingSeconds == remainingSeconds,
                  remainingSeconds > 0,
                  let content = try? NSKeyedUnarchiver.unarchivedObject(
                    ofClass: UNNotificationContent.self, from: record.content
                  ) else { return .init(reason: "stale") }
            return await self.scheduleNow(
                sessionId: sessionId, deadlineMs: deadline.timeIntervalSince1970 * 1_000,
                content: content, appIsActive: BloomCompletionAlert.deliveryState.appIsActive
            )
        }
    }

    private func cancelNow(
        resumeNotice: BloomCompletionResumeNotice?, appIsActive: Bool
    ) async -> BloomCompletionAlertMutation {
        let previous = read()
        if let notice = resumeNotice {
            // The reducer can pause before a generic notice ever existed (for
            // example when handing a paused AlarmKit timer to ActivityKit).
            let content = previous?.sessionId == notice.sessionId
                ? previous?.content
                : try? NSKeyedArchiver.archivedData(
                    withRootObject: Self.content(title: notice.title, body: notice.body),
                    requiringSecureCoding: true
                )
            await center.removePending()
            if let deadline = previous?.deadlineMs {
                BloomCompletionAlert.deliveryState.clear(deadlineMs: deadline)
            }
            write(content.map { Record(sessionId: notice.sessionId, content: $0,
                                       deadlineMs: nil, remainingSeconds: notice.remainingSeconds) })
        } else {
            // Sound off, reset, mode departure, completion and data clear must
            // revoke the ability of an old Activity to restore this cue.
            write(nil)
            if BloomCompletionAlert.deliveryState.shouldRemovePendingForCancellation(
                nowMs: now().timeIntervalSince1970 * 1_000, appIsActive: appIsActive
            ) {
                await center.removePending()
            }
        }
        return .init()
    }

    private func scheduleNow(
        sessionId: String?, deadlineMs: Double, content: UNNotificationContent, appIsActive: Bool
    ) async -> BloomCompletionAlertMutation {
        let previous = read()
        write(nil)
        guard await center.canSchedule() else {
            await center.removePending()
            if let deadline = previous?.deadlineMs { BloomCompletionAlert.deliveryState.clear(deadlineMs: deadline) }
            return .init(reason: "permission")
        }
        let delay = deadlineMs / 1_000 - now().timeIntervalSince1970
        guard delay > 0 else {
            await center.removePending()
            if let deadline = previous?.deadlineMs { BloomCompletionAlert.deliveryState.clear(deadlineMs: deadline) }
            return .init(reason: "past")
        }
        guard let updated = content.mutableCopy() as? UNMutableNotificationContent else {
            return .init(reason: "content")
        }
        updated.userInfo["deadlineMs"] = deadlineMs
        if let sessionId { updated.userInfo["sessionId"] = sessionId }
        else { updated.userInfo.removeValue(forKey: "sessionId") }
        let request = UNNotificationRequest(
            identifier: BloomCompletionAlert.requestIdentifier, content: updated,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)
        )
        await center.removePending()
        await center.removeDelivered()
        BloomCompletionAlert.deliveryState.replace(deadlineMs: deadlineMs, appIsActive: appIsActive)
        do {
            try await center.add(request)
            if let sessionId {
                let data = try NSKeyedArchiver.archivedData(withRootObject: updated, requiringSecureCoding: true)
                write(Record(sessionId: sessionId, content: data, deadlineMs: deadlineMs, remainingSeconds: nil))
            }
            return .init(scheduled: true)
        } catch {
            BloomCompletionAlert.deliveryState.clear(deadlineMs: deadlineMs)
            await center.removePending()
            return .init(reason: "schedule-failed")
        }
    }

    private static func content(title: String, body: String) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = String(title.prefix(80))
        content.body = String(body.prefix(180))
        content.sound = UNNotificationSound(named: .init(rawValue: BloomCompletionAlert.soundName))
        content.threadIdentifier = "bloom-timer"
        content.interruptionLevel = .active
        return content
    }

    private func read() -> Record? {
        guard let data = defaults.data(forKey: Self.storageKey) else { return nil }
        return try? JSONDecoder().decode(Record.self, from: data)
    }

    private func write(_ record: Record?) {
        if let record, let data = try? JSONEncoder().encode(record) {
            defaults.set(data, forKey: Self.storageKey)
        } else {
            defaults.removeObject(forKey: Self.storageKey)
        }
    }
}
