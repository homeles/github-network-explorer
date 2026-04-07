import { useState } from 'react';

interface TopFile {
  path: string;
  additions: number;
  deletions: number;
  changes: number;
  commitCount: number;
}

interface Props {
  files: TopFile[];
  pathFilter: string;
  onPathSelect: (path: string) => void;
  owner: string;
  repo: string;
}

type SortKey = 'changes' | 'additions' | 'deletions' | 'commitCount';

export default function TopFilesTable({ files, pathFilter, onPathSelect, owner, repo }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('changes');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = pathFilter
    ? files.filter((f) => f.path.startsWith(pathFilter))
    : files;

  const sorted = [...filtered].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortIndicator({ col }: { col: SortKey }) {
    if (col !== sortKey) return <span style={{ color: '#30363d' }}> ↕</span>;
    return <span style={{ color: '#58a6ff' }}> {sortAsc ? '↑' : '↓'}</span>;
  }

  const thStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    textAlign: 'left',
    fontSize: '0.8125rem',
    color: '#8b949e',
    fontWeight: 500,
    borderBottom: '1px solid #21262d',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.4rem 0.75rem',
    fontSize: '0.8125rem',
    color: '#dfe2eb',
    borderBottom: '1px solid #161b22',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      {sorted.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
          No files found{pathFilter ? ` under ${pathFilter}` : ''}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#161b22' }}>
              <th style={{ ...thStyle, width: '50%' }}>File Path</th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('additions')}>
                Additions <SortIndicator col="additions" />
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('deletions')}>
                Deletions <SortIndicator col="deletions" />
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('changes')}>
                Net Change <SortIndicator col="changes" />
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('commitCount')}>
                Commits <SortIndicator col="commitCount" />
              </th>
              <th style={{ ...thStyle, width: 120 }}>Ratio</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => {
              const displayPath = pathFilter ? f.path.slice(pathFilter.length) : f.path;
              const total = f.additions + f.deletions;
              const addPct = total > 0 ? (f.additions / total) * 100 : 50;
              const net = f.additions - f.deletions;
              const parentDir = f.path.includes('/')
                ? f.path.substring(0, f.path.lastIndexOf('/') + 1)
                : '';

              return (
                <tr
                  key={f.path}
                  style={{ transition: 'background 0.1s' }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = '#161b22';
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                  }}
                >
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <button
                        onClick={() => onPathSelect(parentDir)}
                        title={`Filter to ${parentDir || 'root'}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#58a6ff',
                          cursor: 'pointer',
                          padding: 0,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          textAlign: 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {displayPath || f.path}
                      </button>
                      <a
                        href={`https://github.com/${owner}/${repo}/blob/HEAD/${f.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on GitHub"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: '#8b949e',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                          textDecoration: 'none',
                          lineHeight: 1,
                        }}
                        onMouseOver={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.color = '#58a6ff';
                        }}
                        onMouseOut={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.color = '#8b949e';
                        }}
                      >
                        ↗
                      </a>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#3fb950', fontVariantNumeric: 'tabular-nums' }}>
                    +{f.additions.toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#f85149', fontVariantNumeric: 'tabular-nums' }}>
                    -{f.deletions.toLocaleString()}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      color: net >= 0 ? '#3fb950' : '#f85149',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {net >= 0 ? '+' : ''}
                    {net.toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#8b949e', fontVariantNumeric: 'tabular-nums' }}>
                    {f.commitCount.toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle }}>
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#21262d' }}>
                      <div style={{ width: `${addPct}%`, background: '#3fb950', borderRadius: '4px 0 0 4px' }} />
                      <div style={{ width: `${100 - addPct}%`, background: '#f85149', borderRadius: '0 4px 4px 0' }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
