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

import { makeAnimal, SPRITES, type AnimalKind, type Mode } from './pixelpals';

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

describe('PixelPal drawing bounds', () => {
  it.each([
    { size: 116, scale: 6, cssScale: 0.56 },
    { size: 64, scale: 3, cssScale: 1 },
    { size: 40, scale: 3, cssScale: 1 },
    { size: 140, scale: 7, cssScale: 1 },
  ])('keeps every friend and pose inside a $size px canvas at CSS scale $cssScale', ({ size, scale, cssScale }) => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    let body = false;
    let tx = 0, ty = 0, sx = 1, sy = 1, skew = 0;
    let clipped: string | null = null;
    const context = {
      clearRect() {},
      setTransform() {},
      save() { body = true; },
      restore() { body = false; },
      translate(x: number, y: number) { tx = x; ty = y; },
      transform(x: number, _b: number, c: number, y: number) { sx = x; sy = y; skew = c; },
      fillRect(x: number, y: number, w: number, h: number) {
        if (!body) return; // Particles are allowed to leave the canvas; feet and ears are not.
        for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
          const renderedX = tx + px * sx + py * skew;
          const renderedY = ty + py * sy;
          if (renderedX < 0 || renderedX > size || renderedY < 0 || renderedY > size) {
            clipped = `${renderedX}, ${renderedY}`;
          }
        }
      },
      fillStyle: '',
      globalAlpha: 1,
    };
    const canvas = {
      width: 0, height: 0,
      clientWidth: size, clientHeight: size,
      getBoundingClientRect: () => ({ width: size * cssScale, height: size * cssScale }),
      getContext: () => context,
    } as unknown as HTMLCanvasElement;

    for (const sprite of Object.keys(SPRITES) as AnimalKind[]) {
      for (const mode of ['idle', 'work', 'sleep', 'celebrate'] as Mode[]) {
        const controller = makeAnimal(canvas, { sprite, scale, mode });
        expect(canvas.width).toBe(size);
        for (const reducedMotion of [false, true]) {
          for (let now = 0; now < 7000; now += 200) {
            animation.draw!({ now, deltaMs: 200, reducedMotion });
          }
          expect(clipped, `${sprite}, ${mode}, reduced motion ${reducedMotion}`).toBeNull();
        }
        controller.destroy();
      }
    }
    vi.restoreAllMocks();
  });
});
