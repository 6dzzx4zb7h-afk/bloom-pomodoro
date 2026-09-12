// Pixel-art animal sprites + a tiny animation engine.
// Faithful TypeScript port of the design-handoff `pixelpals.js`.
// Animals: bunny, cat, duck, owl, crab, octopus. Behaviours: idle, work, sleep, celebrate.

import {
  observeDecorativeAnimation,
  type DecorativeFrame,
} from './decorativeScheduler';
import { PALETTE, SPRITES, type AnimalKind } from './spriteData';

// The grids and palette live in `spriteData.ts` so the app icon generator can
// read the same art without pulling in Canvas/DOM code (PLAN 13.9).
export { PALETTE, SPRITES };
export type { AnimalKind };

export type Mode = 'idle' | 'work' | 'sleep' | 'celebrate';

interface Cell {
  x: number;
  y: number;
  ch: string;
}
interface EyeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface ParsedSprite {
  width: number;
  height: number;
  cells: Cell[];
  eyes: EyeRect[];
  body: string;
}

function parseSprite(rows: string[]): ParsedSprite {
  const width = Math.max(...rows.map((r) => r.length));
  const height = rows.length;
  const cells: Cell[] = [];
  const eyeCells: { x: number; y: number }[] = [];
  const counts: Record<string, number> = {};
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = row[x] || '.';
      if (ch === '.') continue;
      cells.push({ x, y, ch });
      if (ch === 'e') eyeCells.push({ x, y });
      if (ch !== 'o' && ch !== 'e' && ch !== 'n') counts[ch] = (counts[ch] || 0) + 1;
    }
  }
  // dominant body color
  let body = 'w';
  let best = -1;
  for (const k in counts) if (counts[k] > best) { best = counts[k]; body = k; }
  // cluster eyes into left / right by x
  const mid = width / 2;
  const groups = [eyeCells.filter((c) => c.x < mid), eyeCells.filter((c) => c.x >= mid)];
  const eyes = groups
    .filter((g) => g.length)
    .map((g) => {
      const xs = g.map((c) => c.x);
      const ys = g.map((c) => c.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs) + 1,
        h: Math.max(...ys) - Math.min(...ys) + 1,
      };
    });
  return { width, height, cells, eyes, body };
}

const GLYPHS: Record<string, string[]> = {
  heart: ['.o.o.', 'ooooo', 'ooooo', '.ooo.', '..o..'],
  star: ['..o..', '.ooo.', 'ooooo', '.ooo.', '..o..'],
  z: ['oooo', '...o', '.oo.', 'o...', 'oooo'],
  spark: ['.o.', 'ooo', '.o.'],
};

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  s: number,
  color: string,
  alpha: number,
) {
  const g = GLYPHS[name];
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[y].length; x++)
      if (g[y][x] === 'o')
        ctx.fillRect(Math.round(px + x * s), Math.round(py + y * s), Math.ceil(s), Math.ceil(s));
  ctx.globalAlpha = 1;
}

interface Particle {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  s: number;
}

export interface AnimalOptions {
  sprite?: AnimalKind;
  scale?: number;
  mode?: Mode;
}

export interface AnimalController {
  setMode(m: Mode): void;
  getMode(): Mode;
  destroy(): void;
}

export function makeAnimal(canvas: HTMLCanvasElement, opts: AnimalOptions = {}): AnimalController {
  const sprite = parseSprite(SPRITES[opts.sprite || 'bunny'] || SPRITES.bunny);
  const requestedScale = opts.scale || 7;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d')!;
  let cssW = 0;
  let cssH = 0;
  let scale = requestedScale;
  let spriteW = 0;
  let spriteH = 0;
  let originY = 0;

  function fit() {
    // Canvas drawing coordinates use the layout size, before CSS transforms.
    // Measuring the scaled ring with getBoundingClientRect cropped the feet
    // because the full sprite was drawn into an already-shrunken bitmap.
    const r = canvas.clientWidth && canvas.clientHeight ? null : canvas.getBoundingClientRect();
    cssW = canvas.clientWidth || r?.width || 140;
    cssH = canvas.clientHeight || r?.height || 140;
    // Reserve room for the widest squash/skew and the lowest breathing pose.
    // Tiny thumbnails may need smaller pixels, but never a cropped animal.
    scale = Math.min(
      requestedScale,
      Math.max(1, cssW - 2) / (sprite.width * 1.05 + sprite.height * 0.04),
      Math.max(1, cssH - 2 - 6.2) / (sprite.height * 1.06),
    );
    spriteW = sprite.width * scale;
    spriteH = sprite.height * scale;
    originY = Math.min(cssH * 0.56, cssH - 1 - spriteH * 1.06 / 2 - 6.2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  fit();

  let mode: Mode = opts.mode || 'idle';
  let modeStart = performance.now();
  let particles: Particle[] = [];
  let lastSpawn = 0;
  let running = true;
  let celebrationBurstPending = mode === 'celebrate';

  function spawnBurst() {
    // Scale the burst to the canvas: tiny renders (speech bubbles, settings
    // rows) get a few slow sparkles that stay near the pet instead of a
    // confetti storm clipped by the square edges. Quadratic falloff — a
    // 64px canvas gets ~3 sparkles, the 130px+ ring keeps its full burst.
    const room = Math.min(1, Math.min(cssW, cssH) / 130);
    const count = Math.max(3, Math.round(14 * room * room));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2 - Math.PI / 4;
      const sp = (30 + Math.random() * 55) * room;
      particles.push({
        type: Math.random() < 0.5 ? 'heart' : 'star',
        x: 0,
        y: -spriteH * 0.15,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30 * room,
        life: 0,
        max: 1.1 + Math.random() * 0.6,
        col: Math.random() < 0.5 ? '#ff9cc2' : '#ffd76b',
        s: 2 + Math.random() * 1.5,
      });
    }
  }
  function frame({ now, deltaMs, reducedMotion }: DecorativeFrame) {
    if (!running) return;
    const t = reducedMotion ? 0 : (now - modeStart) / 1000;
    // Real elapsed time (clamped) so particle speed is framerate-independent.
    const dt = reducedMotion ? 0 : Math.min(0.1, Math.max(0, deltaMs / 1000));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    let offsetY = 0;
    let sx = 1;
    let sy = 1;
    let skew = 0;
    let eyesClosed = false;
    let happyEyes = false;

    // Upward hops scale down to whatever headroom the canvas actually has, so
    // small renders (speech bubbles, settings rows) never clip the pet's ears
    // mid-jump. Large canvases have plenty of room and are unaffected.
    const headroom = Math.max(0, originY - spriteH * 1.06 / 2 - 1);

    if (mode === 'idle') {
      if (!reducedMotion) {
        const bob = Math.sin(t * 2.2);
        offsetY = -Math.abs(bob) * Math.min(4, headroom);
        sy = 1 - Math.max(0, -bob) * 0.05;
        sx = 1 + Math.max(0, -bob) * 0.05;
        eyesClosed = t % 3.4 > 3.26; // quick blink
      }
    } else if (mode === 'work') {
      if (!reducedMotion) {
        const bob = Math.sin(t * 6.5);
        offsetY = -Math.abs(bob) * Math.min(2.4, headroom);
        skew = Math.sin(t * 6.5) * 0.04;
        eyesClosed = t % 4.2 > 4.08;
        if (now - lastSpawn > 520) {
          lastSpawn = now;
          particles.push({ type: 'spark', x: spriteW * 0.28, y: -spriteH * 0.32, vx: 10, vy: -22, life: 0, max: 0.9, col: '#c7a9ec', s: 2 });
        }
      }
    } else if (mode === 'sleep') {
      eyesClosed = true;
      if (reducedMotion) {
        offsetY = 5;
      } else {
        const br = Math.sin(t * 1.4);
        offsetY = 5 + br * 1.2;
        sy = 1 + br * 0.03;
        sx = 1 - br * 0.02;
        if (now - lastSpawn > 1000) {
          lastSpawn = now;
          particles.push({ type: 'z', x: spriteW * 0.22, y: -spriteH * 0.28, vx: 9, vy: -16, life: 0, max: 1.8, col: '#b79fe3', s: 2 });
        }
      }
    } else if (mode === 'celebrate') {
      happyEyes = true;
      if (!reducedMotion) {
        if (celebrationBurstPending) {
          spawnBurst();
          lastSpawn = now;
          celebrationBurstPending = false;
        }
        const jump = Math.abs(Math.sin(t * 4));
        offsetY = -jump * Math.min(13, headroom);
        sy = 1 + jump * 0.06;
        sx = 1 - jump * 0.04;
        // Small canvases also celebrate less often, so sparkles never crowd
        // the little square they live in.
        const room = Math.max(0.3, Math.min(1, Math.min(cssW, cssH) / 130));
        if (now - lastSpawn > 360 / (room * room)) {
          lastSpawn = now;
          spawnBurst();
        }
      }
    }

    // body
    ctx.save();
    ctx.translate(cssW / 2, originY + offsetY);
    ctx.transform(sx, 0, skew, sy, 0, 0);
    const ox = -spriteW / 2;
    const oy = -spriteH / 2;
    for (const cell of sprite.cells) {
      let ch = cell.ch;
      if ((eyesClosed || happyEyes) && ch === 'e') ch = sprite.body;
      const col = PALETTE[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + cell.x * scale, oy + cell.y * scale, scale, scale);
    }
    // closed / happy eyes overlay
    if (eyesClosed || happyEyes) {
      ctx.fillStyle = PALETTE.e as string;
      for (const ey of sprite.eyes) {
        const ex = ox + ey.x * scale;
        const ey0 = oy + (ey.y + ey.h * 0.5) * scale;
        const ew = ey.w * scale;
        if (happyEyes) {
          // upward curve ^^
          ctx.fillRect(ex, ey0, ew * 0.5, scale);
          ctx.fillRect(ex, ey0 - scale, ew * 0.5, scale);
          ctx.fillRect(ex + ew * 0.5, ey0, ew * 0.5, scale);
          ctx.fillRect(ex + ew * 0.5, ey0 - scale, ew * 0.5, scale);
        } else {
          ctx.fillRect(ex, ey0, ew, scale);
        }
      }
    }
    ctx.restore();

    // Particles are decorative motion too. Reduced motion clears them and
    // keeps the mode legible through the pet's static face/pose.
    if (reducedMotion) {
      particles = [];
    } else {
      particles = particles.filter((p) => {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 26 * dt;
        const a = Math.max(0, 1 - p.life / p.max);
        if (a <= 0) return false;
        drawGlyph(ctx, p.type, cssW / 2 + p.x - 5, originY + p.y, p.s, p.col, a);
        return true;
      });
    }
  }

  const animation = observeDecorativeAnimation(canvas, frame, { framesPerSecond: 15 });
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    fit();
    animation.requestRender();
  });
  resize?.observe(canvas);

  return {
    setMode(m: Mode) {
      if (m === mode) return;
      mode = m;
      modeStart = performance.now();
      celebrationBurstPending = m === 'celebrate';
      particles = [];
      animation.requestRender();
    },
    getMode() {
      return mode;
    },
    destroy() {
      running = false;
      resize?.disconnect();
      animation.destroy();
    },
  };
}
