// Pixel-art animal sprites + a tiny animation engine.
// Faithful TypeScript port of the design-handoff `pixelpals.js`.
// Animals: bunny, cat, duck, owl, crab, octopus. Behaviours: idle, work, sleep, celebrate.

export type AnimalKind = 'bunny' | 'cat' | 'duck' | 'owl' | 'crab' | 'octopus';
export type Mode = 'idle' | 'work' | 'sleep' | 'celebrate';

export const PALETTE: Record<string, string | null> = {
  '.': null,
  o: '#6e5577', // outline (muted plum)
  w: '#fff7fb', // cream body (bunny)
  p: '#ffd3e8', // inner ear pink
  c: '#ff9cc2', // cheek
  e: '#5b4660', // eye
  n: '#ef93b4', // nose
  g: '#cdb8ec', // cat lavender
  d: '#b79fe3', // cat inner ear
  y: '#ffe08a', // duck yellow
  b: '#ffae4d', // duck beak
  t: '#f4c452', // duck wing
  h: '#cdd7ea', // owl cloud blue-grey
  f: '#a8b8d8', // owl wing
  a: '#ff8a8a', // crab rosy red
  u: '#ffa98c', // octopus coral
};

// Full-body chibi sprites: ears/head on top, rounded body, little feet.
export const SPRITES: Record<AnimalKind, string[]> = {
  bunny: [
    '...oo....oo...',
    '..opo....opo..',
    '..opo....opo..',
    '..owo....owo..',
    '.oowwwwwwwwoo.',
    '.owwwwwwwwwwo.',
    '.oweewwwweewo.',
    '.oweewwwweewo.',
    '.owwwwnnwwwwo.',
    '.owcwwwwwwcwo.',
    '..owwwwwwwwo..',
    '..owwwwwwwwo..',
    '.oowwwwwwwwoo.',
    '..owwwwwwwwo..',
    '..owwwoowwwo..',
    '...ooo..ooo...',
  ],
  cat: [
    '.oo........oo.',
    '.odo......odo.',
    '.oddo....oddo.',
    '.odddoooodddo.',
    '.oggggggggggo.',
    '.ogeeggggeego.',
    '.ogeeggggeego.',
    '.oggggnnggggo.',
    '.ogcggggggcgo.',
    '..oggggggggo..',
    '..oggggggggo..',
    '.oogggwwgggoo.',
    '..ogggwwgggo..',
    '..oggggggggo..',
    '..ogggoogggo..',
    '...ooo..ooo...',
  ],
  duck: [
    '....oooooo....',
    '...oyyyyyyo...',
    '..oyyyyyyyyo..',
    '..oyeeyyeeyo..',
    '..oyeeyyeeyo..',
    '..oyybbbbyyo..',
    '..oyyybbyyyo..',
    '..oycyyyycyo..',
    '.oyyyyyyyyyyo.',
    '.otyyyyyyyyto.',
    '.otyyyyyyyyto.',
    '.oyyyyyyyyyyo.',
    '..oyyyyyyyyo..',
    '..obbboobbbo..',
    '...ooo..ooo...',
  ],
  owl: [
    '..oo......oo..',
    '..oho....oho..',
    '.oohhoooohhoo.',
    '.ohhhhhhhhhho.',
    '.oheehhhheeho.',
    '.oheehhhheeho.',
    '.ohhhhbbhhhho.',
    '.ohchhhhhhcho.',
    '.offhwwwwhffo.',
    '.offhwwwwhffo.',
    '.ofhhwwwwhhfo.',
    '.ohhhwwwwhhho.',
    '..ohhwwwwhho..',
    '..ohhhhhhhho..',
    '...obo..obo...',
  ],
  crab: [
    '....o....o....',
    '...oao..oao...',
    '..ooaooooaoo..',
    '..oaaaaaaaao..',
    'oooaeeaaeeaooo',
    'oaoaeeaaeeaoao',
    'oaoacannacaoao',
    'oooaaaaaaaaooo',
    '..oaaaaaaaao..',
    '..oaoaooaoao..',
    '...o.o..o.o...',
  ],
  octopus: [
    '....oooooo....',
    '..oouuuuuuoo..',
    '.ouuuuuuuuuuo.',
    '.ouuuuuuuuuuo.',
    '.ouueeuueeuuo.',
    '.ouueeuueeuuo.',
    '.oucuuuuuucuo.',
    '.ouuuunnuuuuo.',
    '..ouuuuuuuuo..',
    '..ouuuuuuuuo..',
    '..ouuouuouuo..',
    'oouuoouuoouuoo',
    'ouuo.ouuo.ouuo',
    '.oo...oo...oo.',
  ],
};

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
  const scale = opts.scale || 7;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d')!;
  let cssW = 0;
  let cssH = 0;

  function fit() {
    const r = canvas.getBoundingClientRect();
    cssW = r.width || 140;
    cssH = r.height || 140;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  fit();

  const spriteW = sprite.width * scale;
  const spriteH = sprite.height * scale;

  let mode: Mode = opts.mode || 'idle';
  let modeStart = performance.now();
  let lastFrame = modeStart;
  let particles: Particle[] = [];
  let lastSpawn = 0;
  let running = true;

  function spawnBurst() {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2 - Math.PI / 4;
      const sp = 30 + Math.random() * 55;
      particles.push({
        type: Math.random() < 0.5 ? 'heart' : 'star',
        x: 0,
        y: -spriteH * 0.15,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 0,
        max: 1.1 + Math.random() * 0.6,
        col: Math.random() < 0.5 ? '#ff9cc2' : '#ffd76b',
        s: 2 + Math.random() * 1.5,
      });
    }
  }
  if (mode === 'celebrate') spawnBurst();

  function frame(now: number) {
    if (!running) return;
    const t = (now - modeStart) / 1000;
    // Real elapsed time (clamped) so particle speed is framerate-independent.
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    let offsetY = 0;
    let sx = 1;
    let sy = 1;
    let skew = 0;
    let eyesClosed = false;
    let happyEyes = false;

    if (mode === 'idle') {
      const bob = Math.sin(t * 2.2);
      offsetY = -Math.abs(bob) * 4;
      sy = 1 - Math.max(0, -bob) * 0.05;
      sx = 1 + Math.max(0, -bob) * 0.05;
      eyesClosed = t % 3.4 > 3.26; // quick blink
    } else if (mode === 'work') {
      const bob = Math.sin(t * 6.5);
      offsetY = -Math.abs(bob) * 2.4;
      skew = Math.sin(t * 6.5) * 0.04;
      eyesClosed = t % 4.2 > 4.08;
      if (now - lastSpawn > 520) {
        lastSpawn = now;
        particles.push({ type: 'spark', x: spriteW * 0.28, y: -spriteH * 0.32, vx: 10, vy: -22, life: 0, max: 0.9, col: '#c7a9ec', s: 2 });
      }
    } else if (mode === 'sleep') {
      const br = Math.sin(t * 1.4);
      offsetY = 5 + br * 1.2;
      sy = 1 + br * 0.03;
      sx = 1 - br * 0.02;
      eyesClosed = true;
      if (now - lastSpawn > 1000) {
        lastSpawn = now;
        particles.push({ type: 'z', x: spriteW * 0.22, y: -spriteH * 0.28, vx: 9, vy: -16, life: 0, max: 1.8, col: '#b79fe3', s: 2 });
      }
    } else if (mode === 'celebrate') {
      const jump = Math.abs(Math.sin(t * 4));
      offsetY = -jump * 13;
      sy = 1 + jump * 0.06;
      sx = 1 - jump * 0.04;
      happyEyes = true;
      if (now - lastSpawn > 360) {
        lastSpawn = now;
        spawnBurst();
      }
    }

    // body
    ctx.save();
    ctx.translate(cssW / 2, cssH * 0.56 + offsetY);
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

    // particles
    particles = particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 26 * dt;
      const a = Math.max(0, 1 - p.life / p.max);
      if (a <= 0) return false;
      // Anchor particles to the same origin as the body (cssH * 0.56).
      drawGlyph(ctx, p.type, cssW / 2 + p.x - 5, cssH * 0.56 + p.y, p.s, p.col, a);
      return true;
    });
  }

  // setInterval drives the loop so it keeps painting even when rAF is throttled.
  // Pause when the tab is hidden to save battery (per handoff note).
  frame(performance.now());
  const iv = setInterval(() => {
    if (running && document.visibilityState !== 'hidden') frame(performance.now());
  }, 50);

  return {
    setMode(m: Mode) {
      if (m === mode) return;
      mode = m;
      modeStart = performance.now();
      if (m === 'celebrate') spawnBurst();
    },
    getMode() {
      return mode;
    },
    destroy() {
      running = false;
      clearInterval(iv);
    },
  };
}
