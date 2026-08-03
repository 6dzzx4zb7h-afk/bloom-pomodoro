import ActivityKit
import Foundation
import SwiftUI
import UIKit
import WidgetKit

struct BloomLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BloomFocusActivityAttributes.self) { context in
            BloomLockScreenView(context: context)
                .activityBackgroundTint(BloomLiveActivityStyle.background)
                .activitySystemActionForegroundColor(BloomLiveActivityStyle.accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    BloomModeLabel(mode: context.state.mode, compact: false)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    BloomActivityClock(
                        state: context.state,
                        compact: false,
                        isStale: context.isStale
                    )
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 6) {
                        BloomStatusGlyph(systemName: context.state.symbolName)
                            .accessibilityHidden(true)
                        Text(context.state.statusLabel(isStale: context.isStale))
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                    }
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                BloomStatusGlyph(systemName: context.state.symbolName)
                    .foregroundStyle(BloomLiveActivityStyle.accent)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(
                        context.state.statusLabel(isStale: context.isStale)
                    )
            } compactTrailing: {
                BloomActivityClock(
                    state: context.state,
                    compact: true,
                    isStale: context.isStale
                )
            } minimal: {
                BloomStatusGlyph(systemName: context.state.symbolName)
                    .foregroundStyle(BloomLiveActivityStyle.accent)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(
                        context.state.accessibilityStatus(isStale: context.isStale)
                    )
                    .accessibilityValue(
                        context.state.clockAccessibilityValue(isStale: context.isStale)
                    )
            }
            .keylineTint(BloomLiveActivityStyle.accent)
        }
    }
}

private struct BloomLockScreenView: View {
    let context: ActivityViewContext<BloomFocusActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            BloomStatusGlyph(systemName: context.state.symbolName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(BloomLiveActivityStyle.accent)
                .frame(width: 34, height: 34)
                .background(BloomLiveActivityStyle.accent.opacity(0.14), in: Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("Bloom")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if context.isStale && context.state.phase == .running {
                    Text("Timer reached zero — open Bloom")
                        .font(.headline)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                } else {
                    BloomModeLabel(mode: context.state.mode, compact: false)
                }
            }

            Spacer(minLength: 8)

            BloomActivityClock(
                state: context.state,
                compact: false,
                isStale: context.isStale
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

private struct BloomModeLabel: View {
    let mode: String
    let compact: Bool

    var body: some View {
        Text(mode == "tiny" ? "Tiny focus" : "Focus")
            .font(compact ? .caption2.weight(.semibold) : .headline)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}

private struct BloomActivityClock: View {
    let state: BloomFocusActivityAttributes.ContentState
    let compact: Bool
    let isStale: Bool

    var body: some View {
        Group {
            if state.phase == .running && isStale {
                Text("0:00")
            } else if state.phase == .running {
                Text(
                    timerInterval: state.timerStart...state.timerEnd,
                    countsDown: true,
                    showsHours: true
                )
            } else {
                Text(Self.formattedRemaining(state.pausedRemainingSeconds ?? 0))
            }
        }
        .font(compact ? .caption2.monospacedDigit().weight(.bold) : .title2.monospacedDigit().weight(.bold))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .foregroundStyle(.primary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.clockAccessibilityLabel(isStale: isStale))
        .accessibilityValue(state.clockAccessibilityValue(isStale: isStale))
    }

    private static func formattedRemaining(_ seconds: Int) -> String {
        let clamped = max(0, seconds)
        let hours = clamped / 3_600
        let minutes = (clamped % 3_600) / 60
        let remainingSeconds = clamped % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, remainingSeconds)
        }
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

private extension BloomFocusActivityAttributes.ContentState {
    var symbolName: String {
        switch phase {
        case .running:
            return "leaf.fill"
        case .paused:
            return "pause.fill"
        case .finished:
            return "checkmark"
        }
    }

    func statusLabel(isStale: Bool) -> String {
        switch phase {
        case .running:
            return isStale ? "Timer reached zero — open Bloom" : "Focus timer"
        case .paused:
            return "Paused"
        case .finished:
            return "Finished"
        }
    }

    func accessibilityStatus(isStale: Bool) -> String {
        switch phase {
        case .running:
            return isStale ? "Timer reached zero — open Bloom" : "Bloom focus timer"
        case .paused:
            return "Bloom timer paused"
        case .finished:
            return "Bloom timer finished"
        }
    }

    func clockAccessibilityLabel(isStale: Bool) -> String {
        switch phase {
        case .running:
            return isStale ? "Timer reached zero" : "Time remaining"
        case .paused:
            return "Paused time remaining"
        case .finished:
            return "Timer finished"
        }
    }

    func clockAccessibilityValue(isStale: Bool) -> Text {
        if phase == .running && !isStale {
            return Text(
                timerInterval: timerStart...timerEnd,
                countsDown: true,
                showsHours: true
            )
        }
        return Text("\(max(0, pausedRemainingSeconds ?? 0)) seconds")
    }
}

private struct BloomStatusGlyph: View {
    let systemName: String

    var body: some View {
        Group {
            if UIImage(systemName: systemName) != nil {
                Image(systemName: systemName)
                    .accessibilityHidden(true)
            } else {
                Circle()
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
            }
        }
    }
}

private enum BloomLiveActivityStyle {
    static let accent = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.95, green: 0.53, blue: 0.69, alpha: 1)
                : UIColor(red: 0.68, green: 0.16, blue: 0.37, alpha: 1)
        }
    )
    static let background = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.13, green: 0.09, blue: 0.12, alpha: 1)
                : UIColor(red: 0.99, green: 0.95, blue: 0.97, alpha: 1)
        }
    )
}
