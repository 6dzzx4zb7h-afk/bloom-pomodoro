/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// PLAN 13.14: the switch must not reach for the native overlay bridge on any
// platform, including iOS. Registering the mock proves the component never
// imports or calls it rather than merely that iOS was not detected.
const nativeControl = vi.hoisted(() => ({
  configure: vi.fn(async () => ({ active: true })),
  hide: vi.fn(async () => undefined),
  listen: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
  observe: vi.fn(() => () => undefined),
}));

vi.mock('../native/iosTabs', () => ({
  configureNativeIOSAuxiliaryControl: nativeControl.configure,
  hideNativeIOSAuxiliaryControl: nativeControl.hide,
  isNativeControlSlotVisible: () => true,
  isNativeIOSTabsPlatform: () => true,
  listenForNativeIOSAuxiliaryControlActivation: nativeControl.listen,
  observeNativeControlFrame: nativeControl.observe,
}));

import { SystemSwitch } from './SystemSwitch';

describe('SystemSwitch', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders one accessible, operable switch on every platform', () => {
    const onChange = vi.fn();

    render(
      <SystemSwitch
        nativeId="settings.sound"
        checked={false}
        label="Ring when done"
        onChange={onChange}
      />,
    );

    const control = screen.getByRole('switch', { name: 'Ring when done' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.getAttribute('aria-hidden')).toBeNull();
    expect(control.getAttribute('tabindex')).toBeNull();

    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('never hands the control to a native overlay', () => {
    render(
      <SystemSwitch
        nativeId="settings.flow"
        checked={true}
        label="Flow mode"
        onChange={vi.fn()}
      />,
    );

    expect(nativeControl.configure).not.toHaveBeenCalled();
    expect(nativeControl.observe).not.toHaveBeenCalled();
    expect(nativeControl.listen).not.toHaveBeenCalled();
  });

  it('reports checked state, a distinct screen-reader name, and disabled state', () => {
    const onChange = vi.fn();

    render(
      <SystemSwitch
        nativeId="settings.sound"
        checked={true}
        label="Night sky"
        ariaLabel="Night sky backdrop"
        disabled
        onChange={onChange}
      />,
    );

    const control = screen.getByRole('switch', { name: 'Night sky backdrop' });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect((control as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
