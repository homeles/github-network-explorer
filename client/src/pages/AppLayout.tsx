import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams, Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth.js';
import { useRepos } from '../hooks/useRepos.js';
import { api } from '../lib/api.js';
import type { UserRepo } from '../lib/api.js';

export default function AppLayout() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { repos, isLoading: reposLoading } = useRepos(isAuthenticated);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const params = useParams();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const currentRepo = params.owner && params.repo
    ? repos.find((r) => r.owner.login === params.owner && r.name === params.repo)
    : null;

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleLogout() {
    await api.auth.logout();
    queryClient.clear();
    void navigate('/');
  }

  function selectRepo(repo: UserRepo) {
    setShowRepoDropdown(false);
    setSearchQuery('');
    void navigate(`/app/repo/${repo.owner.login}/${repo.name}`);
  }

  const isOnCodeFrequencyPage = location.pathname.endsWith('/code-frequency');
  const isOnGraphPage =
    location.pathname.includes('/app/repo/') &&
    !location.pathname.endsWith('/network') &&
    !location.pathname.endsWith('/pulls') &&
    !location.pathname.endsWith('/branches') &&
    !location.pathname.endsWith('/settings') &&
    !isOnCodeFrequencyPage;
  const isOnNetworkPage = location.pathname.endsWith('/network');
  const isOnPullsPage = location.pathname.endsWith('/pulls');
  const isOnBranchesPage = location.pathname.endsWith('/branches');
  const isOnSettingsPage = location.pathname.endsWith('/settings');

  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d1117',
          color: '#8b949e',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      {/* Top navigation */}
      <header
        style={{
          height: 56,
          background: '#161b22',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          gap: '1rem',
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <Link
          to="/app"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: '#58a6ff',
            fontWeight: 700,
            fontSize: '1rem',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20 }}>⬡</span>
          <span style={{ color: '#dfe2eb' }}>Network Explorer</span>
        </Link>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 24,
            background: '#30363d',
            flexShrink: 0,
          }}
        />

        {/* Repo selector */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowRepoDropdown((v) => !v)}
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 8,
              color: '#dfe2eb',
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minWidth: 200,
            }}
          >
            <span style={{ flexGrow: 1, textAlign: 'left' }}>
              {currentRepo ? currentRepo.full_name : 'Select repository...'}
            </span>
            <span style={{ color: '#8b949e' }}>▾</span>
          </button>

          {showRepoDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 8,
                width: 320,
                maxHeight: 400,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}
            >
              <div style={{ padding: '0.5rem' }}>
                <input
                  autoFocus
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    color: '#dfe2eb',
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.875rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 340 }}>
                {reposLoading ? (
                  <div
                    style={{
                      padding: '1rem',
                      color: '#8b949e',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                    }}
                  >
                    Loading repositories...
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div
                    style={{
                      padding: '1rem',
                      color: '#8b949e',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                    }}
                  >
                    No repositories found
                  </div>
                ) : (
                  filteredRepos.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => selectRepo(repo)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        background:
                          currentRepo?.full_name === repo.full_name
                            ? '#1f2937'
                            : 'transparent',
                        border: 'none',
                        color: '#dfe2eb',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                      onMouseOver={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          '#1f2937';
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          currentRepo?.full_name === repo.full_name
                            ? '#1f2937'
                            : 'transparent';
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>
                        {repo.private ? '🔒 ' : ''}
                        {repo.full_name}
                      </span>
                      {repo.description && (
                        <span
                          style={{
                            color: '#8b949e',
                            fontSize: '0.75rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {repo.description}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flexGrow: 1 }} />

        {/* User info + logout */}
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <img
              src={user.avatarUrl}
              alt={user.login}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '2px solid #30363d',
              }}
            />
            <span style={{ color: '#c0c7d4', fontSize: '0.875rem' }}>
              {user.login}
            </span>
            <button
              onClick={() => void handleLogout()}
              style={{
                background: 'transparent',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#8b949e',
                padding: '0.25rem 0.625rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#f85149';
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  '#f85149';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#8b949e';
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  '#30363d';
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Main content area with sidebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar - icon only nav */}
        <nav
          style={{
            width: 56,
            background: '#161b22',
            borderRight: '1px solid #21262d',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0.75rem 0',
            gap: '0.25rem',
            flexShrink: 0,
          }}
        >
          {[
            {
              icon: '⬡',
              label: 'Commit Graph',
              active: isOnGraphPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}`
                : '/app',
            },
            {
              icon: '🔀',
              label: 'Network Graph',
              active: isOnNetworkPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/network`
                : '/app',
            },
            {
              icon: '📋',
              label: 'Pull Requests',
              active: isOnPullsPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/pulls`
                : '/app',
            },
            {
              icon: '🏷️',
              label: 'Branches',
              active: isOnBranchesPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/branches`
                : '/app',
            },
            {
              icon: '📈',
              label: 'Code Frequency',
              active: isOnCodeFrequencyPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/code-frequency`
                : '/app',
            },
            {
              icon: '⚙️',
              label: 'Settings',
              active: isOnSettingsPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/settings`
                : '/app',
            },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.href}
              title={item.label}
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '1.125rem',
                background: item.active ? 'rgba(88,166,255,0.15)' : 'transparent',
                color: item.active ? '#58a6ff' : '#8b949e',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {item.icon}
            </Link>
          ))}
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {isAuthenticated ? (
            <Outlet />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8b949e',
              }}
            >
              Redirecting...
            </div>
          )}
        </main>
      </div>

      {/* Click-outside handler for dropdown */}
      {showRepoDropdown && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
          }}
          onClick={() => setShowRepoDropdown(false)}
        />
      )}
    </div>
  );
}
