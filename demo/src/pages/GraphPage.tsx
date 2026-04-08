import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultiBranchCommits, useCommitDetail } from '../hooks/useCommits.js';
import { api, OWNER, REPO } from '../lib/github-api.js';
import GraphVisualization from '../components/GraphVisualization.js';
import CommitDetail from '../components/CommitDetail.js';
import BranchSelector from '../components/BranchSelector.js';

export default function GraphPage() {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.repos.overview(),
  });

  const defaultBranch = overview?.defaultBranchRef?.name ?? 'main';

  useEffect(() => {
    if (overview && selectedBranches.length === 0) {
      setSelectedBranches([defaultBranch]);
    }
  }, [overview, defaultBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveBranches =
    selectedBranches.length > 0
      ? selectedBranches
      : overview
      ? [defaultBranch]
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
    effectiveBranches,
    effectiveBranches.length > 0
  );

  const { commit: commitDetail, isLoading: detailLoading } = useCommitDetail(
    selectedOid
  );

  const allBranchNames = overview?.branches.map((b) => b.name) ?? [];

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
        <span style={{ color: '#dfe2eb', fontWeight: 600, fontSize: '0.9375rem' }}>
          {OWNER}/{REPO}
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
          </div>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
                Loading commits...
              </span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

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
                Failed to load commits: {(error as Error).message}
              </span>
            </div>
          )}

          {!overviewLoading && !commitsLoading && commits.length > 0 && (
            <GraphVisualization
              commits={commits}
              selectedOid={selectedOid}
              onSelectCommit={setSelectedOid}
              branchMap={branchMap}
              defaultBranch={defaultBranch}
            />
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

          {hasNextPage && commits.length > 0 && (
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
                owner={OWNER}
                repo={REPO}
                branches={branchMap.get(selectedOid)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
