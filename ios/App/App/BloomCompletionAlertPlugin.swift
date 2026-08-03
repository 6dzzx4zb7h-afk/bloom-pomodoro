import Foundation
import UserNotifications
import UIKit
import Capacitor

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

/// PLAN 13.11 — mirrors the reducer-owned countdown deadline into one local
/// iOS notification. Delivery is a cue only: this plugin never writes Bloom
/// state or claims that a session was completed.
@objc(BloomCompletionAlertPlugin)
final class BloomCompletionAlertPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomCompletionAlertPlugin"
    let jsName = "BloomCompletionAlert"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeDue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
    ]

    private let center = UNUserNotificationCenter.current()

    @objc func status(_ call: CAPPluginCall) {
        resolveStatus(call)
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        center.requestAuthorization(options: [.alert, .sound]) { [weak self] _, error in
            guard let self else {
                call.reject("Notification permission request did not finish")
                return
            }
            if let error {
                call.reject("Could not request notification permission", nil, error)
                return
            }
            self.resolveStatus(call)
        }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        guard
            let deadlineMs = call.getDouble("deadlineMs"),
            deadlineMs.isFinite,
            let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines),
            !title.isEmpty,
            let body = call.getString("body")?.trimmingCharacters(in: .whitespacesAndNewlines),
            !body.isEmpty
        else {
            call.reject("A finite deadline, title, and body are required")
            return
        }

        BloomCompletionAlert.deliveryState.replace(
            deadlineMs: deadlineMs,
            appIsActive: UIApplication.shared.applicationState == .active
        )

        center.getNotificationSettings { [weak self] settings in
            guard let self else {
                call.reject("Notification scheduling did not finish")
                return
            }
            guard self.canSchedule(settings.authorizationStatus) else {
                self.center.removePendingNotificationRequests(
                    withIdentifiers: [BloomCompletionAlert.requestIdentifier]
                )
                BloomCompletionAlert.deliveryState.clear(deadlineMs: deadlineMs)
                call.resolve(["scheduled": false, "reason": "permission"])
                return
            }

            let deadline = Date(timeIntervalSince1970: deadlineMs / 1_000)
            let delay = deadline.timeIntervalSinceNow
            guard delay > 0 else {
                self.center.removePendingNotificationRequests(
                    withIdentifiers: [BloomCompletionAlert.requestIdentifier]
                )
                BloomCompletionAlert.deliveryState.clear(deadlineMs: deadlineMs)
                call.resolve(["scheduled": false, "reason": "past"])
                return
            }

            let content = UNMutableNotificationContent()
            content.title = String(title.prefix(80))
            content.body = String(body.prefix(180))
            content.sound = UNNotificationSound(
                named: UNNotificationSoundName(rawValue: BloomCompletionAlert.soundName)
            )
            content.threadIdentifier = "bloom-timer"
            content.userInfo = ["deadlineMs": deadlineMs]
            if #available(iOS 15.0, *) {
                // Ordinary active delivery: it remains under the person's
                // Silent Mode and Focus controls. Bloom does not request the
                // Time Sensitive or Critical Alert capabilities.
                content.interruptionLevel = .active
            }

            let trigger = UNTimeIntervalNotificationTrigger(
                timeInterval: max(1, delay),
                repeats: false
            )
            let request = UNNotificationRequest(
                identifier: BloomCompletionAlert.requestIdentifier,
                content: content,
                trigger: trigger
            )

            // A stable identifier makes every deadline update a replacement,
            // never a growing queue of stale completion cues.
            self.center.removePendingNotificationRequests(
                withIdentifiers: [BloomCompletionAlert.requestIdentifier]
            )
            self.center.removeDeliveredNotifications(
                withIdentifiers: [BloomCompletionAlert.requestIdentifier]
            )
            self.center.add(request) { error in
                if let error {
                    BloomCompletionAlert.deliveryState.clear(deadlineMs: deadlineMs)
                    call.reject("Could not schedule the completion alert", nil, error)
                } else {
                    call.resolve(["scheduled": true, "deadlineMs": deadlineMs])
                }
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        let cancelIfSafe = {
            let shouldRemove = BloomCompletionAlert.deliveryState.shouldRemovePendingForCancellation(
                nowMs: Date().timeIntervalSince1970 * 1_000,
                appIsActive: UIApplication.shared.applicationState == .active
            )
            if shouldRemove {
                self.center.removePendingNotificationRequests(
                    withIdentifiers: [BloomCompletionAlert.requestIdentifier]
                )
            }
            call.resolve()
        }
        if Thread.isMainThread {
            cancelIfSafe()
        } else {
            DispatchQueue.main.async(execute: cancelIfSafe)
        }
    }

    @objc func consumeDue(_ call: CAPPluginCall) {
        guard let deadlineMs = call.getDouble("deadlineMs"), deadlineMs.isFinite else {
            call.reject("A finite deadline is required")
            return
        }
        let presentation = BloomCompletionAlert.deliveryState.consume(deadlineMs: deadlineMs)
        center.removeDeliveredNotifications(
            withIdentifiers: [BloomCompletionAlert.requestIdentifier]
        )
        call.resolve(["presentation": presentation])
    }

    @objc func pending(_ call: CAPPluginCall) {
        center.getPendingNotificationRequests { requests in
            let matches = requests.filter {
                $0.identifier == BloomCompletionAlert.requestIdentifier
            }
            let deadlineMs = matches.first?.content.userInfo["deadlineMs"] as? Double
            var result: JSObject = ["count": matches.count]
            if let deadlineMs {
                result["deadlineMs"] = deadlineMs
            }
            call.resolve(result)
        }
    }

    private func canSchedule(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined, .denied:
            return false
        @unknown default:
            return false
        }
    }

    private func resolveStatus(_ call: CAPPluginCall) {
        center.getNotificationSettings { settings in
            call.resolve([
                "permission": self.permissionName(settings.authorizationStatus),
                "alertsEnabled": settings.alertSetting == .enabled,
                "soundsEnabled": settings.soundSetting == .enabled,
                "lockScreenEnabled": settings.lockScreenSetting == .enabled,
            ])
        }
    }

    private func permissionName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "prompt"
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        @unknown default: return "unsupported"
        }
    }
}
