import { describe, expect, it } from 'vitest';

import {
  DecorativeScheduler,
  type DecorativeAnimationHandle,
  type DecorativeFrame,
  type DecorativeSchedulerRuntime,
} from './decorativeScheduler';

class FakeRuntime implements DecorativeSchedulerRuntime {
  currentTime = 0;
  visible = true;
  reduced = false;
  requestCount = 0;
  cancelCount = 0;

  private nextFrameId = 1;
  private frames = new Map<number, FrameRequestCallback>();
  private visibilityListeners = new Set<() => void>();
  private motionListeners = new Set<() => void>();
  private intersections = new Map<Element, (visible: boolean) => void>();

  now() {
    return this.currentTime;
  }

  requestFrame(callback: FrameRequestCallback) {
    const id = this.nextFrameId++;
    this.requestCount++;
    this.frames.set(id, callback);
    return id;
  }

  cancelFrame(id: number) {
    if (this.frames.delete(id)) this.cancelCount++;
  }

  pageVisible() {
    return this.visible;
  }

  reducedMotion() {
    return this.reduced;
  }

  onVisibilityChange(callback: () => void) {
    this.visibilityListeners.add(callback);
    return () => this.visibilityListeners.delete(callback);
  }

  onReducedMotionChange(callback: () => void) {
    this.motionListeners.add(callback);
    return () => this.motionListeners.delete(callback);
  }

  observeIntersection(target: Element, callback: (visible: boolean) => void) {
    this.intersections.set(target, callback);
    return () => this.intersections.delete(target);
  }

  setIntersecting(target: Element, visible: boolean) {
    this.intersections.get(target)?.(visible);
  }

  setPageVisible(visible: boolean) {
    this.visible = visible;
    for (const listener of this.visibilityListeners) listener();
  }

  setReducedMotion(reduced: boolean) {
    this.reduced = reduced;
    for (const listener of this.motionListeners) listener();
  }

  runFrame(now: number) {
    this.currentTime = now;
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    for (const callback of callbacks) callback(now);
  }

  get pendingFrames() {
    return this.frames.size;
  }
}

const target = (): Element => ({}) as Element;

function subscribe(
  scheduler: DecorativeScheduler,
  element: Element,
  frames: DecorativeFrame[],
  framesPerSecond: number,
): DecorativeAnimationHandle {
  return scheduler.subscribe(element, (frame) => frames.push(frame), { framesPerSecond });
}

describe('DecorativeScheduler', () => {
  it('shares one driver and stays inside the Friends-screen draw budget', () => {
    const runtime = new FakeRuntime();
    const scheduler = new DecorativeScheduler(runtime);
    const pals = Array.from({ length: 6 }, () => ({ element: target(), frames: [] as DecorativeFrame[] }));
    const sky = { element: target(), frames: [] as DecorativeFrame[] };

    for (const pal of pals) {
      subscribe(scheduler, pal.element, pal.frames, 15);
      runtime.setIntersecting(pal.element, true);
    }
    subscribe(scheduler, sky.element, sky.frames, 20);
    runtime.setIntersecting(sky.element, true);

    // One immediate paint per canvas, then exactly one pending shared driver.
    expect(pals.every((pal) => pal.frames.length === 1)).toBe(true);
    expect(sky.frames).toHaveLength(1);
    expect(runtime.pendingFrames).toBe(1);
    expect(runtime.requestCount).toBe(1);

    for (let frame = 1; frame <= 60; frame++) runtime.runFrame((frame * 1000) / 60);

    const animatedDraws =
      pals.reduce((sum, pal) => sum + pal.frames.length - 1, 0) + sky.frames.length - 1;
    expect(animatedDraws).toBeLessThanOrEqual(110);
    expect(animatedDraws).toBeGreaterThanOrEqual(100);
    expect(runtime.pendingFrames).toBe(1);

    scheduler.destroy();
  });

  it('cancels all decorative work while hidden', () => {
    const runtime = new FakeRuntime();
    const scheduler = new DecorativeScheduler(runtime);
    const element = target();
    const frames: DecorativeFrame[] = [];
    const handle = subscribe(scheduler, element, frames, 15);
    runtime.setIntersecting(element, true);
    runtime.runFrame(100);

    runtime.setPageVisible(false);
    const hiddenCount = frames.length;
    expect(runtime.pendingFrames).toBe(0);
    expect(runtime.cancelCount).toBeGreaterThan(0);

    handle.requestRender();
    runtime.runFrame(5000);
    expect(frames).toHaveLength(hiddenCount);
    expect(runtime.pendingFrames).toBe(0);

    runtime.setPageVisible(true);
    expect(frames).toHaveLength(hiddenCount + 1);
    expect(runtime.pendingFrames).toBe(1);

    scheduler.destroy();
  });

  it('stops drawing an offscreen canvas without stopping visible subscribers', () => {
    const runtime = new FakeRuntime();
    const scheduler = new DecorativeScheduler(runtime);
    const offscreen = target();
    const visible = target();
    const offscreenFrames: DecorativeFrame[] = [];
    const visibleFrames: DecorativeFrame[] = [];

    subscribe(scheduler, offscreen, offscreenFrames, 15);
    subscribe(scheduler, visible, visibleFrames, 15);
    runtime.setIntersecting(offscreen, true);
    runtime.setIntersecting(visible, true);
    runtime.runFrame(100);

    runtime.setIntersecting(offscreen, false);
    const stoppedAt = offscreenFrames.length;
    for (let frame = 1; frame <= 10; frame++) runtime.runFrame(100 + frame * 100);

    expect(offscreenFrames).toHaveLength(stoppedAt);
    expect(visibleFrames.length).toBeGreaterThan(stoppedAt);
    expect(runtime.pendingFrames).toBe(1);

    scheduler.destroy();
  });

  it('renders one static frame under reduced motion and redraws state on demand', () => {
    const runtime = new FakeRuntime();
    const scheduler = new DecorativeScheduler(runtime);
    const element = target();
    const frames: DecorativeFrame[] = [];
    const handle = subscribe(scheduler, element, frames, 15);
    runtime.setIntersecting(element, true);
    runtime.runFrame(100);

    runtime.setReducedMotion(true);
    expect(frames[frames.length - 1]).toMatchObject({ reducedMotion: true, deltaMs: 0 });
    expect(runtime.pendingFrames).toBe(0);
    const staticCount = frames.length;

    runtime.runFrame(1000);
    expect(frames).toHaveLength(staticCount);

    handle.requestRender();
    expect(frames).toHaveLength(staticCount + 1);
    expect(frames[frames.length - 1]).toMatchObject({ reducedMotion: true, deltaMs: 0 });
    expect(runtime.pendingFrames).toBe(0);

    runtime.setReducedMotion(false);
    expect(frames[frames.length - 1]).toMatchObject({ reducedMotion: false, deltaMs: 0 });
    expect(runtime.pendingFrames).toBe(1);

    scheduler.destroy();
  });

  it('keeps seven-subscriber dispatch under the predeclared synthetic budget', () => {
    const runtime = new FakeRuntime();
    const scheduler = new DecorativeScheduler(runtime);
    const elements = Array.from({ length: 7 }, target);

    for (const element of elements) {
      subscribe(scheduler, element, [], 60);
      runtime.setIntersecting(element, true);
    }

    const samples: number[] = [];
    for (let frame = 1; frame <= 250; frame++) {
      const started = performance.now();
      runtime.runFrame(frame * 17);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];

    expect(p95).toBeLessThan(2);
    scheduler.destroy();
  });
});
