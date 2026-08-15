import { describe, expect, it } from 'vitest';
import { InMemoryControlPlane } from './controlPlane';
import { randomOpaqueId } from './encoding';

const IDENTITY_PEPPER = 'identity-pepper-with-at-least-thirty-two-characters';
const SESSION_PEPPER = 'session-pepper-with-at-least-thirty-two-characters';

describe('Bloom sync account control plane', () => {
  it('creates account access without granting upload consent', async () => {
    const control = new InMemoryControlPlane(IDENTITY_PEPPER, SESSION_PEPPER);
    const account = await control.resolveIdentity('google', 'issuer', 'subject');
    const session = await control.issueSession(account.id, 'native');

    expect((await control.authenticateAccess(session.accessToken)).account.syncConsentAt).toBeNull();
    await expect(control.listDevices(account.id)).rejects.toMatchObject({
      code: 'sync_consent_required',
    });
  });

  it('rotates an expired access session through a one-use refresh credential', async () => {
    let now = 1_000_000;
    const control = new InMemoryControlPlane(
      IDENTITY_PEPPER,
      SESSION_PEPPER,
      () => now,
    );
    const account = await control.resolveIdentity('google', 'issuer', 'subject');
    const first = await control.issueSession(account.id, 'native');
    now += 16 * 60_000;

    await expect(control.authenticateAccess(first.accessToken)).rejects.toMatchObject({
      code: 'session_expired',
    });
    const rotated = await control.refreshSession(first.refreshToken);
    await expect(control.authenticateAccess(rotated.accessToken)).resolves.toMatchObject({
      account: { id: account.id },
    });
    await expect(control.refreshSession(first.refreshToken)).rejects.toMatchObject({
      code: 'refresh_invalid',
    });
  });

  it('requires consent and permanently denies a revoked device grant', async () => {
    const control = new InMemoryControlPlane(IDENTITY_PEPPER, SESSION_PEPPER);
    const account = await control.resolveIdentity('apple', 'issuer', 'subject');
    const deviceId = randomOpaqueId('device');
    await expect(
      control.registerDevice(account.id, deviceId, 'ios', 1, false),
    ).rejects.toMatchObject({ code: 'sync_consent_required' });
    await control.registerDevice(account.id, deviceId, 'ios', 1, true);
    await expect(control.requireDevice(account.id, deviceId)).resolves.toMatchObject({ id: deviceId });
    await control.revokeDevice(account.id, deviceId);
    await expect(control.requireDevice(account.id, deviceId)).rejects.toMatchObject({
      code: 'device_revoked',
    });
  });

  it('binds a native handoff to one challenge and consumes it once', async () => {
    const control = new InMemoryControlPlane(IDENTITY_PEPPER, SESSION_PEPPER);
    const account = await control.resolveIdentity('google', 'issuer', 'native-subject');
    const handoff = await control.createNativeHandoff(
      account.id,
      'google',
      'device-challenge-value',
    );

    await expect(
      control.consumeNativeHandoff('google', handoff, 'another-challenge'),
    ).rejects.toMatchObject({ code: 'handoff_invalid' });
    await expect(
      control.consumeNativeHandoff('apple', handoff, 'device-challenge-value'),
    ).rejects.toMatchObject({ code: 'handoff_invalid' });
    await expect(
      control.consumeNativeHandoff('google', handoff, 'device-challenge-value'),
    ).resolves.toBe(account.id);
    await expect(
      control.consumeNativeHandoff('google', handoff, 'device-challenge-value'),
    ).rejects.toMatchObject({ code: 'handoff_invalid' });
  });

  it('keeps provider aliases isolated and rejects cross-account linking', async () => {
    const control = new InMemoryControlPlane(IDENTITY_PEPPER, SESSION_PEPPER);
    const first = await control.resolveIdentity('google', 'issuer', 'first');
    const second = await control.resolveIdentity('google', 'issuer', 'second');
    expect(first.id).not.toBe(second.id);
    await expect(
      control.resolveIdentity('google', 'issuer', 'first', second.id),
    ).rejects.toMatchObject({ code: 'identity_linked' });
  });

  it('consumes OIDC state once and rejects it after expiry', async () => {
    let now = 1000;
    const control = new InMemoryControlPlane(
      IDENTITY_PEPPER,
      SESSION_PEPPER,
      () => now,
    );
    const first = await control.createAuthTransaction({
      provider: 'google',
      mode: 'web',
      nativeChallenge: null,
      linkAccountId: null,
      linkSessionId: null,
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: 'a'.repeat(43),
    });
    await expect(control.consumeAuthTransaction(first.state, 'google')).resolves.toMatchObject({
      nonce: first.transaction.nonce,
    });
    await expect(control.consumeAuthTransaction(first.state, 'google')).rejects.toMatchObject({
      code: 'auth_state',
    });
    const expired = await control.createAuthTransaction({
      provider: 'apple',
      mode: 'web',
      nativeChallenge: null,
      linkAccountId: null,
      linkSessionId: null,
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: null,
    });
    now += 11 * 60_000;
    await expect(control.consumeAuthTransaction(expired.state, 'apple')).rejects.toMatchObject({
      code: 'auth_state',
    });
  });
});
