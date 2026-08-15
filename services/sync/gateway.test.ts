import { describe, expect, it } from 'vitest';
import { InMemoryContentStore } from './contentStore';
import { InMemoryControlPlane } from './controlPlane';
import { base64UrlEncode, randomOpaqueId } from './encoding';
import { sessionCookieNames, SyncGateway, type SafeRequestLogger } from './gateway';
import { FakeOidcProvider } from './oidc';
import {
  CLOUD_SYNC_ALGORITHM,
  CLOUD_SYNC_PROTOCOL,
  CLOUD_SYNC_PROTOCOL_VERSION,
  type EncryptedMutationEnvelope,
  type SafeRequestLog,
  type SessionSecrets,
} from './types';

const ORIGIN = 'https://bloom.test';
const IDENTITY_PEPPER = 'identity-pepper-with-at-least-thirty-two-characters';
const SESSION_PEPPER = 'session-pepper-with-at-least-thirty-two-characters';

interface Harness {
  gateway: SyncGateway;
  control: InMemoryControlPlane;
  logs: SafeRequestLog[];
}

function harness(now: () => number = Date.now): Harness {
  const control = new InMemoryControlPlane(
    IDENTITY_PEPPER,
    SESSION_PEPPER,
    now,
  );
  const logs: SafeRequestLog[] = [];
  const logger: SafeRequestLogger = {
    write: (entry) => {
      logs.push(entry);
    },
  };
  return {
    control,
    logs,
    gateway: new SyncGateway({
      origin: ORIGIN,
      control,
      content: new InMemoryContentStore(now),
      providers: {
        google: new FakeOidcProvider('google', {
          issuer: 'https://accounts.google.com',
          subject: 'google-user',
        }),
        apple: new FakeOidcProvider('apple', {
          issuer: 'https://appleid.apple.com',
          subject: 'apple-user',
        }),
      },
      logger,
      now,
    }),
  };
}

async function nativeLogin(
  gateway: SyncGateway,
  provider: 'google' | 'apple',
  challenge: string,
): Promise<SessionSecrets> {
  const start = await gateway.fetch(new Request(
    `${ORIGIN}/api/sync/v1/auth/${provider}/start?mode=native&challenge=${challenge}`,
  ));
  expect(start.status).toBe(303);
  const providerUrl = new URL(start.headers.get('location')!);
  const callback = await gateway.fetch(new Request(
    `${ORIGIN}/api/sync/v1/auth/${provider}/callback?state=${providerUrl.searchParams.get('state')}&code=valid-code`,
  ));
  expect(callback.status).toBe(303);
  const handoff = new URL(callback.headers.get('location')!).hash.slice(1);
  const handoffParams = new URLSearchParams(handoff);
  const response = await gateway.fetch(new Request(
    `${ORIGIN}/api/sync/v1/auth/${provider}/handoff`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        handoff: handoffParams.get('handoff'),
        challenge,
      }),
    },
  ));
  expect(response.status).toBe(200);
  return response.json() as Promise<SessionSecrets>;
}

function authenticatedRequest(
  path: string,
  session: SessionSecrets,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${session.accessToken}`);
  return new Request(`${ORIGIN}/api/sync/v1${path}`, { ...init, headers });
}

function encryptedEnvelope(
  accountId: string,
  deviceId: string,
  plaintextMarker = 'not-on-wire',
): EncryptedMutationEnvelope {
  void plaintextMarker;
  return {
    protocol: CLOUD_SYNC_PROTOCOL,
    protocolVersion: CLOUD_SYNC_PROTOCOL_VERSION,
    envelopeType: 'mutation',
    accountId,
    deviceId,
    mutationId: randomOpaqueId('mutation'),
    baseCursor: null,
    cloudGeneration: 1,
    contentSchemaVersion: 34,
    keyVersion: 1,
    algorithm: CLOUD_SYNC_ALGORITHM,
    nonce: base64UrlEncode(new Uint8Array(12).fill(3)),
    ciphertext: base64UrlEncode(new Uint8Array(32).fill(4)),
  };
}

describe('Bloom encrypted sync gateway contract', () => {
  it('keeps sign-in separate from upload consent and secures web cookies with CSRF', async () => {
    const { gateway } = harness();
    const start = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/auth/google/start`,
    ));
    const providerUrl = new URL(start.headers.get('location')!);
    const callback = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/auth/google/callback?state=${providerUrl.searchParams.get('state')}&code=valid-code`,
    ));
    expect(callback.status).toBe(303);
    const setCookie = callback.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const names = sessionCookieNames();
    const access = cookieValue(setCookie, names.access);
    const csrf = cookieValue(setCookie, names.csrf);
    const cookie = `${names.access}=${access}; ${names.csrf}=${csrf}`;
    const accountResponse = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/account`,
      { headers: { cookie } },
    ));
    expect(await accountResponse.json()).toMatchObject({ syncEnabled: false });

    const withoutCsrf = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/devices`,
      {
        method: 'POST',
        headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: randomOpaqueId('device'),
          platform: 'web',
          keyVersion: 1,
          consentConfirmed: true,
        }),
      },
    ));
    expect(withoutCsrf.status).toBe(403);
    const withCsrf = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/devices`,
      {
        method: 'POST',
        headers: {
          cookie,
          origin: ORIGIN,
          'content-type': 'application/json',
          'x-bloom-csrf': csrf,
        },
        body: JSON.stringify({
          deviceId: randomOpaqueId('device'),
          platform: 'web',
          keyVersion: 1,
          consentConfirmed: true,
        }),
      },
    ));
    expect(withCsrf.status).toBe(201);
  });

  it('isolates accounts, rejects replay changes, revokes devices, and exports ciphertext only', async () => {
    const { gateway, logs } = harness();
    const firstSession = await nativeLogin(
      gateway,
      'google',
      'first-device-challenge-with-more-than-thirty-two-characters',
    );
    const secondSession = await nativeLogin(
      gateway,
      'apple',
      'second-device-challenge-with-more-than-thirty-two-characters',
    );
    const firstAccount = await responseJson<{ id: string }>(gateway.fetch(
      authenticatedRequest('/account', firstSession),
    ));
    const secondAccount = await responseJson<{ id: string }>(gateway.fetch(
      authenticatedRequest('/account', secondSession),
    ));
    const firstDevice = randomOpaqueId('device');
    const secondDevice = randomOpaqueId('device');

    const deniedConsent = await gateway.fetch(authenticatedRequest('/devices', firstSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: firstDevice,
        platform: 'ios',
        keyVersion: 1,
        consentConfirmed: false,
      }),
    }));
    expect(deniedConsent.status).toBe(409);
    await registerDevice(gateway, firstSession, firstDevice, 'ios');
    await registerDevice(gateway, secondSession, secondDevice, 'android');

    const crossDeviceRevoke = await gateway.fetch(authenticatedRequest(
      `/devices/${secondDevice}`,
      firstSession,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'revoke-device' }),
      },
    ));
    expect(crossDeviceRevoke.status).toBe(204);
    const secondStillAuthorized = await gateway.fetch(authenticatedRequest(
      '/changes',
      secondSession,
      { headers: { 'x-bloom-device-id': secondDevice } },
    ));
    expect(secondStillAuthorized.status).toBe(200);

    const plaintext = 'PRIVATE_FOCUS_TEXT_MUST_NEVER_ENTER_A_LOG';
    const firstEnvelope = encryptedEnvelope(firstAccount.id, firstDevice, plaintext);
    const push = await gateway.fetch(authenticatedRequest('/changes', firstSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bloom-device-id': firstDevice },
      body: JSON.stringify({ mutations: [firstEnvelope] }),
    }));
    expect(await push.json()).toMatchObject({ accepted: [{ replayed: false }] });
    const retry = await gateway.fetch(authenticatedRequest('/changes', firstSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bloom-device-id': firstDevice },
      body: JSON.stringify({ mutations: [firstEnvelope] }),
    }));
    expect(await retry.json()).toMatchObject({ accepted: [{ replayed: true }] });
    const divergent = await gateway.fetch(authenticatedRequest('/changes', firstSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bloom-device-id': firstDevice },
      body: JSON.stringify({ mutations: [{
        ...firstEnvelope,
        ciphertext: base64UrlEncode(new Uint8Array(32).fill(8)),
      }] }),
    }));
    expect(divergent.status).toBe(409);

    const crossAccount = await gateway.fetch(authenticatedRequest('/changes', secondSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bloom-device-id': secondDevice },
      body: JSON.stringify({ mutations: [firstEnvelope] }),
    }));
    expect(crossAccount.status).toBe(400);
    expect(secondAccount.id).not.toBe(firstAccount.id);

    const exported = await gateway.fetch(authenticatedRequest('/export', firstSession, {
      headers: { 'x-bloom-device-id': firstDevice },
    }));
    const exportText = await exported.text();
    expect(exported.headers.get('content-disposition')).toContain('bloom-encrypted-cloud-export');
    expect(exportText).toContain(firstEnvelope.ciphertext);
    expect(exportText).not.toContain(plaintext);

    const revoke = await gateway.fetch(authenticatedRequest(`/devices/${firstDevice}`, firstSession, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'revoke-device' }),
    }));
    expect(revoke.status).toBe(204);
    const deniedAfterRevoke = await gateway.fetch(authenticatedRequest('/changes', firstSession, {
      headers: { 'x-bloom-device-id': firstDevice },
    }));
    expect(deniedAfterRevoke.status).toBe(403);

    const logText = JSON.stringify(logs);
    expect(logText).not.toContain(plaintext);
    expect(logText).not.toContain(firstEnvelope.ciphertext);
    expect(logText).not.toContain(firstEnvelope.nonce);
    expect(logText).not.toContain(firstSession.accessToken);
    expect(logs.every((entry) => !entry.route.includes('?'))).toBe(true);
  });

  it('distinguishes cloud-copy deletion from complete account deletion', async () => {
    const { gateway } = harness();
    const session = await nativeLogin(
      gateway,
      'google',
      'deletion-device-challenge-with-more-than-thirty-two-characters',
    );
    const account = await responseJson<{ id: string }>(gateway.fetch(
      authenticatedRequest('/account', session),
    ));
    const device = randomOpaqueId('device');
    await registerDevice(gateway, session, device, 'web');
    const encrypted = encryptedEnvelope(account.id, device);
    await gateway.fetch(authenticatedRequest('/changes', session, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bloom-device-id': device },
      body: JSON.stringify({ mutations: [encrypted] }),
    }));

    const cloudDelete = await gateway.fetch(authenticatedRequest('/cloud-copy', session, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'delete-cloud-copy' }),
    }));
    expect(await cloudDelete.json()).toEqual({ cloudGeneration: 2, syncEnabled: false });
    const retainedAccount = await responseJson<{
      id: string;
      cloudGeneration: number;
      syncEnabled: boolean;
    }>(gateway.fetch(authenticatedRequest('/account', session)));
    expect(retainedAccount).toMatchObject({
      id: account.id,
      cloudGeneration: 2,
      syncEnabled: false,
    });

    const accountDelete = await gateway.fetch(authenticatedRequest('/account', session, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'delete-account' }),
    }));
    expect(accountDelete.status).toBe(204);
    const denied = await gateway.fetch(authenticatedRequest('/account', session));
    expect(denied.status).toBe(401);
  });

  it('rotates the original session when a second identity provider is linked', async () => {
    const { gateway } = harness();
    const original = await nativeLogin(
      gateway,
      'google',
      'original-link-challenge-with-more-than-thirty-two-characters',
    );
    const account = await responseJson<{ id: string }>(gateway.fetch(
      authenticatedRequest('/account', original),
    ));
    const linkChallenge = 'linked-provider-challenge-with-more-than-thirty-two-characters';
    const link = await gateway.fetch(authenticatedRequest('/account/link/apple', original, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challenge: linkChallenge }),
    }));
    const { authorizationUrl } = await link.json() as { authorizationUrl: string };
    const providerUrl = new URL(authorizationUrl);
    const callback = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/auth/apple/callback?state=${providerUrl.searchParams.get('state')}&code=valid-code`,
    ));
    const callbackHash = new URL(callback.headers.get('location')!).hash.slice(1);
    const handoff = new URLSearchParams(callbackHash).get('handoff');
    const exchange = await gateway.fetch(new Request(
      `${ORIGIN}/api/sync/v1/auth/apple/handoff`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoff, challenge: linkChallenge }),
      },
    ));
    const rotated = await exchange.json() as SessionSecrets;

    expect((await gateway.fetch(authenticatedRequest('/account', original))).status).toBe(401);
    await expect(responseJson<{ id: string }>(gateway.fetch(
      authenticatedRequest('/account', rotated),
    ))).resolves.toMatchObject({ id: account.id });
  });

  it('rejects foreign origins, unknown routes, and methods with no cacheable response', async () => {
    const { gateway } = harness();
    const session = await nativeLogin(
      gateway,
      'google',
      'route-device-challenge-with-more-than-thirty-two-characters',
    );
    const foreign = await gateway.fetch(authenticatedRequest('/session', session, {
      method: 'DELETE',
      headers: { origin: 'https://attacker.example' },
    }));
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('cache-control')).toBe('no-store');
    const unknown = await gateway.fetch(authenticatedRequest('/not-real', session));
    expect(unknown.status).toBe(404);
    const wrongMethod = await gateway.fetch(authenticatedRequest('/account', session, {
      method: 'PATCH',
    }));
    expect(wrongMethod.status).toBe(405);
  });
});

async function registerDevice(
  gateway: SyncGateway,
  session: SessionSecrets,
  deviceId: string,
  platform: 'web' | 'ios' | 'android',
): Promise<void> {
  const response = await gateway.fetch(authenticatedRequest('/devices', session, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      platform,
      keyVersion: 1,
      consentConfirmed: true,
    }),
  }));
  expect(response.status).toBe(201);
}

async function responseJson<T>(response: Promise<Response>): Promise<T> {
  const resolved = await response;
  expect(resolved.ok).toBe(true);
  return resolved.json() as Promise<T>;
}

function cookieValue(setCookie: string, name: string): string {
  const match = setCookie.match(new RegExp(`${name}=([^;,]+)`));
  if (!match) throw new Error(`Missing cookie ${name}.`);
  return match[1];
}
