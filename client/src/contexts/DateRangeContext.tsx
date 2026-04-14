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

export function getDateRange(range: TimeRange): { since?: string; until?: string } {
  if (range === 'all') return {};
  const now = new Date();
  // Truncate to date only (no time) so the key stays stable within the same day
  const untilDate = now.toISOString().slice(0, 10) + 'T23:59:59Z';
  const since = new Date(now);
  if (range === '1m') since.setMonth(since.getMonth() - 1);
  else if (range === '3m') since.setMonth(since.getMonth() - 3);
  else if (range === '6m') since.setMonth(since.getMonth() - 6);
  else if (range === '1y') since.setFullYear(since.getFullYear() - 1);
  const sinceDate = since.toISOString().slice(0, 10) + 'T00:00:00Z';
  return { since: sinceDate, until: untilDate };
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
        since: customSince ? customSince + 'T00:00:00Z' : undefined,
        until: customUntil ? customUntil + 'T23:59:59Z' : undefined,
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
