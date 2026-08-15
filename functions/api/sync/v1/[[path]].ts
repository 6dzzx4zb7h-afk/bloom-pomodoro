import { DurableObjectContentStore } from '../../../../services/sync/cloudflare/durableContentStore';
import { D1ControlPlane } from '../../../../services/sync/cloudflare/d1ControlPlane';
import { D1RateLimiter } from '../../../../services/sync/cloudflare/d1RateLimit';
import type {
  D1Database,
  DurableObjectNamespace,
  PagesFunctionContext,
} from '../../../../services/sync/cloudflare/types';
import { SyncGateway } from '../../../../services/sync/gateway';
import { appleOidcProvider, googleOidcProvider } from '../../../../services/sync/oidc';

interface Environment {
  SYNC_CONTROL: D1Database;
  SYNC_CONTENT: DurableObjectNamespace;
  BLOOM_SYNC_ORIGIN: string;
  BLOOM_COOKIE_SUFFIX: string;
  IDENTITY_PEPPER: string;
  SESSION_PEPPER: string;
  CONTENT_INTERNAL_SECRET: string;
  GOOGLE_OIDC_CLIENT_ID: string;
  GOOGLE_OIDC_CLIENT_SECRET: string;
  APPLE_OIDC_CLIENT_ID: string;
  APPLE_OIDC_CLIENT_SECRET: string;
}

export function onRequest(context: PagesFunctionContext<Environment>): Promise<Response> {
  const control = new D1ControlPlane(
    context.env.SYNC_CONTROL,
    context.env.IDENTITY_PEPPER,
    context.env.SESSION_PEPPER,
  );
  const content = new DurableObjectContentStore(
    context.env.SYNC_CONTENT,
    context.env.CONTENT_INTERNAL_SECRET,
  );
  const gateway = new SyncGateway({
    origin: context.env.BLOOM_SYNC_ORIGIN,
    cookieSuffix: context.env.BLOOM_COOKIE_SUFFIX,
    control,
    content,
    limiter: new D1RateLimiter(context.env.SYNC_CONTROL),
    providers: {
      google: googleOidcProvider({
        clientId: context.env.GOOGLE_OIDC_CLIENT_ID,
        clientSecret: context.env.GOOGLE_OIDC_CLIENT_SECRET,
      }),
      apple: appleOidcProvider({
        clientId: context.env.APPLE_OIDC_CLIENT_ID,
        signedClientSecret: context.env.APPLE_OIDC_CLIENT_SECRET,
      }),
    },
  });
  return gateway.fetch(context.request);
}
