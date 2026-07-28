/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_PERSONAL_CADENCE } from '../insights/cadence';
import { COMPANION_STORAGE_KEY } from '../store/companion';
import { createBackupEnvelope, serializeBackup } from '../store/exportImport';
import { DEFAULT_RITUAL } from '../store/ritual';
import {
  DEFAULT_STATE,
  persistedShapeFromState,
} from '../store/useBloom';
import { SettingsSheet } from './SettingsSheet';

vi.mock('./PixelPal', () => ({
  PixelPal: () => <div aria-hidden="true" />,
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failOnSet: string | null = null;
  failOnSetTimes = 0;

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (key === this.failOnSet && this.failOnSetTimes > 0) {
      this.failOnSetTimes -= 1;
      throw new Error('injected storage failure');
    }
    this.values.set(key, value);
  }
}

function renderSettings() {
  const state = {
    ...DEFAULT_STATE,
    settings: { ...DEFAULT_STATE.settings, name: 'Mira' },
  };
  return render(
    <SettingsSheet
      settings={state.settings}
      records={[]}
      personalCadence={EMPTY_PERSONAL_CADENCE}
      now={state.now}
      running={false}
      hasOpenSession={false}
      persistedState={persistedShapeFromState(state)}
      onPatch={vi.fn()}
      onCacheCadence={vi.fn()}
      onApplyCadence={vi.fn()}
      ritual={DEFAULT_RITUAL}
      onPatchRitual={vi.fn()}
      onUpdateRitualItem={vi.fn()}
      onClearFocusData={vi.fn()}
      onDataImported={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

function openDataSection() {
  fireEvent.click(screen.getByText('Your data', { selector: 'summary' }));
}

function streamedFile(contents: string, name: string): File {
  const bytes = new TextEncoder().encode(contents);
  let delivered = false;
  return {
    name,
    size: bytes.byteLength,
    stream: () => ({
      getReader: () => ({
        read: async () => {
          if (delivered) return { done: true, value: undefined };
          delivered = true;
          return { done: false, value: bytes };
        },
        releaseLock: vi.fn(),
      }),
    }),
  } as unknown as File;
}

describe('Settings data import status', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses seven purpose-based groups with the completion ring under Sessions', () => {
    renderSettings();

    expect(
      Array.from(document.querySelectorAll('summary'), (summary) => summary.textContent),
    ).toEqual([
      'You',
      'Timer lengths',
      'Sessions',
      'Your day',
      'Companion',
      'Appearance',
      'Your data',
    ]);
    expect(screen.getByRole('switch', { name: 'Ring when done' })).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll('summary')).some(
        (summary) => summary.textContent === 'Sound',
      ),
    ).toBe(false);
    expect(screen.queryByText(/coffee shop|white noise|background sound/i)).toBeNull();
  });

  it('announces a calm validation failure and keeps recovery actions available', async () => {
    renderSettings();
    openDataSection();
    const file = streamedFile('{', 'broken.json');
    fireEvent.change(screen.getByLabelText('choose a JSON backup to import'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Nothing changed');
    });
    expect(screen.getByRole('status').textContent).toContain('This file is not valid JSON.');
    expect(screen.getByRole('button', { name: 'export current data' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'choose another file' })).toBeTruthy();
  });

  it('replaces the unchanged claim with a downloadable recovery path after rollback failure', async () => {
    renderSettings();
    openDataSection();
    const current = persistedShapeFromState({
      ...DEFAULT_STATE,
      settings: { ...DEFAULT_STATE.settings, name: 'Mira' },
    });
    const backup = serializeBackup(createBackupEnvelope(current, []));
    const storage = localStorage as MemoryStorage;
    storage.setItem('bloom-state', JSON.stringify(current));
    storage.setItem(COMPANION_STORAGE_KEY, JSON.stringify({ version: 2, events: [] }));

    fireEvent.change(screen.getByLabelText('choose a JSON backup to import'), {
      target: { files: [streamedFile(backup, 'valid.json')] },
    });
    const merge = await screen.findByRole('button', { name: 'merge this backup' });
    storage.failOnSet = COMPANION_STORAGE_KEY;
    storage.failOnSetTimes = 2;
    fireEvent.click(merge);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Recovery backup ready');
    });
    expect(screen.getByRole('status').textContent).not.toContain('Nothing changed');
    expect(screen.getByRole('button', { name: 'download recovery backup' })).toBeTruthy();
  });

  it('exposes bounded progress and a working cancel action while a file is pending', async () => {
    renderSettings();
    openDataSection();
    let finishRead: ((value: { done: boolean; value?: Uint8Array }) => void) | undefined;
    const reader = {
      read: vi.fn(
        () =>
          new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
            finishRead = resolve;
          }),
      ),
      releaseLock: vi.fn(),
    };
    const file = {
      name: 'slow.json',
      size: 20,
      stream: () => ({ getReader: () => reader }),
    } as unknown as File;

    fireEvent.change(screen.getByLabelText('choose a JSON backup to import'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('reading slow.json · 0%');
    });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    finishRead?.({ done: true });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('');
    });
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
});
