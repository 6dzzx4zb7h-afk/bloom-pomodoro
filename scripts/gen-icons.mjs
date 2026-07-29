// Generates Bloom's web and Android icons/splashes from one local SVG source.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function svg({ bleed, inset = 1, round = false, transparent = false }) {
  const size = 1024;
  const radius = round ? size / 2 : 230;
  const background = transparent
    ? ''
    : bleed
      ? `<rect width="${size}" height="${size}" fill="url(#bg)"/>`
      : `<rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>`;
  const petalRy = 150 * inset;
  const petalRx = 108 * inset;
  const petalCy = -148 * inset;
  const centerR = 92 * inset;
  const petals = Array.from({ length: 5 }, (_, index) => {
    const rotation = index * 72;
    return `<g transform="rotate(${rotation})">
      <ellipse cx="0" cy="${petalCy}" rx="${petalRx}" ry="${petalRy}" fill="#fff7fb"/>
      <ellipse cx="0" cy="${petalCy - petalRy * 0.62}" rx="${petalRx * 0.2}" ry="${petalRy * 0.24}" fill="url(#bg)"/>
    </g>`;
  }).join('');
  const stamens = Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    const radiusFromCenter = centerR * 0.5;
    return `<circle cx="${Math.cos(angle) * radiusFromCenter}" cy="${Math.sin(angle) * radiusFromCenter}" r="${centerR * 0.16}" fill="#ffb84d"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb0d4"/>
        <stop offset="1" stop-color="#c79fe6"/>
      </linearGradient>
    </defs>
    ${background}
    <g transform="translate(${size / 2},${size / 2})">
      ${petals}
      <circle r="${centerR}" fill="#ffd76b"/>
      ${stamens}
    </g>
  </svg>`;
}

async function png(svgSource, width, height, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svgSource)).resize(width, height, { fit: 'cover' }).png().toFile(outputPath);
  console.log('wrote', outputPath);
}

const tile = svg({ bleed: false });
const roundTile = svg({ bleed: false, round: true });
const maskable = svg({ bleed: true, inset: 0.82 });
const adaptiveForeground = svg({ bleed: true, inset: 0.58, transparent: true });
const splash = svg({ bleed: true, inset: 0.58 });

await Promise.all([
  png(tile, 192, 192, resolve(root, 'public/icon-192.png')),
  png(tile, 512, 512, resolve(root, 'public/icon-512.png')),
  png(maskable, 512, 512, resolve(root, 'public/icon-maskable-512.png')),
  png(tile, 180, 180, resolve(root, 'public/apple-touch-icon.png')),
  png(tile, 32, 32, resolve(root, 'public/favicon-32.png')),
]);

const androidRes = resolve(root, 'android/app/src/main/res');
if (existsSync(androidRes)) {
  const launcherSizes = {
    'mipmap-mdpi': [48, 108],
    'mipmap-hdpi': [72, 162],
    'mipmap-xhdpi': [96, 216],
    'mipmap-xxhdpi': [144, 324],
    'mipmap-xxxhdpi': [192, 432],
  };
  const splashSizes = {
    drawable: [480, 320],
    'drawable-land-mdpi': [480, 320],
    'drawable-land-hdpi': [800, 480],
    'drawable-land-xhdpi': [1280, 720],
    'drawable-land-xxhdpi': [1600, 960],
    'drawable-land-xxxhdpi': [1920, 1280],
    'drawable-port-mdpi': [320, 480],
    'drawable-port-hdpi': [480, 800],
    'drawable-port-xhdpi': [720, 1280],
    'drawable-port-xxhdpi': [960, 1600],
    'drawable-port-xxxhdpi': [1280, 1920],
  };
  const nativeJobs = [];
  for (const [directory, [legacySize, foregroundSize]] of Object.entries(launcherSizes)) {
    const outputDir = resolve(androidRes, directory);
    nativeJobs.push(png(tile, legacySize, legacySize, resolve(outputDir, 'ic_launcher.png')));
    nativeJobs.push(
      png(roundTile, legacySize, legacySize, resolve(outputDir, 'ic_launcher_round.png')),
    );
    nativeJobs.push(
      png(
        adaptiveForeground,
        foregroundSize,
        foregroundSize,
        resolve(outputDir, 'ic_launcher_foreground.png'),
      ),
    );
  }
  for (const [directory, [width, height]] of Object.entries(splashSizes)) {
    nativeJobs.push(png(splash, width, height, resolve(androidRes, directory, 'splash.png')));
  }
  await Promise.all(nativeJobs);
}

console.log('done');
