import Capacitor
import Foundation
import UIKit

#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import SwiftUI
#endif

enum BloomAlarm {
    /// One alarm identity for the whole app. A stable id is what makes every
    /// deadline change a replacement rather than a growing pile of alarms.
    static let identifier = "B1005A1A-B10E-4A17-9C3E-0DEC0DEDBEEF"
    /// The same bundled cue PLAN 13.11 delivers through UserNotifications.
    static let soundName = "BloomCompletion.wav"
}

private struct BloomAlarmBridgeResult {
    let supported: Bool
    let authorization: String
    var owns: Bool = false
    var changed: Bool = false
    var reason: String? = nil

    var jsObject: JSObject {
        var result: JSObject = [
            "supported": supported,
            "authorization": authorization,
            "owns": owns,
            "changed": changed,
        ]
        if let reason {
            result["reason"] = reason
        }
        return result
    }

    static let unsupported = BloomAlarmBridgeResult(
        supported: false,
        authorization: "unsupported",
        reason: "unsupported"
    )
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
private struct BloomAlarmRequest {
    let deadlineMs: Double
    let mode: String
    let countdownTitle: String
    let alertTitle: String
    let stopLabel: String
}

/// PLAN 13.12 — serializes every AlarmKit mutation behind one identity.
///
/// This actor mirrors the reducer; it is never a second timer authority. It
/// schedules, replaces, and cancels exactly one alarm, and it reports back
/// whether that alarm currently owns the finish cue so the 13.11 notification
/// and the 13.8 activity can stand down instead of doubling it.
@available(iOS 26.0, *)
private actor BloomAlarmCoordinator {
    static let shared = BloomAlarmCoordinator()
    private static let trackedDeadlineKey = "dev.bloom.pomodoro.alarm.tracked-deadline-ms"
    private static let alarmId = UUID(uuidString: BloomAlarm.identifier)!

    private let defaults = UserDefaults.standard

    /// The deadline this actor last scheduled, so an unchanged reducer snapshot
    /// reschedules nothing. It survives relaunch because iOS keeps the alarm.
    private var trackedDeadlineMs: Double? {
        get {
            let stored = defaults.double(forKey: Self.trackedDeadlineKey)
            return stored > 0 ? stored : nil
        }
        set {
            if let newValue {
                defaults.set(newValue, forKey: Self.trackedDeadlineKey)
            } else {
                defaults.removeObject(forKey: Self.trackedDeadlineKey)
            }
        }
    }

    func status() -> BloomAlarmBridgeResult {
        BloomAlarmBridgeResult(
            supported: true,
            authorization: Self.name(for: AlarmManager.shared.authorizationState),
            owns: currentAlarm()?.state == .countdown
        )
    }

    func requestAuthorization() async -> BloomAlarmBridgeResult {
        // iOS asks once. A later change is made in iOS Settings, never here.
        let state = (try? await AlarmManager.shared.requestAuthorization())
            ?? AlarmManager.shared.authorizationState
        return BloomAlarmBridgeResult(
            supported: true,
            authorization: Self.name(for: state)
        )
    }

    func reconcile(_ request: BloomAlarmRequest) async -> BloomAlarmBridgeResult {
        let authorization = AlarmManager.shared.authorizationState
        guard authorization == .authorized else {
            let changed = await cancel(force: false)
            return BloomAlarmBridgeResult(
                supported: true,
                authorization: Self.name(for: authorization),
                changed: changed,
                reason: "permission"
            )
        }

        let duration = Date(timeIntervalSince1970: request.deadlineMs / 1_000)
            .timeIntervalSinceNow
        guard duration > 0.5 else {
            // The deadline already passed. Leave any alerting alarm alone: it
            // is the cue the person asked for, and only they dismiss it.
            return BloomAlarmBridgeResult(
                supported: true,
                authorization: Self.name(for: authorization),
                reason: "past"
            )
        }

        if let tracked = trackedDeadlineMs,
           abs(tracked - request.deadlineMs) < 1,
           currentAlarm()?.state == .countdown {
            return BloomAlarmBridgeResult(
                supported: true,
                authorization: Self.name(for: authorization),
                owns: true
            )
        }

        // A new deadline replaces the old alarm outright, including one that is
        // still alerting from a previous session the person left ringing.
        _ = await cancel(force: true)

        do {
            _ = try await AlarmManager.shared.schedule(
                id: Self.alarmId,
                configuration: configuration(for: request, duration: duration)
            )
            trackedDeadlineMs = request.deadlineMs
            return BloomAlarmBridgeResult(
                supported: true,
                authorization: Self.name(for: authorization),
                owns: true,
                changed: true
            )
        } catch {
            // A scheduling limit or system refusal is an ordinary state. Report
            // it so the notification and chime fallbacks take the cue back.
            trackedDeadlineMs = nil
            return BloomAlarmBridgeResult(
                supported: true,
                authorization: Self.name(for: authorization),
                reason: "schedule-failed"
            )
        }
    }

    /// `force` is reserved for a replacement or an explicit data clear. Ordinary
    /// reconciliation must not silence an alarm that is already ringing.
    @discardableResult
    func cancel(force: Bool) async -> Bool {
        guard let alarm = currentAlarm() else {
            trackedDeadlineMs = nil
            return false
        }
        if alarm.state == .alerting {
            guard force else { return false }
            try? AlarmManager.shared.stop(id: Self.alarmId)
        }
        try? AlarmManager.shared.cancel(id: Self.alarmId)
        trackedDeadlineMs = nil
        return true
    }

    /// Report whether AlarmKit is sounding the cue for this exact reducer
    /// deadline. Anything else keeps Bloom's own foreground chime, because a
    /// missing cue is a worse outcome than a quiet chime under a loud alarm.
    func consumeDue(deadlineMs: Double) -> String {
        guard let tracked = trackedDeadlineMs, abs(tracked - deadlineMs) < 1 else {
            return "none"
        }
        guard let alarm = currentAlarm(), alarm.state == .alerting else {
            return "none"
        }
        trackedDeadlineMs = nil
        return "system-alarm"
    }

    private func configuration(
        for request: BloomAlarmRequest,
        duration: TimeInterval
    ) -> AlarmManager.AlarmConfiguration<BloomAlarmMetadata> {
        // No pause button: AlarmKit must not become a second place where a
        // Bloom session can be paused. Pausing hands the countdown surface
        // back to the PLAN 13.8 activity, which the reducer already drives.
        let countdown = AlarmPresentation.Countdown(
            title: LocalizedStringResource(stringLiteral: request.countdownTitle),
            pauseButton: nil
        )
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: request.alertTitle)
            )
        } else {
            alert = AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: request.alertTitle),
                stopButton: AlarmButton(
                    text: LocalizedStringResource(stringLiteral: request.stopLabel),
                    textColor: .white,
                    systemImageName: "checkmark"
                )
            )
        }

        return AlarmManager.AlarmConfiguration.timer(
            duration: duration,
            attributes: AlarmAttributes(
                presentation: AlarmPresentation(alert: alert, countdown: countdown),
                metadata: BloomAlarmMetadata(mode: request.mode),
                tintColor: BloomAlarmStyle.tint
            ),
            // No stop or secondary intent. Silencing the system alarm must not
            // reach the reducer, which alone records what the session was.
            sound: .named(BloomAlarm.soundName)
        )
    }

    private func currentAlarm() -> Alarm? {
        guard let alarms = try? AlarmManager.shared.alarms else { return nil }
        return alarms.first { $0.id == Self.alarmId }
    }

    private static func name(for state: AlarmManager.AuthorizationState) -> String {
        switch state {
        case .notDetermined: return "prompt"
        case .authorized: return "granted"
        case .denied: return "denied"
        @unknown default: return "unavailable"
        }
    }
}
#endif

/// PLAN 13.12 — mirrors the reducer-owned countdown into one AlarmKit alarm so
/// a finish can sound through Silent Mode and Focus on iOS 26 and later. This
/// plugin never writes Bloom state, completes a session, or upgrades a record.
@objc(BloomAlarmPlugin)
final class BloomAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomAlarmPlugin"
    let jsName = "BloomAlarm"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reconcile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeDue", returnType: CAPPluginReturnPromise),
    ]

    @objc func status(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else {
            call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
            return
        }
        Task {
            call.resolve(await BloomAlarmCoordinator.shared.status().jsObject)
        }
        #else
        call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
        #endif
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else {
            call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
            return
        }
        Task {
            call.resolve(await BloomAlarmCoordinator.shared.requestAuthorization().jsObject)
        }
        #else
        call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
        #endif
    }

    @objc func reconcile(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else {
            call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
            return
        }
        guard let request = validatedRequest(call) else {
            call.reject("A valid bounded countdown snapshot is required")
            return
        }
        Task {
            call.resolve(await BloomAlarmCoordinator.shared.reconcile(request).jsObject)
        }
        #else
        call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
        #endif
    }

    @objc func cancel(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else {
            call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
            return
        }
        let force = call.getBool("force") ?? false
        Task {
            let changed = await BloomAlarmCoordinator.shared.cancel(force: force)
            let status = await BloomAlarmCoordinator.shared.status()
            call.resolve(
                BloomAlarmBridgeResult(
                    supported: true,
                    authorization: status.authorization,
                    owns: status.owns,
                    changed: changed
                ).jsObject
            )
        }
        #else
        call.resolve(BloomAlarmBridgeResult.unsupported.jsObject)
        #endif
    }

    @objc func consumeDue(_ call: CAPPluginCall) {
        guard let deadlineMs = call.getDouble("deadlineMs"), deadlineMs.isFinite else {
            call.reject("A finite deadline is required")
            return
        }
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else {
            call.resolve(["presentation": "none"])
            return
        }
        Task {
            let presentation = await BloomAlarmCoordinator.shared.consumeDue(
                deadlineMs: deadlineMs
            )
            call.resolve(["presentation": presentation])
        }
        #else
        call.resolve(["presentation": "none"])
        #endif
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func validatedRequest(_ call: CAPPluginCall) -> BloomAlarmRequest? {
        guard
            let deadlineMs = call.getDouble("deadlineMs"),
            deadlineMs.isFinite,
            deadlineMs > 0,
            deadlineMs < 32_503_680_000_000,
            let mode = call.getString("mode"),
            ["focus", "tiny", "short", "long"].contains(mode),
            let countdownTitle = trimmed(call.getString("countdownTitle")),
            let alertTitle = trimmed(call.getString("alertTitle")),
            let stopLabel = trimmed(call.getString("stopLabel"))
        else {
            return nil
        }
        return BloomAlarmRequest(
            deadlineMs: deadlineMs,
            mode: mode,
            countdownTitle: String(countdownTitle.prefix(48)),
            alertTitle: String(alertTitle.prefix(80)),
            stopLabel: String(stopLabel.prefix(24))
        )
    }

    private func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let result = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return result.isEmpty ? nil : result
    }
    #endif
}
