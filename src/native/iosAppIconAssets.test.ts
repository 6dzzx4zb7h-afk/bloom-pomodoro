import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const generatorPath = resolve(root, 'scripts/gen-icons.mjs');
const manifestPath = resolve(
  root,
  'docs/verification/plan-13.9b-icon-export-manifest.json',
);

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

  it('keeps the iOS and web generators flower-free at their source boundary', () => {
    const generator = readFileSync(generatorPath, 'utf8');
    const friendSource = generator.match(
      /function friendIconSvg[\s\S]*?\n}\n\nasync function png/,
    )?.[0];
    const webSource = generator.match(
      /function timerMarkSvg[\s\S]*?\n}\n\n\/\*\* Match the app canvas/,
    )?.[0];

    expect(friendSource).toBeTruthy();
    expect(webSource).toBeTruthy();
    expect(friendSource).toContain('pomodoroTimer');
    expect(webSource).toContain('pomodoroTimer');
    expect(friendSource).not.toMatch(/blossom|petal/i);
    expect(webSource).not.toMatch(/blossom|petal/i);
    // Android remains explicitly isolated on its old generator while deferred.
    expect(generator).toContain('const androidTile = blossomSvg');
    expect(generator).toContain('const androidBleed = blossomSvg');
  });

  it('records deterministic, current exports for every iOS appearance and web icon', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      generatedBy: string;
      identity: string;
      flowerInIOSIcons: boolean;
      flowerInWebIcons: boolean;
      androidChanged: boolean;
      iosExports: Array<{
        friend: string;
        appearance: string;
        file: string;
        width: number;
        height: number;
        hasAlpha: boolean;
        sha256: string;
      }>;
      webExports: Array<{
        file: string;
        width: number;
        height: number;
        sha256: string;
      }>;
    };

    expect(manifest.generatedBy).toBe('scripts/gen-icons.mjs');
    expect(manifest.identity).toBe('crowned-pomodoro-dial-with-on-duty-friend');
    expect(manifest.flowerInIOSIcons).toBe(false);
    expect(manifest.flowerInWebIcons).toBe(false);
    expect(manifest.androidChanged).toBe(false);
    expect(manifest.iosExports).toHaveLength(FRIENDS.length * 3);
    expect(manifest.webExports).toHaveLength(7);

    for (const output of [...manifest.iosExports, ...manifest.webExports]) {
      const bytes = readFileSync(resolve(root, output.file));
      expect(output.width).toBeGreaterThanOrEqual(32);
      expect(output.height).toBe(output.width);
      expect(output.sha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
    }

    for (const friend of FRIENDS) {
      expect(
        manifest.iosExports
          .filter((output) => output.friend === friend.name)
          .map((output) => output.appearance),
      ).toEqual(['light', 'dark', 'tinted']);
    }
    expect(
      manifest.iosExports
        .filter((output) => output.appearance === 'light')
        .every((output) => output.hasAlpha === false),
    ).toBe(true);
  });
});
