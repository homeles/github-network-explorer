import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { api, type CodeFrequencyData, type CodeFrequencyStreamEvent } from '../lib/api.js';
import CodeFrequencyChart from '../components/CodeFrequencyChart.js';
import DirectoryTreemap from '../components/DirectoryTreemap.js';
import TopFilesTable from '../components/TopFilesTable.js';
import ContributorsChart from '../components/ContributorsChart.js';

type Tab = 'timeseries' | 'treemap' | 'topfiles' | 'contributors';
type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all';

function getDateRange(range: TimeRange): { since?: string; until?: string } {
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

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '1m': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '1y': 'Last year',
  all: 'All time',
};

interface StreamState {
  phase: 'idle' | 'listing' | 'analyzing' | 'complete' | 'stopped' | 'error';
  loaded: number;
  total: number | null;
  data: CodeFrequencyData | null;
  error: string | null;
}

export default function CodeFrequencyPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [tab, setTab] = useState<Tab>('timeseries');
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');
  const [pathFilter, setPathFilter] = useState('');
  const [loadKey, setLoadKey] = useState(0);

  const { since, until } = useMemo(() => getDateRange(timeRange), [timeRange]);

  const [streamState, setStreamState] = useState<StreamState>({
    phase: 'idle', loaded: 0, total: null, data: null, error: null,
  });
  const esRef = useRef<EventSource | null>(null);

  // Start/restart the SSE stream whenever query params or loadKey change
  useEffect(() => {
    if (!owner || !repo) return;

    esRef.current?.close();
    setStreamState({ phase: 'listing', loaded: 0, total: null, data: null, error: null });

    const es = api.repos.codeFrequencyStream(owner, repo, {
      since, until,
      path: pathFilter || undefined,
    });
    esRef.current = es;

    let completed = false;

    es.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as CodeFrequencyStreamEvent;
      if (msg.phase === 'complete') {
        completed = true;
        es.close();
        setStreamState({
          phase: 'complete',
          loaded: msg.data!.totalCommitsAnalyzed,
          total: msg.data!.totalCommitsAnalyzed,
          data: msg.data!,
          error: null,
        });
      } else if (msg.phase === 'error') {
        completed = true;
        es.close();
        setStreamState((prev) => ({ ...prev, phase: 'error', error: msg.error ?? 'Unknown error' }));
      } else if (msg.phase === 'listing') {
        setStreamState((prev) => ({ ...prev, phase: 'listing', loaded: msg.loaded ?? 0, total: null }));
      } else if (msg.phase === 'analyzing') {
        setStreamState((prev) => ({
          ...prev,
          phase: 'analyzing',
          loaded: msg.loaded ?? prev.loaded,
          total: msg.total ?? prev.total,
          data: msg.partialData ?? prev.data,
        }));
      }
    };

    es.onerror = () => {
      if (!completed) {
        es.close();
        setStreamState((prev) => ({ ...prev, phase: 'error', error: 'Connection lost' }));
      }
    };

    return () => { es.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, since, until, pathFilter, loadKey]);

  const stopLoading = useCallback(() => {
    esRef.current?.close();
    setStreamState((prev) => ({ ...prev, phase: 'stopped' }));
  }, []);

  const retry = useCallback(() => {
    setLoadKey((k) => k + 1);
  }, []);

  const { data, phase, loaded, total, error } = {
    data: streamState.data,
    phase: streamState.phase,
    loaded: streamState.loaded,
    total: streamState.total,
    error: streamState.error,
  };

  const isLoading = phase === 'listing' || phase === 'analyzing';

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

          {/* Stop / Load More controls */}
          {isLoading && (
            <button
              onClick={stopLoading}
              style={{
                background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
                color: '#f85149', padding: '0.25rem 0.625rem', fontSize: '0.8125rem', cursor: 'pointer',
              }}
            >
              Stop
            </button>
          )}

          {/* Commits analyzed count */}
          {(data || isLoading) && (
            <span
              style={{
                color: '#8b949e', fontSize: '0.8125rem', background: '#161b22',
                border: '1px solid #21262d', borderRadius: 12, padding: '0.2rem 0.6rem',
              }}
            >
              {isLoading
                ? `${loaded.toLocaleString()} commits${total ? ` / ${total.toLocaleString()}` : ' loaded'}`
                : `${data!.totalCommitsAnalyzed.toLocaleString()} commits analyzed`}
            </span>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      {(phase === 'listing' || phase === 'analyzing') && (
        <div
          style={{
            background: '#10141a',
            borderBottom: '1px solid #21262d',
            padding: '0.5rem 1.25rem',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: 14, height: 14, flexShrink: 0,
              border: '2px solid #21262d', borderTopColor: '#58a6ff',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }}
          />
          {phase === 'listing' ? (
            <span style={{ fontSize: '0.8125rem', color: '#8b949e' }}>
              Loading commits…&nbsp;
              <span style={{ color: '#dfe2eb', fontVariantNumeric: 'tabular-nums' }}>
                {loaded.toLocaleString()}
              </span>
              &nbsp;loaded
            </span>
          ) : (
            <>
              <span style={{ fontSize: '0.8125rem', color: '#8b949e', whiteSpace: 'nowrap' }}>
                Analyzing commits…&nbsp;
                <span style={{ color: '#dfe2eb', fontVariantNumeric: 'tabular-nums' }}>
                  {loaded.toLocaleString()}
                </span>
                {total != null && (
                  <>
                    &nbsp;/&nbsp;
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</span>
                  </>
                )}
              </span>
              {total != null && total > 0 && (
                <div
                  style={{
                    flex: 1, height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden', maxWidth: 300,
                  }}
                >
                  <div
                    style={{
                      height: '100%', background: '#58a6ff', borderRadius: 2,
                      width: `${Math.min(100, (loaded / total) * 100).toFixed(1)}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

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
        {phase === 'error' ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: '0.75rem', color: '#f85149',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>⚠</span>
            <span>{error}</span>
            <button
              onClick={retry}
              style={{
                background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
                color: '#dfe2eb', padding: '0.4rem 0.875rem', cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              Retry
            </button>
          </div>
        ) : isLoading && !data ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: '0.75rem', color: '#8b949e',
            }}
          >
            <div
              style={{
                width: 32, height: 32, border: '3px solid #21262d', borderTopColor: '#58a6ff',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.9375rem' }}>Loading commits…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
                  owner={owner!}
                  repo={repo!}
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
                  owner={owner!}
                  repo={repo!}
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
