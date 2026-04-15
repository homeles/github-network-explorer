import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { BranchInfo, TagInfo } from '../lib/api.js';

type SortMode = 'updated' | 'name' | 'ahead';
type TabMode = 'branches' | 'tags';

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
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

function AheadBehindBar({ aheadBy, behindBy }: { aheadBy: number; behindBy: number }) {
  if (aheadBy === 0 && behindBy === 0) {
    return (
      <span style={{ color: '#3fb950', fontSize: '0.75rem' }}>up to date</span>
    );
  }

  const maxVal = Math.max(aheadBy, behindBy, 1);
  const aheadPct = Math.min((aheadBy / maxVal) * 100, 100);
  const behindPct = Math.min((behindBy / maxVal) * 100, 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      {behindBy > 0 && (
        <span style={{ color: '#f85149', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          ↓{behindBy}
        </span>
      )}
      <div
        style={{
          width: 60,
          height: 6,
          background: '#21262d',
          borderRadius: 3,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {behindBy > 0 && (
          <div
            style={{
              width: `${behindPct}%`,
              background: '#f85149',
              borderRadius: '3px 0 0 3px',
            }}
          />
        )}
        {aheadBy > 0 && (
          <div
            style={{
              width: `${aheadPct}%`,
              background: '#3fb950',
              borderRadius: behindBy === 0 ? 3 : '0 3px 3px 0',
              marginLeft: behindBy > 0 ? 0 : 'auto',
            }}
          />
        )}
      </div>
      {aheadBy > 0 && (
        <span style={{ color: '#3fb950', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          ↑{aheadBy}
        </span>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  onNavigate,
}: {
  branch: BranchInfo;
  onNavigate: (name: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #21262d',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onClick={() => onNavigate(branch.name)}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#161b22';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Branch name + badges */}
      <div style={{ flex: '0 0 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: '#58a6ff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 180,
            }}
          >
            {branch.name}
          </span>
          {branch.isDefault && (
            <span
              style={{
                background: 'rgba(88,166,255,0.15)',
                color: '#58a6ff',
                borderRadius: 12,
                padding: '1px 6px',
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
                background: 'rgba(248,81,73,0.12)',
                color: '#f85149',
                borderRadius: 12,
                padding: '1px 6px',
                fontSize: '0.6875rem',
                fontWeight: 600,
              }}
            >
              protected
            </span>
          )}
        </div>
      </div>

      {/* Last commit */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#8b949e',
          fontSize: '0.8125rem',
        }}
      >
        {branch.lastCommitMessage.split('\n')[0]}
      </div>

      {/* Author + age */}
      <div
        style={{
          flex: '0 0 140px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          justifyContent: 'flex-end',
        }}
      >
        {branch.lastCommitAuthor.avatarUrl && (
          <img
            src={branch.lastCommitAuthor.avatarUrl}
            alt={branch.lastCommitAuthor.login ?? branch.lastCommitAuthor.name ?? ''}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1px solid #30363d',
            }}
          />
        )}
        <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>
          {timeAgo(branch.lastCommitDate)}
        </span>
      </div>

      {/* Ahead/behind */}
      <div style={{ flex: '0 0 140px', display: 'flex', justifyContent: 'flex-end' }}>
        {!branch.isDefault && (
          <AheadBehindBar aheadBy={branch.aheadBy} behindBy={branch.behindBy} />
        )}
      </div>
    </div>
  );
}

function TagRow({ tag }: { tag: TagInfo }) {
  const date = tag.taggerDate ?? tag.committedDate;
  const authorLogin = tag.author.login ?? tag.author.name ?? '';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #21262d',
      }}
    >
      {/* Tag icon + name */}
      <div style={{ flex: '0 0 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.875rem' }}>🏷️</span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: '#58a6ff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 170,
            }}
          >
            {tag.name}
          </span>
        </div>
      </div>

      {/* Commit message */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#8b949e',
          fontSize: '0.8125rem',
        }}
      >
        {(tag.message?.split('\n')[0] ?? tag.commitMessage.split('\n')[0])}
      </div>

      {/* Author + age */}
      <div
        style={{
          flex: '0 0 140px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          justifyContent: 'flex-end',
        }}
      >
        {tag.author.avatarUrl && (
          <img
            src={tag.author.avatarUrl}
            alt={authorLogin}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1px solid #30363d',
            }}
          />
        )}
        <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>
          {timeAgo(date)}
        </span>
      </div>

      {/* Commit SHA */}
      <div style={{ flex: '0 0 140px', display: 'flex', justifyContent: 'flex-end' }}>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#58a6ff',
            background: 'rgba(88,166,255,0.1)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {tag.commitAbbreviatedOid}
        </span>
      </div>
    </div>
  );
}

export default function BranchesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [activeTab, setActiveTab] = useState<TabMode>('branches');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: branches, isLoading: branchesLoading, error: branchesError } = useQuery({
    queryKey: ['branches', owner, repo],
    queryFn: () => api.repos.branches(owner!, repo!),
    enabled: !!owner && !!repo,
  });

  const { data: tags, isLoading: tagsLoading, error: tagsError } = useQuery({
    queryKey: ['tags', owner, repo],
    queryFn: () => api.repos.tags(owner!, repo!),
    enabled: !!owner && !!repo && activeTab === 'tags',
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

  function handleNavigate(branchName: string) {
    void navigate(`/app/repo/${owner}/${repo}?branch=${encodeURIComponent(branchName)}`);
  }

  const sorted = branches
    ? [...branches].sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        switch (sortMode) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'ahead':
            return b.aheadBy - a.aheadBy;
          default: // 'updated'
            return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
        }
      })
    : [];

  const q = searchQuery.toLowerCase();
  const filteredBranches = q ? sorted.filter((b) => b.name.toLowerCase().includes(q)) : sorted;
  const filteredTags = q && tags ? tags.filter((t) => t.name.toLowerCase().includes(q)) : (tags ?? []);

  const isLoading = activeTab === 'branches' ? branchesLoading : tagsLoading;
  const error = activeTab === 'branches' ? branchesError : tagsError;
  const isEmpty = activeTab === 'branches' ? filteredBranches.length === 0 : filteredTags.length === 0;

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
        <span style={{ fontSize: '1rem', marginRight: '0.25rem' }}>🌿</span>
        <span style={{ color: '#dfe2eb', fontWeight: 600, fontSize: '0.9375rem' }}>
          Branches
        </span>
        <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>
          {owner}/{repo}
        </span>

        {/* Search bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 6,
            padding: '0.25rem 0.5rem',
            marginLeft: '0.5rem',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#8b949e">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#dfe2eb',
              fontSize: '0.8125rem',
              width: 140,
            }}
          />
        </div>

        <div style={{ flexGrow: 1 }} />

        {/* Sort controls (branches only) */}
        {activeTab === 'branches' && (
          <>
            <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>Sort:</span>
            {(['updated', 'name', 'ahead'] as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                style={{
                  background: sortMode === mode ? 'rgba(88,166,255,0.15)' : 'transparent',
                  border: `1px solid ${sortMode === mode ? '#58a6ff' : '#30363d'}`,
                  borderRadius: 6,
                  color: sortMode === mode ? '#58a6ff' : '#8b949e',
                  padding: '0.25rem 0.625rem',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                {mode === 'updated' ? 'Recent' : mode === 'name' ? 'Name' : 'Ahead'}
              </button>
            ))}
          </>
        )}
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
        {(['branches', 'tags'] as TabMode[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
              color: activeTab === tab ? '#dfe2eb' : '#8b949e',
              padding: '0.625rem 0.875rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              transition: 'color 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'branches' ? '🌿 Branches' : '🏷️ Tags'}
          </button>
        ))}
      </div>

      {/* Column headers */}
      {!isLoading && !error && !isEmpty && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid #21262d',
            background: '#161b22',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: '0 0 220px', color: '#8b949e', fontSize: '0.75rem', fontWeight: 600 }}>
            {activeTab === 'branches' ? 'BRANCH' : 'TAG'}
          </div>
          <div style={{ flex: 1, color: '#8b949e', fontSize: '0.75rem', fontWeight: 600 }}>
            {activeTab === 'branches' ? 'LAST COMMIT' : 'MESSAGE'}
          </div>
          <div style={{ flex: '0 0 140px', color: '#8b949e', fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>
            UPDATED
          </div>
          <div style={{ flex: '0 0 140px', color: '#8b949e', fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>
            {activeTab === 'branches' ? 'AHEAD / BEHIND' : 'COMMIT'}
          </div>
        </div>
      )}

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
            Loading {activeTab}...
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
            {error instanceof Error ? error.message : `Failed to load ${activeTab}`}
          </div>
        ) : isEmpty ? (
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
            <span style={{ fontSize: '2rem' }}>{activeTab === 'branches' ? '🌿' : '🏷️'}</span>
            <span style={{ fontSize: '0.9375rem' }}>
              {searchQuery ? `No ${activeTab} matching "${searchQuery}"` : `No ${activeTab} found`}
            </span>
          </div>
        ) : activeTab === 'branches' ? (
          filteredBranches.map((branch) => (
            <BranchRow key={branch.name} branch={branch} onNavigate={handleNavigate} />
          ))
        ) : (
          filteredTags.map((tag) => (
            <TagRow key={tag.name} tag={tag} />
          ))
        )}
      </div>
    </div>
  );
}
