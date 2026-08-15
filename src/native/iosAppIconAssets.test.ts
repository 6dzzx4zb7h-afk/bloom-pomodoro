import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRIENDS } from '../data/friends';

// PLAN 13.9: adding a friend has to carry their app icon with it. A friend
// whose icon set was never generated, or never declared to the Xcode target,
// would build fine and then fail on the device the moment they come on duty —
// so the asset catalog and the build settings are checked here instead.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assets = resolve(root, 'ios/App/App/Assets.xcassets');
const pbxproj = resolve(root, 'ios/App/App.xcodeproj/project.pbxproj');

const iosProjectPresent = existsSync(assets) && existsSync(pbxproj);

describe.runIf(iosProjectPresent)('bundled iOS app icon assets', () => {
  it('ships light, dark, and tinted art for every friend', () => {
    for (const friend of FRIENDS) {
      const setName = friend.appIcon.icon ?? 'AppIcon';
      const contents = resolve(assets, `${setName}.appiconset/Contents.json`);
      expect(existsSync(contents), `${friend.name}: ${setName}.appiconset`).toBe(true);

      const { images } = JSON.parse(readFileSync(contents, 'utf8'));
      // Light carries no `appearances` key; the other two name their variant.
      // `actool` silently drops appearance values it does not recognise, so a
      // typo here would ship a set that quietly loses its dark icon.
      expect(
        images.map(
          (image: { appearances?: { value: string }[] }) =>
            image.appearances?.[0]?.value ?? 'light',
        ),
      ).toEqual(['light', 'dark', 'tinted']);

      for (const image of images) {
        expect(image.size).toBe('1024x1024');
        expect(
          existsSync(resolve(assets, `${setName}.appiconset`, image.filename)),
          `${friend.name}: ${image.filename}`,
        ).toBe(true);
      }
    }
  });

  it('declares every alternate icon to the app target in both configurations', () => {
    const project = readFileSync(pbxproj, 'utf8');
    const declarations = project.match(
      /ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = \(([^)]*)\)/g,
    );
    // One per build configuration — a Debug-only declaration would ship a
    // release build whose alternates silently do not exist.
    expect(declarations).toHaveLength(2);

    const alternates = FRIENDS.map((friend) => friend.appIcon.icon).filter(
      (name): name is string => name !== null,
    );
    for (const declaration of declarations ?? []) {
      for (const name of alternates) {
        expect(declaration).toContain(`"${name}"`);
      }
    }
  });
});
