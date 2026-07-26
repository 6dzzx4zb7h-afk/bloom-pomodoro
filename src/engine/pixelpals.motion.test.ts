import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const animation = vi.hoisted(() => ({
  draw: null as null | ((frame: { now: number; deltaMs: number; reducedMotion: boolean }) => void),
  requestRender: vi.fn(),
  destroy: vi.fn(),
  framesPerSecond: 0,
}));

vi.mock('./decorativeScheduler', () => ({
  observeDecorativeAnimation: (
    _target: Element,
    draw: (frame: { now: number; deltaMs: number; reducedMotion: boolean }) => void,
    options: { framesPerSecond: number },
  ) => {
    animation.draw = draw;
    animation.framesPerSecond = options.framesPerSecond;
    return {
      requestRender: () => {
        animation.requestRender();
        draw({ now: 5000, deltaMs: 0, reducedMotion: true });
      },
      destroy: animation.destroy,
    };
  },
}));

import { makeAnimal } from './pixelpals';

function canvasFixture() {
  const fillRect = vi.fn();
  const context = {
    clearRect: vi.fn(),
    fillRect,
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width: 140, height: 140 }),
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, fillRect };
}

beforeEach(() => {
  animation.draw = null;
  animation.framesPerSecond = 0;
  animation.requestRender.mockClear();
  animation.destroy.mockClear();
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PixelPal reduced motion', () => {
  it('uses the shared 15 fps scheduler and keeps static mode poses redrawable', () => {
    const { canvas, fillRect } = canvasFixture();
    const controller = makeAnimal(canvas, { sprite: 'bunny', scale: 5, mode: 'celebrate' });

    expect(animation.framesPerSecond).toBe(15);
    expect(animation.draw).not.toBeNull();

    animation.draw!({ now: 1000, deltaMs: 0, reducedMotion: true });
    const celebrateCells = fillRect.mock.calls.length;
    fillRect.mockClear();
    animation.draw!({ now: 9000, deltaMs: 0, reducedMotion: true });

    // Time passing cannot change or add particles to a reduced-motion frame.
    expect(fillRect.mock.calls.length).toBe(celebrateCells);

    fillRect.mockClear();
    controller.setMode('sleep');
    const sleepingCells = fillRect.mock.calls.length;
    expect(animation.requestRender).toHaveBeenCalledTimes(1);
    // Closed sleep eyes and happy celebration eyes remain distinct static
    // poses, while text outside this decorative canvas names the timer state.
    expect(sleepingCells).not.toBe(celebrateCells);

    controller.destroy();
    expect(animation.destroy).toHaveBeenCalledTimes(1);
  });
});
