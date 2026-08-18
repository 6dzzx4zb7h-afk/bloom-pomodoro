/**
 * Vitest global setup: give DOM tests working Web Storage.
 *
 * Node >= 22.4 defines `globalThis.localStorage` and `globalThis.sessionStorage`,
 * but both read as `undefined` unless the process was started with
 * `--localstorage-file`. Vitest's jsdom environment only copies a window key
 * onto the test global when that key is missing from the Node global or sits on
 * Vitest's own allowlist, and Web Storage is on neither list — so jsdom's real
 * Storage never lands and a DOM test is handed `undefined` instead.
 *
 * Bloom keeps every byte of user state in localStorage, so the store and
 * migration suites depend on Storage actually working. Install a spec-shaped
 * in-memory Storage for DOM tests. This is deliberately unconditional: probing
 * the Node stub first would trip its ExperimentalWarning on every worker, and
 * owning the implementation keeps storage identical across Node versions and
 * isolated per file, since Vitest runs setup once per test file.
 */

class MemoryStorage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    if (!Number.isInteger(index) || index < 0) return null;
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    const value = this.entries.get(String(key));
    return value === undefined ? null : value;
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(String(key));
  }

  clear(): void {
    this.entries.clear();
  }
}

// Node-environment tests have no business owning Web Storage; only the DOM
// ones, which are exactly the files carrying `@vitest-environment jsdom`.
if (typeof document !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
