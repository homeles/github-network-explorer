import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useMultiBranchCommits, useCommitDetail } from '../hooks/useCommits.js';
import { api } from '../lib/api.js';
import NetworkGraphVisualization from '../components/NetworkGraphVisualization.js';
import CommitDetail from '../components/CommitDetail.js';
import BranchSelector from '../components/BranchSelector.js';

type TimeRange = '1w' | '2w' | '1m' | '6m' | '1y' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1w', label: 'Last week' },
  { value: '2w', label: 'Last 2 weeks' },
  { value: '1m', label: 'Last month' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

function getTimeRangeCutoff(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  switch (range) {
    case '1w': now.setDate(now.getDate() - 7); break;
    case '2w': now.setDate(now.getDate() - 14); break;
    case '1m': now.setMonth(now.getMonth() - 1); break;
    case '6m': now.setMonth(now.getMonth() - 6); break;
    case '1y': now.setFullYear(now.getFullYear() - 1); break;
  }
  return now;
}

export default function NetworkPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1w');
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview', owner, repo],
    queryFn: () => api.repos.overview(owner!, repo!),
    enabled: !!owner && !!repo,
  });

  const defaultBranch = overview?.defaultBranchRef?.name ?? 'main';
  const allBranchNames = overview?.branches.map((b) => b.name) ?? [];

  useEffect(() => {
    setSelectedBranches([]);
    setSelectedOid(null);
  }, [owner, repo]);

  useEffect(() => {
    if (overview && selectedBranches.length === 0 && allBranchNames.length > 0) {
      setSelectedBranches([...allBranchNames]);
    }
  }, [overview]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveBranches =
    selectedBranches.length > 0
      ? selectedBranches
      : allBranchNames.length > 0
      ? allBranchNames
      : [];

  const {
    commits,
    branchMap,
    isLoading: commitsLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMultiBranchCommits(
    owner!,
    repo!,
    effectiveBranches,
    !!owner && !!repo && effectiveBranches.length > 0
  );

  // Filter commits by time range
  const { filteredCommits, filteredBranchMap } = useMemo(() => {
    const cutoff = getTimeRangeCutoff(timeRange);
    if (!cutoff) return { filteredCommits: commits, filteredBranchMap: branchMap };

    const cutoffTime = cutoff.getTime();
    const filtered = commits.filter(
      (c) => new Date(c.committedDate).getTime() >= cutoffTime
    );
    const filteredOids = new Set(filtered.map((c) => c.oid));

    // Rebuild branchMap with only filtered commits
    const newMap = new Map<string, string[]>();
    for (const [oid, branches] of branchMap) {
      if (filteredOids.has(oid)) {
        newMap.set(oid, branches);
      }
    }

    return { filteredCommits: filtered, filteredBranchMap: newMap };
  }, [commits, branchMap, timeRange]);

  const { commit: commitDetail, isLoading: detailLoading } = useCommitDetail(
    owner!,
    repo!,
    selectedOid
  );

  const currentLabel = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? 'Last week';

  if (!owner || !repo) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8b949e',
        }}
      >
        Repository not specified
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div
        style={{
          padding: '0.625rem 1rem',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: '#10141a',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: '#dfe2eb',
            fontWeight: 600,
            fontSize: '0.9375rem',
          }}
        >
          {owner}/{repo}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>Branches:</span>
          <BranchSelector
            branches={allBranchNames}
            selected={effectiveBranches}
            onChange={(next) => {
              setSelectedBranches(next);
              setSelectedOid(null);
            }}
            disabled={overviewLoading}
          />
        </div>

        {/* Time range selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowTimeDropdown((v) => !v)}
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#dfe2eb',
              padding: '0.25rem 0.625rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              minWidth: 130,
            }}
          >
            <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>🕐</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{currentLabel}</span>
            <span style={{ color: '#8b949e', fontSize: '0.6875rem' }}>
              {showTimeDropdown ? '▲' : '▼'}
            </span>
          </button>

          {showTimeDropdown && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 49,
                }}
                onClick={() => setShowTimeDropdown(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 50,
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  minWidth: 160,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                }}
              >
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setTimeRange(opt.value);
                      setShowTimeDropdown(false);
                      setSelectedOid(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: opt.value === timeRange ? '#1f2937' : 'transparent',
                      border: 'none',
                      color: opt.value === timeRange ? '#58a6ff' : '#dfe2eb',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#1f2937';
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        opt.value === timeRange ? '#1f2937' : 'transparent';
                    }}
                  >
                    {opt.value === timeRange && (
                      <span style={{ color: '#58a6ff', fontSize: '0.75rem' }}>✓</span>
                    )}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View label + commit count */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            background: 'rgba(88,166,255,0.1)',
            border: '1px solid rgba(88,166,255,0.2)',
            borderRadius: 12,
            padding: '0.15rem 0.625rem',
            fontSize: '0.75rem',
            color: '#58a6ff',
            fontWeight: 500,
          }}
        >
          🔀 Network View
          {filteredCommits.length > 0 && (
            <span style={{ color: '#8b949e', fontWeight: 400 }}>
              · {filteredCommits.length} commits
            </span>
          )}
        </div>

        {overview && (
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginLeft: 'auto',
              color: '#8b949e',
              fontSize: '0.8125rem',
            }}
          >
            <span title="Stars">⭐ {overview.stargazerCount.toLocaleString()}</span>
            <span title="Forks">🍴 {overview.forkCount.toLocaleString()}</span>
            <span title="Watchers">👁 {overview.watcherCount.toLocaleString()}</span>
            {overview.isPrivate && (
              <span
                style={{
                  background: 'rgba(188,140,255,0.15)',
                  color: '#bc8cff',
                  border: '1px solid rgba(188,140,255,0.3)',
                  borderRadius: 12,
                  padding: '0.1rem 0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                Private
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Graph area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Loading */}
          {(overviewLoading || commitsLoading) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(13,17,23,0.8)',
                zIndex: 10,
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
                Loading network graph...
              </span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error */}
          {error && !commitsLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '0.75rem',
                color: '#f85149',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>⚠</span>
              <span style={{ fontSize: '0.875rem' }}>
                Failed to load network graph: {(error as Error).message}
              </span>
            </div>
          )}

          {/* Network graph */}
          {!overviewLoading && !commitsLoading && filteredCommits.length > 0 && (
            <NetworkGraphVisualization
              commits={filteredCommits}
              selectedOid={selectedOid}
              onSelectCommit={setSelectedOid}
              branchMap={filteredBranchMap}
              defaultBranch={defaultBranch}
              selectedBranches={effectiveBranches}
            />
          )}

          {/* Empty */}
          {!commitsLoading && !error && filteredCommits.length === 0 && commits.length > 0 && (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '0.75rem',
                color: '#8b949e',
                fontSize: '0.875rem',
              }}
            >
              <span>No commits in the selected time range</span>
              <button
                onClick={() => setTimeRange('all')}
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#58a6ff',
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                Show all time
              </button>
            </div>
          )}

          {!commitsLoading && !error && commits.length === 0 && (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8b949e',
                fontSize: '0.875rem',
              }}
            >
              No commits found for the selected branch(es)
            </div>
          )}

          {/* Load more */}
          {hasNextPage && filteredCommits.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              <button
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 8,
                  color: '#58a6ff',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  cursor: isFetchingNextPage ? 'not-allowed' : 'pointer',
                  opacity: isFetchingNextPage ? 0.6 : 1,
                }}
              >
                {isFetchingNextPage ? 'Loading more...' : 'Load more commits'}
              </button>
            </div>
          )}
        </div>

        {/* Commit detail sidebar */}
        {selectedOid && (
          <div style={{ height: '100%', display: 'flex' }}>
            {detailLoading ? (
              <div
                style={{
                  width: 340,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#161b22',
                  borderLeft: '1px solid #21262d',
                  color: '#8b949e',
                  fontSize: '0.875rem',
                }}
              >
                Loading...
              </div>
            ) : commitDetail ? (
              <CommitDetail
                commit={commitDetail}
                onClose={() => setSelectedOid(null)}
                owner={owner}
                repo={repo}
                branches={selectedOid ? filteredBranchMap.get(selectedOid) : undefined}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
