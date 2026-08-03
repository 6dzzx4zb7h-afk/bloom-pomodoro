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

interface NativeTabSelection {
  screen: string;
}

interface NativeSegmentSelection {
  kind: string;
  value: string;
}

interface BloomNavigationPlugin {
  configure(options: NativeTabConfiguration): Promise<{ active: boolean }>;
  configureSegment(options: NativeSegmentConfiguration): Promise<{ active: boolean }>;
  hideSegment(options: { kind: NativeSegmentKind }): Promise<void>;
  addListener(
    eventName: 'tabSelected',
    listener: (event: NativeTabSelection) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'segmentSelected',
    listener: (event: NativeSegmentSelection) => void,
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
): Promise<{ active: boolean }> {
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
  schedule();

  return () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
  };
}
