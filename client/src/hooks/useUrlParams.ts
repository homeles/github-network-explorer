import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useDateRange } from '../contexts/DateRangeContext.js';
import type { TimeRange } from '../contexts/DateRangeContext.js';

/**
 * Returns a stable `updateParams` function that merges specific search params
 * into the current URL without replacing unrelated params.
 * Pass `null` as a value to delete a param.
 */
export function useUpdateSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const update = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  return { searchParams, updateParams: update };
}

const VALID_RANGES: TimeRange[] = ['1w', '2w', '1m', '3m', '6m', '1y', 'all', 'custom'];

/**
 * Syncs the DateRangeContext with URL search params (`range`, `since`, `until`).
 * Call this in each page that renders a DateRangePicker.
 *
 * - On mount: reads URL params → sets context (if present).
 * - On context change: writes URL params (skips the echo-back after URL→context init).
 * - Default value (`1w`) is omitted from the URL to keep links clean.
 */
export function useDateRangeParams() {
  const {
    timeRange,
    setTimeRange,
    customSince,
    setCustomSince,
    customUntil,
    setCustomUntil,
  } = useDateRange();
  const { updateParams } = useUpdateSearchParams();

  // mountedRef: set to true after the init effect runs (both effects share this render cycle).
  const mountedRef = useRef(false);
  // skipUrlWriteRef: set when we triggered a context change from URL so we skip echoing it back.
  const skipUrlWriteRef = useRef(false);

  // Effect 1: URL → context (mount only)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const range = params.get('range') as TimeRange | null;
    if (range && VALID_RANGES.includes(range)) {
      skipUrlWriteRef.current = true;
      setTimeRange(range);
      if (range === 'custom') {
        const since = params.get('since');
        const until = params.get('until');
        if (since) setCustomSince(since);
        if (until) setCustomUntil(until);
      }
    }
    mountedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: context → URL (runs after every context change)
  useEffect(() => {
    if (!mountedRef.current) return;
    // Skip the write triggered by our own URL→context init to avoid an echo loop.
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false;
      return;
    }
    const updates: Record<string, string | null> = {};
    if (timeRange === '1w') {
      // Default — omit from URL to keep it clean
      updates.range = null;
      updates.since = null;
      updates.until = null;
    } else if (timeRange === 'custom') {
      updates.range = 'custom';
      updates.since = customSince || null;
      updates.until = customUntil || null;
    } else {
      updates.range = timeRange;
      updates.since = null;
      updates.until = null;
    }
    updateParams(updates);
  }, [timeRange, customSince, customUntil]); // eslint-disable-line react-hooks/exhaustive-deps
}
