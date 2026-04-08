import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, OWNER, REPO } from '../lib/github-api.js';
import type { BranchInfo } from '../lib/github-api.js';

type SortField = 'name' | 'date' | 'ahead' | 'behind';
type SortDir = 'asc' | 'desc';

export default function BranchesPage() {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');

  const { data: branches, isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.repos.branches(),
    staleTime: 2 * 60 * 1000,
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  }

  const sortedBranches = useMemo(() => {
    if (!branches) return [];
    let filtered = branches.filter((b) =>
      b.name.toLowerCase().includes(search.toLowerCase())
    );

    filtered.sort((a, b) => {
      // Default always first
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;

      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'date':
          cmp =
            new Date(a.lastCommitDate).getTime() -
            new Date(b.lastCommitDate).getTime();
          break;
        case 'ahead':
          cmp = a.aheadBy - b.aheadBy;
          break;
        case 'behind':
          cmp = a.behindBy - b.behindBy;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [branches, sortField, sortDir, search]);

  function formatRelativeDate(dateStr: string): string {
    if (!dateStr) return '';
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return '⇅';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  const headerStyle = (field: SortField): React.CSSProperties => ({
    padding: '0.625rem 0.75rem',
    textAlign: 'left' as const,
    color: sortField === field ? '#dfe2eb' : '#8b949e',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #21262d',
  });

  if (isLoading) {
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
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f85149',
        }}
      >
        Failed to load branches: {(error as Error).message}
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
          {OWNER}/{REPO}
        </span>

        <span
          style={{
            color: '#8b949e',
            fontSize: '0.875rem',
          }}
        >
          · {branches?.length ?? 0} branches
        </span>

        <div style={{ flexGrow: 1 }} />

        <input
          placeholder="Filter branches..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#dfe2eb',
            padding: '0.375rem 0.75rem',
            fontSize: '0.875rem',
            outline: 'none',
            width: 220,
          }}
        />
      </div>

      {/* Branches table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: '#161b22', zIndex: 1 }}>
              <th style={headerStyle('name')} onClick={() => toggleSort('name')}>
                Branch {sortIcon('name')}
              </th>
              <th style={headerStyle('date')} onClick={() => toggleSort('date')}>
                Last commit {sortIcon('date')}
              </th>
              <th style={{ ...headerStyle('ahead'), textAlign: 'center' }} onClick={() => toggleSort('ahead')}>
                Ahead {sortIcon('ahead')}
              </th>
              <th style={{ ...headerStyle('behind'), textAlign: 'center' }} onClick={() => toggleSort('behind')}>
                Behind {sortIcon('behind')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedBranches.map((branch: BranchInfo) => (
              <tr
                key={branch.name}
                style={{
                  borderBottom: '1px solid #21262d',
                  transition: 'background 0.1s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#161b22';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <td style={{ padding: '0.75rem', color: '#dfe2eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        fontWeight: branch.isDefault ? 600 : 400,
                        fontSize: '0.875rem',
                      }}
                    >
                      {branch.name}
                    </span>
                    {branch.isDefault && (
                      <span
                        style={{
                          background: 'rgba(63,185,80,0.15)',
                          color: '#3fb950',
                          border: '1px solid rgba(63,185,80,0.3)',
                          borderRadius: 12,
                          padding: '0.05rem 0.5rem',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                        }}
                      >
                        default
                      </span>
                    )}
                    {branch.isProtected && (
                      <span
                        style={{
                          color: '#d29922',
                          fontSize: '0.75rem',
                        }}
                        title="Protected branch"
                      >
                        🔒
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <div>
                    <div
                      style={{
                        color: '#c9d1d9',
                        fontSize: '0.8125rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 400,
                      }}
                    >
                      {branch.lastCommitMessage.split('\n')[0]}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginTop: 2,
                        fontSize: '0.75rem',
                        color: '#8b949e',
                      }}
                    >
                      {branch.lastCommitAuthor.avatarUrl && (
                        <img
                          src={branch.lastCommitAuthor.avatarUrl}
                          alt=""
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                          }}
                        />
                      )}
                      <span>
                        {branch.lastCommitAuthor.login ??
                          branch.lastCommitAuthor.name ??
                          'Unknown'}
                      </span>
                      <span>·</span>
                      <span title={branch.lastCommitDate}>
                        {formatRelativeDate(branch.lastCommitDate)}
                      </span>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  {!branch.isDefault && branch.aheadBy > 0 ? (
                    <span
                      style={{
                        color: '#3fb950',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                      }}
                    >
                      +{branch.aheadBy}
                    </span>
                  ) : (
                    <span style={{ color: '#484f58', fontSize: '0.8125rem' }}>
                      {branch.isDefault ? '—' : '0'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  {!branch.isDefault && branch.behindBy > 0 ? (
                    <span
                      style={{
                        color: '#f85149',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                      }}
                    >
                      −{branch.behindBy}
                    </span>
                  ) : (
                    <span style={{ color: '#484f58', fontSize: '0.8125rem' }}>
                      {branch.isDefault ? '—' : '0'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
