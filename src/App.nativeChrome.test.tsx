/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeBridge = vi.hoisted(() => ({
  configureTabs: vi.fn(async () => ({ active: true })),
  configureSegment: vi.fn(async () => ({ active: true })),
  hideSegment: vi.fn(async () => undefined),
  configureControl: vi.fn(async () => ({ active: true })),
  hideControl: vi.fn(async () => undefined),
  configureTimer: vi.fn(async (...configuration: [Record<string, unknown>]) => {
    void configuration;
    return { active: true };
  }),
  hideTimer: vi.fn(async () => undefined),
  controlListener: undefined as
    | ((event: { id: string; value?: boolean }) => void)
    | undefined,
  timerListener: undefined as
    | ((action: 'primary' | 'reset' | 'secondary') => void)
    | undefined,
  timerPlatform: true,
}));
const nativeCompletionAlerts = vi.hoisted(() => ({
  readStatus: vi.fn(),
  requestPermission: vi.fn(),
  reconcile: vi.fn(async () => ({ scheduled: false, permission: 'prompt' as const })),
  consume: vi.fn(async () => 'none' as const),
}));

vi.mock('./components/DaySky', () => ({ DaySky: () => null }));
vi.mock('./components/NightSky', () => ({ NightSky: () => null }));
vi.mock('./components/PixelPal', () => ({
  PixelPal: () => <div aria-hidden="true" data-testid="pixel-pal" />,
}));
vi.mock('./components/CompanionPrompt', () => ({ CompanionPrompt: () => null }));
vi.mock('./store/useCompanion', () => ({
  useCompanion: () => ({
    enabled: false,
    conf: { intention: false },
    prompt: null,
    summary: null,
    actions: { returnDrifted: vi.fn() },
  }),
}));
vi.mock('./native/iosTabs', async (importOriginal) => {
  const original = await importOriginal<typeof import('./native/iosTabs')>();
  return {
    ...original,
    isNativeIOSTabsPlatform: () => true,
    configureNativeIOSTabs: nativeBridge.configureTabs,
    configureNativeIOSSegment: nativeBridge.configureSegment,
    hideNativeIOSSegment: nativeBridge.hideSegment,
    configureNativeIOSAuxiliaryControl: nativeBridge.configureControl,
    hideNativeIOSAuxiliaryControl: nativeBridge.hideControl,
    listenForNativeIOSTabSelection: async () => ({ remove: vi.fn() }),
    listenForNativeIOSSegmentSelection: async () => ({ remove: vi.fn() }),
    listenForNativeIOSAuxiliaryControlActivation: async (
      listener: (event: { id: string; value?: boolean }) => void,
    ) => {
      nativeBridge.controlListener = listener;
      return { remove: vi.fn() };
    },
    observeNativeControlFrame: (
      element: HTMLElement,
      onFrame: (frame: { x: number; y: number; width: number; height: number }) => void,
    ) => {
      const frame = { x: 12, y: 96, width: 360, height: 44 };
      Object.defineProperty(element, 'getClientRects', {
        configurable: true,
        value: () => [frame],
      });
      onFrame(frame);
      return () => undefined;
    },
  };
});
vi.mock('./native/iosTimerSurface', async (importOriginal) => {
  const original = await importOriginal<typeof import('./native/iosTimerSurface')>();
  return {
    ...original,
    isNativeIOSTimerSurfacePlatform: () => nativeBridge.timerPlatform,
    configureNativeIOSTimerSurface: nativeBridge.configureTimer,
    hideNativeIOSTimerSurface: nativeBridge.hideTimer,
    listenForNativeIOSTimerAction: async (
      listener: (action: 'primary' | 'reset' | 'secondary') => void,
    ) => {
      nativeBridge.timerListener = listener;
      return { remove: vi.fn() };
    },
  };
});
vi.mock('./native/iosCompletionAlerts', () => ({
  consumeIOSCompletionAlertDelivery: nativeCompletionAlerts.consume,
  isIOSCompletionAlertPlatform: () => true,
  readIOSCompletionAlertStatus: nativeCompletionAlerts.readStatus,
  reconcileIOSCompletionAlert: nativeCompletionAlerts.reconcile,
  requestIOSCompletionAlertPermission: nativeCompletionAlerts.requestPermission,
  UNSUPPORTED_COMPLETION_ALERT_STATUS: {
    permission: 'unsupported',
    alertsEnabled: false,
    soundsEnabled: false,
    lockScreenEnabled: false,
  },
}));

import App from './App';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('native iOS chrome visibility', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    nativeBridge.configureTabs.mockClear();
    nativeBridge.configureSegment.mockClear();
    nativeBridge.hideSegment.mockClear();
    nativeBridge.configureControl.mockClear();
    nativeBridge.hideControl.mockClear();
    nativeBridge.configureTimer.mockClear();
    nativeBridge.hideTimer.mockClear();
    nativeBridge.controlListener = undefined;
    nativeBridge.timerListener = undefined;
    nativeBridge.timerPlatform = true;
    nativeCompletionAlerts.readStatus.mockReset().mockResolvedValue({
      permission: 'prompt',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });
    nativeCompletionAlerts.requestPermission.mockReset().mockResolvedValue({
      permission: 'granted',
      alertsEnabled: true,
      soundsEnabled: true,
      lockScreenEnabled: true,
    });
    nativeCompletionAlerts.reconcile.mockClear();
    nativeCompletionAlerts.consume.mockClear();
    localStorage.setItem('bloom-state', JSON.stringify({
      version: 31,
      settings: { name: 'Mira' },
      ritual: { enabled: false, suggestionSeen: true },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('removes both native rails while Settings owns the Focus surface', async () => {
    render(<App />);

    await waitFor(() => expect(nativeBridge.configureTabs).toHaveBeenCalledWith(
      expect.objectContaining({ visible: true }),
    ));

    await waitFor(() => {
      expect(nativeBridge.configureControl).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'settings',
          kind: 'settingsButton',
          label: 'Settings',
        }),
      );
      expect(nativeBridge.controlListener).toBeTypeOf('function');
    });
    expect(document.querySelector('.gear-btn .gear-icon')).toBeTruthy();

    act(() => nativeBridge.controlListener?.({ id: 'settings' }));

    await waitFor(() => {
      expect(nativeBridge.configureTabs).toHaveBeenLastCalledWith(
        expect.objectContaining({ visible: false }),
      );
      expect(nativeBridge.configureSegment).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'focusModes', visible: false }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    await waitFor(() => {
      expect(nativeBridge.configureTabs).toHaveBeenLastCalledWith(
        expect.objectContaining({ visible: true }),
      );
      expect(nativeBridge.configureSegment).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'focusModes', visible: true }),
      );
    });
  });

  it('follows live system appearance without changing the native appearance enum', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn((_name: string, next: (event: MediaQueryListEvent) => void) => {
        listener = next;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    localStorage.setItem('bloom-state', JSON.stringify({
      version: 33,
      settings: { name: 'Mira', appearance: 'system' },
      ritual: { enabled: false, suggestionSeen: true },
    }));
    const themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    document.head.appendChild(themeColor);

    render(<App />);

    await waitFor(() => expect(nativeBridge.configureTabs).toHaveBeenCalledWith(
      expect.objectContaining({ appearance: 'system' }),
    ));
    expect(document.querySelector('.phone')?.classList.contains('night')).toBe(false);

    act(() => listener?.({ matches: true } as MediaQueryListEvent));

    expect(document.querySelector('.phone')?.classList.contains('night')).toBe(true);
    expect(document.body.classList.contains('night')).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))
      .toBe('#1b1535');
    expect(nativeBridge.configureTabs).toHaveBeenLastCalledWith(
      expect.objectContaining({ appearance: 'system' }),
    );
  });

  it('removes both native rails while the foundations picker owns the Focus surface', async () => {
    localStorage.setItem('bloom-state', JSON.stringify({
      version: 31,
      settings: { name: 'Mira', foundations: true },
      ritual: { enabled: false, suggestionSeen: true },
    }));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Short' }));
    fireEvent.click(await screen.findByRole('button', { name: 'tend' }));

    await waitFor(() => {
      expect(nativeBridge.configureTabs).toHaveBeenLastCalledWith(
        expect.objectContaining({ visible: false }),
      );
      expect(nativeBridge.configureSegment).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'focusModes', visible: false }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close foundations picker' }));

    await waitFor(() => {
      expect(nativeBridge.configureTabs).toHaveBeenLastCalledWith(
        expect.objectContaining({ visible: true }),
      );
      expect(nativeBridge.configureSegment).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'focusModes', visible: true }),
      );
    });
  });

  it('keeps the timer running through the skippable permission explainer and reports denial', async () => {
    nativeCompletionAlerts.requestPermission.mockResolvedValue({
      permission: 'denied',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Get a timer alert?' })).toBeTruthy();
    expect(document.querySelector('.ctrl-play')?.getAttribute('aria-label')).toBe('Pause');
    expect(screen.getByRole('button', { name: 'Close timer alert explanation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'not now' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'allow notifications' }));

    expect(await screen.findByRole('heading', { name: 'Foreground chime only' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Timer alerts are off/);
    expect(screen.queryByRole('button', { name: 'allow notifications' })).toBeNull();
  });

  it('routes native Start, Pause, and Continue through the reducer without per-tick bridge traffic', async () => {
    localStorage.setItem('bloom-state', JSON.stringify({
      version: 33,
      settings: { name: 'Mira', sound: false },
      ritual: { enabled: false, suggestionSeen: true },
    }));
    render(<App />);

    await waitFor(() => {
      expect(nativeBridge.timerListener).toBeTypeOf('function');
      expect(nativeBridge.configureTimer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'focus',
          running: false,
          primaryLabel: 'Start',
        }),
      );
    });

    act(() => nativeBridge.timerListener?.('primary'));
    await waitFor(() => expect(nativeBridge.configureTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'focus',
        running: true,
        remainingSeconds: 0,
        primaryLabel: 'Pause',
        deadlineMs: expect.any(Number),
      }),
    ));

    const callsWhileRunning = nativeBridge.configureTimer.mock.calls.length;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    });
    expect(nativeBridge.configureTimer).toHaveBeenCalledTimes(callsWhileRunning);

    act(() => nativeBridge.timerListener?.('primary'));
    await waitFor(() => expect(nativeBridge.configureTimer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'focus',
        running: false,
        primaryLabel: 'Continue',
      }),
    ));
    const pausedSnapshot = nativeBridge.configureTimer.mock.calls[
      nativeBridge.configureTimer.mock.calls.length - 1
    ]?.[0];
    expect(pausedSnapshot?.remainingSeconds as number).toBeGreaterThan(0);
    expect(pausedSnapshot?.deadlineMs).toBeUndefined();

    act(() => nativeBridge.timerListener?.('primary'));
    await waitFor(() => expect(nativeBridge.configureTimer).toHaveBeenLastCalledWith(
      expect.objectContaining({ running: true, primaryLabel: 'Pause' }),
    ));
  });

  it('retains the accessible React clock and controls when UIKit is unavailable', async () => {
    nativeBridge.timerPlatform = false;
    render(<App />);

    const timer = await screen.findByRole('timer', { name: 'Time remaining' });
    expect(timer.textContent).toBe('25:00');
    expect(timer.getAttribute('aria-hidden')).toBeNull();
    expect(timer.classList.contains('native-timer-slot-ready')).toBe(false);
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(nativeBridge.configureTimer).not.toHaveBeenCalled();
  });
});
