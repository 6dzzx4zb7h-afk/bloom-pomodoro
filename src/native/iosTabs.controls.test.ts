/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
  configure: vi.fn(async () => ({ active: true })),
  configureControl: vi.fn(async () => ({ active: true })),
  configureSegment: vi.fn(async () => ({ active: true, height: 44 })),
  hideControl: vi.fn(async () => undefined),
  hideSegment: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  registerPlugin: () => plugin,
}));

import {
  configureNativeIOSAuxiliaryControl,
  hideNativeIOSAuxiliaryControl,
  isNativeAuxiliaryControlID,
  isNativeControlSlotVisible,
  listenForNativeIOSAuxiliaryControlActivation,
  observeNativeControlFrame,
  type NativeControlFrame,
} from './iosTabs';

const frame: NativeControlFrame = { x: 12, y: 80, width: 48, height: 44 };

function giveLayout(element: HTMLElement) {
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => [{ x: frame.x, y: frame.y, width: frame.width, height: frame.height }],
  });
}

describe('native iOS auxiliary control bridge', () => {
  beforeEach(() => {
    plugin.addListener.mockClear();
    plugin.configureControl.mockClear();
    plugin.hideControl.mockClear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes a valid configuration to the plugin unchanged', async () => {
    const configuration = {
      id: 'settings',
      kind: 'settingsButton' as const,
      label: 'Settings',
      enabled: true,
      visible: true,
      frame,
    };

    await expect(configureNativeIOSAuxiliaryControl(configuration)).resolves.toEqual({
      active: true,
    });
    expect(plugin.configureControl).toHaveBeenCalledExactlyOnceWith(configuration);
  });

  it.each([
    ['an empty id', ''],
    ['an id beginning with punctuation', '.settings.sound'],
    ['an id containing whitespace', 'settings sound'],
    ['an overlong id', `s${'x'.repeat(80)}`],
  ])('rejects %s before crossing the native boundary', async (_case, id) => {
    await expect(configureNativeIOSAuxiliaryControl({
      id,
      kind: 'settingsButton',
      label: 'Settings',
      enabled: true,
      visible: true,
      frame,
    })).resolves.toEqual({ active: false });
    expect(plugin.configureControl).not.toHaveBeenCalled();
  });

  it('rejects blank, overlong, and non-finite configuration values', async () => {
    const base = {
      id: 'settings',
      kind: 'settingsButton' as const,
      enabled: true,
      visible: true,
      frame,
    };

    await expect(configureNativeIOSAuxiliaryControl({ ...base, label: '   ' }))
      .resolves.toEqual({ active: false });
    await expect(configureNativeIOSAuxiliaryControl({
      ...base,
      label: 'x'.repeat(101),
    })).resolves.toEqual({ active: false });
    await expect(configureNativeIOSAuxiliaryControl({
      ...base,
      label: 'Settings',
      frame: { ...frame, x: Number.NaN },
    })).resolves.toEqual({ active: false });
    expect(plugin.configureControl).not.toHaveBeenCalled();
  });

  it('validates hide ids and wires the activation listener by event name', async () => {
    const listener = vi.fn();

    expect(isNativeAuxiliaryControlID('foundation.movement')).toBe(true);
    expect(isNativeAuxiliaryControlID(' foundation.movement')).toBe(false);
    await hideNativeIOSAuxiliaryControl('bad id');
    expect(plugin.hideControl).not.toHaveBeenCalled();

    await hideNativeIOSAuxiliaryControl('foundation.movement');
    expect(plugin.hideControl).toHaveBeenCalledWith({ id: 'foundation.movement' });

    await listenForNativeIOSAuxiliaryControlActivation(listener);
    expect(plugin.addListener).toHaveBeenCalledWith('controlActivated', listener);
  });
});

describe('native control slot visibility', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts a laid-out on-screen slot', () => {
    const slot = document.createElement('button');
    giveLayout(slot);
    document.body.append(slot);

    expect(isNativeControlSlotVisible(slot, frame)).toBe(true);
  });

  it('ignores the fallback slot aria-hidden state without ignoring hidden ancestors', () => {
    const wrapper = document.createElement('div');
    const slot = document.createElement('button');
    slot.setAttribute('aria-hidden', 'true');
    giveLayout(slot);
    wrapper.append(slot);
    document.body.append(wrapper);

    expect(isNativeControlSlotVisible(slot, frame)).toBe(true);
    wrapper.setAttribute('aria-hidden', 'true');
    expect(isNativeControlSlotVisible(slot, frame)).toBe(false);
  });

  it('rejects absent layout, zero-size, offscreen, and hidden ancestors', () => {
    const wrapper = document.createElement('div');
    const slot = document.createElement('button');
    wrapper.append(slot);
    document.body.append(wrapper);

    expect(isNativeControlSlotVisible(slot, frame)).toBe(false);
    giveLayout(slot);
    expect(isNativeControlSlotVisible(slot, { ...frame, width: 0 })).toBe(false);
    expect(isNativeControlSlotVisible(slot, { ...frame, x: 390 })).toBe(false);

    wrapper.setAttribute('aria-hidden', 'true');
    expect(isNativeControlSlotVisible(slot, frame)).toBe(false);
    wrapper.removeAttribute('aria-hidden');
    wrapper.hidden = true;
    expect(isNativeControlSlotVisible(slot, frame)).toBe(false);
  });

  it('remeasures on nested scroll and stops after cleanup', () => {
    let nextFrame = { ...frame };
    const slot = document.createElement('button');
    Object.defineProperty(slot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        ...nextFrame,
        top: nextFrame.y,
        right: nextFrame.x + nextFrame.width,
        bottom: nextFrame.y + nextFrame.height,
        left: nextFrame.x,
        toJSON: () => ({}),
      }),
    });
    document.body.append(slot);

    let rafID = 0;
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafID += 1;
      rafCallbacks.set(rafID, callback);
      return rafID;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id);
    });
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('MutationObserver', undefined);
    const flushAnimationFrames = () => {
      const pending = [...rafCallbacks.values()];
      rafCallbacks.clear();
      pending.forEach((callback) => callback(0));
    };
    const listener = vi.fn();

    const stop = observeNativeControlFrame(slot, listener);
    flushAnimationFrames();
    expect(listener).toHaveBeenLastCalledWith(frame);

    nextFrame = { ...frame, y: 36 };
    slot.dispatchEvent(new Event('scroll', { bubbles: true }));
    flushAnimationFrames();
    expect(listener).toHaveBeenLastCalledWith({ ...frame, y: 36 });

    stop();
    nextFrame = { ...frame, y: 20 };
    slot.dispatchEvent(new Event('scroll', { bubbles: true }));
    flushAnimationFrames();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reports a slot that moves without resizing, and repeats nothing', () => {
    vi.useFakeTimers();
    let nextFrame = { ...frame };
    const slot = document.createElement('button');
    Object.defineProperty(slot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        ...nextFrame,
        top: nextFrame.y,
        right: nextFrame.x + nextFrame.width,
        bottom: nextFrame.y + nextFrame.height,
        left: nextFrame.x,
        toJSON: () => ({}),
      }),
    });
    document.body.append(slot);
    // A display font swapping in resizes the header above the slot: the slot's
    // own box never changes, so no ResizeObserver or mutation fires.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('MutationObserver', undefined);
    const listener = vi.fn();

    const stop = observeNativeControlFrame(slot, listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith(frame);

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledOnce();

    nextFrame = { ...frame, y: frame.y + 36 };
    vi.advanceTimersByTime(250);
    expect(listener).toHaveBeenLastCalledWith({ ...frame, y: frame.y + 36 });
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    nextFrame = { ...frame, y: 400 };
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
