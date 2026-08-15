import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');
const DIST = resolve(ROOT, 'dist');

const SOURCE_EXTENSIONS = new Set(['.css', '.json', '.ts', '.tsx']);
const NETWORK_APIS = [
  ['fetch', /\bfetch\s*\(/g],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/g],
  ['WebSocket', /\bWebSocket\b/g],
  ['EventSource', /\bEventSource\b/g],
  ['sendBeacon', /\bsendBeacon\b/g],
];
const URL_RE = /https?:\/\/[^\s"'`<>\\)]+/g;
const ALLOWED_BUNDLE_URLS = [
  'https://capacitorjs.com/', // dependency license banner; never dereferenced
  'https://reactjs.org/docs/error-decoder.html?invariant=', // React error text only
  'http://www.w3.org/', // DOM/SVG/MathML namespace identifiers, not requests
];
const NETWORK_DEPENDENCY_RE =
  /(?:^|[-_/])(analytics|amplitude|auth0|axios|firebase|mixpanel|posthog|segment|sentry|socket\.io|supabase)(?:$|[-_/])/i;

const failures = [];

function posix(path) {
  return path.split(sep).join('/');
}

function fail(message) {
  failures.push(message);
}

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(root, absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function offsets(text, pattern) {
  const found = [];
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) found.push(match.index);
  return found;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

async function mustExist(path, label) {
  try {
    const info = await stat(path);
    if (!info.isFile()) fail(`${label} is not a file: ${posix(relative(ROOT, path))}`);
  } catch {
    fail(`${label} is missing: ${posix(relative(ROOT, path))}`);
  }
}

function runtimePath(reference) {
  const clean = reference.split('#')[0].split('?')[0];
  if (!clean || clean === '/' || clean.startsWith('data:') || clean.startsWith('blob:')) {
    return clean === '/' ? resolve(DIST, 'index.html') : null;
  }
  if (/^[a-z]+:/i.test(clean) || clean.startsWith('//')) {
    fail(`remote runtime reference: ${reference}`);
    return null;
  }
  return resolve(DIST, clean.replace(/^\//, ''));
}

const sourceFiles = (await walk(SRC)).filter((path) => SOURCE_EXTENSIONS.has(extname(path)));
for (const path of sourceFiles) {
  const text = await readFile(path, 'utf8');
  const name = posix(relative(ROOT, path));
  for (const [api, pattern] of NETWORK_APIS) {
    for (const offset of offsets(text, pattern)) {
      fail(`${name}:${lineAt(text, offset)} uses ${api}`);
    }
  }
  for (const url of text.match(URL_RE) ?? []) {
    fail(`${name} contains external URL ${url}`);
  }
}

const packageJson = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
const dependencyNames = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
});
for (const dependency of dependencyNames) {
  if (NETWORK_DEPENDENCY_RE.test(dependency)) {
    fail(`network/reporting dependency is present: ${dependency}`);
  }
}

const capacitorConfig = await readFile(resolve(ROOT, 'capacitor.config.ts'), 'utf8');
if (/\bserver\s*:\s*\{/.test(capacitorConfig)) {
  fail('capacitor.config.ts contains a server override');
}
if (/\bCapacitorHttp\b/.test(capacitorConfig)) {
  fail('capacitor.config.ts configures CapacitorHttp');
}

const distFiles = await walk(DIST).catch(() => []);
if (distFiles.length === 0) fail('dist is missing; run npm run build first');

const bundleFiles = distFiles.filter(
  (path) => extname(path) === '.js' && posix(relative(DIST, path)).startsWith('assets/'),
);
if (bundleFiles.length !== 1) {
  fail(`expected one application JavaScript bundle, found ${bundleFiles.length}`);
}

let approvedBundleFetches = 0;
for (const path of bundleFiles) {
  const text = await readFile(path, 'utf8');
  const name = posix(relative(ROOT, path));
  for (const [api, pattern] of NETWORK_APIS) {
    const found = offsets(text, pattern);
    if (api !== 'fetch' && found.length > 0) {
      fail(`${name} contains ${found.length} ${api} site(s)`);
      continue;
    }
    for (const offset of found) {
      const context = text.slice(Math.max(0, offset - 2200), offset + 2200);
      const isModulePreload = context.includes('modulepreload');
      const isDormantCapacitorAdapter =
        context.includes('webFetchExtra') && context.includes('CapacitorHttp');
      if (isModulePreload || isDormantCapacitorAdapter) approvedBundleFetches += 1;
      else fail(`${name} contains an unapproved fetch site at byte ${offset}`);
    }
  }
  for (const url of text.match(URL_RE) ?? []) {
    if (!ALLOWED_BUNDLE_URLS.some((prefix) => url.startsWith(prefix))) {
      fail(`${name} contains unapproved external URL ${url}`);
    }
  }
}
if (approvedBundleFetches !== 2) {
  fail(`expected two framework-generated bundle fetch sites, found ${approvedBundleFetches}`);
}

const serviceWorkerPath = resolve(DIST, 'sw.js');
await mustExist(serviceWorkerPath, 'generated service worker');
let precacheUrls = [];
try {
  const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
  const serviceWorkerFetches = offsets(serviceWorker, /\bfetch\s*\(/g).length;
  if (serviceWorkerFetches !== 2) {
    fail(`service worker contains ${serviceWorkerFetches} fetch sites instead of two cache fallbacks`);
  }
  for (const required of [
    "url.origin !== self.location.origin",
    'isNetworkOnlyPath(url.pathname)',
    "if (request.method !== 'GET') return",
  ]) {
    if (!serviceWorker.includes(required)) fail(`service worker is missing guard: ${required}`);
  }
  const precacheMatch = serviceWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
  if (!precacheMatch) fail('service worker precache list is missing');
  else precacheUrls = JSON.parse(precacheMatch[1]);
} catch (error) {
  fail(`service worker could not be audited: ${error instanceof Error ? error.message : error}`);
}

const indexPath = resolve(DIST, 'index.html');
const index = await readFile(indexPath, 'utf8').catch(() => '');
const htmlReferences = [...index.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(
  (match) => match[1],
);
for (const reference of htmlReferences) {
  const path = runtimePath(reference);
  if (path) await mustExist(path, `HTML asset ${reference}`);
}

for (const path of distFiles.filter((file) => extname(file) === '.css')) {
  const css = await readFile(path, 'utf8');
  const references = [...css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/g)].map(
    (match) => match[1],
  );
  for (const reference of references) {
    const asset = runtimePath(reference);
    if (asset) await mustExist(asset, `CSS asset ${reference}`);
  }
}

const manifestPath = resolve(DIST, 'manifest.webmanifest');
await mustExist(manifestPath, 'web manifest');
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const icon of manifest.icons ?? []) {
    const asset = runtimePath(icon.src);
    if (asset) await mustExist(asset, `manifest icon ${icon.src}`);
  }
} catch (error) {
  fail(`manifest could not be audited: ${error instanceof Error ? error.message : error}`);
}

for (const font of ['fredoka-latin.woff2', 'nunito-latin.woff2']) {
  await mustExist(resolve(DIST, 'fonts', font), `bundled font ${font}`);
}
await mustExist(resolve(SRC, 'engine', 'completionCue.json'), 'local completion cue data');
const audioSource = await readFile(resolve(SRC, 'engine', 'audio.ts'), 'utf8');
if (!audioSource.includes("import completionCue from './completionCue.json'")) {
  fail('completion audio no longer imports its local cue data');
}
const guideSource = await readFile(resolve(SRC, 'content', 'guide.ts'), 'utf8');
if (!guideSource.includes('static TypeScript data')) {
  fail('guide content is no longer explicitly bundled static data');
}

for (const required of htmlReferences) {
  if (!required.startsWith('/') || required === '/') continue;
  const precachePath = required.split('?')[0];
  if (!precacheUrls.includes(precachePath)) {
    fail(`app-shell asset is absent from the service-worker precache: ${precachePath}`);
  }
}

if (failures.length > 0) {
  console.error('Local-only audit failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log('Local-only audit passed.');
  console.log(`- ${sourceFiles.length} source files contain no network API or external URL.`);
  console.log('- no auth, sync, telemetry, analytics, or diagnostic reporter dependency is present.');
  console.log('- every HTML, CSS, manifest, font, icon, guide, and completion-cue asset is local.');
  console.log('- two framework fetch sites are limited to same-origin preload and a dormant adapter.');
  console.log('- service-worker fetches are same-origin app-shell cache fallbacks with network-only guards.');
}
