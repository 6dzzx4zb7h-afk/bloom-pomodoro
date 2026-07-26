/**
 * One clock for Bloom's decorative canvases (PLAN 8.7).
 *
 * Canvas owners keep their own drawing state, but they all subscribe to this
 * scheduler instead of creating an interval or requestAnimationFrame loop.
 * The scheduler stops completely while the document is hidden, skips
 * offscreen canvases, and turns reduced motion into an on-demand static draw.
 */

export interface DecorativeFrame {
  now: number;
  deltaMs: number;
  reducedMotion: boolean;
}

export interface DecorativeAnimationHandle {
  /** Redraw immediately when visible (for resize, mode, or theme changes). */
  requestRender(): void;
  destroy(): void;
}

export interface DecorativeAnimationOptions {
  framesPerSecond: number;
}

type DrawFrame = (frame: DecorativeFrame) => void;

export interface DecorativeSchedulerRuntime {
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  pageVisible(): boolean;
  reducedMotion(): boolean;
  onVisibilityChange(callback: () => void): () => void;
  onReducedMotionChange(callback: () => void): () => void;
  observeIntersection(target: Element, callback: (visible: boolean) => void): () => void;
}

interface Subscriber {
  draw: DrawFrame;
  intervalMs: number;
  intersecting: boolean;
  lastDrawAt: number | null;
  stopObserving: () => void;
}

const MIN_FPS = 1;
const MAX_FPS = 60;

function frameInterval(framesPerSecond: number): number {
  const fps = Number.isFinite(framesPerSecond)
    ? Math.max(MIN_FPS, Math.min(MAX_FPS, framesPerSecond))
    : MIN_FPS;
  return 1000 / fps;
}

/**
 * Exported for deterministic lifecycle tests. Product code shares the single
 * lazily-created instance exposed by observeDecorativeAnimation().
 */
export class DecorativeScheduler {
  private readonly subscribers = new Set<Subscriber>();
  private frameId: number | null = null;
  private readonly stopVisibility: () => void;
  private readonly stopReducedMotion: () => void;

  constructor(private readonly runtime: DecorativeSchedulerRuntime) {
    this.stopVisibility = runtime.onVisibilityChange(() => this.environmentChanged());
    this.stopReducedMotion = runtime.onReducedMotionChange(() => this.environmentChanged());
  }

  subscribe(
    target: Element,
    draw: DrawFrame,
    options: DecorativeAnimationOptions,
  ): DecorativeAnimationHandle {
    const subscriber: Subscriber = {
      draw,
      intervalMs: frameInterval(options.framesPerSecond),
      intersecting: false,
      lastDrawAt: null,
      stopObserving: () => {},
    };
    this.subscribers.add(subscriber);
    subscriber.stopObserving = this.runtime.observeIntersection(target, (visible) => {
      if (!this.subscribers.has(subscriber) || subscriber.intersecting === visible) return;
      subscriber.intersecting = visible;
      subscriber.lastDrawAt = null;
      if (visible) this.renderOnce(subscriber);
      this.syncLoop();
    });

    return {
      requestRender: () => {
        if (!this.subscribers.has(subscriber)) return;
        subscriber.lastDrawAt = null;
        this.renderOnce(subscriber);
        this.syncLoop();
      },
      destroy: () => {
        if (!this.subscribers.delete(subscriber)) return;
        subscriber.stopObserving();
        this.syncLoop();
      },
    };
  }

  /** Remove global listeners; used by focused tests and hot-reload cleanup. */
  destroy(): void {
    this.stopLoop();
    for (const subscriber of this.subscribers) subscriber.stopObserving();
    this.subscribers.clear();
    this.stopVisibility();
    this.stopReducedMotion();
  }

  private environmentChanged(): void {
    this.stopLoop();
    if (!this.runtime.pageVisible()) return;
    for (const subscriber of this.subscribers) {
      subscriber.lastDrawAt = null;
      this.renderOnce(subscriber);
    }
    this.syncLoop();
  }

  private renderOnce(subscriber: Subscriber): void {
    if (!subscriber.intersecting || !this.runtime.pageVisible()) return;
    const now = this.runtime.now();
    subscriber.draw({
      now,
      deltaMs: 0,
      reducedMotion: this.runtime.reducedMotion(),
    });
    subscriber.lastDrawAt = now;
  }

  private shouldRun(): boolean {
    return (
      this.runtime.pageVisible() &&
      !this.runtime.reducedMotion() &&
      [...this.subscribers].some((subscriber) => subscriber.intersecting)
    );
  }

  private syncLoop(): void {
    if (!this.shouldRun()) {
      this.stopLoop();
      return;
    }
    if (this.frameId == null) {
      this.frameId = this.runtime.requestFrame((now) => this.tick(now));
    }
  }

  private stopLoop(): void {
    if (this.frameId == null) return;
    this.runtime.cancelFrame(this.frameId);
    this.frameId = null;
  }

  private tick(now: number): void {
    this.frameId = null;
    if (!this.shouldRun()) return;

    for (const subscriber of this.subscribers) {
      if (!subscriber.intersecting) continue;
      const elapsed =
        subscriber.lastDrawAt == null ? Number.POSITIVE_INFINITY : now - subscriber.lastDrawAt;
      // A half-millisecond tolerance avoids dropping an intended frame to
      // floating-point rounding at rates such as 15 fps.
      if (elapsed + 0.5 < subscriber.intervalMs) continue;
      subscriber.draw({
        now,
        deltaMs: subscriber.lastDrawAt == null ? 0 : Math.min(100, Math.max(0, elapsed)),
        reducedMotion: false,
      });
      subscriber.lastDrawAt = now;
    }

    this.syncLoop();
  }
}

function browserRuntime(): DecorativeSchedulerRuntime {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const intersectionCallbacks = new Map<Element, Set<(visible: boolean) => void>>();
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const callbacks = intersectionCallbacks.get(entry.target);
            if (!callbacks) continue;
            const visible = entry.isIntersecting && entry.intersectionRatio > 0;
            for (const callback of callbacks) callback(visible);
          }
        })
      : null;

  return {
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    pageVisible: () => document.visibilityState !== 'hidden',
    reducedMotion: () => media.matches,
    onVisibilityChange: (callback) => {
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
    onReducedMotionChange: (callback) => {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', callback);
        return () => media.removeEventListener('change', callback);
      }
      // Older WebViews expose the deprecated MediaQueryList listener pair.
      media.addListener(callback);
      return () => media.removeListener(callback);
    },
    observeIntersection: (target, callback) => {
      if (!observer) {
        callback(true);
        return () => {};
      }
      const callbacks = intersectionCallbacks.get(target) ?? new Set();
      callbacks.add(callback);
      intersectionCallbacks.set(target, callbacks);
      observer.observe(target);
      return () => {
        const current = intersectionCallbacks.get(target);
        if (!current) return;
        current.delete(callback);
        if (current.size > 0) return;
        intersectionCallbacks.delete(target);
        observer.unobserve(target);
      };
    },
  };
}

let sharedScheduler: DecorativeScheduler | null = null;

export function observeDecorativeAnimation(
  target: Element,
  draw: DrawFrame,
  options: DecorativeAnimationOptions,
): DecorativeAnimationHandle {
  sharedScheduler ??= new DecorativeScheduler(browserRuntime());
  return sharedScheduler.subscribe(target, draw, options);
}
