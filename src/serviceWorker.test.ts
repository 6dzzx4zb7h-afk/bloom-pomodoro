// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBloomServiceWorker } from './serviceWorker';

type ServiceWorkerMock = {
  controller: ServiceWorker | null;
  register: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

function installServiceWorkerMock(controlled: boolean) {
  const listeners = new Map<string, EventListener>();
  const update = vi.fn(async () => undefined);
  const serviceWorker: ServiceWorkerMock = {
    controller: controlled ? ({} as ServiceWorker) : null,
    register: vi.fn(async () => ({ update })),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });

  return { listeners, serviceWorker, update };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
});

describe('production service-worker registration', () => {
  it('registers the root worker without HTTP-cache reuse and checks for an update', async () => {
    vi.stubEnv('PROD', true);
    const { serviceWorker, update } = installServiceWorkerMock(false);

    registerBloomServiceWorker();
    window.dispatchEvent(new Event('load'));

    await vi.waitFor(() => {
      expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      expect(update).toHaveBeenCalledOnce();
    });
  });

  it('reloads a previously controlled page once when the build controller changes', async () => {
    vi.stubEnv('PROD', true);
    const { listeners, serviceWorker } = installServiceWorkerMock(true);
    const reload = vi.fn();

    registerBloomServiceWorker(reload);
    const controllerChange = listeners.get('controllerchange');
    expect(controllerChange).toBeDefined();

    controllerChange?.(new Event('controllerchange'));
    controllerChange?.(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledOnce());
  });
});
