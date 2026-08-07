import SwiftUI
import WidgetKit

@main
struct BloomLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        BloomLiveActivityWidget()
        // PLAN 13.12 — AlarmKit's countdown and alert, on the systems that
        // have it. Older systems keep the generic activity above on its own.
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            BloomAlarmWidget()
        }
        #endif
    }
}
