// Executable iOS Simulator tests for the real notification transport. Compile
// this file with Shared/BloomCompletionAlertTransport.swift; no alerts are sent.
import Foundation
import UserNotifications

private enum TestFailure: Error { case assertion(String), scheduling }

private func check(_ condition: Bool, _ message: String) throws {
    if !condition { throw TestFailure.assertion(message) }
}

private actor TestCenter: BloomCompletionAlertCenter {
    var allowed = true
    var rejectAdd = false
    var suspendAdd = false
    var pending: UNNotificationRequest?
    var additions = 0
    var blocked: CheckedContinuation<Void, Never>?

    func canSchedule() async -> Bool { allowed }
    func add(_ request: UNNotificationRequest) async throws {
        if suspendAdd {
            suspendAdd = false
            await withCheckedContinuation { blocked = $0 }
        }
        if rejectAdd { throw TestFailure.scheduling }
        additions += 1
        pending = request
    }
    func removePending() async { pending = nil }
    func removeDelivered() async {}
    func setAllowed(_ value: Bool) { allowed = value }
    func setRejectAdd() { rejectAdd = true }
    func blockNextAdd() { suspendAdd = true }
    func releaseAdd() { blocked?.resume(); blocked = nil }
    func isBlocked() -> Bool { blocked != nil }
}

@main
private struct BloomCompletionTransportTests {
    static func main() async throws {
        let domain = "dev.bloom.transport-tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: domain)!
        defer { defaults.removePersistentDomain(forName: domain) }
        let center = TestCenter()
        let instant = Date(timeIntervalSince1970: 1_800_000_000)
        let deadlineMs = instant.addingTimeInterval(60).timeIntervalSince1970 * 1_000
        let transport = BloomCompletionAlertTransport(center: center, defaults: defaults, now: { instant })

        let initial = await transport.schedule(sessionId: "focus-1", deadlineMs: deadlineMs,
            title: "Focus timer finished", body: "Bloom is ready when you are.", appIsActive: true)
        try check(initial.scheduled, "initial request scheduled")
        let original = await center.pending!
        try check(original.identifier == BloomCompletionAlert.requestIdentifier, "one stable notice identity")
        await transport.pause(sessionId: "another-session", deadlineMs: deadlineMs, remainingSeconds: 42, at: instant)
        try check(await center.pending != nil, "stale session cannot cancel")
        await transport.pause(sessionId: "focus-1", deadlineMs: deadlineMs - 1_000, remainingSeconds: 42, at: instant)
        try check(await center.pending != nil, "stale pre-extension deadline cannot cancel")

        await transport.pause(sessionId: "focus-1", deadlineMs: deadlineMs, remainingSeconds: 42,
            at: instant.addingTimeInterval(18))
        try check(await center.pending == nil, "pause cancels original deadline")

        // A new coordinator reads the archived template, exercising the actual
        // durable encode/unarchive path used after a suspended-process wake.
        let restored = BloomCompletionAlertTransport(center: center, defaults: defaults, now: { instant })
        await restored.resume(sessionId: "another-session", remainingSeconds: 42, deadline: instant.addingTimeInterval(42))
        await restored.resume(sessionId: "focus-1", remainingSeconds: 41, deadline: instant.addingTimeInterval(41))
        try check(await center.pending == nil, "stale resume/session cannot restore cue")
        let resumedDeadline = instant.addingTimeInterval(42)
        await restored.resume(sessionId: "focus-1", remainingSeconds: 42, deadline: resumedDeadline)
        let resumed = await center.pending
        try check(resumed != nil, "resume restores archived request")
        try check(resumed?.content.title == original.content.title && resumed?.content.body == original.content.body,
            "title and body survive secure archive round trip")
        try check(resumed?.content.sound?.isEqual(original.content.sound) == true, "bundled sound survives archive")
        try check(resumed?.content.threadIdentifier == original.content.threadIdentifier &&
            resumed?.content.interruptionLevel == .active, "presentation settings survive archive")
        try check(resumed?.content.userInfo["sessionId"] as? String == "focus-1", "opaque session preserved")
        try check(resumed?.content.userInfo["deadlineMs"] as? Double == resumedDeadline.timeIntervalSince1970 * 1_000,
            "deadline metadata moves to resumed time")
        try check((resumed?.trigger as? UNTimeIntervalNotificationTrigger)?.timeInterval == 42,
            "trigger uses resumed deadline, not old deadline")
        try check(BloomCompletionAlert.deliveryState.consume(deadlineMs: resumedDeadline.timeIntervalSince1970 * 1_000)
            == "background-system", "background resume updates exact-deadline cue handshake")

        _ = await restored.cancel(resumeNotice: nil, appIsActive: true)
        await restored.resume(sessionId: "focus-1", remainingSeconds: 42, deadline: resumedDeadline)
        try check(await center.pending == nil, "sound-off/reset/finish revokes stale resume metadata")

        let notice = BloomCompletionResumeNotice(sessionId: "focus-2", title: "Tiny timer finished",
            body: "Bloom is ready when you are.", remainingSeconds: 30)
        _ = await restored.cancel(resumeNotice: notice, appIsActive: true)
        await center.setAllowed(false)
        await restored.resume(sessionId: "focus-2", remainingSeconds: 30, deadline: instant.addingTimeInterval(30))
        try check(await center.pending == nil, "permission revoked while paused prevents restored notice")
        await center.setAllowed(true)
        _ = await restored.cancel(resumeNotice: notice, appIsActive: true)
        await restored.resume(sessionId: "focus-2", remainingSeconds: 30, deadline: instant.addingTimeInterval(30))
        try check(await center.pending?.content.title == "Tiny timer finished",
            "in-app pause/AlarmKit handoff can resume without prior generic schedule")

        _ = await restored.schedule(sessionId: nil, deadlineMs: deadlineMs,
            title: "Break timer finished", body: "Your next focus is ready when you are.", appIsActive: true)
        await restored.pause(sessionId: "focus-2", deadlineMs: deadlineMs, remainingSeconds: 30, at: instant)
        try check(await center.pending?.content.title == "Break timer finished", "old work controls cannot cancel break")

        await center.blockNextAdd()
        let start = Task {
            await restored.schedule(sessionId: "focus-3", deadlineMs: deadlineMs,
                title: "Focus timer finished", body: "Bloom is ready when you are.", appIsActive: true)
        }
        while !(await center.isBlocked()) { await Task.yield() }
        let cancellation = Task { await restored.cancel(resumeNotice: nil, appIsActive: true) }
        // Give cancellation an opportunity to enter while the OS add is held.
        // An actor without the serialization queue would cancel first, then
        // resurrect the stale request when this add is released.
        try await Task.sleep(for: .milliseconds(25))
        await center.releaseAdd()
        _ = await start.value
        _ = await cancellation.value
        try check(await center.pending == nil, "cancel wins after an in-flight native add")

        BloomCompletionAlert.deliveryState.noteAppBecameActive()
        _ = await restored.cancel(resumeNotice: notice, appIsActive: true)
        await restored.resume(sessionId: "focus-2", remainingSeconds: 30, deadline: instant.addingTimeInterval(30))
        try check(BloomCompletionAlert.deliveryState.consume(deadlineMs: instant.addingTimeInterval(30).timeIntervalSince1970 * 1_000)
            == "none", "native resume while app active keeps the foreground chime available")

        await center.setRejectAdd()
        _ = await restored.schedule(sessionId: "focus-4", deadlineMs: deadlineMs,
            title: "Focus timer finished", body: "Bloom is ready when you are.", appIsActive: true)
        await restored.resume(sessionId: "focus-4", remainingSeconds: 30, deadline: instant.addingTimeInterval(30))
        try check(await center.pending == nil, "failed scheduling cannot leave restorable cue")
        print("PASS: native notification transport, secure content/sound archive, stale controls, disabled/revoked cues, handoff and in-flight cancellation")
    }
}
