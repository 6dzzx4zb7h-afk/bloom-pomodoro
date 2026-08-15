import UIKit
import Capacitor

/// PLAN 13.9 — the home-screen icon follows whichever friend is on duty.
///
/// The web reducer stays the authority on who that is; this plugin only mirrors
/// the current friend onto the application's icon. Every icon is compiled into
/// the app bundle, so nothing about the choice leaves the device.
@objc(BloomAppIconPlugin)
final class BloomAppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomAppIconPlugin"
    let jsName = "BloomAppIcon"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
    ]

    /// `name` is the asset-catalog name of an alternate icon. Omit it, or send
    /// an empty string, to restore the primary icon — Mochi the bunny.
    @objc func select(_ call: CAPPluginCall) {
        let requested = call.getString("name")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let target = (requested?.isEmpty ?? true) ? nil : requested

        DispatchQueue.main.async {
            let application = UIApplication.shared

            guard application.supportsAlternateIcons else {
                call.resolve(["supported": false, "changed": false])
                return
            }

            guard application.alternateIconName != target else {
                // This friend is already on the home screen. Setting the same
                // icon again would make iOS show its "you have changed the
                // icon" alert for a change the user cannot see.
                call.resolve(["supported": true, "changed": false])
                return
            }

            application.setAlternateIconName(target) { error in
                if let error {
                    // Most often: the app was backgrounded mid-change. The web
                    // side reconciles again on the next foreground, so this
                    // stays a quiet no-op rather than an interruption.
                    call.reject("Could not change the app icon", nil, error)
                } else {
                    call.resolve(["supported": true, "changed": true])
                }
            }
        }
    }
}
