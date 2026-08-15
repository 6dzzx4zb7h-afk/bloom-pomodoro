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

describe('native iOS data presentation contract (PLAN 13.4d)', () => {
  it('uses system share, document-picker, and destructive-confirmation surfaces', () => {
    expect(swift).toContain('UIActivityViewController(');
    expect(swift).toContain('UIDocumentPickerViewController(');
    expect(swift).toContain('UIAlertController(title: title');
    expect(swift).toContain('style: .destructive');
  });

  it('reads only a chosen security-scoped JSON file within the shared size cap', () => {
    expect(swift).toContain('forOpeningContentTypes: [.json]');
    expect(swift).toContain('url.startAccessingSecurityScopedResource()');
    expect(swift).toContain('url.stopAccessingSecurityScopedResource()');
    expect(swift).toContain('maximumDocumentBytes = 5 * 1_024 * 1_024');
    expect(swift).toContain('data.count <= self.maximumDocumentBytes');
  });

  it('removes the generated temporary export and keeps parsing and commit in React', () => {
    expect(swift).toContain('FileManager.default.temporaryDirectory');
    expect(swift).toContain('FileManager.default.removeItem(at: directory)');
    expect(settings).toContain('parseBackup(selected.contents)');
    expect(settings).toContain('prepareImport(incoming, currentBackup())');
    expect(settings).toContain('commitPreparedImport(prepared, localStorage)');
    expect(swift).not.toContain('bloom-state');
    expect(swift).not.toContain('bloom-companion-v1');
  });
});
