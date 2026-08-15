import {
  MAX_ACCOUNT_CONTENT_BYTES,
  MAX_ENCRYPTED_SNAPSHOT_BYTES,
  MAX_SYNC_BATCH_BYTES,
  SyncServiceError,
  type Clock,
  type DevicePlatform,
  type EncryptedMutationEnvelope,
  type EncryptedSnapshotEnvelope,
  type IdentityProviderName,
  type RandomByteFiller,
  type SafeRequestLog,
  type SessionRecord,
  type SessionSecrets,
} from './types';
import {
  constantTimeEqual,
  fillRandom,
  randomOpaqueId,
  safeInteger,
  validOpaqueId,
} from './encoding';
import type { ContentStore } from './contentStore';
import type { AuthenticatedSession, ControlPlane } from './controlPlane';
import type { OidcProvider } from './oidc';
import { FixedWindowRateLimiter, type RateLimiter } from './rateLimit';

const API_PREFIX = '/api/sync/v1';
const JSON_TYPE = 'application/json';
const ACCESS_COOKIE = '__Host-bloom_access';
const REFRESH_COOKIE = '__Host-bloom_refresh';
const CSRF_COOKIE = '__Host-bloom_csrf';
const MAX_SMALL_BODY_BYTES = 16 * 1024;
const MAX_SNAPSHOT_REQUEST_BYTES = Math.ceil(MAX_ENCRYPTED_SNAPSHOT_BYTES * 4 / 3) +
  512 * 1024;

export interface SafeRequestLogger {
  write(entry: SafeRequestLog): void | Promise<void>;
}

export interface SyncGatewayOptions {
  origin: string;
  control: ControlPlane;
  content: ContentStore;
  providers: Record<IdentityProviderName, OidcProvider>;
  logger?: SafeRequestLogger;
  limiter?: RateLimiter;
  now?: Clock;
  random?: RandomByteFiller;
  cookieSuffix?: string;
  nativeRedirectUri?: string;
}

interface RequestContext {
  requestId: string;
  route: string;
  accountId: string | null;
  deviceId: string | null;
  outcome: string;
}

interface RequestAuth extends AuthenticatedSession {
  source: 'cookie' | 'bearer';
}

export class SyncGateway {
  private readonly origin: string;
  private readonly logger: SafeRequestLogger;
  private readonly limiter: RateLimiter;
  private readonly now: Clock;
  private readonly random: RandomByteFiller;
  private readonly cookieSuffix: string;
  private readonly nativeRedirectUri: string;

  constructor(private readonly options: SyncGatewayOptions) {
    this.origin = new URL(options.origin).origin;
    if (new URL(this.origin).protocol !== 'https:' && !this.origin.startsWith('http://localhost')) {
      throw new Error('The Bloom sync origin must use HTTPS outside localhost.');
    }
    this.logger = options.logger ?? { write: (entry) => console.info(JSON.stringify(entry)) };
    this.now = options.now ?? Date.now;
    this.random = options.random ?? fillRandom;
    this.limiter = options.limiter ?? new FixedWindowRateLimiter(this.now);
    this.cookieSuffix = options.cookieSuffix ?? '';
    this.nativeRedirectUri = options.nativeRedirectUri ?? 'bloom://auth';
  }

  async fetch(request: Request): Promise<Response> {
    const startedAt = this.now();
    const url = new URL(request.url);
    const context: RequestContext = {
      requestId: randomOpaqueId('request', 16, this.random),
      route: routeTemplate(url.pathname),
      accountId: null,
      deviceId: null,
      outcome: 'ok',
    };
    let response: Response;
    try {
      if (url.origin !== this.origin || !url.pathname.startsWith(`${API_PREFIX}/`)) {
        throw new SyncServiceError(404, 'route_missing', 'The sync route does not exist.');
      }
      response = await this.dispatch(request, url, context);
    } catch (error) {
      const serviceError = error instanceof SyncServiceError
        ? error
        : new SyncServiceError(500, 'internal', 'The sync service could not complete this request.');
      context.outcome = serviceError.code;
      response = jsonResponse(
        { error: { code: serviceError.code, message: serviceError.message } },
        serviceError.status,
        serviceError.retryAfterSeconds
          ? { 'retry-after': String(serviceError.retryAfterSeconds) }
          : undefined,
      );
    }
    const finalResponse = withSecurityHeaders(response);
    await this.logger.write({
      requestId: context.requestId,
      method: request.method,
      route: context.route,
      status: finalResponse.status,
      outcome: context.outcome,
      accountId: context.accountId,
      deviceId: context.deviceId,
      elapsedMs: Math.max(0, this.now() - startedAt),
    });
    return finalResponse;
  }

  private async dispatch(
    request: Request,
    url: URL,
    context: RequestContext,
  ): Promise<Response> {
    const path = url.pathname.slice(API_PREFIX.length);
    const authMatch = path.match(/^\/auth\/(google|apple)\/(start|callback|handoff)$/);
    if (authMatch) {
      const provider = authMatch[1] as IdentityProviderName;
      const action = authMatch[2];
      if (action === 'start') return this.authStart(request, url, provider);
      if (action === 'callback') return this.authCallback(request, url, provider);
      return this.nativeHandoff(request, provider);
    }

    if (path === '/session/refresh') return this.refresh(request);
    const auth = await this.authenticated(request, context);
    if (path === '/session') return this.signOut(request, auth);
    if (path === '/account') return this.account(request, auth);

    const linkMatch = path.match(/^\/account\/link\/(google|apple)$/);
    if (linkMatch) {
      return this.linkProvider(request, auth, linkMatch[1] as IdentityProviderName);
    }
    if (path === '/devices') return this.devices(request, auth);
    const deviceMatch = path.match(/^\/devices\/(device_[A-Za-z0-9_-]+)$/);
    if (deviceMatch) return this.revokeDevice(request, auth, deviceMatch[1]);

    if (path === '/changes') return this.changes(request, url, auth, context);
    if (path === '/snapshots/latest') return this.latestSnapshot(request, auth, context);
    if (path === '/snapshots') return this.snapshots(request, auth, context);
    if (path === '/export') return this.cloudExport(request, auth, context);
    if (path === '/cloud-copy') return this.deleteCloudCopy(request, auth);
    throw new SyncServiceError(404, 'route_missing', 'The sync route does not exist.');
  }

  private async authStart(
    request: Request,
    url: URL,
    providerName: IdentityProviderName,
  ): Promise<Response> {
    requireMethod(request, 'GET');
    await this.limiter.take(
      'auth-start',
      request.headers.get('cf-connecting-ip') ?? 'unknown',
      10,
      10 * 60_000,
    );
    const requestedMode = url.searchParams.get('mode');
    if (requestedMode !== null && requestedMode !== 'web' && requestedMode !== 'native') {
      throw new SyncServiceError(400, 'auth_mode', 'The sign-in mode is invalid.');
    }
    const mode = requestedMode === 'native' ? 'native' : 'web';
    rejectUnknownSearch(url, mode === 'native' ? ['mode', 'challenge'] : ['mode']);
    const challenge = mode === 'native' ? url.searchParams.get('challenge') : null;
    if (mode === 'native' && (!challenge || challenge.length < 32 || challenge.length > 512)) {
      throw new SyncServiceError(400, 'native_challenge', 'Native sign-in needs a bounded device challenge.');
    }
    const pkceVerifier = providerName === 'google'
      ? randomOpaqueId('pkce', 32, this.random)
      : null;
    const redirectUri = `${this.origin}${API_PREFIX}/auth/${providerName}/callback`;
    const created = await this.options.control.createAuthTransaction({
      provider: providerName,
      mode,
      nativeChallenge: challenge,
      linkAccountId: null,
      linkSessionId: null,
      redirectUri,
      pkceVerifier,
    });
    const location = await this.options.providers[providerName].authorizationUrl({
      state: created.state,
      nonce: created.transaction.nonce,
      redirectUri,
      pkceVerifier,
    });
    return redirectResponse(location);
  }

  private async authCallback(
    request: Request,
    url: URL,
    providerName: IdentityProviderName,
  ): Promise<Response> {
    requireMethod(request, 'GET');
    rejectUnknownSearch(url, ['state', 'code']);
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const transaction = await this.options.control.consumeAuthTransaction(state, providerName);
    const identity = await this.options.providers[providerName].exchange({
      state,
      code,
      nonce: transaction.nonce,
      redirectUri: transaction.redirectUri,
      pkceVerifier: transaction.pkceVerifier,
    });
    const account = await this.options.control.resolveIdentity(
      providerName,
      identity.issuer,
      identity.subject,
      transaction.linkAccountId,
    );
    if (transaction.linkSessionId) {
      await this.options.control.revokeSession(transaction.linkSessionId);
    }
    if (transaction.mode === 'native') {
      if (!transaction.nativeChallengeHash) {
        throw new SyncServiceError(400, 'native_challenge', 'The native sign-in challenge is unavailable.');
      }
      const handoff = await this.options.control.createNativeHandoffFromHash(
        account.id,
        providerName,
        transaction.nativeChallengeHash,
      );
      const location = new URL(this.nativeRedirectUri);
      location.hash = new URLSearchParams({ handoff, provider: providerName }).toString();
      return redirectResponse(location.toString());
    }
    const secrets = await this.options.control.issueSession(account.id, 'web');
    return withSessionCookies(
      redirectResponse(`${this.origin}/`),
      secrets,
      this.cookieSuffix,
      this.now(),
    );
  }

  private async nativeHandoff(
    request: Request,
    provider: IdentityProviderName,
  ): Promise<Response> {
    requireMethod(request, 'POST');
    requireJson(request);
    rejectForeignOrigin(request, this.origin);
    const body = await readJson(request, MAX_SMALL_BODY_BYTES);
    const token = requiredString(body, 'handoff', 512);
    const challenge = requiredString(body, 'challenge', 512);
    const accountId = await this.options.control.consumeNativeHandoff(
      provider,
      token,
      challenge,
    );
    return jsonResponse(await this.options.control.issueSession(accountId, 'native'), 200);
  }

  private async refresh(request: Request): Promise<Response> {
    requireMethod(request, 'POST');
    const cookies = parseCookies(request.headers.get('cookie'));
    const nativeRefresh = bearerToken(request.headers.get('authorization'), 'BloomRefresh');
    let refreshToken: string;
    let source: 'cookie' | 'bearer';
    if (nativeRefresh) {
      rejectForeignOrigin(request, this.origin);
      refreshToken = nativeRefresh;
      source = 'bearer';
    } else {
      requireOrigin(request, this.origin);
      refreshToken = cookies.get(cookieName(REFRESH_COOKIE, this.cookieSuffix)) ?? '';
      const csrfCookie = cookies.get(cookieName(CSRF_COOKIE, this.cookieSuffix)) ?? '';
      const csrfHeader = request.headers.get('x-bloom-csrf') ?? '';
      if (!csrfCookie || !constantTimeEqual(csrfCookie, csrfHeader)) {
        throw new SyncServiceError(403, 'csrf_invalid', 'The request confirmation token is invalid.');
      }
      source = 'cookie';
    }
    const secrets = await this.options.control.refreshSession(refreshToken);
    const response = jsonResponse(source === 'bearer' ? secrets : { refreshed: true }, 200);
    return source === 'cookie'
      ? withSessionCookies(response, secrets, this.cookieSuffix, this.now())
      : response;
  }

  private async signOut(request: Request, auth: RequestAuth): Promise<Response> {
    requireMethod(request, 'DELETE');
    await this.requireMutationAuth(request, auth);
    await this.options.control.revokeSession(auth.session.id);
    return auth.source === 'cookie'
      ? clearSessionCookies(new Response(null, { status: 204 }), this.cookieSuffix)
      : new Response(null, { status: 204 });
  }

  private async account(request: Request, auth: RequestAuth): Promise<Response> {
    if (request.method === 'GET') {
      return jsonResponse({
        id: auth.account.id,
        fingerprint: auth.account.fingerprint,
        cloudGeneration: auth.account.cloudGeneration,
        syncEnabled: auth.account.syncConsentAt !== null,
        quotaBytes: MAX_ACCOUNT_CONTENT_BYTES,
      }, 200);
    }
    requireMethod(request, 'DELETE');
    await this.requireMutationAuth(request, auth);
    this.options.control.requireRecentAuth(auth.session);
    requireJson(request);
    const body = await readJson(request, MAX_SMALL_BODY_BYTES);
    if (body.confirmation !== 'delete-account') {
      throw new SyncServiceError(400, 'confirmation_required', 'Account deletion needs exact confirmation.');
    }
    const requestedGeneration = auth.account.cloudGeneration + 1;
    await this.options.content.deleteActiveContent(auth.account.id, requestedGeneration);
    const generation = await this.options.control.beginAccountDeletion(auth.account.id);
    if (generation !== requestedGeneration) {
      throw new SyncServiceError(409, 'generation_changed', 'The cloud generation changed.');
    }
    await this.options.control.finishAccountDeletion(auth.account.id);
    return clearSessionCookies(new Response(null, { status: 204 }), this.cookieSuffix);
  }

  private async linkProvider(
    request: Request,
    auth: RequestAuth,
    providerName: IdentityProviderName,
  ): Promise<Response> {
    requireMethod(request, 'POST');
    await this.requireMutationAuth(request, auth);
    this.options.control.requireRecentAuth(auth.session);
    let nativeChallenge: string | null = null;
    if (auth.source === 'bearer') {
      requireJson(request);
      const body = await readJson(request, MAX_SMALL_BODY_BYTES);
      nativeChallenge = requiredString(body, 'challenge', 512);
      if (nativeChallenge.length < 32) {
        throw new SyncServiceError(400, 'native_challenge', 'Native sign-in needs a bounded device challenge.');
      }
    }
    const pkceVerifier = providerName === 'google'
      ? randomOpaqueId('pkce', 32, this.random)
      : null;
    const redirectUri = `${this.origin}${API_PREFIX}/auth/${providerName}/callback`;
    const created = await this.options.control.createAuthTransaction({
      provider: providerName,
      mode: auth.source === 'bearer' ? 'native' : 'web',
      nativeChallenge,
      linkAccountId: auth.account.id,
      linkSessionId: auth.session.id,
      redirectUri,
      pkceVerifier,
    });
    const authorizationUrl = await this.options.providers[providerName].authorizationUrl({
      state: created.state,
      nonce: created.transaction.nonce,
      redirectUri,
      pkceVerifier,
    });
    return jsonResponse({ authorizationUrl }, 200);
  }

  private async devices(request: Request, auth: RequestAuth): Promise<Response> {
    if (request.method === 'GET') {
      return jsonResponse({ devices: await this.options.control.listDevices(auth.account.id) }, 200);
    }
    requireMethod(request, 'POST');
    await this.requireMutationAuth(request, auth);
    requireJson(request);
    const body = await readJson(request, MAX_SMALL_BODY_BYTES);
    const id = requiredString(body, 'deviceId', 128);
    const platform = body.platform as DevicePlatform;
    const keyVersion = body.keyVersion;
    if (!safeInteger(keyVersion, 1)) {
      throw new SyncServiceError(400, 'key_version', 'The device key version is invalid.');
    }
    const device = await this.options.control.registerDevice(
      auth.account.id,
      id,
      platform,
      keyVersion,
      body.consentConfirmed === true,
    );
    return jsonResponse({ device }, 201);
  }

  private async revokeDevice(
    request: Request,
    auth: RequestAuth,
    deviceId: string,
  ): Promise<Response> {
    requireMethod(request, 'DELETE');
    if (!validOpaqueId(deviceId, 'device')) {
      throw new SyncServiceError(400, 'device_metadata', 'The device id is invalid.');
    }
    await this.requireMutationAuth(request, auth);
    this.options.control.requireRecentAuth(auth.session);
    requireJson(request);
    const body = await readJson(request, MAX_SMALL_BODY_BYTES);
    if (body.confirmation !== 'revoke-device') {
      throw new SyncServiceError(400, 'confirmation_required', 'Device revocation needs exact confirmation.');
    }
    await this.options.control.revokeDevice(auth.account.id, deviceId);
    return new Response(null, { status: 204 });
  }

  private async changes(
    request: Request,
    url: URL,
    auth: RequestAuth,
    context: RequestContext,
  ): Promise<Response> {
    const device = await this.authorizedDevice(request, auth, context);
    if (request.method === 'GET') {
      rejectUnknownSearch(url, ['after']);
      await this.limiter.take(
        'pull',
        `${auth.account.id.length}:${auth.account.id}${device.id}`,
        60,
        60_000,
      );
      const after = url.searchParams.get('after');
      const page = await this.options.content.changes(
        auth.account.id,
        auth.account.cloudGeneration,
        after,
      );
      await this.options.control.acknowledgeDevice(auth.account.id, device.id, page.cursor);
      return jsonResponse(page, 200);
    }
    requireMethod(request, 'POST');
    await this.requireMutationAuth(request, auth);
    await this.limiter.take('mutation-batch', auth.account.id, 120, 60_000);
    requireJson(request);
    const body = await readJson(request, MAX_SYNC_BATCH_BYTES);
    if (!Array.isArray(body.mutations)) {
      throw new SyncServiceError(400, 'batch_json', 'The encrypted mutation batch is invalid.');
    }
    const accepted = await this.options.content.append(
      auth.account.id,
      device.id,
      auth.account.cloudGeneration,
      body.mutations as EncryptedMutationEnvelope[],
    );
    const cursor = accepted[accepted.length - 1]?.cursor ?? device.lastCursor;
    await this.options.control.acknowledgeDevice(auth.account.id, device.id, cursor);
    return jsonResponse({ cloudGeneration: auth.account.cloudGeneration, accepted }, 200);
  }

  private async latestSnapshot(
    request: Request,
    auth: RequestAuth,
    context: RequestContext,
  ): Promise<Response> {
    requireMethod(request, 'GET');
    const device = await this.authorizedDevice(request, auth, context);
    await this.limiter.take(
      'pull',
      `${auth.account.id.length}:${auth.account.id}${device.id}`,
      60,
      60_000,
    );
    const snapshot = await this.options.content.latestSnapshot(
      auth.account.id,
      auth.account.cloudGeneration,
    );
    return jsonResponse({ cloudGeneration: auth.account.cloudGeneration, snapshot }, 200);
  }

  private async snapshots(
    request: Request,
    auth: RequestAuth,
    context: RequestContext,
  ): Promise<Response> {
    requireMethod(request, 'POST');
    await this.requireMutationAuth(request, auth);
    const device = await this.authorizedDevice(request, auth, context);
    requireJson(request);
    const body = await readJson(request, MAX_SNAPSHOT_REQUEST_BYTES);
    const snapshot = await this.options.content.storeSnapshot(
      auth.account.id,
      device.id,
      auth.account.cloudGeneration,
      body.snapshot as EncryptedSnapshotEnvelope,
    );
    return jsonResponse({ snapshot }, 201);
  }

  private async cloudExport(
    request: Request,
    auth: RequestAuth,
    context: RequestContext,
  ): Promise<Response> {
    requireMethod(request, 'GET');
    await this.authorizedDevice(request, auth, context);
    return jsonResponse(
      await this.options.content.export(auth.account.id, auth.account.cloudGeneration),
      200,
      { 'content-disposition': 'attachment; filename="bloom-encrypted-cloud-export.json"' },
    );
  }

  private async deleteCloudCopy(request: Request, auth: RequestAuth): Promise<Response> {
    requireMethod(request, 'DELETE');
    await this.requireMutationAuth(request, auth);
    this.options.control.requireRecentAuth(auth.session);
    requireJson(request);
    const body = await readJson(request, MAX_SMALL_BODY_BYTES);
    if (body.confirmation !== 'delete-cloud-copy') {
      throw new SyncServiceError(400, 'confirmation_required', 'Cloud-copy deletion needs exact confirmation.');
    }
    const requestedGeneration = auth.account.cloudGeneration + 1;
    await this.options.content.deleteActiveContent(auth.account.id, requestedGeneration);
    const generation = await this.options.control.beginCloudDeletion(auth.account.id);
    if (generation !== requestedGeneration) {
      throw new SyncServiceError(409, 'generation_changed', 'The cloud generation changed.');
    }
    await this.options.control.finishCloudDeletion(auth.account.id, generation);
    return jsonResponse({ cloudGeneration: generation, syncEnabled: false }, 200);
  }

  private async authenticated(
    request: Request,
    context: RequestContext,
  ): Promise<RequestAuth> {
    const bearer = bearerToken(request.headers.get('authorization'), 'Bearer');
    const cookies = parseCookies(request.headers.get('cookie'));
    const cookie = cookies.get(cookieName(ACCESS_COOKIE, this.cookieSuffix));
    const token = bearer ?? cookie ?? '';
    const authenticated = await this.options.control.authenticateAccess(token);
    context.accountId = authenticated.account.id;
    return { ...authenticated, source: bearer ? 'bearer' : 'cookie' };
  }

  private async requireMutationAuth(request: Request, auth: RequestAuth): Promise<void> {
    if (auth.source === 'cookie') {
      requireOrigin(request, this.origin);
      await this.options.control.verifyCsrf(
        auth.session,
        request.headers.get('x-bloom-csrf') ?? '',
      );
    } else {
      rejectForeignOrigin(request, this.origin);
    }
  }

  private async authorizedDevice(
    request: Request,
    auth: RequestAuth,
    context: RequestContext,
  ) {
    const deviceId = request.headers.get('x-bloom-device-id') ?? '';
    const device = await this.options.control.requireDevice(auth.account.id, deviceId);
    context.deviceId = device.id;
    return device;
  }
}

function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new SyncServiceError(405, 'method_not_allowed', 'This method is not allowed for the sync route.');
  }
}

function requireOrigin(request: Request, origin: string): void {
  if (request.headers.get('origin') !== origin) {
    throw new SyncServiceError(403, 'origin_invalid', 'The request origin is not allowed.');
  }
}

function rejectForeignOrigin(request: Request, origin: string): void {
  const actual = request.headers.get('origin');
  if (actual !== null && actual !== origin) {
    throw new SyncServiceError(403, 'origin_invalid', 'The request origin is not allowed.');
  }
}

function requireJson(request: Request): void {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== JSON_TYPE) {
    throw new SyncServiceError(415, 'content_type', 'The sync request must use application/json.');
  }
}

async function readJson(
  request: Request,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new SyncServiceError(413, 'body_size', 'The sync request body is too large.');
  }
  if (!request.body) throw new SyncServiceError(400, 'body_json', 'The sync request body is missing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new SyncServiceError(413, 'body_size', 'The sync request body is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new SyncServiceError(400, 'body_json', 'The sync request body is invalid.');
  }
}

function requiredString(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new SyncServiceError(400, 'body_field', `The ${key} field is invalid.`);
  }
  return value;
}

function rejectUnknownSearch(url: URL, allowed: string[]): void {
  if ([...url.searchParams.keys()].some((key) => !allowed.includes(key))) {
    throw new SyncServiceError(400, 'query_parameter', 'The sync route has an unknown query parameter.');
  }
}

function routeTemplate(pathname: string): string {
  if (pathname.match(/^\/api\/sync\/v1\/devices\/[^/]+$/)) {
    return `${API_PREFIX}/devices/:deviceId`;
  }
  return pathname.startsWith(`${API_PREFIX}/`) ? pathname : 'unmatched';
}

function bearerToken(header: string | null, scheme: string): string | null {
  if (!header) return null;
  const prefix = `${scheme} `;
  return header.startsWith(prefix) && header.length > prefix.length
    ? header.slice(prefix.length)
    : null;
}

function parseCookies(value: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of value?.split(';') ?? []) {
    const equals = part.indexOf('=');
    if (equals <= 0) continue;
    cookies.set(part.slice(0, equals).trim(), part.slice(equals + 1).trim());
  }
  return cookies;
}

function cookieName(base: string, suffix: string): string {
  return suffix ? `${base}_${suffix}` : base;
}

function cookie(value: string, httpOnly: boolean, maximumAge: number): string {
  const attributes = [
    value,
    'Path=/',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maximumAge}`,
  ];
  if (httpOnly) attributes.push('HttpOnly');
  return attributes.join('; ');
}

function withSessionCookies(
  response: Response,
  secrets: SessionSecrets,
  suffix: string,
  now: number,
): Response {
  const headers = new Headers(response.headers);
  headers.append('set-cookie', cookie(
    `${cookieName(ACCESS_COOKIE, suffix)}=${secrets.accessToken}`,
    true,
    Math.max(0, Math.floor((secrets.accessExpiresAt - now) / 1000)),
  ));
  headers.append('set-cookie', cookie(
    `${cookieName(REFRESH_COOKIE, suffix)}=${secrets.refreshToken}`,
    true,
    Math.max(0, Math.floor((secrets.refreshExpiresAt - now) / 1000)),
  ));
  headers.append('set-cookie', cookie(
    `${cookieName(CSRF_COOKIE, suffix)}=${secrets.csrfToken}`,
    false,
    Math.max(0, Math.floor((secrets.refreshExpiresAt - now) / 1000)),
  ));
  return new Response(response.body, { status: response.status, headers });
}

function clearSessionCookies(response: Response, suffix: string): Response {
  const headers = new Headers(response.headers);
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    headers.append('set-cookie', cookie(`${cookieName(name, suffix)}=`, true, 0));
  }
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(
  value: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': `${JSON_TYPE}; charset=utf-8`, ...extraHeaders },
  });
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, headers });
}

export function sessionCookieNames(suffix = ''): {
  access: string;
  refresh: string;
  csrf: string;
} {
  return {
    access: cookieName(ACCESS_COOKIE, suffix),
    refresh: cookieName(REFRESH_COOKIE, suffix),
    csrf: cookieName(CSRF_COOKIE, suffix),
  };
}

export type { SessionRecord };
