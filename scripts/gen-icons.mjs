// Generates Bloom's app icons (a cozy cherry-blossom) from an inline SVG.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Build the icon SVG. `bleed` = full-square gradient (maskable/adaptive);
 *  otherwise a rounded tile (`round` makes it a full circle). `inset` shrinks
 *  the flower into the safe zone. */
function svg({ bleed, inset = 1, round = false }) {
  const S = 1024;
  const rx = round ? S / 2 : 230;
  const bg = bleed
    ? `<rect width="${S}" height="${S}" fill="url(#bg)"/>`
    : `<rect width="${S}" height="${S}" rx="${rx}" fill="url(#bg)"/>`;
  const petalRy = 150 * inset;
  const petalRx = 108 * inset;
  const petalCy = -148 * inset;
  const centerR = 92 * inset;
  const petals = Array.from({ length: 5 }, (_, i) => {
    const rot = i * 72;
    return `<g transform="rotate(${rot})">
      <ellipse cx="0" cy="${petalCy}" rx="${petalRx}" ry="${petalRy}" fill="#fff7fb"/>
      <ellipse cx="0" cy="${petalCy - petalRy * 0.62}" rx="${petalRx * 0.2}" ry="${petalRy * 0.24}" fill="url(#bg)"/>
    </g>`;
  }).join('');
  const stamens = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    const rr = centerR * 0.5;
    return `<circle cx="${Math.cos(a) * rr}" cy="${Math.sin(a) * rr}" r="${centerR * 0.16}" fill="#ffb84d"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb0d4"/>
        <stop offset="1" stop-color="#c79fe6"/>
      </linearGradient>
    </defs>
    ${bg}
    <g transform="translate(${S / 2},${S / 2})">
      ${petals}
      <circle r="${centerR}" fill="#ffd76b"/>
      ${stamens}
    </g>
  </svg>`;
}

async function png(svgStr, size, outPath) {
  await sharp(Buffer.from(svgStr)).resize(size, size).png().toFile(outPath);
  console.log('wrote', outPath);
}

mkdirSync(resolve(root, 'public'), { recursive: true });
mkdirSync(resolve(root, 'resources'), { recursive: true });

const tile = svg({ bleed: false });
const bleed = svg({ bleed: true, inset: 0.82 }); // safe-zone inset for adaptive/maskable

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

// ---- iOS app icon + launch image ----
const iosAssets = resolve(root, 'ios/App/App/Assets.xcassets');
if (existsSync(iosAssets)) {
  const splash = svg({ bleed: true, inset: 0.68 });
  await Promise.all([
    png(
      bleed,
      1024,
      resolve(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'),
    ),
    ...[
      'splash-2732x2732.png',
      'splash-2732x2732-1.png',
      'splash-2732x2732-2.png',
    ].map((filename) =>
      png(splash, 2732, resolve(iosAssets, 'Splash.imageset', filename)),
    ),
  ]);
  console.log('wrote iOS app icon and launch images');
}

console.log('done');
