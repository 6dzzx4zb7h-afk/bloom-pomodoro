import Foundation
import SwiftUI

#if canImport(AlarmKit)
import AlarmKit

/// PLAN 13.12 — the metadata AlarmKit carries for a Bloom countdown.
///
/// The React reducer owns the session. AlarmKit receives only which bounded
/// mode is running, so the system countdown and alert can name it. Task text,
/// session targets, and identifiers are intentionally absent: this value is
/// rendered on the Lock Screen, where nothing personal belongs.
@available(iOS 26.0, *)
struct BloomAlarmMetadata: AlarmMetadata {
    /// One of `focus`, `tiny`, `short`, `long`. Flow has no predetermined
    /// finish, so it never schedules an alarm.
    let mode: String
    /// The reducer's open-session id, so PLAN 13.19's controls can address the
    /// same session from this surface (PLAN 13.18's commands are keyed by it).
    /// Empty for breaks, which open no session and therefore show no control.
    /// This is an opaque identifier, exactly as PLAN 13.8's attributes already
    /// carry — it names nothing about the person or the work.
    var sessionId: String = ""
}
#endif

/// PLAN 13.12 — the one alarm identity for the whole app. A stable id is what
/// makes every deadline change a replacement rather than a growing pile of
/// alarms. It lives here rather than beside the plugin because PLAN 13.19's
/// controls run in the widget extension and address the same alarm.
enum BloomAlarm {
    static let identifier = "B1005A1A-B10E-4A17-9C3E-0DEC0DEDBEEF"
    /// The same bundled cue PLAN 13.11 delivers through UserNotifications.
    static let soundName = "BloomCompletion.wav"
}

/// Shared by the app target and the widget extension so the system countdown
/// matches the rest of Bloom's native chrome.
enum BloomAlarmStyle {
    static let tint = Color(red: 0.85, green: 0.35, blue: 0.55)
}
