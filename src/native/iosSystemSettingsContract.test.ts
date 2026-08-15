import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const swift = readFileSync(
  resolve(root, 'ios/App/App/BloomSettingsPlugin.swift'),
  'utf8',
);
const settings = readFileSync(
  resolve(root, 'src/components/SettingsSheet.tsx'),
  'utf8',
);
const store = readFileSync(resolve(root, 'src/store/useBloom.ts'), 'utf8');

describe('native iOS permission-recovery contract (PLAN 13.11a)', () => {
  it('opens only Bloom’s app-specific system Settings URL after a plugin call', () => {
    expect(swift).toContain('CAPPluginMethod(name: "openSystemSettings"');
    expect(swift).toContain('URL(string: UIApplication.openSettingsURLString)');
    expect(swift).toContain('UIApplication.shared.open(url, options: [:])');
    expect(swift).not.toContain('prefs:root');
    expect(swift).not.toContain('App-Prefs:');
  });

  it('keeps the recovery action explicit and absent from prompt and allowed branches', () => {
    expect(settings).toContain("case 'action.openIOSSettings.liveActivity':");
    expect(settings).toContain("case 'action.openIOSSettings.notificationsDenied':");
    expect(settings).toContain("case 'action.openIOSSettings.notificationsPartial':");
    expect(settings).toContain('void openNativeIOSAppSettings();');
    expect(settings.match(/openNativeIOSAppSettings\(\)/g)?.length).toBe(4);
  });

  it('refreshes both system-owned statuses when Bloom becomes visible again', () => {
    expect(store).toMatch(
      /document\.visibilityState === 'visible'\) void refreshCompletionAlertStatus\(\)/,
    );
    expect(store).toMatch(
      /document\.visibilityState !== 'visible'\) return;[\s\S]*?refreshLiveActivityStatus\(\)/,
    );
    expect(store).not.toContain('openSystemSettingsURL');
  });
});
