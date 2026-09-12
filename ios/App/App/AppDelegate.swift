import UIKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        BloomBackupPolicy.excludeLocalDataFromBackup()
        // PLAN 13.11: the system owns background/Lock Screen delivery. Bloom's
        // existing Web Audio cue remains the sole foreground sound, so the
        // delegate suppresses only Bloom's mirrored timer notification there.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.identifier == BloomCompletionAlert.requestIdentifier {
            let isActive = UIApplication.shared.applicationState == .active
            if let deadlineMs = notification.request.content.userInfo["deadlineMs"] as? Double {
                BloomCompletionAlert.deliveryState.notePresentation(
                    deadlineMs: deadlineMs,
                    foregroundSuppressed: isActive
                )
            }
            // When Bloom is merely inactive (Control Center, an incoming call,
            // or another interruption), Web Audio is not a reliable fallback.
            completionHandler(isActive ? [] : [.banner, .list, .sound])
        } else {
            completionHandler([.banner, .list, .sound])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        // Tapping the cue opens Bloom normally. Native delivery never mutates
        // the reducer or turns an interrupted record into a completion.
        if response.notification.request.identifier == BloomCompletionAlert.requestIdentifier,
           let deadlineMs = response.notification.request.content.userInfo["deadlineMs"] as? Double {
            BloomCompletionAlert.deliveryState.noteResponse(deadlineMs: deadlineMs)
        }
        completionHandler()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        BloomCompletionAlert.deliveryState.noteAppBecameNonActive(
            atMs: Date().timeIntervalSince1970 * 1_000
        )
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        BloomBackupPolicy.excludeLocalDataFromBackup()
        BloomCompletionAlert.deliveryState.noteAppBecameNonActive(
            atMs: Date().timeIntervalSince1970 * 1_000
        )
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        BloomCompletionAlert.deliveryState.noteAppBecameActive()
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

/// Keep durable app data in its normal container, with Apple's backup-exclusion
/// resource value on the parent directories. Library covers WKWebView storage
/// and UserDefaults, including files created after launch. Do not move this data
/// into Caches: the OS may purge caches while the app is still installed.
enum BloomBackupPolicy {
    static func excludeLocalDataFromBackup() {
        for directory in [FileManager.SearchPathDirectory.documentDirectory, .libraryDirectory] {
            do {
                let url = try FileManager.default.url(
                    for: directory,
                    in: .userDomainMask,
                    appropriateFor: nil,
                    create: true
                )
                try excludeDirectory(url)
            } catch {
                // This is an OS backup preference, not a reason to stop local
                // saving. Retry on backgrounding without logging user content.
                NSLog("Bloom could not apply a local backup exclusion.")
            }
        }
    }

    static func excludeDirectory(_ directory: URL) throws {
        var url = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
}
