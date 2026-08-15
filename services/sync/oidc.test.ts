import { describe, expect, it } from 'vitest';
import { base64UrlEncode, ownedArrayBuffer, utf8 } from './encoding';
import { appleOidcProvider, googleOidcProvider } from './oidc';

describe('allowlisted OIDC authorization-code providers', () => {
  it('uses state, nonce, and S256 PKCE for Google and verifies the signed id token', async () => {
    const now = 2_000_000_000_000;
    const nonce = 'nonce-value';
    const { token, jwk } = await signedGoogleToken(now, nonce);
    const requests: { url: string; init?: RequestInit }[] = [];
    const provider = googleOidcProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      now: () => now,
      fetcher: async (input, init) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith('/token')) {
          return new Response(JSON.stringify({ id_token: token }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const verifier = 'a'.repeat(43);
    const authorization = new URL(await provider.authorizationUrl({
      state: 'state-value',
      nonce,
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: verifier,
    }));
    expect(authorization.origin).toBe('https://accounts.google.com');
    expect(authorization.searchParams.get('state')).toBe('state-value');
    expect(authorization.searchParams.get('nonce')).toBe(nonce);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).not.toBe(verifier);

    await expect(provider.exchange({
      state: 'state-value',
      code: 'provider-code',
      nonce,
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: verifier,
    })).resolves.toEqual({
      issuer: 'https://accounts.google.com',
      subject: 'opaque-provider-subject',
    });
    expect(String(requests[0].init?.body)).toContain('code_verifier=');
    expect(requests.map((request) => new URL(request.url).hostname)).toEqual([
      'oauth2.googleapis.com',
      'www.googleapis.com',
    ]);
  });

  it('rejects a nonce mismatch and does not add undocumented PKCE to Apple', async () => {
    const apple = appleOidcProvider({
      clientId: 'apple-client',
      signedClientSecret: 'signed-secret',
      fetcher: async () => new Response('{}'),
    });
    const authorization = new URL(await apple.authorizationUrl({
      state: 'state-value',
      nonce: 'nonce-value',
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: null,
    }));
    expect(authorization.origin).toBe('https://appleid.apple.com');
    expect(authorization.searchParams.has('code_challenge')).toBe(false);
    await expect(apple.authorizationUrl({
      state: 'state-value',
      nonce: 'nonce-value',
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: 'a'.repeat(43),
    })).rejects.toMatchObject({ code: 'pkce_policy' });

    const now = 2_000_000_000_000;
    const { token, jwk } = await signedGoogleToken(now, 'different-nonce');
    const google = googleOidcProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      now: () => now,
      fetcher: async (input) => new Response(JSON.stringify(
        String(input).endsWith('/token') ? { id_token: token } : { keys: [jwk] },
      )),
    });
    await expect(google.exchange({
      state: 'state-value',
      code: 'provider-code',
      nonce: 'expected-nonce',
      redirectUri: 'https://bloom.test/callback',
      pkceVerifier: 'a'.repeat(43),
    })).rejects.toMatchObject({ code: 'id_token_claims' });
  });
});

async function signedGoogleToken(
  now: number,
  nonce: string,
): Promise<{ token: string; jwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const header = base64UrlEncode(utf8(JSON.stringify({ alg: 'RS256', kid: 'test-key' })));
  const claims = base64UrlEncode(utf8(JSON.stringify({
    iss: 'https://accounts.google.com',
    sub: 'opaque-provider-subject',
    aud: 'google-client',
    exp: Math.floor(now / 1000) + 600,
    iat: Math.floor(now / 1000),
    nonce,
  })));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    ownedArrayBuffer(utf8(`${header}.${claims}`)),
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  (jwk as JsonWebKey & { kid: string }).kid = 'test-key';
  return {
    token: `${header}.${claims}.${base64UrlEncode(new Uint8Array(signature))}`,
    jwk,
  };
}
