import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultiBranchCommits, useCommitDetail } from '../hooks/useCommits.js';
import { api, OWNER, REPO } from '../lib/github-api.js';
import type { CommitNode } from '../lib/github-api.js';
import NetworkGraphVisualization from '../components/NetworkGraphVisualization.js';
import CommitDetail from '../components/CommitDetail.js';
import BranchSelector from '../components/BranchSelector.js';

export default function NetworkPage() {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.repos.overview(),
  });

  const defaultBranch = overview?.defaultBranchRef?.name ?? 'main';
  const allBranchNames = overview?.branches.map((b) => b.name) ?? [];

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

  const fetchBranches = [defaultBranch];

  const {
    commits: mainCommits,
    branchMap: mainBranchMap,
    isLoading: commitsLoading,
    error,
  } = useMultiBranchCommits(
    fetchBranches,
    fetchBranches.length > 0,
    true
  );

  const otherBranches = effectiveBranches.filter((b) => b !== defaultBranch);
  const [loadedBranchIdx, setLoadedBranchIdx] = useState(0);
  const [extraCommits, setExtraCommits] = useState<CommitNode[]>([]);
  const [extraBranchMap, setExtraBranchMap] = useState<Map<string, string[]>>(new Map());
  const [loadingExtra, setLoadingExtra] = useState(false);
  const BRANCH_BATCH_SIZE = 10;

  function loadMoreBranches() {
    if (loadingExtra || loadedBranchIdx >= otherBranches.length) return;

    const endIdx = Math.min(loadedBranchIdx + BRANCH_BATCH_SIZE, otherBranches.length);
    const batchToLoad = otherBranches.slice(loadedBranchIdx, endIdx);
    setLoadingExtra(true);

    let currentIdx = 0;
    function fetchNext() {
      if (currentIdx >= batchToLoad.length) {
        setLoadedBranchIdx(endIdx);
        setLoadingExtra(false);
        return;
      }
      const branch = batchToLoad[currentIdx]!;
      currentIdx++;

      api.repos.commits(branch).then((page) => {
        setExtraCommits((prev) => {
          const existingOids = new Set(prev.map((c) => c.oid));
          const newCommits = page.nodes.filter((c) => !existingOids.has(c.oid));
          return [...prev, ...newCommits];
        });
        setExtraBranchMap((prev) => {
          const next = new Map(prev);
          for (const commit of page.nodes) {
            const existing = next.get(commit.oid) ?? [];
            if (!existing.includes(branch)) {
              next.set(commit.oid, [...existing, branch]);
            }
          }
          return next;
        });
        fetchNext();
      }).catch(() => {
        fetchNext();
      });
    }
    fetchNext();
  }

  const hasMoreBranches = loadedBranchIdx < otherBranches.length;

  const { commits, branchMap } = useMemo(() => {
    const commitMap = new Map<string, CommitNode>();
    const bMap = new Map<string, string[]>();

    for (const c of mainCommits) {
      commitMap.set(c.oid, c);
    }
    for (const [oid, branches] of mainBranchMap) {
      bMap.set(oid, [...(bMap.get(oid) ?? []), ...branches]);
    }

    for (const c of extraCommits) {
      if (!commitMap.has(c.oid)) commitMap.set(c.oid, c);
    }
    for (const [oid, branches] of extraBranchMap) {
      const existing = bMap.get(oid) ?? [];
      for (const b of branches) {
        if (!existing.includes(b)) existing.push(b);
      }
      bMap.set(oid, existing);
    }

    const allCommits = Array.from(commitMap.values()).sort(
      (a, b) => new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime()
    );
    return { commits: allCommits, branchMap: bMap };
  }, [mainCommits, mainBranchMap, extraCommits, extraBranchMap]);

  const { commit: commitDetail, isLoading: detailLoading } = useCommitDetail(
    selectedOid
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
          </div>
        )}
      </div>

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
                Loading network graph...
              </span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {!commitsLoading && loadingExtra && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 8,
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                color: '#8b949e',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid #21262d',
                  borderTopColor: '#58a6ff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Loading branches...
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
                Failed to load network graph: {(error as Error).message}
              </span>
            </div>
          )}

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

          {!commitsLoading && hasMoreBranches && !loadingExtra && commits.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              <button
                onClick={loadMoreBranches}
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 8,
                  color: '#58a6ff',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Load more branches ({otherBranches.length - loadedBranchIdx} remaining)
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
