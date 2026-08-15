import UIKit
import SwiftUI
import Capacitor
import UniformTypeIdentifiers

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
    /// Bloom's Day, Night, or live device appearance choice.
    let appearance: String
    let sections: [BloomSettingsSection]

    var interfaceStyle: UIUserInterfaceStyle {
        switch appearance {
        case "day": return .light
        case "night": return .dark
        default: return .unspecified
        }
    }
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

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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
                .onChange(of: row.value) { newValue in
                    // Never fight the keyboard: adopt outside edits only while
                    // this field is not the one being typed in.
                    if !editing { draft = newValue?.stringValue ?? "" }
                }
                .onChange(of: draft) { newValue in
                    if let limit = row.maxLength, newValue.count > limit {
                        draft = String(newValue.prefix(limit))
                    }
                }
                .onSubmit { commitText() }
                .onChange(of: editing) { focused in
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

@available(iOS 16.0, *)
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
final class BloomSettingsPlugin: CAPPlugin, CAPBridgedPlugin,
    UIAdaptivePresentationControllerDelegate, UIDocumentPickerDelegate {
    let identifier = "BloomSettingsPlugin"
    let jsName = "BloomSettings"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSystemSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickDocument", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmDestructive", returnType: CAPPluginReturnPromise),
    ]

    private var model: BloomSettingsModel?
    private weak var hostingController: UIViewController?
    private weak var documentPicker: UIDocumentPickerViewController?
    private var pendingDocumentCall: CAPPluginCall?
    private let maximumDocumentBytes = 5 * 1_024 * 1_024

    @objc func present(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            // The web sheet stays the whole Settings implementation here.
            call.resolve(["active": false])
            return
        }
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

    /// PLAN 13.11a: the person explicitly chose a recovery action. Opening the
    /// app-specific system page neither infers nor writes permission state;
    /// React refreshes UserNotifications and ActivityKit when Bloom returns.
    @objc func openSystemSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.resolve(["opened": false])
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.canOpenURL(url) else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    /// PLAN 13.4d: React generates the canonical bytes. Native writes them
    /// only after the person taps an export action, presents the system share
    /// sheet, and removes Bloom's temporary copy when the sheet finishes.
    @objc func exportFile(_ call: CAPPluginCall) {
        guard
            let fileName = call.getString("fileName"),
            isSafeFileName(fileName),
            let mimeType = call.getString("mimeType"),
            mimeType == "application/json" || mimeType == "text/csv",
            let contents = call.getString("contents"),
            let data = contents.data(using: .utf8),
            data.count <= maximumDocumentBytes
        else {
            call.reject("Invalid export file")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else {
                call.reject("Export did not finish")
                return
            }
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("bloom-export-\(UUID().uuidString)", isDirectory: true)
            let fileURL = directory.appendingPathComponent(fileName, isDirectory: false)
            do {
                try FileManager.default.createDirectory(
                    at: directory,
                    withIntermediateDirectories: true
                )
                try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("Could not prepare the export file", nil, error)
                return
            }

            DispatchQueue.main.async { [weak self] in
                guard let self, let presenter = self.presentationHost(),
                      presenter.presentedViewController == nil else {
                    try? FileManager.default.removeItem(at: directory)
                    call.reject("Another native presentation is already open")
                    return
                }
                let controller = UIActivityViewController(
                    activityItems: [fileURL],
                    applicationActivities: nil
                )
                controller.popoverPresentationController?.sourceView = presenter.view
                controller.popoverPresentationController?.sourceRect = CGRect(
                    x: presenter.view.bounds.midX,
                    y: presenter.view.bounds.midY,
                    width: 1,
                    height: 1
                )
                controller.completionWithItemsHandler = { _, completed, _, _ in
                    try? FileManager.default.removeItem(at: directory)
                    call.resolve(["completed": completed])
                }
                presenter.present(controller, animated: true)
            }
        }
    }

    /// The system picker is the consent boundary: Bloom cannot inspect a file
    /// until the person chooses it. The selected security-scoped document is
    /// bounded and decoded locally, then the existing React parser/migrator
    /// decides whether it is a valid Bloom backup.
    @objc func pickDocument(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.pendingDocumentCall == nil,
                  let presenter = self.presentationHost(),
                  presenter.presentedViewController == nil else {
                call.reject("Another native presentation is already open")
                return
            }
            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: [.json],
                asCopy: true
            )
            picker.allowsMultipleSelection = false
            picker.delegate = self
            self.pendingDocumentCall = call
            self.documentPicker = picker
            presenter.present(picker, animated: true)
        }
    }

    /// Clearing history remains a React action. Native owns only the alert
    /// presentation and returns one boolean, so dismissals cannot mutate data.
    @objc func confirmDestructive(_ call: CAPPluginCall) {
        guard
            let title = bounded(call.getString("title"), limit: 120),
            let message = bounded(call.getString("message"), limit: 600),
            let confirmTitle = bounded(call.getString("confirmTitle"), limit: 120),
            let cancelTitle = bounded(call.getString("cancelTitle"), limit: 120)
        else {
            call.reject("Invalid confirmation")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.presentationHost(),
                  presenter.presentedViewController == nil else {
                call.reject("Another native presentation is already open")
                return
            }
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: cancelTitle, style: .cancel) { _ in
                call.resolve(["confirmed": false])
            })
            alert.addAction(UIAlertAction(title: confirmTitle, style: .destructive) { _ in
                call.resolve(["confirmed": true])
            })
            presenter.present(alert, animated: true)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishDocumentCall(["canceled": true])
    }

    func documentPicker(
        _ controller: UIDocumentPickerViewController,
        didPickDocumentsAt urls: [URL]
    ) {
        guard let url = urls.first, urls.count == 1 else {
            finishDocumentCall(["canceled": true])
            return
        }
        let call = pendingDocumentCall
        pendingDocumentCall = nil
        documentPicker = nil
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self, let call else { return }
            let accessing = url.startAccessingSecurityScopedResource()
            defer {
                if accessing { url.stopAccessingSecurityScopedResource() }
            }
            do {
                let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                guard values.isRegularFile == true else {
                    call.reject("The chosen item is not a file")
                    return
                }
                if let size = values.fileSize, size > self.maximumDocumentBytes {
                    call.reject("That backup is too large")
                    return
                }
                let data = try Data(contentsOf: url, options: [.mappedIfSafe])
                guard data.count <= self.maximumDocumentBytes else {
                    call.reject("That backup is too large")
                    return
                }
                guard let contents = String(data: data, encoding: .utf8) else {
                    call.reject("That backup is not UTF-8 text")
                    return
                }
                call.resolve([
                    "canceled": false,
                    "fileName": String(url.lastPathComponent.prefix(120)),
                    "size": data.count,
                    "contents": contents,
                ])
            } catch {
                call.reject("That file could not be read", nil, error)
            }
        }
    }

    /// Swipe-to-dismiss: the sheet is already gone, so only React needs telling.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        model = nil
        hostingController = nil
        notifyListeners("settingsDismissed", data: [:], retainUntilConsumed: false)
    }

    private func closeSettings(notify: Bool) {
        if let call = pendingDocumentCall {
            pendingDocumentCall = nil
            documentPicker = nil
            call.resolve(["canceled": true])
        }
        let controller = hostingController
        model = nil
        hostingController = nil
        controller?.dismiss(animated: true)
        if notify {
            notifyListeners("settingsDismissed", data: [:], retainUntilConsumed: false)
        }
    }

    private func presentationHost() -> UIViewController? {
        hostingController ?? bridge?.viewController
    }

    private func finishDocumentCall(_ result: JSObject) {
        let call = pendingDocumentCall
        pendingDocumentCall = nil
        documentPicker = nil
        call?.resolve(result)
    }

    private func bounded(_ value: String?, limit: Int) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= limit else { return nil }
        return trimmed
    }

    private func isSafeFileName(_ value: String) -> Bool {
        guard value.count <= 120,
              value == URL(fileURLWithPath: value).lastPathComponent,
              value.first?.isLetter == true || value.first?.isNumber == true else {
            return false
        }
        return value.unicodeScalars.allSatisfy { scalar in
            CharacterSet.alphanumerics.contains(scalar) || "._ -".unicodeScalars.contains(scalar)
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
