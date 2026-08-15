import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const navigation = readFileSync(
  resolve(root, 'ios/App/App/BloomBridgeViewController.swift'),
  'utf8',
);
const settings = readFileSync(
  resolve(root, 'ios/App/App/BloomSettingsPlugin.swift'),
  'utf8',
);

describe('native iOS appearance contract', () => {
  it('receives the shared enum and restores UIKit system ownership for Follow system', () => {
    expect(navigation).toContain('call.getString("appearance")');
    expect(navigation).not.toContain('call.getBool("night")');
    expect(navigation).toContain('case "day": overrideUserInterfaceStyle = .light');
    expect(navigation).toContain('case "night": overrideUserInterfaceStyle = .dark');
    expect(navigation).toContain('default: overrideUserInterfaceStyle = .unspecified');
    expect(navigation).toContain('currentAppearance == "system"');
    expect(navigation).toContain('traitCollectionDidChange');
  });

  it('gives the native Settings sheet the same Day, Night, and System behavior', () => {
    expect(settings).toContain('case "day": return .light');
    expect(settings).toContain('case "night": return .dark');
    expect(settings).toContain('default: return .unspecified');
  });
});
