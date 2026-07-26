// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scheduled = vi.hoisted(() => [] as Array<{
  draw: (frame: { now: number; deltaMs: number; reducedMotion: boolean }) => void;
  framesPerSecond: number;
  requestRender: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}>);

vi.mock('../engine/decorativeScheduler', () => ({
  observeDecorativeAnimation: (
    _target: Element,
    draw: (frame: { now: number; deltaMs: number; reducedMotion: boolean }) => void,
    options: { framesPerSecond: number },
  ) => {
    const entry = {
      draw,
      framesPerSecond: options.framesPerSecond,
      requestRender: vi.fn(),
      destroy: vi.fn(),
    };
    scheduled.push(entry);
    return entry;
  },
}));

import { DaySky } from './DaySky';
import { NightSky } from './NightSky';

function contextFixture() {
  const gradient = { addColorStop: vi.fn() };
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    lineWidth: 1,
    strokeStyle: '',
  };
}

function visibleRect(): DOMRect {
  return {
    bottom: 700,
    height: 700,
    left: 0,
    right: 390,
    top: 0,
    width: 390,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

let context: ReturnType<typeof contextFixture>;

beforeEach(() => {
  scheduled.length = 0;
  context = contextFixture();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function staticDrawSignature() {
  return {
    arcs: context.arc.mock.calls.map((args) => [...args]),
    fills: context.fillRect.mock.calls.map((args) => [...args]),
    rotations: context.rotate.mock.calls.map((args) => [...args]),
  };
}

function clearDrawCalls() {
  context.arc.mockClear();
  context.fillRect.mockClear();
  context.rotate.mockClear();
}

describe('sky reduced motion', () => {
  it('keeps the day sky fully drawn but motionless', () => {
    render(<DaySky />);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].framesPerSecond).toBe(20);

    scheduled[0].draw({ now: 1000, deltaMs: 0, reducedMotion: true });
    const first = staticDrawSignature();
    clearDrawCalls();
    scheduled[0].draw({ now: 9000, deltaMs: 0, reducedMotion: true });

    expect(staticDrawSignature()).toEqual(first);
    expect(first.arcs.length).toBeGreaterThan(0);
    expect(first.fills.length).toBeGreaterThan(0);
  });

  it('keeps moon and stars static and suppresses meteors', () => {
    render(<NightSky />);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].framesPerSecond).toBe(20);

    scheduled[0].draw({ now: 1000, deltaMs: 0, reducedMotion: true });
    const first = staticDrawSignature();
    expect(context.createLinearGradient).not.toHaveBeenCalled();
    clearDrawCalls();
    scheduled[0].draw({ now: 9000, deltaMs: 0, reducedMotion: true });

    expect(staticDrawSignature()).toEqual(first);
    expect(context.createLinearGradient).not.toHaveBeenCalled();
    expect(first.arcs.length).toBeGreaterThan(0);
    expect(first.fills.length).toBeGreaterThan(100);
  });
});
