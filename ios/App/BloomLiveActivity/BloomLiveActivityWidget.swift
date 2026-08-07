import ActivityKit
import Foundation
import SwiftUI
import UIKit
import WidgetKit

#if canImport(AppIntents)
import AppIntents
#endif

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
                        BloomStatusGlyph(systemName: context.state.symbolName)
                            .foregroundStyle(BloomLiveActivityStyle.accent)
                            .accessibilityHidden(true)
                        BloomModeLabel(mode: context.state.mode, compact: false)
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
                    VStack(spacing: 10) {
                        BloomProgressBar(state: context.state, isStale: context.isStale)
                        BloomTransportControl(
                            sessionId: context.attributes.sessionId,
                            state: context.state,
                            isStale: context.isStale,
                            style: .wide
                        )
                    }
                    .padding(.top, 2)
                }
            } compactLeading: {
                // iOS gives an active timer activity the full status-bar width
                // whatever these regions ask for, so the leading slot names the
                // mode rather than leaving a wide empty span beside the glyph.
                HStack(spacing: 4) {
                    BloomStatusGlyph(systemName: context.state.symbolName)
                        .font(.caption2)
                        .frame(width: 14, height: 14)
                    Text(context.state.compactLabel(isStale: context.isStale))
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                }
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

/// PLAN 13.19 — the Lock Screen presentation.
///
/// The clock is the focal point, the mode names itself under it, and a quiet
/// bar carries the progress the old single-row layout left to imagination. Task
/// text and session targets stay absent by construction (PLAN 13.8): the
/// attributes never carry them, so no layout change here can leak them.
private struct BloomLockScreenView: View {
    let context: ActivityViewContext<BloomFocusActivityAttributes>

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    BloomStatusGlyph(systemName: context.state.symbolName)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(BloomLiveActivityStyle.accent)
                        .frame(width: 26, height: 26)
                        .background(
                            BloomLiveActivityStyle.accent.opacity(0.16),
                            in: Circle()
                        )
                        .accessibilityHidden(true)

                    if context.isStale && context.state.phase == .running {
                        Text("Timer reached zero — open Bloom")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                    } else {
                        VStack(alignment: .leading, spacing: 1) {
                            BloomModeLabel(mode: context.state.mode, compact: false)
                            Text(context.state.statusLabel(isStale: context.isStale))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }

                BloomActivityClock(
                    state: context.state,
                    compact: false,
                    isStale: context.isStale
                )
                // Large enough to be the focal point, conservative enough that
                // "1:04:59" still has room — iOS drops to a minutes-only
                // rendering when a timer string cannot fit its slot.
                .font(.system(size: 34, weight: .semibold, design: .rounded).monospacedDigit())

                BloomProgressBar(state: context.state, isStale: context.isStale)
            }

            Spacer(minLength: 4)

            BloomTransportControl(
                sessionId: context.attributes.sessionId,
                state: context.state,
                isStale: context.isStale,
                style: .tall
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

/// Pause and resume, over PLAN 13.18's channel.
///
/// Deliberately the only controls here. Skip ends a session, and PLAN 8.14
/// established that Bloom guards a running timer against accidental
/// destruction — a control that cannot be confirmed and sits under a thumb on a
/// Lock Screen is the wrong home for it. Pause is safe precisely because a
/// mis-tap costs nothing and undoes itself.
private struct BloomTransportControl: View {
    enum Style {
        case tall
        case wide
    }

    let sessionId: String
    let state: BloomFocusActivityAttributes.ContentState
    let isStale: Bool
    let style: Style

    var body: some View {
        #if canImport(AppIntents)
        if #available(iOS 17.0, *), state.phase != .finished, !isStale {
            let pausing = state.phase == .running
            Group {
                if pausing {
                    Button(intent: BloomPauseIntent(sessionId: sessionId)) {
                        label
                    }
                } else {
                    Button(intent: BloomResumeIntent(sessionId: sessionId)) {
                        label
                    }
                }
            }
            .buttonStyle(.plain)
            .tint(BloomLiveActivityStyle.accent)
            .accessibilityLabel(pausing ? "Pause timer" : "Resume timer")
        }
        #endif
    }

    @ViewBuilder
    private var label: some View {
        let pausing = state.phase == .running
        Group {
            // The Lock Screen slot is narrow, so it carries the glyph alone;
            // the expanded Dynamic Island has room to name the action.
            if style == .tall {
                Image(systemName: pausing ? "pause.fill" : "play.fill")
                    .font(.body.weight(.bold))
            } else {
                Label {
                    Text(pausing ? "Pause" : "Resume")
                        .font(.footnote.weight(.semibold))
                } icon: {
                    Image(systemName: pausing ? "pause.fill" : "play.fill")
                        .font(.footnote.weight(.bold))
                }
            }
        }
        .foregroundStyle(BloomLiveActivityStyle.accent)
        .frame(
            minWidth: style == .tall ? 52 : 96,
            minHeight: style == .tall ? 52 : 34
        )
        .background(
            BloomLiveActivityStyle.accent.opacity(0.16),
            in: Capsule()
        )
        .contentShape(Capsule())
    }
}

/// A quiet, system-advanced progress bar.
///
/// `ProgressView(timerInterval:)` lets the system fill it without per-second
/// bridge traffic, exactly as `Text(timerInterval:)` advances the clock.
private struct BloomProgressBar: View {
    let state: BloomFocusActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        Group {
            if state.phase == .running && !isStale {
                ProgressView(timerInterval: state.timerStart...state.timerEnd, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
            } else {
                ProgressView(value: fractionElapsed)
            }
        }
        .progressViewStyle(.linear)
        .tint(BloomLiveActivityStyle.accent)
        .frame(height: 4)
        // The clock beside it already announces the time; a second spoken
        // progress value would just be noise in VoiceOver.
        .accessibilityHidden(true)
    }

    private var fractionElapsed: Double {
        let total = state.timerEnd.timeIntervalSince(state.timerStart)
        guard total > 0 else { return isStale ? 1 : 0 }
        guard let remaining = state.pausedRemainingSeconds else { return isStale ? 1 : 0 }
        return min(1, max(0, 1 - Double(remaining) / total))
    }
}

private struct BloomModeLabel: View {
    let mode: String
    let compact: Bool

    var body: some View {
        Text(mode == "tiny" ? "Tiny focus" : "Focus")
            .font(compact ? .caption2.weight(.semibold) : .subheadline.weight(.semibold))
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
                // `showsHours` is asked for only when the session really runs
                // past an hour. Left always-on it reserves room for a leading
                // "0:" that never appears, which is what stretched the compact
                // Dynamic Island wider than its content.
                Text(
                    timerInterval: state.timerStart...state.timerEnd,
                    countsDown: true,
                    showsHours: state.needsHours
                )
            } else {
                Text(Self.formattedRemaining(state.pausedRemainingSeconds ?? 0))
            }
        }
        .font(compact ? .caption2.monospacedDigit().weight(.bold) : .title2.monospacedDigit().weight(.bold))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .foregroundStyle(.primary)
        // A self-advancing timer string still reserves layout width for the
        // widest value it can reach, so the compact slot is given exactly the
        // width its own format needs and no more.
        .modifier(BloomCompactClockWidth(active: compact, needsHours: state.needsHours))
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

/// Pins the compact Dynamic Island clock to the width its format needs.
private struct BloomCompactClockWidth: ViewModifier {
    let active: Bool
    let needsHours: Bool

    func body(content: Content) -> some View {
        if active {
            content.frame(width: needsHours ? 58 : 40, alignment: .trailing)
        } else {
            content
        }
    }
}

private extension BloomFocusActivityAttributes.ContentState {
    /// True only when this session can actually show an hours component.
    var needsHours: Bool {
        if let paused = pausedRemainingSeconds {
            return paused >= 3_600
        }
        return timerEnd.timeIntervalSince(timerStart) >= 3_600
    }

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

    /// One short word for the compact island — it shares a narrow slot with the
    /// glyph, so it names the state rather than describing it.
    func compactLabel(isStale: Bool) -> String {
        switch phase {
        case .running:
            if isStale { return "Done" }
            return mode == "tiny" ? "Tiny" : "Focus"
        case .paused:
            return "Paused"
        case .finished:
            return "Done"
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
