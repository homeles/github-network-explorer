import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { PullRequest } from '../lib/api.js';
import { useDateRange } from '../contexts/DateRangeContext.js';
import DateRangePicker from '../components/DateRangePicker.js';

type PRState = 'OPEN' | 'CLOSED' | 'MERGED';
type SortMode = 'newest' | 'oldest' | 'most-comments' | 'most-reviews';

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

type CheckNode =
  | { name: string; conclusion: string | null; status: string; detailsUrl: string | null }
  | { context: string; state: string; targetUrl: string | null };

function CIStatusIcon({ rollup }: { pr: PullRequest; rollup: PullRequest['statusCheckRollup'] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!rollup) {
    return (
      <span title="No CI status" style={{ fontSize: '0.875rem', cursor: 'default' }}>
        ⚪
      </span>
    );
  }

  const icon =
    rollup.state === 'SUCCESS'
      ? '✅'
      : rollup.state === 'FAILURE' || rollup.state === 'ERROR'
        ? '❌'
        : rollup.state === 'PENDING'
          ? '⏳'
          : '⚪';

  const checks = rollup.contexts.nodes;

  function getCheckName(c: CheckNode): string {
    return 'name' in c ? c.name : c.context;
  }
  function getCheckState(c: CheckNode): string {
    if ('conclusion' in c) return c.conclusion ?? c.status;
    return c.state;
  }
  function getCheckUrl(c: CheckNode): string | null {
    return 'detailsUrl' in c ? c.detailsUrl : c.targetUrl;
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span style={{ fontSize: '0.875rem', cursor: 'default' }}>{icon}</span>
      {showTooltip && checks.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: '#1c2128',
            border: '1px solid #30363d',
            borderRadius: 8,
            padding: '8px 10px',
            minWidth: 220,
            maxWidth: 340,
            zIndex: 200,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            fontSize: '11px',
          }}
        >
          {checks.map((c, i) => {
            const name = getCheckName(c);
            const st = getCheckState(c);
            const url = getCheckUrl(c);
            const stColor =
              st === 'SUCCESS' || st === 'success'
                ? '#3fb950'
                : st === 'FAILURE' || st === 'failure' || st === 'ERROR' || st === 'error'
                  ? '#f85149'
                  : '#d29922';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 0',
                  borderBottom: i < checks.length - 1 ? '1px solid #21262d' : 'none',
                }}
              >
                <span style={{ color: stColor, flexShrink: 0 }}>●</span>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#58a6ff', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {name}
                  </a>
                ) : (
                  <span style={{ color: '#dfe2eb', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                )}
                <span style={{ color: '#8b949e', flexShrink: 0 }}>{st}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewerAvatars({ pr }: { pr: PullRequest }) {
  // Build a merged list: requested reviewers + people who reviewed
  const reviewed = new Map<string, { login: string; avatarUrl: string; state: string }>();

  for (const r of pr.reviewList) {
    if (r.author) {
      const existing = reviewed.get(r.author.login);
      // Prefer APPROVED / CHANGES_REQUESTED over COMMENTED
      if (!existing || existing.state === 'COMMENTED') {
        reviewed.set(r.author.login, { ...r.author, state: r.state });
      }
    }
  }

  const allReviewers: Array<{ login: string; avatarUrl: string; state: string }> = [];
  for (const req of pr.reviewRequests) {
    if (!reviewed.has(req.login)) {
      allReviewers.push({ ...req, state: 'PENDING' });
    }
  }
  for (const [, r] of reviewed) {
    allReviewers.push(r);
  }

  if (allReviewers.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {allReviewers.slice(0, 5).map((r) => {
        const ringColor =
          r.state === 'APPROVED'
            ? '#3fb950'
            : r.state === 'CHANGES_REQUESTED'
              ? '#f85149'
              : r.state === 'COMMENTED'
                ? '#d29922'
                : '#484f58';
        return (
          <img
            key={r.login}
            src={r.avatarUrl}
            alt={r.login}
            title={`${r.login}: ${r.state}`}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: `2px solid ${ringColor}`,
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  'most-comments': 'Most reviews',
  'most-reviews': 'Most commits',
};

function SortDropdown({ sortMode, setSortMode }: { sortMode: SortMode; setSortMode: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const modes: SortMode[] = ['newest', 'oldest', 'most-comments', 'most-reviews'];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: '#dfe2eb',
          padding: '0.25rem 0.625rem',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        Sort: {SORT_LABELS[sortMode]}
        <span style={{ color: '#8b949e', fontSize: '0.6875rem' }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 6,
            zIndex: 100,
            minWidth: 140,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => { setSortMode(m); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: sortMode === m ? 'rgba(88,166,255,0.12)' : 'transparent',
                border: 'none',
                color: sortMode === m ? '#58a6ff' : '#dfe2eb',
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: value ? 'rgba(88,166,255,0.12)' : '#161b22',
          border: `1px solid ${value ? '#58a6ff' : '#30363d'}`,
          borderRadius: 6,
          color: value ? '#58a6ff' : '#dfe2eb',
          padding: '0.25rem 0.625rem',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          whiteSpace: 'nowrap',
        }}
      >
        {label}{value ? `: ${value}` : ''}
        <span style={{ color: '#8b949e', fontSize: '0.6875rem' }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 6,
            zIndex: 100,
            minWidth: 160,
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: !value ? 'rgba(88,166,255,0.12)' : 'transparent',
              border: 'none',
              color: !value ? '#58a6ff' : '#8b949e',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            All
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: value === opt ? 'rgba(88,166,255,0.12)' : 'transparent',
                border: 'none',
                color: value === opt ? '#58a6ff' : '#dfe2eb',
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
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

      {/* Reviewer avatars */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 2 }}>
        <ReviewerAvatars pr={pr} />
        <CIStatusIcon pr={pr} rollup={pr.statusCheckRollup} />
      </div>
    </a>
  );
}

export default function PullRequestsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [activeState, setActiveState] = useState<PRState>('OPEN');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [authorFilter, setAuthorFilter] = useState('');
  const [reviewerFilter, setReviewerFilter] = useState('');

  const { since, until } = useDateRange();

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

  // Compute unique authors and reviewers for filter dropdowns
  const uniqueAuthors = prs
    ? [...new Set(prs.map((p) => p.author?.login).filter((l): l is string => !!l))].sort()
    : [];

  const uniqueReviewers = prs
    ? [
        ...new Set([
          ...prs.flatMap((p) => p.reviewRequests.map((r) => r.login)),
          ...prs.flatMap((p) => p.reviewList.map((r) => r.author?.login ?? '')).filter(Boolean),
        ]),
      ].sort()
    : [];

  const sortedPrs = prs
    ? [...prs].sort((a, b) => {
        switch (sortMode) {
          case 'oldest':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'most-comments':
            return b.reviews.totalCount - a.reviews.totalCount;
          case 'most-reviews':
            return b.commits.totalCount - a.commits.totalCount;
          default: // newest
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      })
    : [];

  // Client-side date filtering on createdAt
  const filteredPrs = sortedPrs.filter((pr) => {
    const created = new Date(pr.createdAt).getTime();
    if (since && created < new Date(since).getTime()) return false;
    if (until && created > new Date(until).getTime()) return false;
    if (authorFilter && pr.author?.login !== authorFilter) return false;
    if (reviewerFilter) {
      const hasReviewer =
        pr.reviewRequests.some((r) => r.login === reviewerFilter) ||
        pr.reviewList.some((r) => r.author?.login === reviewerFilter);
      if (!hasReviewer) return false;
    }
    return true;
  });

  const isFiltered = !!(since || until || authorFilter || reviewerFilter);
  const totalCount = sortedPrs.length;
  const filteredCount = filteredPrs.length;

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
          flexWrap: 'wrap',
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
        <div style={{ flexGrow: 1 }} />

        {/* Date range picker */}
        <DateRangePicker />

        {/* Author filter */}
        <FilterDropdown
          label="Author"
          options={uniqueAuthors}
          value={authorFilter}
          onChange={setAuthorFilter}
        />

        {/* Reviewer filter */}
        <FilterDropdown
          label="Reviewer"
          options={uniqueReviewers}
          value={reviewerFilter}
          onChange={setReviewerFilter}
        />

        {/* Sort dropdown */}
        <SortDropdown sortMode={sortMode} setSortMode={setSortMode} />
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
          alignItems: 'center',
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

        {/* Filter count badge */}
        {isFiltered && !isLoading && prs && (
          <span
            style={{
              marginLeft: 'auto',
              color: '#8b949e',
              fontSize: '0.8125rem',
              background: '#161b22',
              border: '1px solid #21262d',
              borderRadius: 12,
              padding: '0.15rem 0.6rem',
            }}
          >
            {filteredCount} of {totalCount} shown
          </span>
        )}
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
        ) : filteredPrs.length === 0 ? (
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
              No pull requests match the current filters
            </span>
          </div>
        ) : (
          <div>
            {filteredPrs.map((pr) => (
              <PRRow key={pr.number} pr={pr} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
