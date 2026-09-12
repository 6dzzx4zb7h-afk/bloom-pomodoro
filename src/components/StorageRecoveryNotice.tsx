import { useSyncExternalStore } from 'react';
import {
  getStorageHealthSnapshot,
  subscribeStorageHealth,
} from '../store/storageHealth';

export function StorageRecoveryNotice({
  onRetry,
  onRecover,
}: {
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
        <button type="button" onClick={onRetry}>
          try storage again
        </button>
        <button type="button" onClick={onRecover}>
          keep this recovered copy
        </button>
      </div>
      <p className="storage-recovery-detail">
        {hasWriteFailure
          ? 'Try storage again to save the latest changes on this device.'
          : 'Keeping the recovered copy replaces the original with its readable parts on this device.'}
      </p>
    </section>
  );
}
