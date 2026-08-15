import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'visual-tests', 'cases.json');
const baselineRoot = path.join(root, 'visual-baselines', 'chromium-macos26-arm64');

async function pngFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await pngFiles(absolute)) {
        files.push(path.join(entry.name, nested));
      }
    } else if (entry.isFile() && entry.name.endsWith('.png')) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

export function baselineProblems(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((file) => !actualSet.has(file)),
    stale: actual.filter((file) => !expectedSet.has(file)),
  };
}

function formatProblems({ missing, stale }) {
  const lines = [];
  if (missing.length > 0) lines.push(`Missing visual baselines: ${missing.join(', ')}`);
  if (stale.length > 0) lines.push(`Stale visual baselines: ${stale.join(', ')}`);
  return lines;
}

async function expectedBaselines() {
  const cases = JSON.parse(await readFile(manifestPath, 'utf8'));
  const names = cases.map((entry) => entry.baseline);
  if (names.some((name) => typeof name !== 'string' || path.basename(name) !== name)) {
    throw new Error('Every visual baseline must be one plain PNG filename.');
  }
  if (new Set(names).size !== names.length) {
    throw new Error('Visual baseline names must be unique.');
  }
  return names.sort();
}

function proveFailureDiagnostics() {
  const proof = baselineProblems(['kept.png', 'missing.png'], ['kept.png', 'stale.png']);
  const lines = formatProblems(proof);
  if (!lines.some((line) => line.includes('Missing visual baselines: missing.png'))) {
    throw new Error('Missing-baseline diagnostic proof failed.');
  }
  if (!lines.some((line) => line.includes('Stale visual baselines: stale.png'))) {
    throw new Error('Stale-baseline diagnostic proof failed.');
  }
  console.log('Visual baseline contract detects both missing and stale files with named diagnostics.');
}

if (process.argv.includes('--prove-failures')) {
  proveFailureDiagnostics();
} else {
  const expected = await expectedBaselines();
  const actual = await pngFiles(baselineRoot);
  const lines = formatProblems(baselineProblems(expected, actual));
  if (lines.length > 0) {
    console.error(lines.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Visual baseline manifest matches ${actual.length} committed PNG files.`);
  }
}
