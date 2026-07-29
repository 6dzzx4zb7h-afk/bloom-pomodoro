import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectPrecacheFiles,
  computeBuildHash,
  generateServiceWorker,
  renderServiceWorker,
  shouldPrecache,
} from './generate-service-worker.mjs';

const temporaryDirectories = [];

function workerHarness(source, cacheStorage = new Map()) {
  const listeners = new Map();
  const fetch = async () => {
    throw new Error('network unavailable');
  };
  const pathFor = (input) =>
    new URL(typeof input === 'string' ? input : input.url, 'https://bloom.test').pathname;

  const caches = {
    async open(name) {
      if (!cacheStorage.has(name)) cacheStorage.set(name, new Map());
      const entries = cacheStorage.get(name);
      return {
        async addAll(requests) {
          for (const request of requests) {
            const pathname = pathFor(request);
            entries.set(pathname, { cacheName: name, pathname });
          }
        },
        async match(request) {
          return entries.get(pathFor(request));
        },
      };
    },
    async keys() {
      return [...cacheStorage.keys()];
    },
    async delete(name) {
      return cacheStorage.delete(name);
    },
  };

  const self = {
    location: { origin: 'https://bloom.test' },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  runInNewContext(source, { caches, fetch, Request, self, URL });

  return {
    cacheStorage,
    async lifecycle(type) {
      let work;
      listeners.get(type)({
        waitUntil(promise) {
          work = Promise.resolve(promise);
        },
      });
      await work;
    },
    async request(request) {
      let response;
      let responded = false;
      listeners.get('fetch')({
        request,
        respondWith(promise) {
          responded = true;
          response = Promise.resolve(promise);
        },
      });
      return {
        responded,
        response: responded ? await response : undefined,
      };
    },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bloom-sw-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(join(root, 'api'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<main>Bloom</main>');
  await writeFile(join(root, 'assets', 'index-abc.js'), 'console.log("Bloom")');
  await writeFile(join(root, 'assets', 'index-abc.css'), 'body { color: #321; }');
  await writeFile(join(root, 'manifest.webmanifest'), '{"name":"Bloom"}');
  await writeFile(join(root, '_headers'), '/sw.js\\n  Cache-Control: no-cache');
  await writeFile(join(root, 'api', 'session.json'), '{"token":"never cache this"}');
  await writeFile(join(root, 'sw.js'), 'old generated worker');
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('service-worker build generation', () => {
  it('precache-selects local runtime assets but excludes control files and network namespaces', () => {
    expect(shouldPrecache('index.html')).toBe(true);
    expect(shouldPrecache('assets/index-abc.js')).toBe(true);
    expect(shouldPrecache('fonts/nunito.woff2')).toBe(true);
    expect(shouldPrecache('_headers')).toBe(false);
    expect(shouldPrecache('sw.js')).toBe(false);
    expect(shouldPrecache('api/session.json')).toBe(false);
    expect(shouldPrecache('auth/callback.html')).toBe(false);
  });

  it('derives a stable version from the selected production bytes', async () => {
    const root = await fixture();
    const files = await collectPrecacheFiles(root);
    const first = await computeBuildHash(root, files);
    const second = await computeBuildHash(root, files);
    expect(second).toBe(first);

    await writeFile(join(root, 'assets', 'index-abc.css'), 'body { color: #654; }');
    const changed = await computeBuildHash(root, files);
    expect(changed).not.toBe(first);
  });

  it('emits an exact precache worker with cleanup and network-only guards', async () => {
    const root = await fixture();
    const result = await generateServiceWorker(root);
    const source = renderServiceWorker(result.buildHash, result.files);

    expect(result.files).toEqual([
      'assets/index-abc.css',
      'assets/index-abc.js',
      'index.html',
      'manifest.webmanifest',
    ]);
    expect(source).toContain(`const CACHE_NAME = "bloom-shell-${result.buildHash}"`);
    expect(source).toContain("const APP_SHELL = '/'");
    expect(source).toContain('  "/"');
    expect(source).not.toContain('  "/index.html"');
    expect(source).toContain(".filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)");
    expect(source).toContain("if (url.origin !== self.location.origin || isNetworkOnlyPath(url.pathname)) return");
    expect(source).toContain("if (!PRECACHE_PATHS.has(url.pathname)) return");
    expect(source).toContain('const cache = await caches.open(CACHE_NAME)');
    expect(source).not.toContain('api/session.json');
    expect(source).not.toContain('cache.put(');
  });

  it('boots offline from the current build and replaces only old Bloom caches on update', async () => {
    const root = await fixture();
    const files = await collectPrecacheFiles(root);
    const firstHash = await computeBuildHash(root, files);
    const sharedCaches = new Map([
      ['bloom-shell-obsolete', new Map()],
      ['unrelated-cache', new Map([['/keep-me', { pathname: '/keep-me' }]])],
    ]);
    const firstWorker = workerHarness(renderServiceWorker(firstHash, files), sharedCaches);

    await firstWorker.lifecycle('install');
    await firstWorker.lifecycle('activate');

    expect([...sharedCaches.keys()].sort()).toEqual([
      `bloom-shell-${firstHash}`,
      'unrelated-cache',
    ]);

    const offlineNavigation = await firstWorker.request({
      method: 'GET',
      mode: 'navigate',
      url: 'https://bloom.test/tasks',
    });
    expect(offlineNavigation).toEqual({
      responded: true,
      response: {
        cacheName: `bloom-shell-${firstHash}`,
        pathname: '/',
      },
    });

    const offlineBundle = await firstWorker.request({
      method: 'GET',
      mode: 'cors',
      url: 'https://bloom.test/assets/index-abc.js',
    });
    expect(offlineBundle).toEqual({
      responded: true,
      response: {
        cacheName: `bloom-shell-${firstHash}`,
        pathname: '/assets/index-abc.js',
      },
    });

    const apiRequest = await firstWorker.request({
      method: 'GET',
      mode: 'cors',
      url: 'https://bloom.test/api/sync',
    });
    expect(apiRequest).toEqual({ responded: false, response: undefined });

    await writeFile(join(root, 'assets', 'index-abc.css'), 'body { color: #987; }');
    const secondHash = await computeBuildHash(root, files);
    const secondWorker = workerHarness(renderServiceWorker(secondHash, files), sharedCaches);

    await secondWorker.lifecycle('install');
    await secondWorker.lifecycle('activate');

    expect(secondHash).not.toBe(firstHash);
    expect([...sharedCaches.keys()].sort()).toEqual([
      `bloom-shell-${secondHash}`,
      'unrelated-cache',
    ]);
  });
});
