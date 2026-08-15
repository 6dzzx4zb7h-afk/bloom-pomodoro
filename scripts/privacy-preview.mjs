import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.BLOOM_PRIVACY_PREVIEW_PORT ?? 4174);

const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const WORKER_CSP = "default-src 'self'; connect-src 'self'; object-src 'none'";

const auditPlugin = {
  name: 'bloom-local-only-preview-audit',
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      const startedAt = Date.now();
      const pathname = new URL(request.url ?? '/', `http://${HOST}:${PORT}`).pathname;
      response.setHeader(
        'Content-Security-Policy',
        pathname === '/sw.js' ? WORKER_CSP : DOCUMENT_CSP,
      );
      response.on('finish', () => {
        console.log(
          `[privacy-preview] ${JSON.stringify({
            method: request.method,
            path: pathname,
            status: response.statusCode,
            ms: Date.now() - startedAt,
          })}`,
        );
      });
      next();
    });
  },
};

const server = await preview({
  root: ROOT,
  plugins: [auditPlugin],
  preview: {
    host: HOST,
    port: PORT,
    strictPort: true,
    open: false,
  },
});

console.log(`[privacy-preview] ready at http://${HOST}:${PORT}/`);

const close = async () => {
  await server.close();
  process.exit(0);
};

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
