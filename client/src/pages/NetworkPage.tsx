import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useMultiBranchCommits, useCommitDetail } from '../hooks/useCommits.js';
import { api } from '../lib/api.js';
import NetworkGraphVisualization from '../components/NetworkGraphVisualization.js';
import CommitDetail from '../components/CommitDetail.js';
import BranchSelector from '../components/BranchSelector.js';

export default function NetworkPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

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

  // Auto-select ALL branches once overview loads
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

  // For the network graph, only fetch the default branch initially.
  // Virtual (deleted) branches are reconstructed from main's merge commit
  // topology — no need to fetch every branch separately.
  // Other live branches (like demo) are added if explicitly selected.
  const fetchBranches = effectiveBranches.includes(defaultBranch)
    ? [defaultBranch, ...effectiveBranches.filter(
        (b) => b !== defaultBranch
      ).slice(0, 4)] // default + up to 4 other live branches
    : effectiveBranches.slice(0, 5);

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
    fetchBranches,
    !!owner && !!repo && fetchBranches.length > 0
  );

  const { commit: commitDetail, isLoading: detailLoading } = useCommitDetail(
    owner!,
    repo!,
    selectedOid
  );

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

        {/* View label + commit count */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginLeft: '0.5rem',
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
          {commits.length > 0 && (
            <span style={{ color: '#8b949e', fontWeight: 400 }}>
              · {commits.length} commits
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
          {!overviewLoading && !commitsLoading && commits.length > 0 && (
            <NetworkGraphVisualization
              commits={commits}
              selectedOid={selectedOid}
              onSelectCommit={setSelectedOid}
              branchMap={branchMap}
              defaultBranch={defaultBranch}
              selectedBranches={effectiveBranches}
            />
          )}

          {/* Empty */}
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

          {/* Load more button */}
          {hasNextPage && commits.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {isFetchingNextPage ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: '2px solid #21262d',
                        borderTopColor: '#58a6ff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        display: 'inline-block',
                      }}
                    />
                    Loading more...
                  </>
                ) : (
                  'Load more commits'
                )}
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
                branches={selectedOid ? branchMap.get(selectedOid) : undefined}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
