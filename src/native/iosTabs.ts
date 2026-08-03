import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';
import type { ScreenName } from '../components/TabBar';
import type { TimerMode } from '../store/useBloom';

export interface NativeTabConfiguration {
  selected: ScreenName;
  showGoals: boolean;
  night: boolean;
  visible: boolean;
}

export type NativeSegmentKind = 'focusModes' | 'collectionSections';

export interface NativeControlFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeSegmentItem {
  id: string;
  title: string;
}

export interface NativeSegmentConfiguration {
  kind: NativeSegmentKind;
  items: NativeSegmentItem[];
  selected: string;
  enabled: boolean;
  visible: boolean;
  frame: NativeControlFrame;
}

export type NativeAuxiliaryControlKind = 'settingsButton' | 'switch';

export interface NativeAuxiliaryControlConfiguration {
  id: string;
  kind: NativeAuxiliaryControlKind;
  label: string;
  enabled: boolean;
  visible: boolean;
  checked?: boolean;
  frame: NativeControlFrame;
}

export interface NativeAuxiliaryControlActivation {
  id: string;
  value?: boolean;
}

interface NativeTabSelection {
  screen: string;
}

interface NativeSegmentSelection {
  kind: string;
  value: string;
}

/**
 * `height` is the room UIKit actually took for the control (PLAN 13.10). The
 * web slot reserves it so the system can never be handed a frame shorter than
 * its own layout needs — that clipped the rail's labels on devices whose text
 * size or iOS version asked for more than the old hard-coded ceiling.
 */
export interface NativeSegmentResult {
  active: boolean;
  height: number;
}

interface BloomNavigationPlugin {
  configure(options: NativeTabConfiguration): Promise<{ active: boolean }>;
  configureSegment(options: NativeSegmentConfiguration): Promise<NativeSegmentResult>;
  hideSegment(options: { kind: NativeSegmentKind }): Promise<void>;
  configureControl(
    options: NativeAuxiliaryControlConfiguration,
  ): Promise<{ active: boolean }>;
  hideControl(options: { id: string }): Promise<void>;
  addListener(
    eventName: 'tabSelected',
    listener: (event: NativeTabSelection) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'segmentSelected',
    listener: (event: NativeSegmentSelection) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'controlActivated',
    listener: (event: NativeAuxiliaryControlActivation) => void,
  ): Promise<PluginListenerHandle>;
}

const bloomNavigation = registerPlugin<BloomNavigationPlugin>('BloomNavigation');

const SCREEN_NAMES: readonly ScreenName[] = [
  'focus',
  'tasks',
  'history',
  'goals',
  'collection',
];

export function isNativeIOSTabsPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export function isNativeTabScreen(value: string): value is ScreenName {
  return SCREEN_NAMES.some((screen) => screen === value);
}

export function configureNativeIOSTabs(
  configuration: NativeTabConfiguration,
): Promise<{ active: boolean }> {
  return bloomNavigation.configure(configuration);
}

export function listenForNativeIOSTabSelection(
  listener: (event: NativeTabSelection) => void,
): Promise<PluginListenerHandle> {
  return bloomNavigation.addListener('tabSelected', listener);
}

export function configureNativeIOSSegment(
  configuration: NativeSegmentConfiguration,
): Promise<NativeSegmentResult> {
  return bloomNavigation.configureSegment(configuration);
}

export function hideNativeIOSSegment(kind: NativeSegmentKind): Promise<void> {
  return bloomNavigation.hideSegment({ kind });
}

export function listenForNativeIOSSegmentSelection(
  listener: (event: NativeSegmentSelection) => void,
): Promise<PluginListenerHandle> {
  return bloomNavigation.addListener('segmentSelected', listener);
}

const NATIVE_AUXILIARY_CONTROL_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/;

export function isNativeAuxiliaryControlID(value: string): boolean {
  return NATIVE_AUXILIARY_CONTROL_ID.test(value);
}

export function configureNativeIOSAuxiliaryControl(
  configuration: NativeAuxiliaryControlConfiguration,
): Promise<{ active: boolean }> {
  if (
    !isNativeAuxiliaryControlID(configuration.id) ||
    !configuration.label.trim() ||
    configuration.label.length > 100 ||
    !Object.values(configuration.frame).every(Number.isFinite)
  ) {
    return Promise.resolve({ active: false });
  }
  return bloomNavigation.configureControl(configuration);
}

export function hideNativeIOSAuxiliaryControl(id: string): Promise<void> {
  if (!isNativeAuxiliaryControlID(id)) return Promise.resolve();
  return bloomNavigation.hideControl({ id });
}

export function listenForNativeIOSAuxiliaryControlActivation(
  listener: (event: NativeAuxiliaryControlActivation) => void,
): Promise<PluginListenerHandle> {
  return bloomNavigation.addListener('controlActivated', listener);
}

export function isNativeTimerMode(value: string): value is TimerMode {
  return ['focus', 'flow', 'tiny', 'short', 'long'].includes(value);
}

export function isNativeCollectionSection(
  value: string,
): value is 'friends' | 'guide' {
  return value === 'friends' || value === 'guide';
}

export function observeNativeControlFrame(
  element: HTMLElement,
  listener: (frame: NativeControlFrame) => void,
): () => void {
  let animationFrame: number | null = null;

  const emit = () => {
    animationFrame = null;
    const rect = element.getBoundingClientRect();
    listener({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
  };
  const schedule = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(emit);
  };

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  resizeObserver?.observe(element);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  // Capture scroll from nested sheets as well as the window. Native overlays
  // do not move with WKWebView content unless React reports the new slot frame.
  document.addEventListener('scroll', schedule, true);
  const mutationObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(schedule);
  mutationObserver?.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['aria-hidden', 'class', 'hidden', 'inert', 'open', 'style'],
  });
  schedule();

  return () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
    document.removeEventListener('scroll', schedule, true);
    mutationObserver?.disconnect();
  };
}

export function isNativeControlSlotVisible(
  element: HTMLElement,
  frame: NativeControlFrame,
): boolean {
  if (frame.width < 1 || frame.height < 1) return false;
  if (element.getClientRects().length === 0) return false;
  if (frame.x + frame.width <= 0 || frame.y + frame.height <= 0) return false;
  if (frame.x >= window.innerWidth || frame.y >= window.innerHeight) return false;

  // The measured element is the fallback slot. Once UIKit is active React
  // deliberately marks that slot aria-hidden and transparent so VoiceOver and
  // touch reach only the native control. Inspecting the slot's own aria-hidden
  // would create a feedback loop that immediately hid the UIKit control too.
  // Modal/inert state is owned by ancestors, which must still hide it.
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    if (
      current.hidden ||
      current.inert ||
      current.getAttribute('aria-hidden') === 'true' ||
      (current instanceof HTMLDetailsElement && !current.open)
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}
