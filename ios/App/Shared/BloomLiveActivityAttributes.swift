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
    }

    let sessionId: String
}
