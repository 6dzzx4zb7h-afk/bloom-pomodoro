import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'visual-artifacts', 'one-pixel-proof');
const playwright = path.join(root, 'node_modules', '.bin', 'playwright');

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute));
    else files.push(absolute);
  }
  return files;
}

await rm(output, { recursive: true, force: true });
const result = spawnSync(
  playwright,
  [
    'test',
    '--config',
    'playwright.visual.config.ts',
    '--grep',
    'goals-day-active-390x844',
    '--output',
    path.relative(root, output),
    '--reporter',
    'line',
  ],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BLOOM_VISUAL_PROBE: 'goals-day-active-390x844' },
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status === 0) {
  throw new Error('The deliberate one-CSS-pixel visual change unexpectedly passed.');
}

const artifacts = await filesBelow(output);
const actual = artifacts.find((file) => file.endsWith('-actual.png'));
const diff = artifacts.find((file) => file.endsWith('-diff.png'));
const expected = artifacts.find((file) => file.endsWith('-expected.png'));
if (!actual || !diff || !expected) {
  throw new Error('The one-pixel failure did not emit expected, actual, and diff PNG artifacts.');
}

console.log('One-CSS-pixel change failed as required; expected, actual, and diff PNGs are readable in visual-artifacts/one-pixel-proof.');
