import type {
  EncryptedMutationEnvelope,
  EncryptedSnapshotEnvelope,
  SessionSecrets,
} from './types';

export type SyncTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SyncClientCredentials {
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
}

export interface SyncServiceClientOptions {
  origin: string;
  transport: SyncTransport;
  credentials?: SyncClientCredentials;
}

/**
 * Explicitly constructed service adapter. No default instance exists, so importing Bloom's
 * local-only app cannot start auth, register a device, or create a network request.
 */
export class SyncServiceClient {
  private readonly origin: string;
  private readonly credentials: SyncClientCredentials;

  constructor(private readonly options: SyncServiceClientOptions) {
    this.origin = new URL(options.origin).origin;
    this.credentials = { ...options.credentials };
  }

  authorizationStartUrl(
    provider: 'google' | 'apple',
    nativeChallenge?: string,
  ): string {
    const url = this.url(`/auth/${provider}/start`);
    if (nativeChallenge) {
      url.searchParams.set('mode', 'native');
      url.searchParams.set('challenge', nativeChallenge);
    }
    return url.toString();
  }

  nativeHandoff(
    provider: 'google' | 'apple',
    handoff: string,
    challenge: string,
  ): Promise<SessionSecrets> {
    return this.json(`/auth/${provider}/handoff`, {
      method: 'POST',
      body: JSON.stringify({ handoff, challenge }),
    });
  }

  refresh(): Promise<{ refreshed: true } | SessionSecrets> {
    return this.json('/session/refresh', {
      method: 'POST',
      headers: this.credentials.refreshToken
        ? { authorization: `BloomRefresh ${this.credentials.refreshToken}` }
        : undefined,
    });
  }

  account(): Promise<Record<string, unknown>> {
    return this.json('/account');
  }

  registerDevice(input: {
    deviceId: string;
    platform: 'web' | 'ios' | 'android';
    keyVersion: number;
    consentConfirmed: true;
  }): Promise<Record<string, unknown>> {
    return this.json('/devices', { method: 'POST', body: JSON.stringify(input) });
  }

  listDevices(): Promise<Record<string, unknown>> {
    return this.json('/devices');
  }

  revokeDevice(deviceId: string): Promise<void> {
    return this.empty(`/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'revoke-device' }),
    });
  }

  pull(deviceId: string, after: string | null): Promise<Record<string, unknown>> {
    const path = after === null ? '/changes' : `/changes?after=${encodeURIComponent(after)}`;
    return this.json(path, { headers: { 'x-bloom-device-id': deviceId } });
  }

  push(
    deviceId: string,
    mutations: EncryptedMutationEnvelope[],
  ): Promise<Record<string, unknown>> {
    return this.json('/changes', {
      method: 'POST',
      headers: { 'x-bloom-device-id': deviceId },
      body: JSON.stringify({ mutations }),
    });
  }

  latestSnapshot(deviceId: string): Promise<Record<string, unknown>> {
    return this.json('/snapshots/latest', {
      headers: { 'x-bloom-device-id': deviceId },
    });
  }

  storeSnapshot(
    deviceId: string,
    snapshot: EncryptedSnapshotEnvelope,
  ): Promise<Record<string, unknown>> {
    return this.json('/snapshots', {
      method: 'POST',
      headers: { 'x-bloom-device-id': deviceId },
      body: JSON.stringify({ snapshot }),
    });
  }

  cloudExport(deviceId: string): Promise<Record<string, unknown>> {
    return this.json('/export', { headers: { 'x-bloom-device-id': deviceId } });
  }

  deleteCloudCopy(): Promise<Record<string, unknown>> {
    return this.json('/cloud-copy', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'delete-cloud-copy' }),
    });
  }

  deleteAccount(): Promise<void> {
    return this.empty('/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'delete-account' }),
    });
  }

  signOut(): Promise<void> {
    return this.empty('/session', { method: 'DELETE' });
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(path, init);
    const value = await response.json() as unknown;
    if (!response.ok) throw serviceResponseError(response.status, value);
    return value as T;
  }

  private async empty(path: string, init: RequestInit): Promise<void> {
    const response = await this.send(path, init);
    if (!response.ok) {
      const value = await response.json().catch(() => null) as unknown;
      throw serviceResponseError(response.status, value);
    }
  }

  private send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (this.credentials.accessToken && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${this.credentials.accessToken}`);
    } else if (this.credentials.csrfToken && init.method && init.method !== 'GET') {
      headers.set('x-bloom-csrf', this.credentials.csrfToken);
    }
    return this.options.transport(this.url(path), {
      ...init,
      headers,
      credentials: this.credentials.accessToken ? 'omit' : 'include',
      redirect: 'error',
      cache: 'no-store',
    });
  }

  private url(path: string): URL {
    const url = new URL(`/api/sync/v1${path}`, this.origin);
    if (url.origin !== this.origin || !url.pathname.startsWith('/api/sync/v1/')) {
      throw new Error('The sync adapter rejected a non-allowlisted URL.');
    }
    return url;
  }
}

function serviceResponseError(status: number, value: unknown): Error {
  const message = value && typeof value === 'object' && 'error' in value
    ? (value as { error?: { message?: unknown } }).error?.message
    : null;
  return new Error(typeof message === 'string' ? message : `Bloom sync request returned ${status}.`);
}
