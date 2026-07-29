// Generates Bloom's app icons (a cozy cherry-blossom) from an inline SVG.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Build the icon SVG. `bleed` = full-square gradient for maskable icons;
 *  otherwise use a rounded tile. `inset` shrinks the flower into the safe zone. */
function svg({ bleed, inset = 1 }) {
  const S = 1024;
  const bg = bleed
    ? `<rect width="${S}" height="${S}" fill="url(#bg)"/>`
    : `<rect width="${S}" height="${S}" rx="230" fill="url(#bg)"/>`;
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
const tile = svg({ bleed: false });
const bleed = svg({ bleed: true, inset: 0.82 }); // safe-zone inset for maskable icons

await Promise.all([
  // PWA / web
  png(tile, 192, resolve(root, 'public/icon-192.png')),
  png(tile, 512, resolve(root, 'public/icon-512.png')),
  png(bleed, 512, resolve(root, 'public/icon-maskable-512.png')),
  png(tile, 180, resolve(root, 'public/apple-touch-icon.png')),
  png(tile, 32, resolve(root, 'public/favicon-32.png')),
]);

console.log('done');
