import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { PullRequest } from '../lib/api.js';

type PRState = 'OPEN' | 'CLOSED' | 'MERGED';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function StateBadge({ state }: { state: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (state) {
    case 'OPEN':
      bg = 'rgba(63,185,80,0.15)';
      color = '#3fb950';
      label = 'Open';
      break;
    case 'MERGED':
      bg = 'rgba(188,140,255,0.15)';
      color = '#bc8cff';
      label = 'Merged';
      break;
    default:
      bg = 'rgba(248,81,73,0.15)';
      color = '#f85149';
      label = 'Closed';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: bg,
        color,
        borderRadius: 12,
        padding: '2px 8px',
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function PRRow({ pr }: { pr: PullRequest }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid #21262d',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 0.1s',
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = '#161b22';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
      }}
    >
      {/* Avatar */}
      {pr.author ? (
        <img
          src={pr.author.avatarUrl}
          alt={pr.author.login}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid #30363d',
            flexShrink: 0,
            marginTop: 2,
          }}
        />
      ) : (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#21262d',
            flexShrink: 0,
            marginTop: 2,
          }}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <StateBadge state={pr.state} />
          <span
            style={{
              color: '#dfe2eb',
              fontWeight: 600,
              fontSize: '0.9375rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {pr.title}
          </span>
          <span style={{ color: '#8b949e', fontSize: '0.8125rem', flexShrink: 0 }}>
            #{pr.number}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: '0.375rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Branch info */}
          <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>
            <span
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 4,
                padding: '1px 5px',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#58a6ff',
              }}
            >
              {pr.headRefName}
            </span>
            <span style={{ margin: '0 4px', color: '#8b949e' }}>→</span>
            <span
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 4,
                padding: '1px 5px',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#8b949e',
              }}
            >
              {pr.baseRefName}
            </span>
          </span>

          {/* Author */}
          {pr.author && (
            <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>
              by{' '}
              <span style={{ color: '#c0c7d4' }}>{pr.author.login}</span>
            </span>
          )}

          {/* Age */}
          <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>
            {timeAgo(pr.createdAt)}
          </span>

          {/* Commits */}
          {pr.commits.totalCount > 0 && (
            <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>
              {pr.commits.totalCount} commit{pr.commits.totalCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* Reviews */}
          {pr.reviews.totalCount > 0 && (
            <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>
              {pr.reviews.totalCount} review{pr.reviews.totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

export default function PullRequestsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [activeState, setActiveState] = useState<PRState>('OPEN');

  const { data: prs, isLoading, error } = useQuery({
    queryKey: ['pulls', owner, repo, activeState],
    queryFn: () => api.repos.pullRequests(owner!, repo!, activeState),
    enabled: !!owner && !!repo,
  });

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

  const tabs: { label: string; value: PRState }[] = [
    { label: 'Open', value: 'OPEN' },
    { label: 'Closed', value: 'CLOSED' },
    { label: 'Merged', value: 'MERGED' },
  ];

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
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #21262d',
          background: '#161b22',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ fontSize: '1rem', marginRight: '0.25rem' }}>📋</span>
        <span
          style={{ color: '#dfe2eb', fontWeight: 600, fontSize: '0.9375rem' }}
        >
          Pull Requests
        </span>
        <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>
          {owner}/{repo}
        </span>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #21262d',
          background: '#161b22',
          flexShrink: 0,
          padding: '0 1rem',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveState(tab.value)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeState === tab.value ? '2px solid #58a6ff' : '2px solid transparent',
              color: activeState === tab.value ? '#dfe2eb' : '#8b949e',
              padding: '0.625rem 0.875rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontWeight: activeState === tab.value ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              gap: '0.75rem',
              color: '#8b949e',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                border: '2px solid #30363d',
                borderTopColor: '#58a6ff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            Loading pull requests...
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div
            style={{
              padding: '2rem',
              color: '#f85149',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
            {error instanceof Error ? error.message : 'Failed to load pull requests'}
          </div>
        ) : !prs || prs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              gap: '0.5rem',
              color: '#8b949e',
            }}
          >
            <span style={{ fontSize: '2rem' }}>📋</span>
            <span style={{ fontSize: '0.9375rem' }}>
              No {activeState.toLowerCase()} pull requests
            </span>
          </div>
        ) : (
          <div>
            {prs.map((pr) => (
              <PRRow key={pr.number} pr={pr} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
