import ActivityKit
import Foundation

/// The privacy-minimal state shared by Bloom and its WidgetKit extension.
///
/// The React reducer owns the session. ActivityKit receives only the opaque
/// local session identifier, mode, and clock state needed to mirror it. Task
/// text is intentionally absent so it cannot leak onto the Lock Screen.
@available(iOS 16.2, *)
struct BloomFocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable, Hashable {
            case running
            case paused
            case finished
        }

        let mode: String
        let phase: Phase
        let timerStart: Date
        let timerEnd: Date
        let pausedRemainingSeconds: Int?
        /// Mirrors the existing Ring when done setting so a Continue intent
        /// can restore or suppress the one local completion request while the
        /// web view is suspended. This is operational state, not user content.
        // Optional so an activity archived by the previous app version still
        // decodes after upgrade. A missing value safely suppresses scheduling
        // until the reducer mirrors a current snapshot.
        let completionAlertsEnabled: Bool?
    }

    let sessionId: String
}
