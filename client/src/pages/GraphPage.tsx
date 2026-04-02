import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useCommits, useCommitDetail } from '../hooks/useCommits.js';
import { api } from '../lib/api.js';
import GraphVisualization from '../components/GraphVisualization.js';
import CommitDetail from '../components/CommitDetail.js';

export default function GraphPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview', owner, repo],
    queryFn: () => api.repos.overview(owner!, repo!),
    enabled: !!owner && !!repo,
  });

  const effectiveBranch =
    selectedBranch ||
    overview?.defaultBranchRef?.name ||
    'main';

  const {
    commits,
    isLoading: commitsLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommits(owner!, repo!, effectiveBranch, !!owner && !!repo && !!effectiveBranch);

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
        {/* Repo name */}
        <span
          style={{
            color: '#dfe2eb',
            fontWeight: 600,
            fontSize: '0.9375rem',
          }}
        >
          {owner}/{repo}
        </span>

        {/* Branch selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>Branch:</span>
          <select
            value={effectiveBranch}
            onChange={(e) => {
              setSelectedBranch(e.target.value);
              setSelectedOid(null);
            }}
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#dfe2eb',
              padding: '0.25rem 0.5rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
            disabled={overviewLoading}
          >
            {overview?.branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            )) ?? <option value={effectiveBranch}>{effectiveBranch}</option>}
          </select>
        </div>

        {/* Stats */}
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
          {/* Loading overlay */}
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

          {/* Error state */}
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

          {/* Graph visualization */}
          {!overviewLoading && !commitsLoading && commits.length > 0 && (
            <GraphVisualization
              commits={commits}
              selectedOid={selectedOid}
              onSelectCommit={setSelectedOid}
            />
          )}

          {/* Empty state */}
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
              No commits found for branch &quot;{effectiveBranch}&quot;
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
                {isFetchingNextPage ? 'Loading more...' : `Load more commits`}
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
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
