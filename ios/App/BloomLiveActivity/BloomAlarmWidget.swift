#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import Foundation
import SwiftUI
import UIKit
import WidgetKit

/// PLAN 13.12 — the system countdown and alert for an authorized Bloom alarm.
///
/// AlarmKit supplies the state; this only decides how it reads. It reuses the
/// PLAN 13.8 extension so a person never sees two Bloom countdowns at once:
/// while an alarm is scheduled the generic activity is ended, and pausing
/// hands the surface back to it.
@available(iOS 26.0, *)
struct BloomAlarmWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<BloomAlarmMetadata>.self) { context in
            BloomAlarmLockScreenView(context: context)
                .activityBackgroundTint(BloomAlarmPalette.background)
                .activitySystemActionForegroundColor(BloomAlarmStyle.tint)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.bloomModeLabel)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    BloomAlarmClock(mode: context.state.mode, compact: false)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 6) {
                        BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                        Text(context.state.mode.bloomStatusLabel)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                    }
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                    .foregroundStyle(BloomAlarmStyle.tint)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(context.state.mode.bloomStatusLabel)
            } compactTrailing: {
                BloomAlarmClock(mode: context.state.mode, compact: true)
            } minimal: {
                BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                    .foregroundStyle(BloomAlarmStyle.tint)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(context.state.mode.bloomStatusLabel)
            }
            .keylineTint(BloomAlarmStyle.tint)
        }
    }
}

/// Only the extension needs this: `Color(uiColor:)` is iOS 15, and the shared
/// file is also compiled into the app target, which deploys further back.
private enum BloomAlarmPalette {
    static let background = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.13, green: 0.09, blue: 0.12, alpha: 1)
                : UIColor(red: 0.99, green: 0.95, blue: 0.97, alpha: 1)
        }
    )
}

@available(iOS 26.0, *)
private struct BloomAlarmLockScreenView: View {
    let context: ActivityViewContext<AlarmAttributes<BloomAlarmMetadata>>

    var body: some View {
        HStack(spacing: 14) {
            BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(BloomAlarmStyle.tint)
                .frame(width: 34, height: 34)
                .background(BloomAlarmStyle.tint.opacity(0.14), in: Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("Bloom")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(context.bloomModeLabel)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }

            Spacer(minLength: 8)

            BloomAlarmClock(mode: context.state.mode, compact: false)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

@available(iOS 26.0, *)
private struct BloomAlarmClock: View {
    let mode: AlarmPresentationState.Mode
    let compact: Bool

    var body: some View {
        Group {
            switch mode {
            case .countdown(let countdown):
                Text(
                    timerInterval: countdown.startDate...countdown.fireDate,
                    countsDown: true,
                    showsHours: true
                )
            case .paused(let paused):
                Text(
                    Self.formatted(
                        paused.totalCountdownDuration - paused.previouslyElapsedDuration
                    )
                )
            case .alert:
                Text("0:00")
            @unknown default:
                Text("0:00")
            }
        }
        .font(
            compact
                ? .caption2.monospacedDigit().weight(.bold)
                : .title2.monospacedDigit().weight(.bold)
        )
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .foregroundStyle(.primary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(mode.bloomClockAccessibilityLabel)
        .accessibilityValue(mode.bloomClockAccessibilityValue)
    }

    static func formatted(_ seconds: TimeInterval) -> String {
        let clamped = max(0, Int(seconds.rounded()))
        let hours = clamped / 3_600
        let minutes = (clamped % 3_600) / 60
        let remainingSeconds = clamped % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, remainingSeconds)
        }
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

@available(iOS 26.0, *)
private struct BloomAlarmGlyph: View {
    let systemName: String

    var body: some View {
        Group {
            if UIImage(systemName: systemName) != nil {
                Image(systemName: systemName)
            } else {
                Circle().frame(width: 8, height: 8)
            }
        }
        .accessibilityHidden(true)
    }
}

@available(iOS 26.0, *)
private extension ActivityViewContext<AlarmAttributes<BloomAlarmMetadata>> {
    /// Names the mode without ever showing what the person is working on.
    var bloomModeLabel: String {
        switch attributes.metadata?.mode {
        case "tiny": return "Tiny focus"
        case "short": return "Short break"
        case "long": return "Long break"
        default: return "Focus"
        }
    }
}

@available(iOS 26.0, *)
private extension AlarmPresentationState.Mode {
    var bloomSymbolName: String {
        switch self {
        case .countdown: return "leaf.fill"
        case .paused: return "pause.fill"
        case .alert: return "bell.fill"
        @unknown default: return "leaf.fill"
        }
    }

    var bloomStatusLabel: String {
        switch self {
        case .countdown: return "Bloom timer"
        case .paused: return "Paused"
        case .alert: return "Timer finished"
        @unknown default: return "Bloom timer"
        }
    }

    var bloomClockAccessibilityLabel: String {
        switch self {
        case .countdown: return "Time remaining"
        case .paused: return "Paused time remaining"
        case .alert: return "Timer finished"
        @unknown default: return "Time remaining"
        }
    }

    var bloomClockAccessibilityValue: Text {
        switch self {
        case .countdown(let countdown):
            return Text(
                timerInterval: countdown.startDate...countdown.fireDate,
                countsDown: true,
                showsHours: true
            )
        case .paused(let paused):
            return Text(
                BloomAlarmClock.formatted(
                    paused.totalCountdownDuration - paused.previouslyElapsedDuration
                )
            )
        case .alert:
            return Text("0 seconds")
        @unknown default:
            return Text("0 seconds")
        }
    }
}
#endif
