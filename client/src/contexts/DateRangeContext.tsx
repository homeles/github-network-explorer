import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';

export type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all' | 'custom';

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '1m': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '1y': 'Last year',
  all: 'All time',
  custom: 'Custom',
};

/**
 * Convert a local YYYY-MM-DD date to an ISO timestamp at local midnight,
 * expressed with the correct UTC offset so the GitHub API filters correctly
 * for the viewer's timezone.
 */
function localDateToISO(dateStr: string, endOfDay = false): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const local = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59)
    : new Date(y, m - 1, d, 0, 0, 0);
  return local.toISOString();
}

/** Return the viewer's local date as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDateRange(range: TimeRange): { since?: string; until?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const untilDate = localToday();
  const since = new Date(now);
  if (range === '1m') since.setMonth(since.getMonth() - 1);
  else if (range === '3m') since.setMonth(since.getMonth() - 3);
  else if (range === '6m') since.setMonth(since.getMonth() - 6);
  else if (range === '1y') since.setFullYear(since.getFullYear() - 1);
  const sinceDate = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  return { since: localDateToISO(sinceDate), until: localDateToISO(untilDate, true) };
}

interface DateRangeContextValue {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  customSince: string;
  setCustomSince: (date: string) => void;
  customUntil: string;
  setCustomUntil: (date: string) => void;
  since: string | undefined;
  until: string | undefined;
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');
  const [customSince, setCustomSince] = useState<string>(() => getDateRange('1m').since!.slice(0, 10));
  const [customUntil, setCustomUntil] = useState<string>(() => getDateRange('1m').until!.slice(0, 10));

  // Sync date inputs when switching to a preset
  useEffect(() => {
    if (timeRange === 'custom' || timeRange === 'all') return;
    const { since, until } = getDateRange(timeRange);
    setCustomSince(since!.slice(0, 10));
    setCustomUntil(until!.slice(0, 10));
  }, [timeRange]);

  const { since, until } = useMemo(() => {
    if (timeRange === 'custom') {
      return {
        since: customSince ? localDateToISO(customSince) : undefined,
        until: customUntil ? localDateToISO(customUntil, true) : undefined,
      };
    }
    return getDateRange(timeRange);
  }, [timeRange, customSince, customUntil]);

  return (
    <DateRangeContext.Provider
      value={{ timeRange, setTimeRange, customSince, setCustomSince, customUntil, setCustomUntil, since, until }}
    >
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider');
  return ctx;
}
