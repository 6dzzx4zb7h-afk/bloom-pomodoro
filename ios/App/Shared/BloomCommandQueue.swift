import Foundation

/// PLAN 13.18 — one command a control in system UI leaves for the reducer.
///
/// The React reducer is the only timer/session authority. A `LiveActivityIntent`
/// performs in the app's process, but the WebView's JavaScript is suspended at
/// that moment, so nothing can be called synchronously. An intent therefore
/// records *intent* — what was pressed, for which session, and at what instant —
/// and the reducer decides what it means when JS next runs.
///
/// `occurredAt` is the load-bearing field. Bloom's timer is wall-clock based, so
/// a pause recorded at `T` reconstructs exactly as `endsAt - T` however much
/// later the drain happens. Replay is lossless rather than approximate, which is
/// what lets this channel exist without becoming a second authority.
struct BloomCommand: Codable, Hashable {
    /// Idempotency key. Delivery is at-least-once, so applying twice must be a
    /// no-op rather than a second pause.
    let id: String
    /// `pause` and `resume` today; PLAN 13.20 adds the check-in answers.
    let kind: String
    /// The reducer's open-session id. A command whose session is gone is
    /// dropped, so a queue surviving a force-quit cannot revive a session the
    /// boot sweep already closed as `interrupted`.
    let sessionId: String
    /// Epoch milliseconds, the wall clock the reducer replays against.
    let occurredAt: Double
}

/// The durable queue itself.
///
/// Storage is `UserDefaults.standard` in the app's own container rather than an
/// App Group: `LiveActivityIntent` performs in the app's process, so the intent
/// can write here directly and Bloom needs no extra entitlement. See
/// `docs/adr/0001-native-command-channel.md` for when that stops being true.
enum BloomCommandQueue {
    static let storageKey = "dev.bloom.pomodoro.commands.pending"

    /// Every command is a physical tap that itself wakes the app to drain, so
    /// reaching this cap already means something is wrong. The cap exists so a
    /// pathological state stays bounded, not as an expected working limit.
    static let maxCommands = 32

    private static let defaults = UserDefaults.standard

    /// Append one command, oldest-first. Overflow drops from the front: the
    /// most recent intent is the one most likely to still match a live session.
    static func append(_ command: BloomCommand) {
        var pending = peekAll()
        // Re-appending a known id must not queue it twice.
        guard !pending.contains(where: { $0.id == command.id }) else { return }
        pending.append(command)
        if pending.count > maxCommands {
            pending.removeFirst(pending.count - maxCommands)
        }
        write(pending)
    }

    /// Read without removing. Acknowledgement is a separate call so a crash
    /// between applying and acknowledging re-delivers rather than loses.
    static func peekAll() -> [BloomCommand] {
        guard let data = defaults.data(forKey: storageKey) else { return [] }
        guard let decoded = try? JSONDecoder().decode([BloomCommand].self, from: data) else {
            // A blob this build cannot read is not a blob it can act on. Drop it
            // rather than throwing on every drain for the life of the install.
            defaults.removeObject(forKey: storageKey)
            return []
        }
        return decoded
    }

    /// Remove the commands the reducer has actually applied.
    static func acknowledge(ids: [String]) {
        guard !ids.isEmpty else { return }
        let acknowledged = Set(ids)
        write(peekAll().filter { !acknowledged.contains($0.id) })
    }

    /// Used by the confirmed data clear: pending intent for erased data is not
    /// intent worth keeping.
    static func clear() {
        defaults.removeObject(forKey: storageKey)
    }

    private static func write(_ commands: [BloomCommand]) {
        guard !commands.isEmpty else {
            defaults.removeObject(forKey: storageKey)
            return
        }
        guard let data = try? JSONEncoder().encode(commands) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
