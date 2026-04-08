import type { CommitDetail as CommitDetailType } from '../lib/github-api.js';

interface Props {
  commit: CommitDetailType;
  onClose: () => void;
  owner: string;
  repo: string;
  branches?: string[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CIStatusBadge({ state }: { state: string }) {
  const configs: Record<string, { color: string; label: string }> = {
    SUCCESS: { color: '#3fb950', label: 'Passed' },
    FAILURE: { color: '#f85149', label: 'Failed' },
    ERROR: { color: '#f85149', label: 'Error' },
    PENDING: { color: '#d29922', label: 'Pending' },
    EXPECTED: { color: '#8b949e', label: 'Expected' },
  };
  const cfg = configs[state.toUpperCase()] ?? { color: '#8b949e', label: state };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        background: `${cfg.color}22`,
        color: cfg.color,
        border: `1px solid ${cfg.color}44`,
        borderRadius: 12,
        padding: '0.15rem 0.6rem',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.color,
          display: 'inline-block',
        }}
      />
      {cfg.label}
    </span>
  );
}

function PRStateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    OPEN: '#3fb950',
    CLOSED: '#f85149',
    MERGED: '#bc8cff',
  };
  const color = colors[state.toUpperCase()] ?? '#8b949e';
  return (
    <span
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 12,
        padding: '0.1rem 0.5rem',
        fontSize: '0.7rem',
        fontWeight: 600,
      }}
    >
      {state}
    </span>
  );
}

export default function CommitDetail({ commit, onClose, owner, repo, branches }: Props) {
  const firstLine = commit.message.split('\n')[0] ?? '';
  const bodyLines = commit.message.split('\n').slice(2).join('\n').trim();

  return (
    <aside
      style={{
        width: 340,
        flexShrink: 0,
        background: '#161b22',
        borderLeft: '1px solid #21262d',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.875rem 1rem',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontFamily: 'monospace',
                color: '#58a6ff',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {commit.abbreviatedOid}
            </span>
            <a
              href={`https://github.com/${owner}/${repo}/commit/${commit.oid}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on GitHub"
              style={{
                color: '#8b949e',
                fontSize: '0.75rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.1rem 0.4rem',
                borderRadius: 4,
                border: '1px solid #30363d',
                background: '#0d1117',
              }}
            >
              ↗ GitHub
            </a>
          </div>
          {commit.statusCheckRollup && (
            <div style={{ marginTop: 4 }}>
              <CIStatusBadge state={commit.statusCheckRollup.state} />
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '1.25rem',
            lineHeight: 1,
            padding: '0.25rem',
            borderRadius: 4,
          }}
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '1rem' }}>
        {/* Commit message */}
        <section style={{ marginBottom: '1.25rem' }}>
          <h3
            style={{
              color: '#dfe2eb',
              fontSize: '0.9375rem',
              fontWeight: 600,
              margin: '0 0 0.375rem',
              lineHeight: 1.4,
            }}
          >
            {firstLine}
          </h3>
          {bodyLines && (
            <pre
              style={{
                color: '#8b949e',
                fontSize: '0.8125rem',
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            >
              {bodyLines}
            </pre>
          )}
        </section>

        {/* Author */}
        <section
          style={{
            marginBottom: '1.25rem',
            padding: '0.75rem',
            background: '#0d1117',
            borderRadius: 8,
            border: '1px solid #21262d',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.5rem',
            }}
          >
            {commit.author?.avatarUrl && (
              <img
                src={commit.author.avatarUrl}
                alt={commit.author.user?.login ?? commit.author.name ?? '?'}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid #30363d',
                }}
              />
            )}
            <div>
              <div style={{ color: '#dfe2eb', fontSize: '0.875rem', fontWeight: 600 }}>
                {commit.author?.user?.login ?? commit.author?.name ?? 'Unknown'}
              </div>
              {commit.author?.email && (
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>
                  {commit.author.email}
                </div>
              )}
            </div>
          </div>
          <div style={{ color: '#8b949e', fontSize: '0.8125rem' }}>
            {formatDate(commit.committedDate)}
          </div>
        </section>

        {/* Branches */}
        {branches && branches.length > 0 && (
          <section style={{ marginBottom: '1.25rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Branches
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {branches.map((b) => (
                <span
                  key={b}
                  style={{
                    background: 'rgba(88,166,255,0.15)',
                    color: '#58a6ff',
                    border: '1px solid rgba(88,166,255,0.3)',
                    borderRadius: 12,
                    padding: '0.15rem 0.6rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    fontWeight: 500,
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Stats */}
        <section style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#8b949e',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}
          >
            Changes
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {commit.changedFilesIfAvailable !== null &&
              commit.changedFilesIfAvailable !== undefined && (
                <span
                  style={{
                    background: '#21262d',
                    color: '#c0c7d4',
                    borderRadius: 6,
                    padding: '0.25rem 0.625rem',
                    fontSize: '0.8125rem',
                  }}
                >
                  {commit.changedFilesIfAvailable} file
                  {commit.changedFilesIfAvailable !== 1 ? 's' : ''} changed
                </span>
              )}
            <span
              style={{
                background: 'rgba(63,185,80,0.15)',
                color: '#3fb950',
                borderRadius: 6,
                padding: '0.25rem 0.625rem',
                fontSize: '0.8125rem',
                fontFamily: 'monospace',
              }}
            >
              +{commit.additions}
            </span>
            <span
              style={{
                background: 'rgba(248,81,73,0.15)',
                color: '#f85149',
                borderRadius: 6,
                padding: '0.25rem 0.625rem',
                fontSize: '0.8125rem',
                fontFamily: 'monospace',
              }}
            >
              -{commit.deletions}
            </span>
          </div>
        </section>

        {/* Parents */}
        {commit.parents.nodes.length > 0 && (
          <section style={{ marginBottom: '1.25rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Parents ({commit.parents.nodes.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {commit.parents.nodes.map((p) => (
                <code
                  key={p.oid}
                  style={{
                    color: '#58a6ff',
                    background: '#0d1117',
                    borderRadius: 4,
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.8125rem',
                    fontFamily: 'monospace',
                  }}
                >
                  {p.oid.slice(0, 7)}
                </code>
              ))}
            </div>
          </section>
        )}

        {/* Associated Pull Requests */}
        {commit.associatedPullRequests.nodes.length > 0 && (
          <section style={{ marginBottom: '1.25rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Pull Requests
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {commit.associatedPullRequests.nodes.map((pr) => (
                <a
                  key={pr.number}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.625rem',
                    background: '#0d1117',
                    borderRadius: 8,
                    border: '1px solid #21262d',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        color: '#dfe2eb',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        marginBottom: 4,
                      }}
                    >
                      {pr.title}
                    </div>
                    <div style={{ color: '#8b949e', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      #{pr.number}
                    </div>
                  </div>
                  <PRStateBadge state={pr.state} />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* SHA */}
        <section>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#8b949e',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.375rem',
            }}
          >
            Full SHA
          </div>
          <code
            style={{
              color: '#8b949e',
              background: '#0d1117',
              borderRadius: 6,
              padding: '0.375rem 0.625rem',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              display: 'block',
              wordBreak: 'break-all',
              border: '1px solid #21262d',
            }}
          >
            {commit.oid}
          </code>
        </section>
      </div>
    </aside>
  );
}
