import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Every app source file, excluding the tests that describe these rules. */
function appSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      appSources(path, found);
    } else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.includes('.test.')) {
      found.push(path);
    }
  }
  return found;
}

const sources = appSources(here).map((path) => ({
  name: relative(root, path),
  text: readFileSync(path, 'utf8'),
}));

/**
 * ROADMAP 7.2 — the local-only privacy audit, as a standing guard.
 *
 * Constraint 1 is "local-first, no network", and dropping sync made it
 * absolute: there is no longer any code path that is *supposed* to reach the
 * network, so a single hit is a defect rather than a policy question. A grep
 * proves that on the day it is run; this proves it on every commit.
 */
describe('ROADMAP 7.2 local-only guarantee', () => {
  it('has no source file that can open a network connection', () => {
    const offenders = sources
      .filter(({ text }) =>
        /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|navigator\.sendBeacon/.test(text),
      )
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('references no external origin from source', () => {
    // The SVG namespace is an identifier, not an address — nothing resolves it.
    const allowed = /^https?:\/\/(www\.w3\.org|localhost|127\.0\.0\.1)/;
    const offenders = sources.flatMap(({ name, text }) =>
      (text.match(/https?:\/\/[^\s'"`)]+/g) ?? [])
        .filter((url) => !allowed.test(url))
        .map((url) => `${name}: ${url}`),
    );
    expect(offenders).toEqual([]);
  });

  it('loads no remote document resource from the HTML shell', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const remote = (html.match(/(?:href|src)=["'](https?:)?\/\/[^"']+/g) ?? []);
    expect(remote).toEqual([]);
  });

  it('bundles its fonts instead of fetching them', () => {
    const css = readFileSync(join(here, 'styles.css'), 'utf8');
    const faces = css.match(/@font-face[\s\S]*?\}/g) ?? [];
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face).toMatch(/src:\s*url\('\/fonts\//);
    }
  });

  it('keeps the service worker on its own origin', () => {
    const sw = readFileSync(join(root, 'scripts/generate-service-worker.mjs'), 'utf8');
    // It may only ever re-request what it precached; anything cross-origin is
    // handed straight back to the browser untouched.
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toContain("credentials: 'same-origin'");
  });
});
