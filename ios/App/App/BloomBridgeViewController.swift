import UIKit
import Capacitor

private enum BloomTab: String, CaseIterable {
    case focus
    case tasks
    case history
    case goals
    case collection

    var title: String {
        switch self {
        case .focus: return "Focus"
        case .tasks: return "Tasks"
        case .history: return "History"
        case .goals: return "Goals"
        case .collection: return "Friends"
        }
    }

    var systemImageName: String {
        switch self {
        case .focus: return "timer"
        case .tasks: return "square.and.pencil"
        case .history: return "clock.arrow.circlepath"
        case .goals: return "flag.fill"
        case .collection: return "heart.fill"
        }
    }
}

private struct BloomSegmentItem: Decodable, Equatable {
    let id: String
    let title: String
}

private struct BloomControlFrame: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

private struct BloomSegmentConfiguration: Decodable {
    let kind: String
    let items: [BloomSegmentItem]
    let selected: String
    let enabled: Bool
    let visible: Bool
    let frame: BloomControlFrame
}

private struct BloomNativeControlConfiguration: Decodable {
    let id: String
    let kind: String
    let label: String
    let enabled: Bool
    let visible: Bool
    let frame: BloomControlFrame
}

@objc(BloomBridgeViewController)
final class BloomBridgeViewController: CAPBridgeViewController, UITabBarDelegate {
    private let bloomTabBar = UITabBar()
    private let bloomSegmentedControl = UISegmentedControl()
    /// PLAN 13.16: the Liquid Glass the rail floats on, on iOS 26 and later.
    private let bloomSegmentGlass = UIVisualEffectView()
    private let bloomSettingsButton = UIButton(type: .system)
    private let navigationPlugin = BloomNavigationPlugin()
    private let appIconPlugin = BloomAppIconPlugin()
    private let completionAlertPlugin = BloomCompletionAlertPlugin()
    private let liveActivityPlugin = BloomLiveActivityPlugin()
    private let settingsPlugin = BloomSettingsPlugin()
    private var visibleTabs: [BloomTab] = []
    private var segmentKind: String?
    private var segmentItems: [BloomSegmentItem] = []
    private var tabBarHeight: NSLayoutConstraint?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        navigationPlugin.tabsController = self
        bridge?.registerPluginInstance(navigationPlugin)
        bridge?.registerPluginInstance(appIconPlugin)
        bridge?.registerPluginInstance(completionAlertPlugin)
        bridge?.registerPluginInstance(liveActivityPlugin)
        bridge?.registerPluginInstance(settingsPlugin)
        installNativeTabBar()
        installNativeSegmentedControl()
        installNativeAuxiliaryControls()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateTabBarHeight()
    }

    private func installNativeTabBar() {
        bloomTabBar.translatesAutoresizingMaskIntoConstraints = false
        bloomTabBar.delegate = self
        bloomTabBar.isHidden = true
        bloomTabBar.isTranslucent = true
        bloomTabBar.accessibilityIdentifier = "bloom-native-tab-bar"

        // Deliberately do not set a background/selection image or material.
        // UIKit owns Liquid Glass, its moving selection lens, and accessibility
        // adaptations on iOS 26 and later; older systems use their native style.
        view.addSubview(bloomTabBar)
        tabBarHeight = bloomTabBar.heightAnchor.constraint(equalToConstant: 49)
        NSLayoutConstraint.activate([
            bloomTabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bloomTabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bloomTabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tabBarHeight!,
        ])
        updateTabBarHeight()
    }

    /// PLAN 13.13: a mid-screen rail is a segmented control on every iOS
    /// version. `UITabBar` is a bottom-anchored, full-width class: on iOS 26 it
    /// draws itself as a floating capsule inset inside its own bounds and
    /// reserves the bottom safe area, so mid-screen it rendered narrower than
    /// its measured slot and cropped its own labels. `UISegmentedControl` fills
    /// the frame it is handed, and iOS 26 gives it the same Liquid Glass
    /// sliding selection indicator. Supply no background, effect, or animation.
    private func installNativeSegmentedControl() {
        bloomSegmentedControl.isHidden = true
        bloomSegmentedControl.isMomentary = false
        bloomSegmentedControl.accessibilityIdentifier = "bloom-native-segmented-control"
        bloomSegmentedControl.addTarget(
            self,
            action: #selector(nativeSegmentChanged(_:)),
            for: .valueChanged
        )

        // PLAN 13.16: a segmented control on its own draws an opaque track, so
        // next to the system tab bar the rail read as flat plastic. Float it on
        // a real `UIGlassEffect` and clear its own unselected track, so the sky
        // refracts through and only the selected segment keeps its own lens.
        // The system owns the material; Bloom sets no colour, blur, or shadow.
        guard #available(iOS 26.0, *) else {
            view.addSubview(bloomSegmentedControl)
            return
        }
        bloomSegmentGlass.effect = UIGlassEffect()
        bloomSegmentGlass.isHidden = true
        bloomSegmentGlass.clipsToBounds = true
        bloomSegmentGlass.layer.cornerCurve = .continuous
        bloomSegmentGlass.accessibilityIdentifier = "bloom-native-segment-glass"
        // Only the view's own fill is cleared. Blanking the `.normal`
        // background image also blanks the selected segment's indicator, which
        // left every mode looking identically unselected.
        bloomSegmentedControl.backgroundColor = .clear
        view.addSubview(bloomSegmentGlass)
        bloomSegmentGlass.contentView.addSubview(bloomSegmentedControl)
    }

    private func installNativeAuxiliaryControls() {
        bloomSettingsButton.isHidden = true
        bloomSettingsButton.accessibilityIdentifier = "bloom-native-settings-button"
        bloomSettingsButton.accessibilityLabel = "Settings"
        bloomSettingsButton.addTarget(
            self,
            action: #selector(nativeSettingsButtonActivated),
            for: .touchUpInside
        )
        view.addSubview(bloomSettingsButton)
    }

    private func updateTabBarHeight() {
        let systemHeight = bloomTabBar.sizeThatFits(
            CGSize(width: view.bounds.width, height: UIView.layoutFittingCompressedSize.height)
        ).height
        tabBarHeight?.constant = max(systemHeight, 49 + view.safeAreaInsets.bottom)
    }

    func applyTabConfiguration(
        selected: String,
        showGoals: Bool,
        night: Bool,
        visible: Bool
    ) {
        let tabs = BloomTab.allCases.filter { showGoals || $0 != .goals }
        if tabs != visibleTabs {
            visibleTabs = tabs
            let items = tabs.enumerated().map { index, tab in
                let item = UITabBarItem(
                    title: tab.title,
                    image: UIImage(systemName: tab.systemImageName),
                    tag: index
                )
                item.accessibilityIdentifier = "bloom-tab-\(tab.rawValue)"
                return item
            }
            bloomTabBar.setItems(items, animated: !bloomTabBar.isHidden)
        }

        let selectedTab = BloomTab(rawValue: selected) ?? .focus
        let selectedIndex = visibleTabs.firstIndex(of: selectedTab) ?? 0
        if let items = bloomTabBar.items, items.indices.contains(selectedIndex) {
            bloomTabBar.selectedItem = items[selectedIndex]
        }

        overrideUserInterfaceStyle = night ? .dark : .light
        let accentColor = night
            ? UIColor(red: 0.80, green: 0.66, blue: 1.00, alpha: 1)
            : UIColor(red: 0.93, green: 0.31, blue: 0.59, alpha: 1)
        bloomTabBar.tintColor = accentColor
        bloomTabBar.unselectedItemTintColor = .secondaryLabel
        view.tintColor = accentColor
        updateAuxiliaryControlTint(accentColor)
        bloomTabBar.isHidden = !visible
        view.bringSubviewToFront(bloomTabBar)
        if !bloomSegmentGlass.isHidden {
            view.bringSubviewToFront(bloomSegmentGlass)
        } else if !bloomSegmentedControl.isHidden {
            view.bringSubviewToFront(bloomSegmentedControl)
        }
        updateTabBarHeight()
    }

    private func updateAuxiliaryControlTint(_ accentColor: UIColor) {
        guard #available(iOS 15.0, *) else {
            bloomSettingsButton.tintColor = accentColor
            return
        }
        guard var configuration = bloomSettingsButton.configuration else {
            bloomSettingsButton.tintColor = accentColor
            return
        }
        configuration.baseForegroundColor = accentColor
        bloomSettingsButton.configuration = configuration
    }

    /// PLAN 13.4a: UIKit owns the visible Settings symbol; React supplies only
    /// validated state, labels, and measured fallback slots. PLAN 13.14 removed
    /// the `switch` kind: a native view placed from JavaScript-measured rects
    /// cannot track WKWebView scrolling, so overlaid switches drifted out of
    /// their rows inside the scrolling Settings sheet. Only fixed chrome —
    /// which the Settings glyph is — may be handed to a native overlay.
    fileprivate func applyNativeControlConfiguration(
        _ configuration: BloomNativeControlConfiguration
    ) -> Bool {
        let identifierPattern = "^[A-Za-z][A-Za-z0-9._:-]{0,79}$"
        let validIdentifier = configuration.id.range(
            of: identifierPattern,
            options: .regularExpression
        ) != nil
        let trimmedLabel = configuration.label.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedFrame = CGRect(
            x: configuration.frame.x,
            y: configuration.frame.y,
            width: configuration.frame.width,
            height: configuration.frame.height
        )
        guard
            validIdentifier,
            !trimmedLabel.isEmpty,
            trimmedLabel.count <= 100,
            requestedFrame.minX.isFinite,
            requestedFrame.minY.isFinite,
            requestedFrame.width.isFinite,
            requestedFrame.height.isFinite,
            requestedFrame.width >= 24,
            requestedFrame.height >= 24
        else {
            hideNativeControl(id: configuration.id)
            return false
        }

        switch configuration.kind {
        case "settingsButton":
            guard configuration.id == "settings", configureSettingsButtonImage() else {
                bloomSettingsButton.isHidden = true
                return false
            }
            bloomSettingsButton.frame = requestedFrame.intersection(view.bounds)
            bloomSettingsButton.isEnabled = configuration.enabled
            bloomSettingsButton.accessibilityLabel = trimmedLabel
            bloomSettingsButton.isHidden = !configuration.visible
            if configuration.visible {
                view.bringSubviewToFront(bloomSettingsButton)
            }
            return true

        default:
            hideNativeControl(id: configuration.id)
            return false
        }
    }

    private func configureSettingsButtonImage() -> Bool {
        guard let image = UIImage(systemName: "gearshape.fill") else {
            // Never hide the web fallback behind a blank SF Symbol.
            return false
        }
        let configuredImage = image.applyingSymbolConfiguration(
            UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
        ) ?? image
        if #available(iOS 26.0, *) {
            var configuration = UIButton.Configuration.glass()
            configuration.image = configuredImage
            configuration.baseForegroundColor = view.tintColor
            bloomSettingsButton.configuration = configuration
        } else if #available(iOS 15.0, *) {
            var configuration = UIButton.Configuration.tinted()
            configuration.image = configuredImage
            configuration.baseForegroundColor = view.tintColor
            bloomSettingsButton.configuration = configuration
        } else {
            bloomSettingsButton.setImage(configuredImage, for: .normal)
            bloomSettingsButton.tintColor = view.tintColor
            bloomSettingsButton.backgroundColor = .secondarySystemBackground
            bloomSettingsButton.layer.cornerRadius = 12
        }
        return true
    }

    fileprivate func hideNativeControl(id: String) {
        if id == "settings" {
            bloomSettingsButton.isHidden = true
        }
    }

    /// Returns the height the native control actually occupies, or nil when no
    /// native control could be placed — the caller reports that back so the web
    /// rail returns as the visible, accessible fallback (PLAN 13.10).
    fileprivate func applySegmentConfiguration(_ configuration: BloomSegmentConfiguration) -> CGFloat? {
        let requestedFrame = CGRect(
            x: configuration.frame.x,
            y: configuration.frame.y,
            width: configuration.frame.width,
            height: configuration.frame.height
        )
        guard
            requestedFrame.minX.isFinite,
            requestedFrame.minY.isFinite,
            requestedFrame.width.isFinite,
            requestedFrame.height.isFinite,
            requestedFrame.width >= 88,
            requestedFrame.height >= 32
        else {
            bloomSegmentedControl.isHidden = true
            bloomSegmentGlass.isHidden = true
            return nil
        }

        let identifiersChanged =
            configuration.kind != segmentKind ||
            configuration.items.map(\.id) != segmentItems.map(\.id)
        if identifiersChanged {
            bloomSegmentedControl.removeAllSegments()
            for (index, item) in configuration.items.enumerated() {
                bloomSegmentedControl.insertSegment(
                    withTitle: item.title,
                    at: index,
                    animated: false
                )
            }
            segmentKind = configuration.kind
            segmentItems = configuration.items
            bloomSegmentedControl.accessibilityIdentifier =
                "bloom-native-segmented-\(configuration.kind)"
        }

        let selectedIndex =
            segmentItems.firstIndex(where: { $0.id == configuration.selected }) ?? 0
        if segmentItems.indices.contains(selectedIndex) {
            bloomSegmentedControl.selectedSegmentIndex = selectedIndex
        }
        bloomSegmentedControl.isEnabled = configuration.enabled

        // `UISegmentedControl` fills the frame it is given and has no
        // safe-area behaviour of its own, so the measured web slot is normally
        // the whole answer. Keep the 13.10 height negotiation as a floor: if a
        // system text size ever asks for more room than the slot reserves, take
        // it and report it back rather than laying the labels out for a taller
        // control and then cropping them (PLAN 13.13).
        let fittedHeight = bloomSegmentedControl.sizeThatFits(
            CGSize(
                width: requestedFrame.width,
                height: UIView.layoutFittingCompressedSize.height
            )
        ).height
        let controlHeight = max(requestedFrame.height, fittedHeight)
        // Anchored to the slot's top edge: a control that grew past its slot
        // must never ride up over the header above it before the web layout
        // has reserved the extra room.
        let controlFrame = CGRect(
            x: requestedFrame.minX,
            y: requestedFrame.minY,
            width: requestedFrame.width,
            height: controlHeight
        )
        let placed = controlFrame.intersection(view.bounds)
        if #available(iOS 26.0, *) {
            bloomSegmentGlass.frame = placed
            bloomSegmentGlass.layer.cornerRadius = placed.height / 2
            bloomSegmentedControl.frame = bloomSegmentGlass.bounds
            bloomSegmentGlass.isHidden = !configuration.visible
            bloomSegmentedControl.isHidden = false
            if configuration.visible {
                view.bringSubviewToFront(bloomSegmentGlass)
            }
        } else {
            bloomSegmentedControl.frame = placed
            bloomSegmentedControl.isHidden = !configuration.visible
            if configuration.visible {
                view.bringSubviewToFront(bloomSegmentedControl)
            }
        }
        return controlHeight
    }

    func hideSegmentedControl(kind: String) {
        guard kind == segmentKind else { return }
        bloomSegmentedControl.isHidden = true
        bloomSegmentGlass.isHidden = true
    }

    @objc private func nativeSegmentChanged(_ sender: UISegmentedControl) {
        guard
            let kind = segmentKind,
            segmentItems.indices.contains(sender.selectedSegmentIndex)
        else { return }
        navigationPlugin.publishSegmentSelection(
            kind: kind,
            value: segmentItems[sender.selectedSegmentIndex].id
        )
    }

    @objc private func nativeSettingsButtonActivated() {
        navigationPlugin.publishControlActivation(id: "settings", value: nil)
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard visibleTabs.indices.contains(item.tag) else { return }
        navigationPlugin.publishSelection(visibleTabs[item.tag].rawValue)
    }
}

@objc(BloomNavigationPlugin)
final class BloomNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomNavigationPlugin"
    let jsName = "BloomNavigation"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureSegment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideSegment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureControl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideControl", returnType: CAPPluginReturnPromise),
    ]

    weak var tabsController: BloomBridgeViewController?

    @objc func configure(_ call: CAPPluginCall) {
        guard let tabsController else {
            call.reject("Native tab controller is unavailable")
            return
        }

        let selected = call.getString("selected") ?? BloomTab.focus.rawValue
        let showGoals = call.getBool("showGoals") ?? false
        let night = call.getBool("night") ?? false
        let visible = call.getBool("visible") ?? true

        DispatchQueue.main.async {
            tabsController.applyTabConfiguration(
                selected: selected,
                showGoals: showGoals,
                night: night,
                visible: visible
            )
            call.resolve(["active": true])
        }
    }

    @objc func configureSegment(_ call: CAPPluginCall) {
        guard let tabsController else {
            call.reject("Native control host is unavailable")
            return
        }

        do {
            let configuration = try call.decode(BloomSegmentConfiguration.self)
            DispatchQueue.main.async {
                // A nil height means no native control could be placed, so the
                // web rail has to come back rather than leaving the screen with
                // no mode control at all (PLAN 13.10).
                guard let height = tabsController.applySegmentConfiguration(configuration) else {
                    call.resolve(["active": false, "height": 0])
                    return
                }
                call.resolve(["active": true, "height": height])
            }
        } catch {
            call.reject("Invalid native segmented-control configuration", nil, error)
        }
    }

    @objc func hideSegment(_ call: CAPPluginCall) {
        guard let tabsController else {
            call.reject("Native control host is unavailable")
            return
        }
        guard let kind = call.getString("kind") else {
            call.reject("Missing segmented-control kind")
            return
        }

        DispatchQueue.main.async {
            tabsController.hideSegmentedControl(kind: kind)
            call.resolve()
        }
    }

    @objc func configureControl(_ call: CAPPluginCall) {
        guard let tabsController else {
            call.reject("Native control host is unavailable")
            return
        }
        do {
            let configuration = try call.decode(BloomNativeControlConfiguration.self)
            DispatchQueue.main.async {
                call.resolve([
                    "active": tabsController.applyNativeControlConfiguration(configuration)
                ])
            }
        } catch {
            call.reject("Invalid native control configuration", nil, error)
        }
    }

    @objc func hideControl(_ call: CAPPluginCall) {
        guard let tabsController else {
            call.reject("Native control host is unavailable")
            return
        }
        guard let id = call.getString("id") else {
            call.reject("Missing native control identifier")
            return
        }
        DispatchQueue.main.async {
            tabsController.hideNativeControl(id: id)
            call.resolve()
        }
    }

    func publishSelection(_ screen: String) {
        notifyListeners(
            "tabSelected",
            data: ["screen": screen],
            retainUntilConsumed: true
        )
    }

    func publishSegmentSelection(kind: String, value: String) {
        notifyListeners(
            "segmentSelected",
            data: ["kind": kind, "value": value],
            retainUntilConsumed: true
        )
    }

    func publishControlActivation(id: String, value: Bool?) {
        var data: JSObject = ["id": id]
        if let value {
            data["value"] = value
        }
        notifyListeners(
            "controlActivated",
            data: data,
            // A UI event is meaningful only to the listener mounted for the
            // currently visible React control. Replaying it could mutate a
            // newly mounted setting with an old tap.
            retainUntilConsumed: false
        )
    }
}
