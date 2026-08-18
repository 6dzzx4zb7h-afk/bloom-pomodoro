import UIKit
import SwiftUI
import Capacitor

// MARK: - Snapshot model
//
// PLAN 13.4b: this file renders a form; it does not know what any of these
// settings mean. Every string arrives from React, which owns Bloom's copy and
// its `docs/voice.md` obligations, so a new setting needs no change here.

private enum BloomSettingsValue: Decodable, Equatable {
    case bool(Bool)
    case string(String)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let flag = try? container.decode(Bool.self) {
            self = .bool(flag)
            return
        }
        self = .string(try container.decode(String.self))
    }

    var boolValue: Bool { if case let .bool(flag) = self { return flag } else { return false } }
    var stringValue: String { if case let .string(text) = self { return text } else { return "" } }
}

private struct BloomSettingsOption: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
}

/// PLAN 13.4c: one read-only figure in a side-by-side row, carrying the label
/// VoiceOver should speak instead of reading "20 / 4" character by character.
private struct BloomSettingsValueItem: Decodable, Equatable, Identifiable {
    let id: String
    let label: String
    let caption: String
    let spoken: String
}

private struct BloomSettingsRow: Decodable, Equatable, Identifiable {
    let kind: String
    let id: String
    let title: String?
    let subtitle: String?
    let body: String?
    let value: BloomSettingsValue?
    let valueLabel: String?
    let placeholder: String?
    let maxLength: Int?
    let options: [BloomSettingsOption]?
    let items: [BloomSettingsValueItem]?
    let selected: String?
    let role: String?
    let enabled: Bool?
    let status: Bool?
    let canDecrease: Bool?
    let canIncrease: Bool?

    var isEnabled: Bool { enabled ?? true }
}

private struct BloomSettingsSection: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
    let footer: String?
    let rows: [BloomSettingsRow]
}

private struct BloomSettingsSnapshot: Decodable, Equatable {
    let title: String
    let doneTitle: String
    /// Bloom's day/night choice. The sheet follows the app, not the system.
    let appearance: String
    let sections: [BloomSettingsSection]

    var interfaceStyle: UIUserInterfaceStyle { appearance == "dark" ? .dark : .light }
}

private final class BloomSettingsModel: ObservableObject {
    @Published var snapshot: BloomSettingsSnapshot
    /// Sends `(id, value, direction)` back across the bridge.
    var onAction: (String, BloomSettingsValue?, String?) -> Void = { _, _, _ in }
    var onDone: () -> Void = {}

    init(snapshot: BloomSettingsSnapshot) {
        self.snapshot = snapshot
    }
}

// MARK: - A real UIStepper
//
// SwiftUI's Stepper cannot disable one arrow at a time, and the web rows this
// replaces disable `−` at the minimum and `+` at the maximum. UIStepper does
// that natively from its own bounds, so the range stands in for the two flags
// and the value snaps back to neutral after each press.

private struct BloomStepper: UIViewRepresentable {
    let canDecrease: Bool
    let canIncrease: Bool
    let onStep: (String) -> Void

    func makeUIView(context: Context) -> UIStepper {
        let stepper = UIStepper()
        stepper.stepValue = 1
        stepper.autorepeat = false
        stepper.wraps = false
        stepper.addTarget(
            context.coordinator,
            action: #selector(BloomStepperCoordinator.stepped(_:)),
            for: .valueChanged
        )
        return stepper
    }

    func updateUIView(_ stepper: UIStepper, context: Context) {
        context.coordinator.onStep = onStep
        stepper.minimumValue = canDecrease ? -1 : 0
        stepper.maximumValue = canIncrease ? 1 : 0
        stepper.value = 0
    }

    func makeCoordinator() -> BloomStepperCoordinator {
        BloomStepperCoordinator(onStep: onStep)
    }
}

private final class BloomStepperCoordinator: NSObject {
    var onStep: (String) -> Void

    init(onStep: @escaping (String) -> Void) {
        self.onStep = onStep
    }

    @objc func stepped(_ sender: UIStepper) {
        let direction = sender.value > 0 ? "increase" : "decrease"
        // Programmatic assignment does not re-fire .valueChanged, so returning
        // to neutral leaves both arrows live for the next press.
        sender.value = 0
        onStep(direction)
    }
}

// MARK: - Form

private struct BloomSettingsRowView: View {
    let row: BloomSettingsRow
    let send: (String, BloomSettingsValue?, String?) -> Void

    @State private var draft: String = ""
    @FocusState private var editing: Bool

    var body: some View {
        switch row.kind {
        case "switch":
            Toggle(isOn: Binding(
                get: { row.value?.boolValue ?? false },
                set: { send(row.id, .bool($0), nil) }
            )) {
                labelStack(row.title ?? "", row.subtitle)
            }
            .disabled(!row.isEnabled)

        case "stepper":
            HStack {
                labelStack(row.title ?? "", row.subtitle)
                Spacer(minLength: 12)
                Text(row.valueLabel ?? "")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                BloomStepper(
                    canDecrease: row.canDecrease ?? false,
                    canIncrease: row.canIncrease ?? false
                ) { direction in
                    send(row.id, nil, direction)
                }
                .fixedSize()
                .accessibilityLabel(row.title ?? "")
                .accessibilityValue(row.valueLabel ?? "")
            }

        case "segmented":
            VStack(alignment: .leading, spacing: 8) {
                labelStack(row.title ?? "", row.subtitle)
                Picker(row.title ?? "", selection: Binding(
                    get: { row.selected ?? "" },
                    set: { send(row.id, .string($0), nil) }
                )) {
                    ForEach(row.options ?? []) { option in
                        Text(option.title).tag(option.id)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

        case "picker":
            Picker(selection: Binding(
                get: { row.selected ?? "" },
                set: { send(row.id, .string($0), nil) }
            )) {
                ForEach(row.options ?? []) { option in
                    Text(option.title).tag(option.id)
                }
            } label: {
                labelStack(row.title ?? "", row.subtitle)
            }

        case "text":
            VStack(alignment: .leading, spacing: 4) {
                if let subtitle = row.subtitle, !subtitle.isEmpty {
                    labelStack(row.title ?? "", subtitle)
                }
                TextField(
                    row.placeholder ?? "",
                    text: $draft,
                    prompt: row.placeholder.map { Text($0) }
                )
                .focused($editing)
                .submitLabel(.done)
                .accessibilityLabel(row.title ?? "")
                .onAppear { draft = row.value?.stringValue ?? "" }
                .onChange(of: row.value) { _, newValue in
                    // Never fight the keyboard: adopt outside edits only while
                    // this field is not the one being typed in.
                    if !editing { draft = newValue?.stringValue ?? "" }
                }
                .onChange(of: draft) { _, newValue in
                    if let limit = row.maxLength, newValue.count > limit {
                        draft = String(newValue.prefix(limit))
                    }
                }
                .onSubmit { commitText() }
                .onChange(of: editing) { _, focused in
                    if !focused { commitText() }
                }
            }

        case "button":
            Button(role: row.role == "destructive" ? .destructive : nil) {
                send(row.id, nil, nil)
            } label: {
                labelStack(row.title ?? "", row.subtitle)
            }
            .disabled(!row.isEnabled)

        case "disclosure":
            Button {
                send(row.id, nil, nil)
            } label: {
                HStack {
                    labelStack(row.title ?? "", row.subtitle)
                        .foregroundStyle(Color.primary)
                    Spacer(minLength: 12)
                    Image(systemName: "chevron.forward")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .accessibilityAddTraits(.isButton)

        case "values":
            VStack(alignment: .leading, spacing: 8) {
                if let title = row.title, !title.isEmpty {
                    Text(title).font(.subheadline.weight(.semibold))
                }
                HStack(alignment: .top, spacing: 0) {
                    ForEach(row.items ?? []) { item in
                        VStack(spacing: 2) {
                            Text(item.caption)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(item.label)
                                .font(.callout.weight(.semibold))
                                .monospacedDigit()
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(item.spoken)
                    }
                }
            }

        case "note":
            VStack(alignment: .leading, spacing: 4) {
                if let title = row.title, !title.isEmpty {
                    Text(title).font(.subheadline.weight(.semibold))
                }
                Text(row.body ?? "")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits((row.status ?? false) ? .updatesFrequently : [])

        default:
            EmptyView()
        }
    }

    private func commitText() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let current = row.value?.stringValue ?? ""
        guard trimmed != current else {
            draft = current
            return
        }
        // React re-validates and may reject; the snapshot it sends back is what
        // this field then shows.
        send(row.id, .string(trimmed), nil)
    }

    @ViewBuilder
    private func labelStack(_ title: String, _ subtitle: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct BloomSettingsFormView: View {
    @ObservedObject var model: BloomSettingsModel

    var body: some View {
        NavigationStack {
            Form {
                ForEach(model.snapshot.sections) { section in
                    Section {
                        ForEach(section.rows) { row in
                            BloomSettingsRowView(row: row, send: model.onAction)
                        }
                    } header: {
                        Text(section.title)
                    } footer: {
                        if let footer = section.footer, !footer.isEmpty {
                            Text(footer)
                        }
                    }
                }
            }
            .navigationTitle(model.snapshot.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.snapshot.doneTitle) { model.onDone() }
                }
            }
        }
    }
}

// MARK: - Plugin

@objc(BloomSettingsPlugin)
final class BloomSettingsPlugin: CAPPlugin, CAPBridgedPlugin, UIAdaptivePresentationControllerDelegate {
    let identifier = "BloomSettingsPlugin"
    let jsName = "BloomSettings"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise),
    ]

    private var model: BloomSettingsModel?
    private weak var hostingController: UIViewController?

    @objc func present(_ call: CAPPluginCall) {
        let snapshot: BloomSettingsSnapshot
        do {
            snapshot = try call.decode(BloomSettingsSnapshot.self)
        } catch {
            call.reject("Invalid settings snapshot", nil, error)
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else {
                call.resolve(["active": false])
                return
            }
            if let existing = self.model {
                // A second present is how React re-renders the live sheet,
                // including a Night sky toggle made inside the sheet itself.
                existing.snapshot = snapshot
                self.hostingController?.overrideUserInterfaceStyle = snapshot.interfaceStyle
                call.resolve(["active": self.hostingController != nil])
                return
            }

            let model = BloomSettingsModel(snapshot: snapshot)
            model.onAction = { [weak self] id, value, direction in
                self?.publishAction(id: id, value: value, direction: direction)
            }
            model.onDone = { [weak self] in
                self?.closeSettings(notify: true)
            }
            let controller = UIHostingController(rootView: BloomSettingsFormView(model: model))
            controller.presentationController?.delegate = self
            controller.overrideUserInterfaceStyle = snapshot.interfaceStyle
            self.model = model
            self.hostingController = controller
            presenter.present(controller, animated: true) {
                call.resolve(["active": true])
            }
        }
    }

    @objc func dismiss(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.closeSettings(notify: false)
            call.resolve()
        }
    }

    /// Swipe-to-dismiss: the sheet is already gone, so only React needs telling.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        model = nil
        hostingController = nil
        notifyListeners("settingsDismissed", data: [:], retainUntilConsumed: false)
    }

    private func closeSettings(notify: Bool) {
        let controller = hostingController
        model = nil
        hostingController = nil
        controller?.dismiss(animated: true)
        if notify {
            notifyListeners("settingsDismissed", data: [:], retainUntilConsumed: false)
        }
    }

    private func publishAction(id: String, value: BloomSettingsValue?, direction: String?) {
        var data: JSObject = ["id": id]
        switch value {
        // Booleans travel as their own string-encoded key. A Swift Bool put
        // straight into a JSObject did not reach JavaScript as a boolean, so
        // every switch silently did nothing while strings round-tripped fine.
        // The adapter parses this back into a real boolean.
        case let .bool(flag): data["checked"] = flag ? "true" : "false"
        case let .string(text): data["value"] = text
        case nil: break
        }
        if let direction {
            data["direction"] = direction
        }
        // A settings tap is only meaningful to the sheet that is open now;
        // replaying it into a later mount could mutate an unrelated setting.
        notifyListeners("settingsAction", data: data, retainUntilConsumed: false)
    }
}
