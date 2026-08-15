import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

type PresentationDecision =
  | 'keep-web-content'
  | 'keep-web-dialog'
  | 'keep-web-recovery'
  | 'hybrid-native-fixed-chrome'
  | 'hybrid-native-settings';

/**
 * PLAN 13.5 — every production TSX owner with an interactive surface has an
 * explicit iOS presentation decision. The source scan below makes this list a
 * living boundary: a new interactive owner cannot silently skip the audit.
 */
const decisions: Record<string, PresentationDecision> = {
  'src/components/CompanionPrompt.tsx': 'keep-web-content',
  'src/components/DebriefCard.tsx': 'keep-web-content',
  'src/components/DebriefGoalCredit.tsx': 'keep-web-content',
  'src/components/Dialog.tsx': 'keep-web-dialog',
  'src/components/FoundationsCard.tsx': 'keep-web-dialog',
  'src/components/GuideScreen.tsx': 'keep-web-content',
  'src/components/GuideSuggestion.tsx': 'keep-web-content',
  'src/components/IfThenPlanner.tsx': 'keep-web-content',
  'src/components/KindRestart.tsx': 'keep-web-content',
  'src/components/Onboarding.tsx': 'keep-web-content',
  'src/components/ParkingLot.tsx': 'keep-web-content',
  'src/components/ResumeCue.tsx': 'keep-web-dialog',
  'src/components/RitualCard.tsx': 'keep-web-content',
  'src/components/RolloverTriageCard.tsx': 'keep-web-content',
  'src/components/SessionRepairEditor.tsx': 'keep-web-dialog',
  'src/components/SettingsSheet.tsx': 'hybrid-native-settings',
  'src/components/Sheet.tsx': 'keep-web-dialog',
  'src/components/StorageRecoveryNotice.tsx': 'keep-web-recovery',
  'src/components/SystemSwitch.tsx': 'keep-web-content',
  'src/components/TabBar.tsx': 'hybrid-native-fixed-chrome',
  'src/components/WeeklyReview.tsx': 'keep-web-content',
  'src/components/WoopCard.tsx': 'keep-web-content',
  'src/screens/CollectionScreen.tsx': 'hybrid-native-fixed-chrome',
  'src/screens/FocusScreen.tsx': 'hybrid-native-fixed-chrome',
  'src/screens/GoalsScreen.tsx': 'keep-web-dialog',
  'src/screens/HistoryScreen.tsx': 'keep-web-dialog',
  'src/screens/TasksScreen.tsx': 'keep-web-content',
};

const interactiveOwnerPattern =
  /<(?:button|input|select|textarea|Dialog|Sheet|SystemSwitch|ModalFrame)\b|role=["'](?:button|switch|checkbox|tab|radio|combobox|slider)["']/;

function productionTSXFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionTSXFiles(path));
      continue;
    }
    if (
      entry.name.endsWith('.tsx') &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.visual-fixture.')
    ) {
      files.push(path);
    }
  }
  return files;
}

function occurrences(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

describe('iOS presentation inventory (PLAN 13.5)', () => {
  it('records a decision for every interactive production TSX owner', () => {
    const interactiveFiles = [
      ...productionTSXFiles(resolve(root, 'src/components')),
      ...productionTSXFiles(resolve(root, 'src/screens')),
    ]
      .filter((path) => interactiveOwnerPattern.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path))
      .sort();

    expect(interactiveFiles).toEqual(Object.keys(decisions).sort());

    const architecture = readFileSync(resolve(root, 'docs/ios-liquid-glass.md'), 'utf8');
    for (const path of interactiveFiles) {
      expect(architecture, `${path} needs a documented iOS presentation decision`)
        .toContain(`\`${path}\``);
    }
  });

  it('keeps custom glass limited to fixed navigation and timer chrome', () => {
    const bridge = readFileSync(
      resolve(root, 'ios/App/App/BloomBridgeViewController.swift'),
      'utf8',
    );
    const settings = readFileSync(
      resolve(root, 'ios/App/App/BloomSettingsPlugin.swift'),
      'utf8',
    );
    const allSwift = [
      ...readdirSync(resolve(root, 'ios/App/App'))
        .filter((name) => name.endsWith('.swift'))
        .map((name) => readFileSync(resolve(root, 'ios/App/App', name), 'utf8')),
      ...readdirSync(resolve(root, 'ios/App/BloomLiveActivity'))
        .filter((name) => name.endsWith('.swift'))
        .map((name) => readFileSync(resolve(root, 'ios/App/BloomLiveActivity', name), 'utf8')),
    ].join('\n');

    expect(occurrences(bridge, /UIGlassEffect\(\)/g)).toBe(1);
    expect(occurrences(bridge, /UIButton\.Configuration\.glass\(\)/g)).toBe(2);
    expect(settings).not.toContain('UIGlassEffect');
    expect(settings).not.toContain('.glassEffect(');
    expect(occurrences(allSwift, /\.glassEffect\(/g)).toBe(0);
  });

  it('uses system presentations only at OS-owned boundaries', () => {
    const settings = readFileSync(
      resolve(root, 'ios/App/App/BloomSettingsPlugin.swift'),
      'utf8',
    );
    expect(settings).toContain('UIHostingController(rootView: BloomSettingsFormView');
    expect(settings).toContain('UIActivityViewController(');
    expect(settings).toContain('UIDocumentPickerViewController(');
    expect(settings).toContain('UIAlertController(title: title');
    expect(settings).toContain('UIApplication.openSettingsURLString');
    expect(settings).not.toContain('bloom-state');
    expect(settings).not.toContain('bloom-companion-v1');
  });
});
