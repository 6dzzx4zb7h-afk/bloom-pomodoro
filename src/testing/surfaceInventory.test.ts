import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SURFACE_INVENTORY } from './surfaceInventory';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const interactiveOwnerPattern =
  /<(?:button|input|select|textarea|Dialog|Sheet|SystemSwitch|ModalFrame)\b|role=["'](?:button|switch|checkbox|tab|radio|combobox|slider)["']/;

function allTSXFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...allTSXFiles(path));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

function productionTSXFiles(directory: string): string[] {
  return allTSXFiles(directory).filter(
    (path) => !path.includes('.test.') && !path.includes('.visual-fixture.'),
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

describe('PLAN 8.21a cross-screen coverage inventory', () => {
  it('keeps stable IDs and records every interactive production owner', () => {
    expect(unique(SURFACE_INVENTORY.map((entry) => entry.id))).toHaveLength(
      SURFACE_INVENTORY.length,
    );

    const interactiveFiles = [
      ...productionTSXFiles(resolve(root, 'src/components')),
      ...productionTSXFiles(resolve(root, 'src/screens')),
    ]
      .filter((path) => interactiveOwnerPattern.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    const inventoriedOwners = SURFACE_INVENTORY
      .filter((entry) => entry.interactive)
      .map((entry) => entry.owner);

    expect(unique(inventoriedOwners)).toEqual(unique(interactiveFiles));
  });

  it('keeps every owner, test, and fixture reference real and every gap explicit', () => {
    for (const entry of SURFACE_INVENTORY) {
      expect(entry.states.length, `${entry.id} needs representative states`).toBeGreaterThan(0);
      expect(entry.remaining.trim(), `${entry.id} needs a named remaining check`).not.toBe('');
      for (const path of [
        entry.owner,
        ...entry.automated.files,
        ...entry.visual.files,
        ...(entry.visual.baselines ?? []),
      ]) {
        expect(existsSync(resolve(root, path)), `${entry.id} references missing ${path}`).toBe(true);
      }
      if (entry.automated.level === 'missing') expect(entry.automated.files).toHaveLength(0);
      if (entry.visual.level === 'fixture') expect(entry.visual.files.length).toBeGreaterThan(0);
      if (entry.visual.level === 'missing') expect(entry.visual.files).toHaveLength(0);
    }

    const indirectInteractive = SURFACE_INVENTORY
      .filter((entry) => entry.interactive && entry.automated.level !== 'direct')
      .map((entry) => entry.id);
    expect(indirectInteractive, 'PLAN 8.21b requires direct evidence for every interactive row')
      .toEqual([]);
  });

  it('accounts for every deterministic visual fixture and publishes exact summary counts', () => {
    const fixtureFiles = [
      ...readdirSync(resolve(root, 'fixtures'))
        .filter((name) => name.endsWith('.html'))
        .map((name) => `fixtures/${name}`),
      ...allTSXFiles(resolve(root, 'src'))
        .filter((path) => path.includes('.visual-fixture.'))
        .map((path) => relative(root, path)),
    ];
    const inventoriedFixtures = SURFACE_INVENTORY.flatMap((entry) => entry.visual.files);
    expect(unique(inventoriedFixtures)).toEqual(unique(fixtureFiles));

    const direct = SURFACE_INVENTORY.filter((entry) => entry.automated.level === 'direct').length;
    const indirect = SURFACE_INVENTORY.filter((entry) => entry.automated.level === 'indirect').length;
    const missing = SURFACE_INVENTORY.filter((entry) => entry.automated.level === 'missing').length;
    const fixture = SURFACE_INVENTORY.filter((entry) => entry.visual.level === 'fixture').length;
    const baseline = SURFACE_INVENTORY.filter(
      (entry) => (entry.visual.baselines?.length ?? 0) > 0,
    ).length;
    const summary = `entries=${SURFACE_INVENTORY.length} direct=${direct} indirect=${indirect} missing=${missing} visual-fixture=${fixture} visual-baseline=${baseline}`;
    const guidance = readFileSync(resolve(root, 'docs/testing.md'), 'utf8');
    const qa = readFileSync(resolve(root, 'docs/qa.md'), 'utf8');

    expect(guidance).toContain(`<!-- surface-inventory-summary: ${summary} -->`);
    expect(qa).toContain('[`docs/testing.md`](testing.md)');
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'visual-tests/cases.json'), 'utf8'),
    ) as { baseline: string }[];
    const manifestBaselines = manifest.map(
      ({ baseline }) => `visual-baselines/chromium-macos26-arm64/${baseline}`,
    );
    const inventoriedBaselines = SURFACE_INVENTORY.flatMap(
      (entry) => entry.visual.baselines ?? [],
    );
    expect(unique(inventoriedBaselines)).toEqual(unique(manifestBaselines));
    for (const entry of SURFACE_INVENTORY) {
      expect(guidance, `${entry.id} is absent from docs/testing.md`).toContain(
        `\`${entry.id}\``,
      );
    }
  });
});
