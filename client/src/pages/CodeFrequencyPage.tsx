import { useState, useCallback } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import CodeFrequencyChart from '../components/CodeFrequencyChart.js';
import DirectoryTreemap from '../components/DirectoryTreemap.js';
import TopFilesTable from '../components/TopFilesTable.js';
import ContributorsChart from '../components/ContributorsChart.js';

type Tab = 'timeseries' | 'treemap' | 'topfiles' | 'contributors';
type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all';

function getDateRange(range: TimeRange): { since?: string; until?: string } {
  if (range === 'all') return {};
  const until = new Date();
  const since = new Date();
  if (range === '1m') since.setMonth(since.getMonth() - 1);
  else if (range === '3m') since.setMonth(since.getMonth() - 3);
  else if (range === '6m') since.setMonth(since.getMonth() - 6);
  else if (range === '1y') since.setFullYear(since.getFullYear() - 1);
  return {
    since: since.toISOString(),
    until: until.toISOString(),
  };
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '1m': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '1y': 'Last year',
  all: 'All time',
};

export default function CodeFrequencyPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [tab, setTab] = useState<Tab>('timeseries');
  const [timeRange, setTimeRange] = useState<TimeRange>('3m');
  const [pathFilter, setPathFilter] = useState('');

  const { since, until } = getDateRange(timeRange);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['code-frequency', owner, repo, since, until, pathFilter],
    queryFn: () =>
      api.repos.codeFrequency(owner!, repo!, {
        since,
        until,
        path: pathFilter || undefined,
      }),
    enabled: !!owner && !!repo,
    staleTime: 5 * 60 * 1000,
  });

  const handlePathSelect = useCallback((path: string) => {
    setPathFilter(path);
  }, []);

  const breadcrumbParts = pathFilter
    ? pathFilter.replace(/\/$/, '').split('/')
    : [];

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'timeseries', label: 'Time Series' },
    { id: 'treemap', label: 'Directory Treemap' },
    { id: 'topfiles', label: 'Top Files' },
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
      {/* Toolbar */}
      <div
        style={{
          background: '#10141a',
          borderBottom: '1px solid #21262d',
          padding: '0.75rem 1.25rem',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.125rem' }}>📈</span>
            <span style={{ color: '#dfe2eb', fontWeight: 600, fontSize: '0.9375rem' }}>
              Code Frequency
            </span>
            <span style={{ color: '#30363d' }}>/</span>
            <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>
              {owner}/{repo}
            </span>
          </div>

          {/* Breadcrumb path filter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.8125rem',
              fontFamily: 'monospace',
              background: '#161b22',
              border: '1px solid #21262d',
              borderRadius: 6,
              padding: '0.25rem 0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => setPathFilter('')}
              style={{
                background: 'none',
                border: 'none',
                color: pathFilter === '' ? '#dfe2eb' : '#58a6ff',
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.8125rem',
                fontFamily: 'monospace',
              }}
            >
              root
            </button>
            {breadcrumbParts.map((part, i) => {
              const partPath =
                breadcrumbParts.slice(0, i + 1).join('/') +
                (i < breadcrumbParts.length - 1 ? '/' : '');
              const isLast = i === breadcrumbParts.length - 1;
              return (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ color: '#30363d' }}>/</span>
                  <button
                    onClick={() => setPathFilter(partPath + (isLast ? '' : '/'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isLast ? '#dfe2eb' : '#58a6ff',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '0.8125rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
            {pathFilter && (
              <button
                onClick={() => setPathFilter('')}
                title="Clear path filter"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  cursor: 'pointer',
                  padding: '0 0 0 4px',
                  fontSize: '0.75rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Spacer */}
          <div style={{ flexGrow: 1 }} />

          {/* Time range dropdown */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#dfe2eb',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((r) => (
              <option key={r} value={r}>
                {TIME_RANGE_LABELS[r]}
              </option>
            ))}
          </select>

          {/* Commits analyzed count */}
          {data && (
            <span
              style={{
                color: '#8b949e',
                fontSize: '0.8125rem',
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 12,
                padding: '0.2rem 0.6rem',
              }}
            >
              {data.totalCommitsAnalyzed.toLocaleString()} commits analyzed
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={tabStyle(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '0.75rem',
              color: '#8b949e',
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
            <span style={{ fontSize: '0.9375rem' }}>Analyzing commits...</span>
            <span style={{ fontSize: '0.8125rem', color: '#6e7681' }}>
              This may take a moment for large repos
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '0.75rem',
              color: '#f85149',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>⚠</span>
            <span>{(error as Error).message}</span>
            <button
              onClick={() => void refetch()}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#dfe2eb',
                padding: '0.4rem 0.875rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Retry
            </button>
          </div>
        ) : !data ? null : (
          <>
            {tab === 'timeseries' && (
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 8,
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    marginBottom: '0.75rem',
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.8125rem',
                    color: '#8b949e',
                  }}
                >
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        background: '#3fb950',
                        borderRadius: 2,
                        marginRight: 4,
                        verticalAlign: 'middle',
                      }}
                    />
                    Additions
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        background: '#f85149',
                        borderRadius: 2,
                        marginRight: 4,
                        verticalAlign: 'middle',
                      }}
                    />
                    Deletions
                  </span>
                </div>
                <CodeFrequencyChart data={data.timeSeries} />
              </div>
            )}

            {tab === 'treemap' && (
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 8,
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    marginBottom: '0.75rem',
                    fontSize: '0.8125rem',
                    color: '#8b949e',
                    display: 'flex',
                    gap: '1.5rem',
                  }}
                >
                  <span>Box size = total changes. Click a box to drill down.</span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        background: '#238636',
                        borderRadius: 2,
                        marginRight: 4,
                        verticalAlign: 'middle',
                      }}
                    />
                    Mostly additions
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        background: '#da3633',
                        borderRadius: 2,
                        marginRight: 4,
                        verticalAlign: 'middle',
                      }}
                    />
                    Mostly deletions
                  </span>
                </div>
                <DirectoryTreemap
                  data={data.directoryBreakdown}
                  onPathSelect={handlePathSelect}
                  currentPath={pathFilter}
                />
              </div>
            )}

            {tab === 'topfiles' && (
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <TopFilesTable
                  files={data.topFiles}
                  pathFilter={pathFilter}
                  onPathSelect={handlePathSelect}
                />
              </div>
            )}

            {tab === 'contributors' && (
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 8,
                  padding: '1rem',
                }}
              >
                <ContributorsChart contributors={data.contributors} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
