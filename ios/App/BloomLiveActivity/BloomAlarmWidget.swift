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
            // No `activityBackgroundTint` — see BloomLiveActivityWidget for
            // why: a dynamic UIColor can resolve against different traits than
            // the text beside it, which is what produced the washed-out iPad
            // card that fixed itself on the next re-render.
            BloomAlarmLockScreenView(context: context)
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
                // Same fill as the PLAN 13.19 activity: iOS gives an active
                // timer the full status-bar width regardless, so this slot
                // names the mode rather than leaving an empty span.
                HStack(spacing: 4) {
                    BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                        .font(.caption2)
                        .frame(width: 14, height: 14)
                    Text(context.bloomCompactLabel)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                }
                .foregroundStyle(BloomAlarmPalette.accent)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(context.state.mode.bloomStatusLabel)
            } compactTrailing: {
                BloomAlarmClock(mode: context.state.mode, compact: true)
            } minimal: {
                BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                    .foregroundStyle(BloomAlarmPalette.accent)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(context.state.mode.bloomStatusLabel)
            }
            .keylineTint(BloomAlarmPalette.accent)
        }
    }
}

private enum BloomAlarmPalette {
    /// One fixed mid-tone, shared with the PLAN 13.8 activity. See
    /// BloomLiveActivityStyle for why this is not a light/dark pair.
    static let accent = BloomAlarmStyle.tint
}

@available(iOS 26.0, *)
private struct BloomAlarmLockScreenView: View {
    let context: ActivityViewContext<AlarmAttributes<BloomAlarmMetadata>>

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    BloomAlarmGlyph(systemName: context.state.mode.bloomSymbolName)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(BloomAlarmPalette.accent)
                        .frame(width: 26, height: 26)
                        .background(BloomAlarmPalette.accent.opacity(0.16), in: Circle())
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(context.bloomModeLabel)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text(context.state.mode.bloomStatusLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                BloomAlarmClock(mode: context.state.mode, compact: false)
                    .font(.system(size: 34, weight: .semibold, design: .rounded).monospacedDigit())

                BloomAlarmProgressBar(mode: context.state.mode)
            }

            Spacer(minLength: 4)

            BloomAlarmTransportControl(
                sessionId: context.attributes.metadata?.sessionId ?? "",
                mode: context.state.mode
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

/// The same pause/resume affordance PLAN 13.19 put on the generic activity.
///
/// PLAN 13.12 shipped this surface with no control, because at the time a
/// second pause site would have meant a second authority. PLAN 13.18's channel
/// removed that objection: the press records intent for the reducer, and
/// AlarmKit's own pause keeps this surface honest in the meantime.
@available(iOS 26.0, *)
private struct BloomAlarmTransportControl: View {
    let sessionId: String
    let mode: AlarmPresentationState.Mode

    var body: some View {
        // Breaks open no session, so there is nothing to address and no
        // control. An alerting alarm is dismissed by the system's own button.
        if !sessionId.isEmpty, let pausing = pauseIntent {
            Group {
                if pausing {
                    Button(intent: BloomAlarmPauseIntent(sessionId: sessionId)) { label(paused: false) }
                } else {
                    Button(intent: BloomAlarmResumeIntent(sessionId: sessionId)) { label(paused: true) }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(pausing ? "Pause timer" : "Resume timer")
        }
    }

    /// True while running, false while paused, nil when neither applies.
    private var pauseIntent: Bool? {
        switch mode {
        case .countdown: return true
        case .paused: return false
        default: return nil
        }
    }

    private func label(paused: Bool) -> some View {
        Image(systemName: paused ? "play.fill" : "pause.fill")
            .font(.body.weight(.bold))
            .foregroundStyle(BloomAlarmPalette.accent)
            .frame(minWidth: 52, minHeight: 52)
            .background(BloomAlarmPalette.accent.opacity(0.16), in: Capsule())
            .contentShape(Capsule())
    }
}

/// System-advanced fill, matching the PLAN 13.19 activity.
@available(iOS 26.0, *)
private struct BloomAlarmProgressBar: View {
    let mode: AlarmPresentationState.Mode

    var body: some View {
        Group {
            switch mode {
            case .countdown(let countdown):
                ProgressView(
                    timerInterval: countdown.startDate...countdown.fireDate,
                    countsDown: false
                ) { EmptyView() } currentValueLabel: { EmptyView() }
            case .paused(let paused):
                ProgressView(
                    value: paused.totalCountdownDuration > 0
                        ? min(1, max(0, paused.previouslyElapsedDuration / paused.totalCountdownDuration))
                        : 0
                )
            default:
                ProgressView(value: 1)
            }
        }
        .progressViewStyle(.linear)
        .tint(BloomAlarmPalette.accent)
        .frame(height: 4)
        // The clock beside it already announces the time.
        .accessibilityHidden(true)
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
                // `showsHours` only when the countdown can actually reach an
                // hour: left always on it reserves room for a leading "0:"
                // that never appears and stretches the compact island.
                Text(
                    timerInterval: countdown.startDate...countdown.fireDate,
                    countsDown: true,
                    showsHours: countdown.fireDate.timeIntervalSince(countdown.startDate) >= 3_600
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
        .modifier(BloomAlarmCompactClockWidth(active: compact, mode: mode))
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

/// Pins the compact clock to the width its own format needs.
@available(iOS 26.0, *)
private struct BloomAlarmCompactClockWidth: ViewModifier {
    let active: Bool
    let mode: AlarmPresentationState.Mode

    func body(content: Content) -> some View {
        if active {
            content.frame(width: needsHours ? 58 : 40, alignment: .trailing)
        } else {
            content
        }
    }

    private var needsHours: Bool {
        switch mode {
        case .countdown(let countdown):
            return countdown.fireDate.timeIntervalSince(countdown.startDate) >= 3_600
        case .paused(let paused):
            return paused.totalCountdownDuration >= 3_600
        default:
            return false
        }
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

    /// One short word for the compact island, sharing a narrow slot.
    var bloomCompactLabel: String {
        switch state.mode {
        case .paused: return "Paused"
        case .alert: return "Done"
        default:
            switch attributes.metadata?.mode {
            case "tiny": return "Tiny"
            case "short": return "Break"
            case "long": return "Break"
            default: return "Focus"
            }
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
