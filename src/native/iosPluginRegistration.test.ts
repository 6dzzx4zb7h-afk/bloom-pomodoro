import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appDirectory = fileURLToPath(new URL('../../ios/App/App/', import.meta.url));
const controller = readFileSync(`${appDirectory}/BloomBridgeViewController.swift`, 'utf8');

describe('local iOS plugin wiring', () => {
  it('registers every app-local Capacitor plugin with the bridge', () => {
    // These plugins are not npm packages, so Capacitor's generated package
    // list cannot discover them. A compiled but unregistered plugin silently
    // takes the adapters' unavailable path even though its system UI exists.
    const pluginClasses = readdirSync(appDirectory)
      .filter((file) => file.endsWith('.swift'))
      .flatMap((file) => [...readFileSync(`${appDirectory}/${file}`, 'utf8').matchAll(
        /class\s+(\w+)\s*:\s*CAPPlugin\s*,\s*CAPBridgedPlugin/g,
      )].map((match) => match[1]));

    expect(pluginClasses.length).toBeGreaterThan(0);
    for (const pluginClass of pluginClasses) {
      const property = controller.match(new RegExp(
        `(?:let|var)\\s+(\\w+)\\s*=\\s*${pluginClass}\\(\\)`,
      ))?.[1];
      expect(property, `${pluginClass} needs a bridge instance`).toBeDefined();
      expect(controller, `${pluginClass} must be registered`).toMatch(new RegExp(
        `registerPluginInstance\\(\\s*${property}\\s*\\)`,
      ));
    }
  });

  it('keeps the generated and resolved native framework aligned with Capacitor JS', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const expectedVersion = manifest.dependencies['@capacitor/ios'];
    const generated = readFileSync(new URL('../../ios/App/CapApp-SPM/Package.swift', import.meta.url), 'utf8');
    const resolved = JSON.parse(readFileSync(new URL(
      '../../ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
      import.meta.url,
    ), 'utf8')) as { pins: { identity: string; state: { version: string } }[] };

    // npm upgrades alone do not update the native SPM shell. Without sync and
    // Xcode resolution, an app can silently combine two Capacitor major versions.
    expect.soft(generated).toContain(`exact: "${expectedVersion}"`);
    expect.soft(resolved.pins.find((pin) => pin.identity === 'capacitor-swift-pm')?.state.version)
      .toBe(expectedVersion);
  });
});
