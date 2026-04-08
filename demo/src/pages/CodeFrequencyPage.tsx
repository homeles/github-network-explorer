import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, OWNER, REPO } from '../lib/github-api.js';
import CodeFrequencyChart from '../components/CodeFrequencyChart.js';
import ContributorsChart from '../components/ContributorsChart.js';

type Tab = 'timeseries' | 'contributors';
type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all';

function getDateRange(range: TimeRange): { since?: string; until?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const untilDate = now.toISOString().slice(0, 10) + 'T23:59:59Z';
  const since = new Date(now);
  if (range === '1m') since.setMonth(since.getMonth() - 1);
  else if (range === '3m') since.setMonth(since.getMonth() - 3);
  else if (range === '6m') since.setMonth(since.getMonth() - 6);
  else if (range === '1y') since.setFullYear(since.getFullYear() - 1);
  const sinceDate = since.toISOString().slice(0, 10) + 'T00:00:00Z';
  return { since: sinceDate, until: untilDate };
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '1m': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '1y': 'Last year',
  all: 'All time',
};

export default function CodeFrequencyPage() {
  const [tab, setTab] = useState<Tab>('timeseries');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const { since, until } = useMemo(() => getDateRange(timeRange), [timeRange]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['code-frequency', since, until, timeRange],
    queryFn: () => api.repos.codeFrequency({ since, until }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    gcTime: 10 * 60 * 1000,
  });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'timeseries', label: 'Time Series' },
    { id: 'contributors', label: 'Contributors' },
  ];

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #21262d',
    background: '#0d1117',
    padding: '0 1.25rem',
  };

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      padding: '0.625rem 1rem',
      background: 'none',
      border: 'none',
      borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
      color: active ? '#dfe2eb' : '#8b949e',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: active ? 600 : 400,
      marginBottom: -1,
      transition: 'color 0.15s',
    };
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.625rem 1.25rem',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: '#10141a',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#dfe2eb', fontWeight: 600, fontSize: '0.9375rem' }}>
          {OWNER}/{REPO}
        </span>
        <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>· Code Frequency</span>

        <div style={{ flexGrow: 1 }} />

        {/* Time range selector */}
        <div style={{ display: 'flex', gap: 2, background: '#161b22', borderRadius: 8, padding: 2 }}>
          {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: '0.25rem 0.625rem',
                border: 'none',
                borderRadius: 6,
                background: timeRange === range ? '#30363d' : 'transparent',
                color: timeRange === range ? '#dfe2eb' : '#8b949e',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontWeight: timeRange === range ? 600 : 400,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {TIME_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={tabBarStyle}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabStyle(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
        {isLoading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 300,
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: '3px solid #21262d',
                borderTopColor: '#58a6ff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>
              Analyzing code frequency...
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && !isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 300,
              color: '#f85149',
              fontSize: '0.875rem',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>⚠</span>
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && data && (
          <>
            {/* Summary stats */}
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
              }}
            >
              {[
                { label: 'Commits analyzed', value: data.totalCommitsAnalyzed.toLocaleString() },
                { label: 'Period', value: data.period.since && data.period.until
                  ? `${data.period.since.slice(0, 10)} → ${data.period.until.slice(0, 10)}`
                  : 'N/A'
                },
                { label: 'Contributors', value: data.contributors.length.toLocaleString() },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    minWidth: 140,
                  }}
                >
                  <div style={{ color: '#8b949e', fontSize: '0.75rem', marginBottom: 4 }}>
                    {stat.label}
                  </div>
                  <div style={{ color: '#dfe2eb', fontSize: '1.125rem', fontWeight: 600 }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'timeseries' && <CodeFrequencyChart data={data.timeSeries} />}
            {tab === 'contributors' && <ContributorsChart contributors={data.contributors} />}
          </>
        )}
      </div>
    </div>
  );
}
