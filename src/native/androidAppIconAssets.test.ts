import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRIENDS } from '../data/friends';

// PLAN 13.18: adding a friend has to carry their launcher art and their alias
// with it. A friend with no alias in the manifest, or an alias pointing at a
// mipmap nobody generated, fails at build time on a good day and leaves the
// home screen unchanged on a bad one — so both are checked here.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const androidRes = resolve(root, 'android/app/src/main/res');
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');

const androidProjectPresent = existsSync(androidRes) && existsSync(manifestPath);

/** Densities that must carry a raster copy of every launcher bitmap. */
const DENSITIES = [
  'mipmap-mdpi',
  'mipmap-hdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi',
];

describe.runIf(androidProjectPresent)('bundled Android launcher assets', () => {
  const manifest = androidProjectPresent ? readFileSync(manifestPath, 'utf8') : '';

  it('declares one launcher alias per friend', () => {
    for (const friend of FRIENDS) {
      const { alias, res } = friend.appIcon;
      const declaration = manifest.match(
        new RegExp(`<activity-alias[^>]*android:name="\\.${alias}"[\\s\\S]*?</activity-alias>`),
      )?.[0];
      expect(declaration, `${friend.name}: .${alias}`).toBeTruthy();

      expect(declaration).toContain('android:targetActivity=".MainActivity"');
      expect(declaration).toContain(`android:icon="@mipmap/${res}"`);
      expect(declaration).toContain(`android:roundIcon="@mipmap/${res}_round"`);
      // A non-exported alias cannot be launched from the home screen.
      expect(declaration).toContain('android:exported="true"');
      expect(declaration).toContain('android.intent.category.LAUNCHER');
    }
  });

  it('ships exactly one alias enabled, and it is the default friend', () => {
    // Two enabled aliases would put two Bloom entries in the launcher; none
    // would put Bloom nowhere at all on a fresh install.
    const enabled = FRIENDS.filter((friend) => {
      const declaration = manifest.match(
        new RegExp(
          `<activity-alias[^>]*android:name="\\.${friend.appIcon.alias}"[\\s\\S]*?</activity-alias>`,
        ),
      )?.[0];
      return declaration?.includes('android:enabled="true"');
    });
    expect(enabled.map((friend) => friend.name)).toEqual([FRIENDS[0].name]);
  });

  it('keeps the launcher filter on the aliases only', () => {
    const activity = manifest.match(/<activity\b[\s\S]*?<\/activity>/)?.[0];
    // MainActivity keeping its own MAIN/LAUNCHER filter would show a seventh,
    // friendless Bloom icon that no alias switch could ever change.
    expect(activity).toBeTruthy();
    expect(activity).not.toContain('android.intent.category.LAUNCHER');
  });

  it('generates every mipmap each alias points at', () => {
    for (const friend of FRIENDS) {
      const { res } = friend.appIcon;

      for (const name of [`${res}.xml`, `${res}_round.xml`]) {
        const adaptive = resolve(androidRes, 'mipmap-anydpi-v26', name);
        expect(existsSync(adaptive), `${friend.name}: ${name}`).toBe(true);
        const xml = readFileSync(adaptive, 'utf8');
        expect(xml).toContain(`@mipmap/${res}_background`);
        expect(xml).toContain(`@mipmap/${res}_foreground`);
      }

      // API 24–25 has no adaptive icons and falls back to the raster copies.
      for (const density of DENSITIES) {
        for (const suffix of ['', '_round', '_foreground', '_background']) {
          const file = resolve(androidRes, density, `${res}${suffix}.png`);
          expect(existsSync(file), `${friend.name}: ${density}/${res}${suffix}.png`).toBe(true);
        }
      }
    }
  });
});
