import ActivityKit
import Capacitor
import Foundation
import UIKit

@available(iOS 16.2, *)
private struct BloomLiveActivitySnapshot {
    let sessionId: String
    let mode: String
    let phase: BloomFocusActivityAttributes.ContentState.Phase
    let startedAt: Date
    let deadline: Date?
    let remainingSeconds: Int?

    var contentState: BloomFocusActivityAttributes.ContentState {
        let end = deadline ?? startedAt
        return BloomFocusActivityAttributes.ContentState(
            mode: mode,
            phase: phase,
            timerStart: min(startedAt, end),
            timerEnd: max(startedAt, end),
            pausedRemainingSeconds: remainingSeconds
        )
    }

    var isExpired: Bool {
        if phase == .running {
            return deadline.map { $0 <= Date() } ?? true
        }
        return (remainingSeconds ?? 0) <= 0
    }
}

private struct BloomLiveActivityBridgeResult {
    let supported: Bool
    let enabled: Bool
    let active: Bool
    let changed: Bool
    var reason: String? = nil
    var activityId: String? = nil
    var sessionId: String? = nil

    var jsObject: JSObject {
        var result: JSObject = [
            "supported": supported,
            "enabled": enabled,
            "active": active,
            "changed": changed,
        ]
        if let reason {
            result["reason"] = reason
        }
        if let activityId {
            result["activityId"] = activityId
        }
        if let sessionId {
            result["sessionId"] = sessionId
        }
        return result
    }

    static let unavailable = BloomLiveActivityBridgeResult(
        supported: false,
        enabled: false,
        active: false,
        changed: false,
        reason: "unavailable"
    )
}

@available(iOS 16.2, *)
private actor BloomLiveActivityCoordinator {
    static let shared = BloomLiveActivityCoordinator()
    private static let lastRequestedSessionKey =
        "dev.bloom.pomodoro.live-activity.last-requested-session"
    private let defaults = UserDefaults.standard

    func status() -> BloomLiveActivityBridgeResult {
        let activities = Activity<BloomFocusActivityAttributes>.activities
        let first = activities.first
        return BloomLiveActivityBridgeResult(
            supported: true,
            enabled: ActivityAuthorizationInfo().areActivitiesEnabled,
            active: first != nil,
            changed: false,
            activityId: first?.id,
            sessionId: first?.attributes.sessionId
        )
    }

    func reconcile(
        _ snapshot: BloomLiveActivitySnapshot,
        appIsActive: Bool
    ) async -> BloomLiveActivityBridgeResult {
        let activities = Activity<BloomFocusActivityAttributes>.activities
        var retained: Activity<BloomFocusActivityAttributes>?
        var changed = false

        // A session identifier is static ActivityKit metadata. Retain exactly
        // one matching Activity and remove stale/duplicate mirrors first.
        for activity in activities {
            if activity.attributes.sessionId == snapshot.sessionId, retained == nil {
                retained = activity
            } else {
                await end(activity, policy: .immediate, finished: false)
                changed = true
            }
        }

        let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
        guard enabled else {
            if let retained {
                await end(retained, policy: .immediate, finished: false)
                changed = true
            }
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: false,
                active: false,
                changed: changed,
                reason: "disabled"
            )
        }

        guard !snapshot.isExpired else {
            if let retained {
                await end(retained, policy: .immediate, finished: false)
                changed = true
            }
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: true,
                active: false,
                changed: changed,
                reason: "expired"
            )
        }

        let state = snapshot.contentState
        if let retained {
            if currentState(of: retained) != state {
                await update(retained, state: state, staleDate: snapshot.deadline)
                changed = true
            }
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: true,
                active: true,
                changed: changed,
                activityId: retained.id,
                sessionId: snapshot.sessionId
            )
        }

        // Activity.activities no longer contains a Live Activity after the
        // person dismisses it. Remember the opaque session identifier so a
        // later pause/resume snapshot cannot recreate what they swiped away.
        if defaults.string(forKey: Self.lastRequestedSessionKey) == snapshot.sessionId {
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: true,
                active: false,
                changed: changed,
                reason: "dismissed",
                sessionId: snapshot.sessionId
            )
        }

        // iOS permits an app to start a Live Activity only while foregrounded.
        // Updates and endings still reconcile through the actor above.
        guard appIsActive else {
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: true,
                active: false,
                changed: changed,
                reason: "not-active"
            )
        }

        do {
            let attributes = BloomFocusActivityAttributes(sessionId: snapshot.sessionId)
            let activity: Activity<BloomFocusActivityAttributes>
            activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: snapshot.deadline),
                pushType: nil
            )
            defaults.set(snapshot.sessionId, forKey: Self.lastRequestedSessionKey)
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: true,
                active: true,
                changed: true,
                activityId: activity.id,
                sessionId: snapshot.sessionId
            )
        } catch {
            // Availability and authorization are ordinary user-controlled
            // states. Keep the reducer running and fail quietly on the bridge.
            return BloomLiveActivityBridgeResult(
                supported: true,
                enabled: true,
                active: false,
                changed: changed,
                reason: "request-failed"
            )
        }
    }

    func endActivities(
        sessionId: String?,
        policy: ActivityUIDismissalPolicy,
        showFinishedState: Bool
    ) async -> BloomLiveActivityBridgeResult {
        let activities = Activity<BloomFocusActivityAttributes>.activities
        let targets = activities.filter { activity in
            sessionId == nil || activity.attributes.sessionId == sessionId
        }

        for activity in targets {
            await end(activity, policy: policy, finished: showFinishedState)
        }

        let lastRequested = defaults.string(forKey: Self.lastRequestedSessionKey)
        if sessionId == nil || sessionId == lastRequested {
            defaults.removeObject(forKey: Self.lastRequestedSessionKey)
        }

        let remaining = Activity<BloomFocusActivityAttributes>.activities.first
        return BloomLiveActivityBridgeResult(
            supported: true,
            enabled: ActivityAuthorizationInfo().areActivitiesEnabled,
            active: remaining != nil,
            changed: !targets.isEmpty,
            activityId: remaining?.id,
            sessionId: remaining?.attributes.sessionId
        )
    }

    private func currentState(
        of activity: Activity<BloomFocusActivityAttributes>
    ) -> BloomFocusActivityAttributes.ContentState {
        activity.content.state
    }

    private func update(
        _ activity: Activity<BloomFocusActivityAttributes>,
        state: BloomFocusActivityAttributes.ContentState,
        staleDate: Date?
    ) async {
        await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }

    private func end(
        _ activity: Activity<BloomFocusActivityAttributes>,
        policy: ActivityUIDismissalPolicy,
        finished: Bool
    ) async {
        let current = currentState(of: activity)
        let now = Date()
        let finalState = finished
            ? BloomFocusActivityAttributes.ContentState(
                mode: current.mode,
                phase: .finished,
                timerStart: now,
                timerEnd: now,
                pausedRemainingSeconds: 0
            )
            : current

        await activity.end(
            ActivityContent(state: finalState, staleDate: nil),
            dismissalPolicy: policy
        )
    }
}

/// PLAN 13.8 — mirrors reducer-owned Focus/Tiny lifecycle snapshots into one
/// local ActivityKit activity. No method requests a push token, contacts APNs,
/// stores task text, or mutates Bloom session state.
@objc(BloomLiveActivityPlugin)
final class BloomLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomLiveActivityPlugin"
    let jsName = "BloomLiveActivity"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reconcile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func status(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(BloomLiveActivityBridgeResult.unavailable.jsObject)
            return
        }

        Task {
            let result = await BloomLiveActivityCoordinator.shared.status()
            call.resolve(result.jsObject)
        }
    }

    @objc func reconcile(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(BloomLiveActivityBridgeResult.unavailable.jsObject)
            return
        }

        guard let snapshot = validatedSnapshot(call) else {
            call.reject("A valid Focus or Tiny session snapshot is required")
            return
        }

        Task {
            let appIsActive = await MainActor.run {
                UIApplication.shared.applicationState == .active
            }
            let result = await BloomLiveActivityCoordinator.shared.reconcile(
                snapshot,
                appIsActive: appIsActive
            )
            call.resolve(result.jsObject)
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(BloomLiveActivityBridgeResult.unavailable.jsObject)
            return
        }

        let rawSessionId = call.getString("sessionId")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let rawSessionId, !rawSessionId.isEmpty, !isValidSessionId(rawSessionId) {
            call.reject("A valid session identifier is required")
            return
        }

        let dismissal = call.getString("dismissal") ?? "immediate"
        let policy: ActivityUIDismissalPolicy
        switch dismissal {
        case "default":
            policy = .default
        case "immediate":
            policy = .immediate
        default:
            call.reject("Dismissal must be default or immediate")
            return
        }

        Task {
            let result = await BloomLiveActivityCoordinator.shared.endActivities(
                sessionId: rawSessionId?.isEmpty == false ? rawSessionId : nil,
                policy: policy,
                showFinishedState: dismissal == "default"
            )
            call.resolve(result.jsObject)
        }
    }

    @available(iOS 16.2, *)
    private func validatedSnapshot(_ call: CAPPluginCall) -> BloomLiveActivitySnapshot? {
        guard
            let sessionId = call.getString("sessionId")?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            isValidSessionId(sessionId),
            let mode = call.getString("mode"),
            mode == "focus" || mode == "tiny",
            let state = call.getString("state"),
            state == "running" || state == "paused",
            let startedAtMs = call.getDouble("startedAtMs"),
            isValidEpochMilliseconds(startedAtMs)
        else {
            return nil
        }

        let startedAt = Date(timeIntervalSince1970: startedAtMs / 1_000)
        if state == "running" {
            guard
                let deadlineMs = call.getDouble("deadlineMs"),
                isValidEpochMilliseconds(deadlineMs),
                deadlineMs > startedAtMs
            else {
                return nil
            }
            return BloomLiveActivitySnapshot(
                sessionId: sessionId,
                mode: mode,
                phase: .running,
                startedAt: startedAt,
                deadline: Date(timeIntervalSince1970: deadlineMs / 1_000),
                remainingSeconds: nil
            )
        }

        guard
            let remaining = call.getDouble("remainingSeconds"),
            remaining.isFinite,
            remaining >= 0,
            remaining <= 7 * 24 * 60 * 60,
            abs(remaining.rounded() - remaining) < 0.001
        else {
            return nil
        }
        return BloomLiveActivitySnapshot(
            sessionId: sessionId,
            mode: mode,
            phase: .paused,
            startedAt: startedAt,
            deadline: nil,
            remainingSeconds: Int(remaining.rounded())
        )
    }

    private func isValidSessionId(_ value: String) -> Bool {
        value.range(
            of: "^[A-Za-z0-9._-]{1,96}$",
            options: .regularExpression
        ) != nil
    }

    private func isValidEpochMilliseconds(_ value: Double) -> Bool {
        value.isFinite && value > 0 && value < 32_503_680_000_000
    }
}
