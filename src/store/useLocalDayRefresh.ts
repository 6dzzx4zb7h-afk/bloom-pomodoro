import { useEffect, useState } from 'react';
import { nextDayBoundaryAt } from './dayKey';

/**
 * One app-level clock signal for calendar-derived UI (PLAN 8.3).
 *
 * It wakes exactly at the next local study-day boundary and also catches up
 * when the document becomes visible or the window regains focus. App owns the
 * single instance and passes its timestamp to date-sensitive screens, so an
 * app left open does not need a remount to update labels or weekly/streak UI.
 */
export function useLocalDayRefresh(dayStartHour = 0): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let boundaryTimer: number | null = null;

    const scheduleBoundary = () => {
      if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
      const current = Date.now();
      const delay = Math.max(1, nextDayBoundaryAt(current, dayStartHour) - current + 1);
      boundaryTimer = window.setTimeout(refresh, delay);
    };

    const refresh = () => {
      setNow(Date.now());
      scheduleBoundary();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    scheduleBoundary();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refresh);
    return () => {
      if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refresh);
    };
  }, [dayStartHour]);

  return now;
}
