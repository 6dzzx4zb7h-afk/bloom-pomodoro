import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function repositoryFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const contract = repositoryFile('docs/sync.md');
const review = repositoryFile(
  'docs/verification/plan-11.1-sync-contract-review-2026-08-12.md',
);
const readme = repositoryFile('README.md');

const persistedFields = [
  'version',
  'sessions',
  'streak',
  'lastFocusDay',
  'restDayUsedOn',
  'comeBack',
  'tasks',
  'activeTaskId',
  'palXp',
  'goals',
  'goalLedger',
  'foundations.instances',
  'foundations.entries',
  'foundations.archive',
  'dayPlan.targets',
  'dayPlan.archive',
  'lastRolloverOfferDay',
  'flow',
  'sessionRecords',
  'historyArchive.hours',
  'historyArchive.completedTasks',
  'historyArchive.overflow',
  'openFocus',
  'openFlow',
  'lastWeeklyReviewWeek',
  'ifThenPlans',
  'ritual',
  'lastWoopOfferAt',
  'preSlump',
  'personalCadence',
  'parking',
  'guideRead.readAt',
  'guideRead.suggestions',
  'settings',
  'bloom-companion-v1',
] as const;

const exactApiRoutes = [
  '/api/sync/v1/auth/google/start',
  '/api/sync/v1/auth/apple/start',
  '/api/sync/v1/auth/google/callback',
  '/api/sync/v1/auth/apple/callback',
  '/api/sync/v1/session/refresh',
  '/api/sync/v1/account',
  '/api/sync/v1/account/link/google',
  '/api/sync/v1/account/link/apple',
  '/api/sync/v1/devices',
  '/api/sync/v1/changes',
  '/api/sync/v1/snapshots/latest',
  '/api/sync/v1/export',
  '/api/sync/v1/cloud-copy',
] as const;

describe('PLAN 11.1 binding sync contract', () => {
  it('classifies every current persisted slice and the separate Companion log', () => {
    for (const field of persistedFields) {
      expect(contract, `missing sync policy for ${field}`).toContain(`\`${field}\``);
    }
    expect(contract).toContain('SCHEMA_VERSION = 34');
    expect(contract).toContain('server revision');
    expect(contract).toContain('tombstone');
    expect(contract).toContain('device timestamp');
  });

  it('keeps every live timer ownership field device-local', () => {
    for (const field of ['flow', 'openFocus', 'openFlow', 'endsAt', 'remaining']) {
      expect(contract).toMatch(
        new RegExp(
          '(?:Device-local|device-local)[^\\n]*`' +
            field +
            '`|`' +
            field +
            '`[^\\n]*(?:Device-local|device-local)',
        ),
      );
    }
    expect(contract).toContain('Another device cannot finish');
  });

  it('pins account hosting, E2EE recovery, and readable metadata boundaries', () => {
    for (const term of [
      'Cloudflare D1',
      'SQLite-backed Durable Object',
      'Google OpenID Connect',
      'Sign in with Apple',
      'AES-256-GCM',
      'HKDF-SHA-256',
      '256-bit account root key',
      'The service can read',
      'The service cannot read',
      'There is no server escrow',
      'ciphertext is unrecoverable',
    ]) {
      expect(contract).toContain(term);
    }
  });

  it('documents the exact endpoint allowlist and excludes remote SDKs/diagnostics', () => {
    for (const route of exactApiRoutes) expect(contract).toContain(route);
    const secureUrl = (host: string, path: string) =>
      ['https', ':', '//', host, path].join('');
    for (const [host, path] of [
      ['accounts.google.com', '/o/oauth2/v2/auth'],
      ['oauth2.googleapis.com', '/token'],
      ['appleid.apple.com', '/auth/authorize'],
      ['appleid.apple.com', '/auth/token'],
    ]) {
      expect(contract).toContain(secureUrl(host, path));
    }
    expect(contract).toContain('No Google or Apple JavaScript is loaded');
    expect(contract).toContain('Diagnostic or performance reporting is not authorized');
  });

  it('covers required state, failure, retention, deletion, and threat cases', () => {
    for (const term of [
      'LocalOnly',
      'SignedInNoUpload',
      'SyncEnabled',
      'SyncPaused',
      'Lost device',
      'Lost key',
      'Account A to B',
      'Old/new clients',
      'Long-offline device',
      'Remote outage/offline',
      '180 days',
      '25 MiB',
      'DELETE /cloud-copy',
      'DELETE /account',
      'Threat model',
    ]) {
      expect(contract).toContain(term);
    }
  });

  it('records a scoped review and links the binding contract from the roadmap', () => {
    expect(review).toContain('approved as the binding input to PLAN 11.2');
    expect(review).toMatch(/No\s+production service/);
    expect(review).toContain('Implementation gates carried forward');
    expect(readme).toContain('[binding sync contract](docs/sync.md)');
  });
});
