import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useMultiBranchCommits, useCommitDetail } from '../hooks/useCommits.js';
import { api } from '../lib/api.js';
import type { CommitNode } from '../lib/api.js';
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

  // Phase 1: Fetch default branch (fast, 1 API call)
  const fetchBranches = [defaultBranch];

  const {
    commits: mainCommits,
    branchMap: mainBranchMap,
    isLoading: commitsLoading,
    error,
  } = useMultiBranchCommits(
    owner!,
    repo!,
    fetchBranches,
    !!owner && !!repo && fetchBranches.length > 0,
    true // autoFetchAll pages of default branch
  );

  // Phase 2: Progressively fetch other live branches one at a time
  const otherBranches = effectiveBranches.filter((b) => b !== defaultBranch);
  const [loadedBranchIdx, setLoadedBranchIdx] = useState(0);
  const [extraCommits, setExtraCommits] = useState<CommitNode[]>([]);
  const [extraBranchMap, setExtraBranchMap] = useState<Map<string, string[]>>(new Map());
  const [loadingExtra, setLoadingExtra] = useState(false);

  // Reset extra state when repo changes
  useEffect(() => {
    setLoadedBranchIdx(0);
    setExtraCommits([]);
    setExtraBranchMap(new Map());
  }, [owner, repo]);

  // Load other branches one by one in background
  useEffect(() => {
    if (commitsLoading || !owner || !repo) return;
    if (loadedBranchIdx >= otherBranches.length) {
      setLoadingExtra(false);
      return;
    }

    const branch = otherBranches[loadedBranchIdx]!;
    let cancelled = false;
    setLoadingExtra(true);

    api.repos.commits(owner, repo, branch).then((page) => {
      if (cancelled) return;
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
      setLoadedBranchIdx((i) => i + 1);
    }).catch(() => {
      if (!cancelled) setLoadedBranchIdx((i) => i + 1); // skip failed branch
    });

    return () => { cancelled = true; };
  }, [commitsLoading, owner, repo, loadedBranchIdx, otherBranches]);

  // Merge main + extra commits
  const { commits, branchMap } = useMemo(() => {
    const commitMap = new Map<string, CommitNode>();
    const bMap = new Map<string, string[]>();

    // Add main commits
    for (const c of mainCommits) {
      commitMap.set(c.oid, c);
    }
    for (const [oid, branches] of mainBranchMap) {
      bMap.set(oid, [...(bMap.get(oid) ?? []), ...branches]);
    }

    // Add extra branch commits
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

          {/* Fetching more branches indicator */}
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
              Loading branches ({loadedBranchIdx}/{otherBranches.length})...
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

          {/* No manual load more — auto-fetch handles all pagination */}
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
