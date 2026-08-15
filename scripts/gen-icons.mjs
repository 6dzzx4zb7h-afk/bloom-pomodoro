// Generates Bloom's app icons from inline SVG.
//
// Web, PWA, and iOS use Bloom's Pomodoro timer mark (PLAN 13.9b). Android is
// deliberately left on its existing blossom assets while that platform is
// deferred. iOS gets one app icon per friend (PLAN 13.9/13.9b): the primary AppIcon is
// Mochi the bunny, and every other friend ships as an alternate icon the app
// can switch to when they come on duty. Every iOS friend sits inside the same
// crowned timer dial; none has a flower behind it.
//
// Run with: node scripts/gen-icons.mjs   (Node 22.18+ / 24+ — the friend art is
// imported straight from TypeScript via Node's built-in type stripping).
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PALETTE, SPRITES } from '../src/engine/spriteData.ts';
import { FRIENDS } from '../src/data/friends.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const S = 1024;

const BRAND = {
  from: '#3fbfae',
  to: '#215f78',
};

/** The five-petal blossom, drawn around a local origin. */
function blossom({ inset = 1, opacity = 1, petalFill = '#fff7fb', notchFill = 'url(#bg)' }) {
  const petalRy = 150 * inset;
  const petalRx = 108 * inset;
  const petalCy = -148 * inset;
  const centerR = 92 * inset;
  const petals = Array.from({ length: 5 }, (_, i) => {
    const rot = i * 72;
    return `<g transform="rotate(${rot})">
      <ellipse cx="0" cy="${petalCy}" rx="${petalRx}" ry="${petalRy}" fill="${petalFill}"/>
      <ellipse cx="0" cy="${petalCy - petalRy * 0.62}" rx="${petalRx * 0.2}" ry="${petalRy * 0.24}" fill="${notchFill}"/>
    </g>`;
  }).join('');
  const stamens = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    const rr = centerR * 0.5;
    return `<circle cx="${Math.cos(a) * rr}" cy="${Math.sin(a) * rr}" r="${centerR * 0.16}" fill="#ffb84d"/>`;
  }).join('');
  return `<g opacity="${opacity}">${petals}<circle r="${centerR}" fill="#ffd76b"/>${stamens}</g>`;
}

/** PLAN 13.9b — the neutral Pomodoro identity used by every iOS icon. */
const TIMER = {
  arc: '#fff3d9',
  track: 'rgba(255, 255, 255, 0.24)',
  sweep: 268,
};

/** A progress dial, beginning at twelve o'clock and sweeping clockwise. */
function dial({ r, w, track = TIMER.track, arc = TIMER.arc }) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const start = -90;
  const end = start + TIMER.sweep;
  const [x0, y0] = [Math.cos(rad(start)) * r, Math.sin(rad(start)) * r];
  const [x1, y1] = [Math.cos(rad(end)) * r, Math.sin(rad(end)) * r];
  return `<circle r="${r}" fill="none" stroke="${track}" stroke-width="${w}"/>
    <path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}"
      fill="none" stroke="${arc}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** The short crown makes the ring read as a focus timer, not a flower or cycle. */
function pomodoroTimer({ r, w, track = TIMER.track, arc = TIMER.arc }) {
  const crownWidth = r * 0.36;
  const crownHeight = r * 0.17;
  const crownGap = r * 0.08;
  const stemWidth = r * 0.18;
  const stemHeight = r * 0.15;
  const crownY = -r - crownGap - crownHeight;
  return `<rect x="${-crownWidth / 2}" y="${crownY}" width="${crownWidth}" height="${crownHeight}"
      rx="${crownHeight * 0.35}" fill="${arc}"/>
    <rect x="${-stemWidth / 2}" y="${-r - crownGap * 0.65}" width="${stemWidth}" height="${stemHeight}"
      rx="${stemWidth * 0.2}" fill="${arc}"/>
    ${dial({ r, w, track, arc })}`;
}

/** Build the deferred Android blossom icon SVG. `bleed` = full-square gradient;
 *  otherwise a rounded tile (`round` makes it a full circle). `inset` shrinks
 *  the flower into the safe zone. */
function blossomSvg({ bleed, inset = 1, round = false }) {
  const rx = round ? S / 2 : 230;
  const bg = bleed
    ? `<rect width="${S}" height="${S}" fill="url(#bg)"/>`
    : `<rect width="${S}" height="${S}" rx="${rx}" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb0d4"/>
        <stop offset="1" stop-color="#c79fe6"/>
      </linearGradient>
    </defs>
    ${bg}
    <g transform="translate(${S / 2},${S / 2})">
      ${blossom({ inset })}
    </g>
  </svg>`;
}

/** Build the flower-free timer mark used by the web/PWA publishing target. */
function timerMarkSvg({ bleed, inset = 1 }) {
  const bg = bleed
    ? `<rect width="${S}" height="${S}" fill="url(#bg)"/>`
    : `<rect width="${S}" height="${S}" rx="230" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND.from}"/>
        <stop offset="1" stop-color="${BRAND.to}"/>
      </linearGradient>
    </defs>
    ${bg}
    <g transform="translate(${S / 2},${S / 2 + 14 * inset})">
      ${pomodoroTimer({ r: 300 * inset, w: 104 * inset })}
    </g>
  </svg>`;
}

/** Match the app canvas during launch, with a compact timer instead of a flower. */
function splashSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <rect width="${S}" height="${S}" fill="#fdf3fb"/>
    <g transform="translate(${S / 2},${S / 2})">
      ${pomodoroTimer({ r: 80, w: 30, track: 'rgba(33, 95, 120, 0.14)', arc: '#2f9e94' })}
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

/**
 * One friend's app icon: a crowned timer dial, their own deeper gradient, and
 * their pixel sprite drawn at whole-pixel cell sizes. The sprite is preserved
 * as the secondary personality cue while the timer reads first at small size.
 *
 * `variant` selects the iOS appearance (PLAN 13.10):
 *   light  — the default icon, gradient background and all.
 *   dark   — no background at all; iOS supplies the dark backdrop behind the
 *            sprite, so the icon sits in a dark home screen instead of
 *            punching a bright pastel tile through it.
 *   tinted — no background and a greyscale sprite, because iOS maps the
 *            image's luminance onto whatever tint the user picked.
 */
function friendIconSvg(friend, variant = 'light') {
  const rows = SPRITES[friend.sprite];
  const cols = Math.max(...rows.map((r) => r.length));
  // Fit the sprite inside a square box rather than scaling by one axis, so a
  // wide friend (crab) and a tall one (bunny) end up optically the same size.
  const timer = { r: 370, w: 58, box: 580 };
  const { r, w, box } = timer;
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
      ? { track: '#595959', arc: '#f2f2f2' }
      : { track: 'rgba(255, 255, 255, 0.20)', arc: TIMER.arc };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      <g transform="translate(${S / 2},${S / 2})">${pomodoroTimer({ r, w, ...ink })}</g>
      <g shape-rendering="crispEdges">${pixels.join('')}</g>
    </svg>`;
  }

  // A soft contact shadow keeps the sprite from floating on the gradient.
  const shadow = `<ellipse cx="${S / 2}" cy="${originY + spriteH - cell * 0.35}" rx="${spriteW * 0.4}" ry="${cell * 0.7}" fill="#183642" opacity="0.18"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${friend.appIcon.from}"/>
        <stop offset="1" stop-color="${friend.appIcon.to}"/>
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    <g transform="translate(${S / 2},${S / 2})">${pomodoroTimer({ r, w })}</g>
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

const webTile = timerMarkSvg({ bleed: false });
const webBleed = timerMarkSvg({ bleed: true, inset: 0.82 });
const androidTile = blossomSvg({ bleed: false });
const androidBleed = blossomSvg({ bleed: true, inset: 0.82 });
const webOutputs = [
  ['public/icon-192.png', 192, webTile],
  ['public/icon-512.png', 512, webTile],
  ['public/icon-maskable-512.png', 512, webBleed],
  ['public/apple-touch-icon.png', 180, webTile],
  ['public/favicon-32.png', 32, webTile],
  ['resources/icon.png', 1024, webBleed],
  ['resources/icon-foreground.png', 1024, webBleed],
];

await Promise.all(webOutputs.map(([file, size, source]) =>
  png(source, size, resolve(root, file))
));

// ---- Android launcher icons (written straight into the native res dirs) ----
const androidRes = resolve(root, 'android/app/src/main/res');
if (existsSync(androidRes)) {
  const tileRound = blossomSvg({ bleed: false, round: true });
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
    jobs.push(png(androidTile, legacy, resolve(d, 'ic_launcher.png')));
    jobs.push(png(tileRound, legacy, resolve(d, 'ic_launcher_round.png')));
    // Full-bleed gradient+flower foreground; the adaptive mask rounds it.
    jobs.push(png(androidBleed, fg, resolve(d, 'ic_launcher_foreground.png')));
  }
  await Promise.all(jobs);
  console.log('wrote android launcher icons');
}

// ---- iOS app icons (one per friend) + launch image ----
const iosAssets = resolve(root, 'ios/App/App/Assets.xcassets');
if (existsSync(iosAssets)) {
  const splash = splashSvg();
  const jobs = [];
  const iconOutputs = [];

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
      const outputPath = resolve(setDir, `${setName}${suffix}-512@2x.png`);
      iconOutputs.push({ friend: friend.name, setName, variant, outputPath });
      jobs.push(
        png(
          friendIconSvg(friend, variant),
          1024,
          outputPath,
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
  const iosExports = await Promise.all(iconOutputs.map(async (output) => {
    const bytes = readFileSync(output.outputPath);
    const metadata = await sharp(bytes).metadata();
    return {
      friend: output.friend,
      assetSet: output.setName,
      appearance: output.variant,
      file: output.outputPath.slice(root.length + 1),
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }));
  const webExports = await Promise.all(webOutputs.map(async ([file]) => {
    const bytes = readFileSync(resolve(root, file));
    const metadata = await sharp(bytes).metadata();
    return {
      file,
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }));
  writeFileSync(
    resolve(root, 'docs/verification/plan-13.9b-icon-export-manifest.json'),
    `${JSON.stringify({
      generatedBy: 'scripts/gen-icons.mjs',
      identity: 'crowned-pomodoro-dial-with-on-duty-friend',
      flowerInIOSIcons: false,
      flowerInWebIcons: false,
      androidChanged: false,
      iosExports,
      webExports,
    }, null, 2)}\n`,
  );
  console.log('wrote iOS app icons and launch images');
}

console.log('done');
