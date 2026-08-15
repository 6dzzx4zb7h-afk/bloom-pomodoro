import { describe, expect, it } from 'vitest';
import { SyncServiceClient, type SyncTransport } from './client';
import { randomOpaqueId } from './encoding';

describe('explicit optional sync service adapter', () => {
  it('makes no request when constructed or when creating an auth navigation URL', () => {
    const requests: string[] = [];
    const transport: SyncTransport = async (input) => {
      requests.push(String(input));
      return new Response('{}');
    };
    const client = new SyncServiceClient({ origin: 'https://bloom.test', transport });

    expect(requests).toEqual([]);
    expect(client.authorizationStartUrl('google')).toBe(
      'https://bloom.test/api/sync/v1/auth/google/start',
    );
    expect(requests).toEqual([]);
  });

  it('uses only the fixed same-origin API prefix after an explicit method call', async () => {
    const requests: (RequestInfo | URL)[] = [];
    const transport: SyncTransport = async (input) => {
      requests.push(input);
      return new Response(JSON.stringify({ syncEnabled: false }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = new SyncServiceClient({
      origin: 'https://bloom.test/path-is-ignored',
      transport,
      credentials: { accessToken: randomOpaqueId('access', 32) },
    });

    await expect(client.account()).resolves.toEqual({ syncEnabled: false });
    expect(String(requests[0])).toBe('https://bloom.test/api/sync/v1/account');
  });

  it('uses the rotating refresh credential instead of the access bearer', async () => {
    let authorization = '';
    const client = new SyncServiceClient({
      origin: 'https://bloom.test',
      credentials: {
        accessToken: 'access-value',
        refreshToken: 'refresh-value',
      },
      transport: async (_input, init) => {
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return new Response(JSON.stringify({
          sessionId: 'session',
          accessToken: 'next-access',
          refreshToken: 'next-refresh',
          csrfToken: 'next-csrf',
          accessExpiresAt: 1,
          refreshExpiresAt: 2,
        }));
      },
    });

    await client.refresh();
    expect(authorization).toBe('BloomRefresh refresh-value');
  });
});
