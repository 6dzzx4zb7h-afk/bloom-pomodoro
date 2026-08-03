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

@objc(BloomBridgeViewController)
final class BloomBridgeViewController: CAPBridgeViewController, UITabBarDelegate {
    private let bloomTabBar = UITabBar()
    private let bloomSegmentTabBar = UITabBar()
    private let bloomSegmentedControl = UISegmentedControl()
    private let navigationPlugin = BloomNavigationPlugin()
    private let appIconPlugin = BloomAppIconPlugin()
    private var visibleTabs: [BloomTab] = []
    private var segmentKind: String?
    private var segmentItems: [BloomSegmentItem] = []
    private var tabBarHeight: NSLayoutConstraint?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        navigationPlugin.tabsController = self
        bridge?.registerPluginInstance(navigationPlugin)
        bridge?.registerPluginInstance(appIconPlugin)
        installNativeTabBar()
        installNativeSegmentedControl()
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

    private func installNativeSegmentedControl() {
        if #available(iOS 26.0, *) {
            // Use the same system control as primary navigation so the compact
            // rail and moving Liquid Glass selection lens are identical. Do
            // not supply a background, effect, mask, or selection animation.
            bloomSegmentTabBar.delegate = self
            bloomSegmentTabBar.isHidden = true
            bloomSegmentTabBar.isTranslucent = true
            bloomSegmentTabBar.accessibilityIdentifier = "bloom-native-segment-tab-bar"
            view.addSubview(bloomSegmentTabBar)
            return
        }

        bloomSegmentedControl.isHidden = true
        bloomSegmentedControl.isMomentary = false
        bloomSegmentedControl.accessibilityIdentifier = "bloom-native-segmented-control"
        bloomSegmentedControl.addTarget(
            self,
            action: #selector(nativeSegmentChanged(_:)),
            for: .valueChanged
        )
        view.addSubview(bloomSegmentedControl)
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
        bloomSegmentTabBar.tintColor = accentColor
        bloomSegmentTabBar.unselectedItemTintColor = .secondaryLabel
        view.tintColor = accentColor
        bloomTabBar.isHidden = !visible
        view.bringSubviewToFront(bloomTabBar)
        if !bloomSegmentTabBar.isHidden {
            view.bringSubviewToFront(bloomSegmentTabBar)
        } else if !bloomSegmentedControl.isHidden {
            view.bringSubviewToFront(bloomSegmentedControl)
        }
        updateTabBarHeight()
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
            bloomSegmentTabBar.isHidden = true
            return nil
        }

        if #available(iOS 26.0, *) {
            let identifiersChanged =
                configuration.kind != segmentKind ||
                configuration.items.map(\.id) != segmentItems.map(\.id)
            if identifiersChanged {
                segmentKind = configuration.kind
                segmentItems = configuration.items
                let items = configuration.items.enumerated().map { index, item in
                    let tabItem = UITabBarItem(
                        title: item.title,
                        image: nil,
                        tag: index
                    )
                    tabItem.accessibilityIdentifier =
                        "bloom-segment-\(configuration.kind)-\(item.id)"
                    return tabItem
                }
                bloomSegmentTabBar.setItems(items, animated: !bloomSegmentTabBar.isHidden)
                bloomSegmentTabBar.accessibilityIdentifier =
                    "bloom-native-segment-tab-bar-\(configuration.kind)"
            }

            let selectedIndex =
                segmentItems.firstIndex(where: { $0.id == configuration.selected }) ?? 0
            if let items = bloomSegmentTabBar.items, items.indices.contains(selectedIndex) {
                bloomSegmentTabBar.selectedItem = items[selectedIndex]
            }
            bloomSegmentTabBar.isUserInteractionEnabled = configuration.enabled
            bloomSegmentTabBar.alpha = configuration.enabled ? 1 : 0.55

            // PLAN 13.10: `sizeThatFits` on a UITabBar reserves the bottom
            // safe-area inset, because a tab bar normally sits at the very
            // bottom of the screen. This rail floats mid-screen, so that inset
            // is dead space — subtract it to get the height the items really
            // need. The old code instead clamped the whole thing to 58pt, which
            // holds only while the system wants less. Once a larger text size
            // pushed the items past 58 they were laid out for a taller bar and
            // then cropped: labels cut off along the bottom edge with the
            // selection lens floating above them. Take what UIKit asks for and
            // report it back so the web slot reserves the same room.
            let fittedHeight = bloomSegmentTabBar.sizeThatFits(
                CGSize(
                    width: requestedFrame.width,
                    height: UIView.layoutFittingCompressedSize.height
                )
            ).height
            let systemHeight = max(0, fittedHeight - view.safeAreaInsets.bottom)
            let controlHeight = max(requestedFrame.height, systemHeight)
            let controlFrame = CGRect(
                x: requestedFrame.minX,
                y: requestedFrame.midY - controlHeight / 2,
                width: requestedFrame.width,
                height: controlHeight
            )
            bloomSegmentTabBar.frame = controlFrame.intersection(view.bounds)
            bloomSegmentTabBar.isHidden = !configuration.visible
            if configuration.visible {
                view.bringSubviewToFront(bloomSegmentTabBar)
            }
            return controlHeight
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

        // Pre-iOS-26 `UISegmentedControl` sizes itself to the slot it is given,
        // so the web layout already reserves the right room.
        bloomSegmentedControl.frame = requestedFrame.intersection(view.bounds)
        bloomSegmentedControl.isHidden = !configuration.visible
        if configuration.visible {
            view.bringSubviewToFront(bloomSegmentedControl)
        }
        return requestedFrame.height
    }

    func hideSegmentedControl(kind: String) {
        guard kind == segmentKind else { return }
        bloomSegmentedControl.isHidden = true
        bloomSegmentTabBar.isHidden = true
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

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        if tabBar === bloomSegmentTabBar {
            guard
                let kind = segmentKind,
                segmentItems.indices.contains(item.tag)
            else { return }
            navigationPlugin.publishSegmentSelection(
                kind: kind,
                value: segmentItems[item.tag].id
            )
            return
        }

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
}
