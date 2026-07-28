import { useSyncExternalStore } from 'react';
import {
  getStorageHealthSnapshot,
  storageRecoveryJson,
  subscribeStorageHealth,
} from '../store/storageHealth';

function downloadRecovery(json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bloom-storage-recovery-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StorageRecoveryNotice({
  recoveredBloom,
  onRetry,
  onRecover,
}: {
  recoveredBloom: unknown;
  onRetry: () => void;
  onRecover: () => void;
}) {
  const health = useSyncExternalStore(
    subscribeStorageHealth,
    getStorageHealthSnapshot,
    getStorageHealthSnapshot,
  );
  if (health.failures.length === 0) return null;

  const hasWriteFailure = health.failures.some((failure) => failure.kind === 'write');
  const hasCompanionFailure = health.failures.some(
    (failure) => failure.area === 'companion-log',
  );

  return (
    <section
      className="storage-recovery-notice"
      role="alert"
      aria-live="assertive"
      aria-labelledby="storage-recovery-title"
    >
      <h2 id="storage-recovery-title">Your saved copy needs a little care</h2>
      <p>
        {hasWriteFailure
          ? 'Bloom could not save the latest change. Your last saved copy is still in place.'
          : `Bloom kept the readable parts and paused saving so the original ${
              hasCompanionFailure ? 'data' : 'copy'
            } stays available.`}
      </p>
      <div className="storage-recovery-actions">
        <button type="button" onClick={() => downloadRecovery(storageRecoveryJson(recoveredBloom))}>
          download recovery file
        </button>
        <button type="button" onClick={onRetry}>
          try storage again
        </button>
        <button type="button" onClick={onRecover}>
          keep this recovered copy
        </button>
      </div>
      <p className="storage-recovery-detail">
        Nothing is sent anywhere. The recovery file stays on this device unless you move it.
      </p>
    </section>
  );
}
