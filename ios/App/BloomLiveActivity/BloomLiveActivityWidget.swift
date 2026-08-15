import ActivityKit
import AppIntents
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
                    HStack(spacing: 8) {
                        BloomMark(phase: context.state.phase, size: 26)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Bloom")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                            BloomModeLabel(mode: context.state.mode, compact: true)
                        }
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    BloomActivityClock(
                        state: context.state,
                        compact: false,
                        isStale: context.isStale
                    )
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .bottom, spacing: 12) {
                        BloomActivityProgress(
                            state: context.state,
                            isStale: context.isStale
                        )
                        BloomActivityControl(
                            sessionId: context.attributes.sessionId,
                            state: context.state,
                            isStale: context.isStale
                        )
                    }
                }
            } compactLeading: {
                BloomMark(phase: context.state.phase, size: 18)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(
                        context.state.statusLabel(isStale: context.isStale)
                    )
            } compactTrailing: {
                BloomCompactProgress(
                    state: context.state,
                    isStale: context.isStale
                )
            } minimal: {
                BloomMark(phase: context.state.phase, size: 21)
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
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                BloomMark(phase: context.state.phase, size: 38)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 1) {
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

            HStack(alignment: .bottom, spacing: 12) {
                BloomActivityProgress(
                    state: context.state,
                    isStale: context.isStale
                )
                BloomActivityControl(
                    sessionId: context.attributes.sessionId,
                    state: context.state,
                    isStale: context.isStale
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

private struct BloomActivityControl: View {
    let sessionId: String
    let state: BloomFocusActivityAttributes.ContentState
    let isStale: Bool

    @ViewBuilder
    var body: some View {
        if #available(iOSApplicationExtension 17.0, *), !isStale {
            if state.phase == .running {
                Button(intent: BloomPauseLiveActivityIntent(sessionId: sessionId)) {
                    Label("Pause", systemImage: "pause.fill")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(BloomLiveActivityStyle.accent)
                .accessibilityLabel("Pause Bloom timer")
            } else if state.phase == .paused && (state.pausedRemainingSeconds ?? 0) > 0 {
                Button(intent: BloomResumeLiveActivityIntent(sessionId: sessionId)) {
                    Label("Continue", systemImage: "play.fill")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(BloomLiveActivityStyle.accent)
                .accessibilityLabel("Continue Bloom timer")
            }
        }
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
        .font(
            compact
                ? .caption.monospacedDigit().weight(.bold)
                : .title2.monospacedDigit().weight(.bold)
        )
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

private struct BloomActivityProgress: View {
    let state: BloomFocusActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(spacing: 5) {
            Text(state.progressLabel(isStale: isStale))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            if state.phase == .running && !isStale {
                ProgressView(
                    timerInterval: state.timerStart...state.timerEnd,
                    countsDown: false
                )
                .progressViewStyle(.linear)
                .tint(BloomLiveActivityStyle.accent)
                .labelsHidden()
                .accessibilityLabel("Focus progress")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct BloomCompactProgress: View {
    let state: BloomFocusActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        Group {
            if state.phase == .running && !isStale {
                ProgressView(
                    timerInterval: state.timerStart...state.timerEnd,
                    countsDown: false
                )
                .progressViewStyle(.circular)
                .tint(BloomLiveActivityStyle.petal)
                .labelsHidden()
            } else {
                Image(systemName: state.phase == .paused ? "pause.fill" : "checkmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(BloomLiveActivityStyle.petal)
            }
        }
        .frame(width: 18, height: 18)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.clockAccessibilityLabel(isStale: isStale))
        .accessibilityValue(state.clockAccessibilityValue(isStale: isStale))
    }
}

private struct BloomMark: View {
    let phase: BloomFocusActivityAttributes.ContentState.Phase
    let size: CGFloat

    var body: some View {
        ZStack {
            ForEach(0..<5, id: \.self) { index in
                Circle()
                    .fill(BloomLiveActivityStyle.petal)
                    .frame(width: size * 0.43, height: size * 0.43)
                    .offset(y: -size * 0.27)
                    .rotationEffect(.degrees(Double(index) * 72))
            }

            Circle()
                .fill(BloomLiveActivityStyle.center)
                .frame(width: size * 0.35, height: size * 0.35)

            if phase != .running {
                Circle()
                    .fill(BloomLiveActivityStyle.badgeBackground)
                    .frame(width: size * 0.56, height: size * 0.56)
                Image(systemName: phase == .paused ? "pause.fill" : "checkmark")
                    .font(.system(size: size * 0.25, weight: .bold))
                    .foregroundStyle(BloomLiveActivityStyle.accent)
                    .accessibilityHidden(true)
            }
        }
        .frame(width: size, height: size)
    }
}

private extension BloomFocusActivityAttributes.ContentState {
    func progressLabel(isStale: Bool) -> String {
        switch phase {
        case .running:
            return isStale ? "Open Bloom to finish" : "In progress"
        case .paused:
            return "Paused"
        case .finished:
            return "Finished"
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
    static let petal = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.00, green: 0.58, blue: 0.75, alpha: 1)
                : UIColor(red: 0.76, green: 0.18, blue: 0.43, alpha: 1)
        }
    )
    static let center = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.00, green: 0.86, blue: 0.52, alpha: 1)
                : UIColor(red: 1.00, green: 0.72, blue: 0.22, alpha: 1)
        }
    )
    static let badgeBackground = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.15, green: 0.10, blue: 0.14, alpha: 0.94)
                : UIColor(red: 1.00, green: 0.96, blue: 0.98, alpha: 0.96)
        }
    )
}
