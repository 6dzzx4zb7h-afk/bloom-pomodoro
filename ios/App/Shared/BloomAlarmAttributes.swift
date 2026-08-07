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
}
#endif

/// Shared by the app target and the widget extension so the system countdown
/// matches the rest of Bloom's native chrome.
enum BloomAlarmStyle {
    static let tint = Color(red: 0.85, green: 0.35, blue: 0.55)
}
