import Capacitor
import Foundation

/// PLAN 13.18 — the reducer's side of the command channel.
///
/// This plugin only moves recorded intent across the process boundary. It never
/// completes a session, writes a `SessionRecord`, or computes remaining time;
/// those remain the reducer's alone. `drain` deliberately does not remove, so a
/// crash between applying and acknowledging re-delivers rather than loses.
@objc(BloomCommandsPlugin)
final class BloomCommandsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomCommandsPlugin"
    let jsName = "BloomCommands"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enqueueForTesting", returnType: CAPPluginReturnPromise),
    ]

    @objc func drain(_ call: CAPPluginCall) {
        let commands = BloomCommandQueue.peekAll().map { command -> JSObject in
            [
                "id": command.id,
                "kind": command.kind,
                "sessionId": command.sessionId,
                "occurredAt": command.occurredAt,
            ]
        }
        call.resolve(["commands": commands])
    }

    @objc func acknowledge(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self)) ?? []
        BloomCommandQueue.acknowledge(ids: ids)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        BloomCommandQueue.clear()
        call.resolve()
    }

    /// A producer for verification before PLAN 13.19's intents exist. Debug-only
    /// so a shipping build has no way to fabricate a command from JavaScript.
    @objc func enqueueForTesting(_ call: CAPPluginCall) {
        #if DEBUG
        guard
            let kind = call.getString("kind"),
            let sessionId = call.getString("sessionId")
        else {
            call.reject("kind and sessionId are required")
            return
        }
        BloomCommandQueue.append(
            BloomCommand(
                id: call.getString("id") ?? UUID().uuidString,
                kind: kind,
                sessionId: sessionId,
                occurredAt: call.getDouble("occurredAt") ?? Date().timeIntervalSince1970 * 1000
            )
        )
        call.resolve()
        #else
        call.reject("unavailable")
        #endif
    }
}
