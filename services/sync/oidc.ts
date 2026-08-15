import type { Clock, IdentityProviderName } from './types';
import { SyncServiceError } from './types';
import {
  base64UrlDecode,
  base64UrlEncode,
  decodeUtf8,
  encodedBytes,
  ownedArrayBuffer,
  utf8,
} from './encoding';

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
}

export interface OidcAuthorizationInput {
  state: string;
  nonce: string;
  redirectUri: string;
  pkceVerifier: string | null;
}

export interface OidcExchangeInput extends OidcAuthorizationInput {
  code: string;
}

export interface OidcProvider {
  readonly name: IdentityProviderName;
  authorizationUrl(input: OidcAuthorizationInput): Promise<string>;
  exchange(input: OidcExchangeInput): Promise<VerifiedIdentity>;
}

interface OidcProviderConfig {
  name: IdentityProviderName;
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  usePkce: boolean;
}

interface IdTokenClaims {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
}

const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;

export class RemoteOidcProvider implements OidcProvider {
  readonly name: IdentityProviderName;
  private jwks: { expiresAt: number; keys: JsonWebKey[] } | null = null;

  constructor(
    private readonly config: OidcProviderConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: Clock = Date.now,
  ) {
    this.name = config.name;
    for (const endpoint of [
      config.authorizationEndpoint,
      config.tokenEndpoint,
      config.jwksEndpoint,
    ]) {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:') throw new Error('OIDC endpoints must use HTTPS.');
    }
  }

  async authorizationUrl(input: OidcAuthorizationInput): Promise<string> {
    if (this.config.usePkce !== Boolean(input.pkceVerifier)) {
      throw new SyncServiceError(400, 'pkce_policy', 'This provider sign-in transaction has the wrong PKCE policy.');
    }
    const url = new URL(this.config.authorizationEndpoint);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    if (input.pkceVerifier) {
      url.searchParams.set('code_challenge', await pkceChallenge(input.pkceVerifier));
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
  }

  async exchange(input: OidcExchangeInput): Promise<VerifiedIdentity> {
    if (!input.code || input.code.length > 4096) {
      throw new SyncServiceError(400, 'oidc_code', 'The provider authorization code is invalid.');
    }
    if (this.config.usePkce !== Boolean(input.pkceVerifier)) {
      throw new SyncServiceError(400, 'pkce_policy', 'This provider callback has the wrong PKCE policy.');
    }
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: input.redirectUri,
    });
    if (input.pkceVerifier) form.set('code_verifier', input.pkceVerifier);
    const response = await this.fetcher(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'error',
    });
    const token = await boundedJson(response);
    if (!response.ok || typeof token.id_token !== 'string') {
      throw new SyncServiceError(401, 'oidc_exchange', 'The identity provider did not accept the callback.');
    }
    return verifyIdToken(
      token.id_token,
      input.nonce,
      this.config,
      await this.providerKeys(),
      this.now(),
    );
  }

  private async providerKeys(): Promise<JsonWebKey[]> {
    if (this.jwks && this.jwks.expiresAt > this.now()) return this.jwks.keys;
    const response = await this.fetcher(this.config.jwksEndpoint, {
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    const body = await boundedJson(response);
    if (!response.ok || !Array.isArray(body.keys)) {
      throw new SyncServiceError(503, 'oidc_keys', 'The identity provider keys are unavailable.');
    }
    const keys = body.keys.filter(
      (key): key is JsonWebKey => Boolean(key && typeof key === 'object'),
    );
    if (keys.length === 0) {
      throw new SyncServiceError(503, 'oidc_keys', 'The identity provider returned no verification keys.');
    }
    this.jwks = { expiresAt: this.now() + 60 * 60_000, keys };
    return keys;
  }
}

export function googleOidcProvider(input: {
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
  now?: Clock;
}): RemoteOidcProvider {
  return new RemoteOidcProvider(
    {
      name: 'google',
      issuer: 'https://accounts.google.com',
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksEndpoint: 'https://www.googleapis.com/oauth2/v3/certs',
      usePkce: true,
    },
    input.fetcher,
    input.now,
  );
}

export function appleOidcProvider(input: {
  clientId: string;
  signedClientSecret: string;
  fetcher?: typeof fetch;
  now?: Clock;
}): RemoteOidcProvider {
  return new RemoteOidcProvider(
    {
      name: 'apple',
      issuer: 'https://appleid.apple.com',
      clientId: input.clientId,
      clientSecret: input.signedClientSecret,
      authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
      tokenEndpoint: 'https://appleid.apple.com/auth/token',
      jwksEndpoint: 'https://appleid.apple.com/auth/keys',
      usePkce: false,
    },
    input.fetcher,
    input.now,
  );
}

export async function pkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new SyncServiceError(400, 'pkce_verifier', 'The PKCE verifier is invalid.');
  }
  return base64UrlEncode(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', ownedArrayBuffer(utf8(verifier))),
    ),
  );
}

async function verifyIdToken(
  token: string,
  nonce: string,
  config: OidcProviderConfig,
  keys: JsonWebKey[],
  now: number,
): Promise<VerifiedIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new SyncServiceError(401, 'id_token', 'The provider identity token is malformed.');
  }
  let header: Record<string, unknown>;
  let claims: IdTokenClaims;
  try {
    header = JSON.parse(decodeUtf8(base64UrlDecode(parts[0]))) as Record<string, unknown>;
    claims = JSON.parse(decodeUtf8(base64UrlDecode(parts[1]))) as IdTokenClaims;
  } catch {
    throw new SyncServiceError(401, 'id_token', 'The provider identity token is malformed.');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new SyncServiceError(401, 'id_token_algorithm', 'The provider identity token algorithm is not allowed.');
  }
  const jwk = keys.find(
    (key) => (key as JsonWebKey & { kid?: string }).kid === header.kid && key.kty === 'RSA',
  );
  if (!jwk) throw new SyncServiceError(401, 'id_token_key', 'The provider identity token key is unknown.');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    ownedArrayBuffer(base64UrlDecode(parts[2])),
    ownedArrayBuffer(utf8(`${parts[0]}.${parts[1]}`)),
  );
  if (!valid) throw new SyncServiceError(401, 'id_token_signature', 'The provider identity token signature is invalid.');

  const audiences = typeof claims.aud === 'string'
    ? [claims.aud]
    : Array.isArray(claims.aud)
      ? claims.aud.filter((item): item is string => typeof item === 'string')
      : [];
  const nowSeconds = Math.floor(now / 1000);
  if (
    claims.iss !== config.issuer ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    claims.sub.length > 255 ||
    !audiences.includes(config.clientId) ||
    (audiences.length > 1 && claims.azp !== config.clientId) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= nowSeconds ||
    typeof claims.iat !== 'number' ||
    claims.iat > nowSeconds + 300 ||
    claims.nonce !== nonce
  ) {
    throw new SyncServiceError(401, 'id_token_claims', 'The provider identity token claims are invalid.');
  }
  return { issuer: config.issuer, subject: claims.sub };
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new SyncServiceError(502, 'provider_response_size', 'The identity provider response is too large.');
  }
  if (!response.body) {
    throw new SyncServiceError(502, 'provider_response_json', 'The identity provider response is invalid.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SyncServiceError(502, 'provider_response_size', 'The identity provider response is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch {
    throw new SyncServiceError(502, 'provider_response_json', 'The identity provider response is invalid.');
  }
  if (encodedBytes(text) > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new SyncServiceError(502, 'provider_response_size', 'The identity provider response is too large.');
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new SyncServiceError(502, 'provider_response_json', 'The identity provider response is invalid.');
  }
}

export class FakeOidcProvider implements OidcProvider {
  readonly exchanges: OidcExchangeInput[] = [];

  constructor(
    readonly name: IdentityProviderName,
    private readonly identity: VerifiedIdentity,
  ) {}

  async authorizationUrl(input: OidcAuthorizationInput): Promise<string> {
    const url = new URL(`https://${this.name}.example.invalid/authorize`);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    return url.toString();
  }

  async exchange(input: OidcExchangeInput): Promise<VerifiedIdentity> {
    this.exchanges.push(structuredClone(input));
    if (input.code !== 'valid-code') {
      throw new SyncServiceError(401, 'oidc_exchange', 'The identity provider did not accept the callback.');
    }
    return structuredClone(this.identity);
  }
}
