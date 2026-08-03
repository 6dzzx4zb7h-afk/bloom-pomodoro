/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeControl = vi.hoisted(() => ({
  active: true,
  configure: vi.fn(),
  hide: vi.fn(async () => undefined),
  listener: undefined as
    | ((event: { id: string; value?: boolean }) => void)
    | undefined,
  listenerRemove: vi.fn(async () => undefined),
  nativeIOS: true,
  visible: true,
}));

vi.mock('../native/iosTabs', () => ({
  configureNativeIOSAuxiliaryControl: nativeControl.configure,
  hideNativeIOSAuxiliaryControl: nativeControl.hide,
  isNativeControlSlotVisible: () => nativeControl.visible,
  isNativeIOSTabsPlatform: () => nativeControl.nativeIOS,
  listenForNativeIOSAuxiliaryControlActivation: async (
    listener: (event: { id: string; value?: boolean }) => void,
  ) => {
    nativeControl.listener = listener;
    return { remove: nativeControl.listenerRemove };
  },
  observeNativeControlFrame: (
    _element: HTMLElement,
    listener: (frame: { x: number; y: number; width: number; height: number }) => void,
  ) => {
    listener({ x: 280, y: 120, width: 48, height: 44 });
    return () => undefined;
  },
}));

import { SystemSwitch } from './SystemSwitch';

describe('SystemSwitch native iOS control handoff', () => {
  beforeEach(() => {
    nativeControl.active = true;
    nativeControl.nativeIOS = true;
    nativeControl.visible = true;
    nativeControl.listener = undefined;
    nativeControl.configure.mockReset().mockImplementation(async () => ({
      active: nativeControl.active,
    }));
    nativeControl.hide.mockClear();
    nativeControl.listenerRemove.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the accessible web switch as the non-iOS fallback', () => {
    nativeControl.nativeIOS = false;
    const onChange = vi.fn();

    render(
      <SystemSwitch
        nativeId="settings.sound"
        checked={false}
        label="Ring when done"
        onChange={onChange}
      />,
    );

    const fallback = screen.getByRole('switch', { name: 'Ring when done' });
    expect(fallback.getAttribute('aria-checked')).toBe('false');
    expect(fallback.getAttribute('aria-hidden')).toBeNull();
    expect(nativeControl.configure).not.toHaveBeenCalled();

    fireEvent.click(fallback);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('configures UISwitch from React state and forwards the native boolean exactly', async () => {
    const onChange = vi.fn();

    render(
      <SystemSwitch
        nativeId="settings.sound"
        checked={true}
        label="Ring when done"
        ariaLabel="Ring at timer completion"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(nativeControl.configure).toHaveBeenCalledWith({
      id: 'settings.sound',
      kind: 'switch',
      label: 'Ring when done',
      enabled: true,
      visible: true,
      checked: true,
      frame: { x: 280, y: 120, width: 48, height: 44 },
    }));
    await waitFor(() => {
      const hiddenFallback = screen.getByRole('switch', { hidden: true });
      expect(hiddenFallback.getAttribute('aria-label')).toBe(
        'Ring at timer completion',
      );
      expect(hiddenFallback.getAttribute('aria-hidden')).toBe('true');
      expect(hiddenFallback.getAttribute('tabindex')).toBe('-1');
    });

    nativeControl.listener?.({ id: 'another.switch', value: false });
    nativeControl.listener?.({ id: 'settings.sound', value: false });

    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('retains the clickable web control when native setup is inactive', async () => {
    nativeControl.active = false;
    const onChange = vi.fn();

    render(
      <SystemSwitch
        nativeId="settings.autoStart"
        checked={true}
        label="Auto-start next timer"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(nativeControl.configure).toHaveBeenCalled());
    const fallback = screen.getByRole('switch', { name: 'Auto-start next timer' });
    expect(fallback.getAttribute('aria-hidden')).toBeNull();

    fireEvent.click(fallback);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('falls back after native setup rejects and hides the abandoned overlay', async () => {
    nativeControl.configure.mockRejectedValueOnce(new Error('bridge unavailable'));
    const onChange = vi.fn();

    render(
      <SystemSwitch
        nativeId="settings.flow"
        checked={false}
        label="Flow mode"
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(nativeControl.hide).toHaveBeenCalledWith('settings.flow');
    });
    const fallback = screen.getByRole('switch', { name: 'Flow mode' });
    expect(fallback.getAttribute('aria-hidden')).toBeNull();

    fireEvent.click(fallback);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('removes the listener and hides the native control when unmounted', async () => {
    const { unmount } = render(
      <SystemSwitch
        nativeId="settings.night"
        checked={false}
        label="Night sky"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(nativeControl.listener).toBeTypeOf('function'));
    unmount();

    await waitFor(() => {
      expect(nativeControl.listenerRemove).toHaveBeenCalledTimes(1);
      expect(nativeControl.hide).toHaveBeenCalledWith('settings.night');
    });
  });
});
