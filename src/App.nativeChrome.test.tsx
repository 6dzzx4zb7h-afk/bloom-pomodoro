/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeBridge = vi.hoisted(() => ({
  configureTabs: vi.fn(async () => ({ active: true })),
  configureSegment: vi.fn(async () => ({ active: true })),
  hideSegment: vi.fn(async () => undefined),
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
    listenForNativeIOSTabSelection: async () => ({ remove: vi.fn() }),
    listenForNativeIOSSegmentSelection: async () => ({ remove: vi.fn() }),
    observeNativeControlFrame: (
      _element: HTMLElement,
      onFrame: (frame: { x: number; y: number; width: number; height: number }) => void,
    ) => {
      onFrame({ x: 12, y: 96, width: 360, height: 44 });
      return () => undefined;
    },
  };
});

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

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

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
});
