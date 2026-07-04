import { useEffect, useRef } from 'react';

interface Star {
  x: number; // 0..1 fraction of width
  y: number; // 0..1 fraction of height
  r: number;
  col: string;
  sparkle: boolean;
  /** Resting brightness — most stars just sit here, faint. */
  base: number;
  /** Brightness at the top of a pulse. */
  peak: number;
  /** ms until this star's next pulse (while idle). */
  wait: number;
  /** ms into the current pulse, or -1 when idle. */
  t: number;
  /** Length of the current pulse in ms. */
  dur: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

const STAR_COLORS = ['#fff7fb', '#e6dcff', '#ffd3e8', '#cfe4ff'];

/**
 * Animated night backdrop: a crescent moon, twinkling pixel stars, and the
 * occasional meteor streaking down. Purely decorative — it sits behind the
 * screens (the dark sky gradient itself comes from `.phone.night` CSS) and
 * ignores pointer events.
 */
export function NightSky() {
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

    // Each star rests at a faint `base` glow and, on its own randomized
    // timer, swells to `peak` and eases back down — so only a scattered few
    // are ever twinkling at once, never the whole sky in sync.
    const stars: Star[] = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.94,
      r: 0.5 + Math.random() * 1.2,
      col: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
      sparkle: Math.random() < 0.14,
      base: 0.12 + Math.random() * 0.25,
      peak: 0.7 + Math.random() * 0.3,
      wait: Math.random() * 7000, // staggered first pulses
      t: -1,
      dur: 0,
    }));

    let meteors: Meteor[] = [];
    let nextMeteor = 1500 + Math.random() * 2500; // ms until the first one

    let last = performance.now();

    function drawMoon() {
      // Tucked between the mode tabs and the timer ring so the header/tab
      // surfaces never sit on top of it.
      const mx = w * 0.87;
      const my = h * 0.225;
      const mr = 17;
      const glow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.6);
      glow.addColorStop(0, 'rgba(255, 240, 200, 0.25)');
      glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
      ctx.fillStyle = '#ffeecb';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      // Punch out a circle to leave a crescent (sky gradient shows through).
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(mx - mr * 0.45, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      drawMoon();

      // Twinkling stars — square pixels, on-brand with the sprite engine.
      // Advance each star's own pulse timer; idle stars just glow faintly.
      for (const s of stars) {
        if (s.t < 0) {
          s.wait -= dt;
          if (s.wait <= 0) {
            s.t = 0;
            s.dur = 1200 + Math.random() * 1800;
          }
        } else {
          s.t += dt;
          if (s.t >= s.dur) {
            s.t = -1;
            s.wait = 1500 + Math.random() * 8000;
          }
        }
        // Ease up to peak and back down over the pulse (half sine).
        const lift = s.t >= 0 ? Math.sin(Math.PI * (s.t / s.dur)) : 0;
        const alpha = s.base + (s.peak - s.base) * lift;
        const x = s.x * w;
        const y = s.y * h;
        const px = s.r * 2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.col;
        ctx.fillRect(x, y, px, px);
        if (s.sparkle && lift > 0.25) {
          // little + cross that grows in while this star is pulsing bright
          ctx.globalAlpha = alpha * 0.55 * lift;
          ctx.fillRect(x - px, y, px * 3, px / 2);
          ctx.fillRect(x + px / 4, y - px, px / 2, px * 3);
        }
      }
      ctx.globalAlpha = 1;

      // Meteors: spawn one every few seconds, streak down and fade out.
      nextMeteor -= dt;
      if (nextMeteor <= 0) {
        nextMeteor = 2800 + Math.random() * 5200;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const speed = (0.45 + Math.random() * 0.3) * h; // px/s downward
        meteors.push({
          x: (0.15 + Math.random() * 0.7) * w,
          y: -12,
          vx: dir * speed * 0.55,
          vy: speed,
          life: 0,
          max: 1.6,
        });
      }
      meteors = meteors.filter((m) => {
        m.life += dt / 1000;
        m.x += (m.vx * dt) / 1000;
        m.y += (m.vy * dt) / 1000;
        if (m.life > m.max || m.y > h + 40) return false;
        // quick fade-in, slow fade-out
        const fade = Math.min(1, m.life * 6) * Math.max(0, 1 - m.life / m.max);
        const sp = Math.hypot(m.vx, m.vy);
        const len = 90;
        const tx = m.x - (m.vx / sp) * len;
        const ty = m.y - (m.vy / sp) * len;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(255, 244, 250, ${0.9 * fade})`);
        g.addColorStop(0.35, `rgba(255, 211, 232, ${0.5 * fade})`);
        g.addColorStop(1, 'rgba(255, 211, 232, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
        ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
        return true;
      });
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return <canvas ref={ref} className="night-sky" aria-hidden="true" />;
}
