import Foundation
import UserNotifications
import UIKit
import Capacitor

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
            let deadlineMs = call.getDouble("deadlineMs"), deadlineMs.isFinite,
            let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
            let body = call.getString("body")?.trimmingCharacters(in: .whitespacesAndNewlines), !body.isEmpty
        else {
            call.reject("A finite deadline, title, and body are required")
            return
        }
        let sessionId = validSessionId(call.getString("sessionId"))
        Task {
            let appIsActive = await MainActor.run { UIApplication.shared.applicationState == .active }
            let result = await BloomCompletionAlertTransport.shared.schedule(
                sessionId: sessionId, deadlineMs: deadlineMs, title: title, body: body, appIsActive: appIsActive
            )
            var response: JSObject = ["scheduled": result.scheduled]
            if result.scheduled { response["deadlineMs"] = deadlineMs }
            if let reason = result.reason { response["reason"] = reason }
            call.resolve(response)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        var resumeNotice: BloomCompletionResumeNotice?
        if let raw = call.getObject("resumeNotice"),
           let sessionId = validSessionId(raw["sessionId"] as? String),
           let title = raw["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let body = raw["body"] as? String, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let remaining = raw["remainingSeconds"] as? NSNumber,
           remaining.doubleValue.isFinite, remaining.doubleValue > 0,
           remaining.doubleValue <= 7 * 24 * 60 * 60,
           remaining.doubleValue.rounded() == remaining.doubleValue {
            resumeNotice = BloomCompletionResumeNotice(
                sessionId: sessionId, title: title, body: body, remainingSeconds: remaining.intValue
            )
        }
        let notice = resumeNotice
        Task {
            let appIsActive = await MainActor.run { UIApplication.shared.applicationState == .active }
            _ = await BloomCompletionAlertTransport.shared.cancel(resumeNotice: notice, appIsActive: appIsActive)
            call.resolve()
        }
    }

    private func validSessionId(_ value: String?) -> String? {
        guard let value, value.range(of: "^[A-Za-z0-9._-]{1,96}$", options: .regularExpression) != nil else { return nil }
        return value
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
