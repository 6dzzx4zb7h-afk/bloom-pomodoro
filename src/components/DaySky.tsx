import { useEffect, useRef } from 'react';

interface Cloud {
  x: number; // 0..1 fraction of width (can drift past 1, wraps)
  y: number; // 0..1 fraction of height
  s: number; // scale
  v: number; // px/s horizontal drift
  a: number; // opacity
}

interface Bird {
  x: number; // 0..1 fraction of width
  y: number; // 0..1 fraction of height
  v: number; // px/s horizontal drift
  size: number;
  flap: number; // radians into the wing-flap cycle
  flapRate: number; // radians/s
}

/**
 * Animated daytime backdrop — the daylight counterpart to {@link NightSky},
 * shown whenever night mode is off. A warm 10 a.m. sun sits exactly where the
 * night moon does, soft clouds drift across, and little birds flap by. Purely
 * decorative: it sits behind the screens (the sky gradient comes from the
 * `.phone` CSS) and ignores pointer events.
 */
export function DaySky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;

    function fit() {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    fit();
    window.addEventListener('resize', fit);

    // A handful of clouds at different heights, sizes and speeds so they never
    // travel as a pack. They wrap around once they drift off the right edge.
    const clouds: Cloud[] = Array.from({ length: 6 }, () => ({
      x: Math.random(),
      y: 0.08 + Math.random() * 0.5,
      s: 0.6 + Math.random() * 0.9,
      v: 5 + Math.random() * 9,
      a: 0.55 + Math.random() * 0.35,
    })).sort((a, b) => a.s - b.s);

    // A little scatter of birds, each flapping at its own rate.
    const birds: Bird[] = Array.from({ length: 5 }, () => ({
      x: Math.random(),
      y: 0.12 + Math.random() * 0.4,
      v: 22 + Math.random() * 26,
      size: 5 + Math.random() * 4,
      flap: Math.random() * Math.PI * 2,
      flapRate: 5 + Math.random() * 3,
    }));

    let last = performance.now();

    function drawSun() {
      // Same anchor the crescent moon uses in NightSky, so the sun rises in
      // the moon's exact spot when you flip out of night mode.
      const sx = w * 0.87;
      const sy = h * 0.225;
      const sr = 18;

      // Soft outer halo.
      const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3.4);
      glow.addColorStop(0, 'rgba(255, 236, 168, 0.55)');
      glow.addColorStop(0.5, 'rgba(255, 224, 150, 0.22)');
      glow.addColorStop(1, 'rgba(255, 224, 150, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);

      // Gentle rays, slowly turning.
      const spin = (performance.now() / 9000) % (Math.PI * 2);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(spin);
      ctx.strokeStyle = 'rgba(255, 233, 160, 0.5)';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = sr * 1.5;
        const r1 = sr * (i % 2 ? 2.35 : 2.05);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();

      // Warm disc.
      const face = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.2, sx, sy, sr);
      face.addColorStop(0, '#fff6d8');
      face.addColorStop(1, '#ffd25e');
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawCloud(cx: number, cy: number, s: number, a: number) {
      // A cluster of soft white puffs sharing a flat base — reads as a plump,
      // cartoon cloud without any sprite art.
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      const puffs: [number, number, number][] = [
        [0, 0, 15],
        [16, 4, 12],
        [-16, 4, 12],
        [8, -6, 12],
        [-8, -5, 11],
        [26, 6, 8],
        [-26, 6, 8],
      ];
      for (const [dx, dy, r] of puffs) {
        ctx.beginPath();
        ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Flatten the underside.
      ctx.fillRect(cx - 30 * s, cy + 4 * s, 60 * s, 9 * s);
      ctx.globalAlpha = 1;
    }

    function drawBird(bx: number, by: number, size: number, flap: number) {
      // Two wings as shallow strokes whose tips rise and fall — the classic
      // "m" silhouette, animated so the wings beat.
      const lift = Math.sin(flap); // -1..1
      const wing = size;
      const tipY = by - lift * size * 0.6;
      ctx.strokeStyle = 'rgba(74, 92, 120, 0.75)';
      ctx.lineWidth = Math.max(1.4, size * 0.28);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - wing * 1.6, tipY);
      ctx.quadraticCurveTo(bx - wing * 0.5, by + size * 0.25, bx, by);
      ctx.quadraticCurveTo(bx + wing * 0.5, by + size * 0.25, bx + wing * 1.6, tipY);
      ctx.stroke();
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      drawSun();

      // Clouds drift rightward and wrap around once fully off-screen.
      for (const c of clouds) {
        c.x += (c.v * dt) / 1000 / w;
        if (c.x * w - 60 * c.s > w) {
          c.x = -(60 * c.s) / w;
          c.y = 0.08 + Math.random() * 0.5;
        }
        drawCloud(c.x * w, c.y * h, c.s, c.a);
      }

      // Birds flap and glide across, wrapping like the clouds.
      for (const b of birds) {
        b.x += (b.v * dt) / 1000 / w;
        b.flap += (b.flapRate * dt) / 1000;
        if (b.x * w - b.size * 2 > w) {
          b.x = -(b.size * 2) / w;
          b.y = 0.12 + Math.random() * 0.4;
          b.v = 22 + Math.random() * 26;
        }
        drawBird(b.x * w, b.y * h, b.size, b.flap);
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return <canvas ref={ref} className="day-sky" aria-hidden="true" />;
}
