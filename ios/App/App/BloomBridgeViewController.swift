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

/// PLAN 13.8b: React sends only reducer transition state. UIKit derives the
/// visible clock from the stable deadline (or Flow start + accumulator), so a
/// running timer never creates per-second bridge traffic or a second owner of
/// session truth.
private struct BloomTimerSurfaceConfiguration: Decodable {
    let mode: String
    let running: Bool
    let remainingSeconds: Double
    let deadlineMs: Double?
    let flowStartedAtMs: Double?
    let flowAccumulatedSeconds: Double
    let primaryLabel: String
    let secondaryLabel: String
    let enabled: Bool
    let secondaryEnabled: Bool
    let visible: Bool
    let readoutFrame: BloomControlFrame
    let controlsFrame: BloomControlFrame
}

@objc(BloomBridgeViewController)
final class BloomBridgeViewController: CAPBridgeViewController, UITabBarDelegate {
    private let bloomTabBar = UITabBar()
    private let bloomSegmentedControl = UISegmentedControl()
    /// PLAN 13.16: the Liquid Glass the rail floats on, on iOS 26 and later.
    private let bloomSegmentGlass = UIVisualEffectView()
    private let bloomSettingsButton = UIButton(type: .system)
    private let bloomTimerReadout = UILabel()
    private let bloomTimerControls = UIView()
    private let bloomTimerResetButton = UIButton(type: .system)
    private let bloomTimerPrimaryButton = UIButton(type: .system)
    private let bloomTimerSecondaryButton = UIButton(type: .system)
    private let navigationPlugin = BloomNavigationPlugin()
    private let timerSurfacePlugin = BloomTimerSurfacePlugin()
    private let appIconPlugin = BloomAppIconPlugin()
    private let completionAlertPlugin = BloomCompletionAlertPlugin()
    private let liveActivityPlugin = BloomLiveActivityPlugin()
    private let settingsPlugin = BloomSettingsPlugin()
    private var visibleTabs: [BloomTab] = []
    private var segmentKind: String?
    private var segmentItems: [BloomSegmentItem] = []
    private var tabBarHeight: NSLayoutConstraint?
    private var currentAppearance = "system"
    private var timerSurfaceConfiguration: BloomTimerSurfaceConfiguration?
    private var timerSurfaceClock: Timer?
    private var timerSurfaceLastSecond: Int?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        navigationPlugin.tabsController = self
        timerSurfacePlugin.timerController = self
        bridge?.registerPluginInstance(navigationPlugin)
        bridge?.registerPluginInstance(timerSurfacePlugin)
        bridge?.registerPluginInstance(appIconPlugin)
        bridge?.registerPluginInstance(completionAlertPlugin)
        bridge?.registerPluginInstance(liveActivityPlugin)
        bridge?.registerPluginInstance(settingsPlugin)
        installNativeTabBar()
        installNativeSegmentedControl()
        installNativeAuxiliaryControls()
        installNativeTimerSurface()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateTabBarHeight()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        guard currentAppearance == "system",
              previousTraitCollection?.hasDifferentColorAppearance(comparedTo: traitCollection) != false else {
            return
        }
        updateAppearanceTint()
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

    private func installNativeTimerSurface() {
        bloomTimerReadout.isHidden = true
        bloomTimerReadout.backgroundColor = .clear
        bloomTimerReadout.textAlignment = .center
        bloomTimerReadout.adjustsFontForContentSizeCategory = true
        bloomTimerReadout.adjustsFontSizeToFitWidth = true
        bloomTimerReadout.minimumScaleFactor = 0.65
        bloomTimerReadout.accessibilityIdentifier = "bloom-native-timer-readout"
        bloomTimerReadout.isAccessibilityElement = true
        view.addSubview(bloomTimerReadout)

        bloomTimerControls.isHidden = true
        bloomTimerControls.backgroundColor = .clear
        bloomTimerControls.isAccessibilityElement = false
        bloomTimerControls.accessibilityIdentifier = "bloom-native-timer-controls"

        bloomTimerResetButton.accessibilityIdentifier = "bloom-native-timer-reset"
        bloomTimerPrimaryButton.accessibilityIdentifier = "bloom-native-timer-primary"
        bloomTimerSecondaryButton.accessibilityIdentifier = "bloom-native-timer-secondary"
        bloomTimerResetButton.addTarget(
            self,
            action: #selector(nativeTimerResetActivated),
            for: .touchUpInside
        )
        bloomTimerPrimaryButton.addTarget(
            self,
            action: #selector(nativeTimerPrimaryActivated),
            for: .touchUpInside
        )
        bloomTimerSecondaryButton.addTarget(
            self,
            action: #selector(nativeTimerSecondaryActivated),
            for: .touchUpInside
        )
        bloomTimerControls.addSubview(bloomTimerResetButton)
        bloomTimerControls.addSubview(bloomTimerPrimaryButton)
        bloomTimerControls.addSubview(bloomTimerSecondaryButton)
        view.addSubview(bloomTimerControls)
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
        appearance: String,
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

        currentAppearance = ["day", "night", "system"].contains(appearance)
            ? appearance
            : "system"
        switch currentAppearance {
        case "day": overrideUserInterfaceStyle = .light
        case "night": overrideUserInterfaceStyle = .dark
        default: overrideUserInterfaceStyle = .unspecified
        }
        updateAppearanceTint()
        bloomTabBar.isHidden = !visible
        view.bringSubviewToFront(bloomTabBar)
        if !bloomSegmentGlass.isHidden {
            view.bringSubviewToFront(bloomSegmentGlass)
        } else if !bloomSegmentedControl.isHidden {
            view.bringSubviewToFront(bloomSegmentedControl)
        }
        updateTabBarHeight()
    }

    private func updateAppearanceTint() {
        let night = currentAppearance == "night" ||
            (currentAppearance == "system" && traitCollection.userInterfaceStyle == .dark)
        let accentColor = night
            ? UIColor(red: 0.80, green: 0.66, blue: 1.00, alpha: 1)
            : UIColor(red: 0.93, green: 0.31, blue: 0.59, alpha: 1)
        bloomTabBar.tintColor = accentColor
        bloomTabBar.unselectedItemTintColor = .secondaryLabel
        view.tintColor = accentColor
        updateAuxiliaryControlTint(accentColor)
        updateTimerSurfaceTint(accentColor)
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

    private func updateTimerSurfaceTint(_ accentColor: UIColor) {
        bloomTimerReadout.textColor = .label
        for button in [
            bloomTimerResetButton,
            bloomTimerPrimaryButton,
            bloomTimerSecondaryButton,
        ] {
            guard #available(iOS 15.0, *) else {
                button.tintColor = accentColor
                continue
            }
            guard var configuration = button.configuration else {
                button.tintColor = accentColor
                continue
            }
            configuration.baseForegroundColor = accentColor
            button.configuration = configuration
        }
    }

    /// Installs one native in-app timer surface over the measured web fallback
    /// slots. This layer renders time and forwards intent only. It never opens,
    /// completes, resets, or persists a session itself.
    fileprivate func applyTimerSurfaceConfiguration(
        _ configuration: BloomTimerSurfaceConfiguration
    ) -> Bool {
        let modes = ["focus", "flow", "tiny", "short", "long"]
        let primaryLabels = ["Start", "Pause", "Continue"]
        let secondaryLabels = ["Skip", "Finish flow session"]
        let readoutFrame = CGRect(
            x: configuration.readoutFrame.x,
            y: configuration.readoutFrame.y,
            width: configuration.readoutFrame.width,
            height: configuration.readoutFrame.height
        )
        let controlsFrame = CGRect(
            x: configuration.controlsFrame.x,
            y: configuration.controlsFrame.y,
            width: configuration.controlsFrame.width,
            height: configuration.controlsFrame.height
        )
        let numbersAreFinite = [
            configuration.remainingSeconds,
            configuration.flowAccumulatedSeconds,
            readoutFrame.minX,
            readoutFrame.minY,
            readoutFrame.width,
            readoutFrame.height,
            controlsFrame.minX,
            controlsFrame.minY,
            controlsFrame.width,
            controlsFrame.height,
        ].allSatisfy(\.isFinite)
        let runningSourceIsValid = !configuration.running || (
            configuration.mode == "flow"
                ? configuration.flowStartedAtMs?.isFinite == true
                : configuration.deadlineMs?.isFinite == true
        )

        guard
            modes.contains(configuration.mode),
            primaryLabels.contains(configuration.primaryLabel),
            secondaryLabels.contains(configuration.secondaryLabel),
            configuration.remainingSeconds >= 0,
            configuration.flowAccumulatedSeconds >= 0,
            numbersAreFinite,
            runningSourceIsValid,
            readoutFrame.width >= 44,
            readoutFrame.height >= 24,
            controlsFrame.width >= 44,
            controlsFrame.height >= 44
        else {
            hideTimerSurface()
            return false
        }

        timerSurfaceConfiguration = configuration
        timerSurfaceLastSecond = nil
        bloomTimerReadout.frame = readoutFrame.intersection(view.bounds)
        bloomTimerControls.frame = controlsFrame.intersection(view.bounds)
        configureTimerReadoutFont()
        layoutTimerButtons(in: bloomTimerControls.bounds)
        configureTimerButtons(configuration)
        updateTimerReadout()

        let hidden = !configuration.visible
        bloomTimerReadout.isHidden = hidden
        bloomTimerControls.isHidden = hidden
        if !hidden {
            view.bringSubviewToFront(bloomTimerReadout)
            view.bringSubviewToFront(bloomTimerControls)
        }
        refreshTimerSurfaceClock()
        return true
    }

    private func layoutTimerButtons(in bounds: CGRect) {
        let primaryDiameter = min(76, max(44, bounds.height))
        let sideDiameter = min(52, max(44, primaryDiameter * 0.72))
        let desiredSpacing = min(22, max(10, bounds.width * 0.055))
        let contentWidth = sideDiameter * 2 + primaryDiameter + desiredSpacing * 2
        let spacing = contentWidth <= bounds.width
            ? desiredSpacing
            : max(4, (bounds.width - sideDiameter * 2 - primaryDiameter) / 2)
        let actualWidth = sideDiameter * 2 + primaryDiameter + spacing * 2
        let originX = max(0, (bounds.width - actualWidth) / 2)
        bloomTimerResetButton.frame = CGRect(
            x: originX,
            y: (bounds.height - sideDiameter) / 2,
            width: sideDiameter,
            height: sideDiameter
        )
        bloomTimerPrimaryButton.frame = CGRect(
            x: bloomTimerResetButton.frame.maxX + spacing,
            y: (bounds.height - primaryDiameter) / 2,
            width: primaryDiameter,
            height: primaryDiameter
        )
        bloomTimerSecondaryButton.frame = CGRect(
            x: bloomTimerPrimaryButton.frame.maxX + spacing,
            y: (bounds.height - sideDiameter) / 2,
            width: sideDiameter,
            height: sideDiameter
        )
    }

    private func configureTimerButtons(_ configuration: BloomTimerSurfaceConfiguration) {
        configureTimerButton(
            bloomTimerResetButton,
            symbol: "arrow.counterclockwise",
            label: "Reset"
        )
        configureTimerButton(
            bloomTimerPrimaryButton,
            symbol: configuration.running ? "pause.fill" : "play.fill",
            label: configuration.primaryLabel
        )
        configureTimerButton(
            bloomTimerSecondaryButton,
            symbol: configuration.mode == "flow" ? "checkmark" : "forward.end.fill",
            label: configuration.secondaryLabel
        )
        bloomTimerResetButton.isEnabled = configuration.enabled
        bloomTimerPrimaryButton.isEnabled = configuration.enabled
        bloomTimerSecondaryButton.isEnabled =
            configuration.enabled && configuration.secondaryEnabled
    }

    private func configureTimerButton(_ button: UIButton, symbol: String, label: String) {
        let image = UIImage(systemName: symbol)?.applyingSymbolConfiguration(
            UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
        )
        button.accessibilityLabel = label
        button.accessibilityTraits = .button
        if #available(iOS 26.0, *) {
            var configuration = UIButton.Configuration.glass()
            configuration.image = image
            configuration.baseForegroundColor = view.tintColor
            button.configuration = configuration
        } else if #available(iOS 15.0, *) {
            var configuration = UIButton.Configuration.tinted()
            configuration.image = image
            configuration.baseForegroundColor = view.tintColor
            button.configuration = configuration
        } else {
            button.setImage(image, for: .normal)
            button.tintColor = view.tintColor
            button.backgroundColor = .secondarySystemBackground
            button.layer.cornerRadius = min(button.bounds.width, button.bounds.height) / 2
        }
    }

    private func refreshTimerSurfaceClock() {
        timerSurfaceClock?.invalidate()
        timerSurfaceClock = nil
        guard
            let configuration = timerSurfaceConfiguration,
            configuration.visible,
            configuration.running
        else { return }

        let clock = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            self?.updateTimerReadout()
        }
        RunLoop.main.add(clock, forMode: .common)
        timerSurfaceClock = clock
    }

    private func configureTimerReadoutFont() {
        let baseSize = min(54, max(34, bloomTimerReadout.bounds.height * 0.9))
        let baseFont = UIFont.monospacedDigitSystemFont(ofSize: baseSize, weight: .semibold)
        bloomTimerReadout.font = UIFontMetrics(forTextStyle: .largeTitle).scaledFont(
            for: baseFont,
            maximumPointSize: 68
        )
    }

    private func updateTimerReadout() {
        guard let configuration = timerSurfaceConfiguration else { return }
        let seconds: Int
        if configuration.mode == "flow" {
            let live = configuration.running
                ? max(0, Date().timeIntervalSince1970 * 1_000 - (configuration.flowStartedAtMs ?? 0)) / 1_000
                : 0
            seconds = Int(floor(max(0, configuration.flowAccumulatedSeconds + live)))
            bloomTimerReadout.accessibilityLabel = "Elapsed focus time"
        } else {
            let remaining = configuration.running
                ? max(0, ((configuration.deadlineMs ?? 0) - Date().timeIntervalSince1970 * 1_000) / 1_000)
                : configuration.remainingSeconds
            seconds = Int(ceil(max(0, remaining)))
            bloomTimerReadout.accessibilityLabel = "Time remaining"
        }
        guard timerSurfaceLastSecond != seconds else { return }
        timerSurfaceLastSecond = seconds
        bloomTimerReadout.text = timerText(seconds)
        bloomTimerReadout.accessibilityValue = spokenTimerText(seconds)
    }

    private func timerText(_ totalSeconds: Int) -> String {
        let hours = totalSeconds / 3_600
        let minutes = (totalSeconds % 3_600) / 60
        let seconds = totalSeconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }

    private func spokenTimerText(_ totalSeconds: Int) -> String {
        let hours = totalSeconds / 3_600
        let minutes = (totalSeconds % 3_600) / 60
        let seconds = totalSeconds % 60
        var parts: [String] = []
        if hours > 0 { parts.append("\(hours) hour\(hours == 1 ? "" : "s")") }
        if minutes > 0 { parts.append("\(minutes) minute\(minutes == 1 ? "" : "s")") }
        if seconds > 0 || parts.isEmpty {
            parts.append("\(seconds) second\(seconds == 1 ? "" : "s")")
        }
        return parts.joined(separator: ", ")
    }

    fileprivate func hideTimerSurface() {
        timerSurfaceClock?.invalidate()
        timerSurfaceClock = nil
        timerSurfaceConfiguration = nil
        timerSurfaceLastSecond = nil
        bloomTimerReadout.isHidden = true
        bloomTimerControls.isHidden = true
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

    @objc private func nativeTimerResetActivated() {
        timerSurfacePlugin.publishAction("reset")
    }

    @objc private func nativeTimerPrimaryActivated() {
        timerSurfacePlugin.publishAction("primary")
    }

    @objc private func nativeTimerSecondaryActivated() {
        timerSurfacePlugin.publishAction("secondary")
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard visibleTabs.indices.contains(item.tag) else { return }
        navigationPlugin.publishSelection(visibleTabs[item.tag].rawValue)
    }
}

@objc(BloomTimerSurfacePlugin)
final class BloomTimerSurfacePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BloomTimerSurfacePlugin"
    let jsName = "BloomTimerSurface"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
    ]

    weak var timerController: BloomBridgeViewController?

    @objc func configure(_ call: CAPPluginCall) {
        guard let timerController else {
            call.reject("Native timer host is unavailable")
            return
        }
        do {
            let configuration = try call.decode(BloomTimerSurfaceConfiguration.self)
            DispatchQueue.main.async {
                call.resolve([
                    "active": timerController.applyTimerSurfaceConfiguration(configuration)
                ])
            }
        } catch {
            call.reject("Invalid native timer configuration", nil, error)
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        guard let timerController else {
            call.reject("Native timer host is unavailable")
            return
        }
        DispatchQueue.main.async {
            timerController.hideTimerSurface()
            call.resolve()
        }
    }

    func publishAction(_ action: String) {
        notifyListeners(
            "timerAction",
            data: ["action": action],
            retainUntilConsumed: false
        )
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
        let appearance = call.getString("appearance") ?? "system"
        let visible = call.getBool("visible") ?? true

        DispatchQueue.main.async {
            tabsController.applyTabConfiguration(
                selected: selected,
                showGoals: showGoals,
                appearance: appearance,
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
