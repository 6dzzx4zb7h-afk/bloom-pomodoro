// Generates Bloom's app icons from inline SVG.
//
// The mark is a timer dial: a full ring track with an accent arc that starts at
// twelve o'clock and sweeps most of the way round (PLAN 13.21). Web, PWA,
// Android, and the launch image use the dial on its own. iOS additionally gets
// one app icon per friend (PLAN 13.9): the primary AppIcon is Mochi the bunny,
// and every other friend ships as an alternate icon the app can switch to when
// they come on duty — each of them framed by the same dial, so the six icons
// read as one app rather than six.
//
// Run with: node scripts/gen-icons.mjs   (Node 22.18+ / 24+ — the friend art is
// imported straight from TypeScript via Node's built-in type stripping).
import sharp from 'sharp';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PALETTE, SPRITES } from '../src/engine/spriteData.ts';
import { FRIENDS } from '../src/data/friends.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const S = 1024;

/** Bloom's own colours — the gradient behind the plain mark, and the two inks
 *  the dial is drawn in on top of any friend's gradient. */
const BRAND = {
  from: '#3fbfae',
  to: '#215f78',
  /** The elapsed arc: warm cream, legible on every friend gradient. */
  arc: '#fff3d9',
  /** The remaining track, dimmed so the arc is what the eye lands on. */
  track: 'rgba(255, 255, 255, 0.24)',
};

/** How far round the dial the accent arc runs, from twelve o'clock clockwise. */
const SWEEP = 268;

/**
 * The timer dial, drawn around a local origin: a full circular track with the
 * accent arc laid over it. Round caps give the arc its two visible ends, which
 * is what makes it read as a clock hand's path rather than a plain ring.
 */
function dial({ r, w, track = BRAND.track, arc = BRAND.arc }) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const start = -90;
  const end = start + SWEEP;
  const [x0, y0] = [Math.cos(rad(start)) * r, Math.sin(rad(start)) * r];
  const [x1, y1] = [Math.cos(rad(end)) * r, Math.sin(rad(end)) * r];
  return `<circle r="${r}" fill="none" stroke="${track}" stroke-width="${w}"/>
    <path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}"
      fill="none" stroke="${arc}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** Build the plain Bloom mark. `bleed` = full-square gradient (maskable/adaptive);
 *  otherwise a rounded tile (`round` makes it a full circle). `inset` shrinks
 *  the dial into the safe zone. */
function svg({ bleed, inset = 1, round = false }) {
  const rx = round ? S / 2 : 230;
  const bg = bleed
    ? `<rect width="${S}" height="${S}" fill="url(#bg)"/>`
    : `<rect width="${S}" height="${S}" rx="${rx}" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND.from}"/>
        <stop offset="1" stop-color="${BRAND.to}"/>
      </linearGradient>
    </defs>
    ${bg}
    <g transform="translate(${S / 2},${S / 2})">
      ${dial({ r: 300 * inset, w: 104 * inset })}
    </g>
  </svg>`;
}

/**
 * The launch image. It deliberately does not use the icon's gradient: the
 * WebView underneath it opens on the app's own canvas colour, so painting the
 * launch screen anything else would flash a second background between the two.
 * The dial is drawn in Bloom's ink instead, which is what makes it visible on
 * a near-white field.
 *
 * The dial looks small here because the storyboard scales this square to fill
 * the screen and crops the sides: a phone shows roughly the middle 45% of the
 * width, so a mark drawn at ~19% of the square lands at ~40% of screen width.
 */
function splashSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <rect width="${S}" height="${S}" fill="#fdf3fb"/>
    <g transform="translate(${S / 2},${S / 2})">
      ${dial({ r: 80, w: 32, track: 'rgba(33, 95, 120, 0.14)', arc: '#2f9e94' })}
    </g>
  </svg>`;
}

/** Relative luminance of a #rrggbb colour, as a 0–255 grey. */
function greyOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const h = y.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/** Geometry of the dial that frames a friend. The sprite box is sized so the
 *  art sits inside the ring's opening rather than colliding with the stroke. */
const FRIEND_DIAL = { r: 382, w: 54, box: 600 };

/**
 * One friend's app icon: their gradient, Bloom's timer dial framing them, and
 * their own pixel sprite drawn at whole-pixel cell sizes so it stays crisp down
 * to the smallest home-screen size.
 *
 * `variant` selects the iOS appearance (PLAN 13.10):
 *   light  — the default icon, gradient background and all.
 *   dark   — no background at all; iOS supplies the dark backdrop behind the
 *            sprite, so the icon sits in a dark home screen instead of
 *            punching a bright pastel tile through it.
 *   tinted — no background and greyscale art, because iOS maps the image's
 *            luminance onto whatever tint the user picked. The dial is drawn in
 *            flat greys here rather than translucent white so it survives that
 *            mapping instead of dissolving into the backdrop.
 */
function friendIconSvg(friend, variant = 'light') {
  const rows = SPRITES[friend.sprite];
  const cols = Math.max(...rows.map((r) => r.length));
  // Fit the sprite inside a square box rather than scaling by one axis, so a
  // wide friend (crab) and a tall one (bunny) end up optically the same size.
  const { r, w, box } = FRIEND_DIAL;
  const cell = Math.floor(Math.min(box / cols, box / rows.length));
  const spriteW = cell * cols;
  const spriteH = cell * rows.length;
  const originX = Math.round((S - spriteW) / 2);
  const originY = Math.round((S - spriteH) / 2);

  const tinted = variant === 'tinted';
  const pixels = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = rows[y][x] || '.';
      const fill = PALETTE[ch];
      if (!fill) continue;
      pixels.push(
        `<rect x="${originX + x * cell}" y="${originY + y * cell}" width="${cell}" height="${cell}" fill="${tinted ? greyOf(fill) : fill}"/>`,
      );
    }
  }

  if (variant !== 'light') {
    // No background rect and no contact shadow: the system owns the backdrop
    // for these appearances, and anything opaque here would cover it.
    const ink = tinted
      ? { track: '#5c5c5c', arc: '#efefef' }
      : { track: 'rgba(255, 255, 255, 0.20)', arc: BRAND.arc };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      <g transform="translate(${S / 2},${S / 2})">${dial({ r, w, ...ink })}</g>
      <g shape-rendering="crispEdges">${pixels.join('')}</g>
    </svg>`;
  }

  // A soft contact shadow keeps the sprite from floating on the gradient.
  const shadow = `<ellipse cx="${S / 2}" cy="${originY + spriteH - cell * 0.35}" rx="${spriteW * 0.4}" ry="${cell * 0.7}" fill="#243b45" opacity="0.16"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${friend.appIcon.from}"/>
        <stop offset="1" stop-color="${friend.appIcon.to}"/>
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    <g transform="translate(${S / 2},${S / 2})">${dial({ r, w })}</g>
    ${shadow}
    <g shape-rendering="crispEdges">${pixels.join('')}</g>
  </svg>`;
}

async function png(svgStr, size, outPath, { opaque = false } = {}) {
  let pipeline = sharp(Buffer.from(svgStr)).resize(size, size);
  // App Store validation rejects app icons that carry an alpha channel.
  if (opaque) pipeline = pipeline.flatten({ background: '#ffffff' });
  await pipeline.png().toFile(outPath);
  console.log('wrote', outPath);
}

mkdirSync(resolve(root, 'public'), { recursive: true });
mkdirSync(resolve(root, 'resources'), { recursive: true });

const tile = svg({ bleed: false });
const bleed = svg({ bleed: true, inset: 0.82 }); // safe-zone inset for adaptive/maskable
const splash = splashSvg();

await Promise.all([
  // PWA / web
  png(tile, 192, resolve(root, 'public/icon-192.png')),
  png(tile, 512, resolve(root, 'public/icon-512.png')),
  png(bleed, 512, resolve(root, 'public/icon-maskable-512.png')),
  png(tile, 180, resolve(root, 'public/apple-touch-icon.png')),
  png(tile, 32, resolve(root, 'public/favicon-32.png')),
  // Capacitor source (full-bleed 1024, flower kept in the safe zone)
  png(bleed, 1024, resolve(root, 'resources/icon.png')),
  png(bleed, 1024, resolve(root, 'resources/icon-foreground.png')),
]);

// ---- Android launcher icons (written straight into the native res dirs) ----
const androidRes = resolve(root, 'android/app/src/main/res');
if (existsSync(androidRes)) {
  const tileRound = svg({ bleed: false, round: true });
  // px sizes per density: [legacy launcher (48dp), adaptive foreground (108dp)]
  const dens = {
    'mipmap-mdpi': [48, 108],
    'mipmap-hdpi': [72, 162],
    'mipmap-xhdpi': [96, 216],
    'mipmap-xxhdpi': [144, 324],
    'mipmap-xxxhdpi': [192, 432],
  };
  const jobs = [];
  for (const [dir, [legacy, fg]] of Object.entries(dens)) {
    const d = resolve(androidRes, dir);
    jobs.push(png(tile, legacy, resolve(d, 'ic_launcher.png')));
    jobs.push(png(tileRound, legacy, resolve(d, 'ic_launcher_round.png')));
    // Full-bleed gradient+flower foreground; the adaptive mask rounds it.
    jobs.push(png(bleed, fg, resolve(d, 'ic_launcher_foreground.png')));
  }
  await Promise.all(jobs);
  console.log('wrote android launcher icons');
}

// ---- iOS app icons (one per friend) + launch image ----
const iosAssets = resolve(root, 'ios/App/App/Assets.xcassets');
if (existsSync(iosAssets)) {
  const jobs = [];

  // Light plus the two appearance variants iOS actually supports in an asset
  // catalog. There is no "clear" appearance here: the iOS 26 Clear/Liquid Glass
  // look is produced from an Icon Composer `.icon` bundle, and actool silently
  // drops any other appearance value it is handed.
  const VARIANTS = [
    { variant: 'light', suffix: '', appearances: null, opaque: true },
    {
      variant: 'dark',
      suffix: '-dark',
      appearances: [{ appearance: 'luminosity', value: 'dark' }],
      opaque: false,
    },
    {
      variant: 'tinted',
      suffix: '-tinted',
      appearances: [{ appearance: 'luminosity', value: 'tinted' }],
      opaque: false,
    },
  ];

  for (const friend of FRIENDS) {
    // `appIcon.icon === null` is the primary icon; alternates use their own set.
    const setName = friend.appIcon.icon ?? 'AppIcon';
    const setDir = resolve(iosAssets, `${setName}.appiconset`);
    mkdirSync(setDir, { recursive: true });

    const images = VARIANTS.map(({ suffix, appearances }) => ({
      ...(appearances ? { appearances } : {}),
      filename: `${setName}${suffix}-512@2x.png`,
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024',
    }));
    writeFileSync(
      resolve(setDir, 'Contents.json'),
      `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
    );

    for (const { variant, suffix, opaque } of VARIANTS) {
      jobs.push(
        png(
          friendIconSvg(friend, variant),
          1024,
          resolve(setDir, `${setName}${suffix}-512@2x.png`),
          { opaque },
        ),
      );
    }
  }

  jobs.push(
    ...[
      'splash-2732x2732.png',
      'splash-2732x2732-1.png',
      'splash-2732x2732-2.png',
    ].map((filename) =>
      png(splash, 2732, resolve(iosAssets, 'Splash.imageset', filename)),
    ),
  );

  await Promise.all(jobs);
  console.log('wrote iOS app icons and launch images');
}

console.log('done');
