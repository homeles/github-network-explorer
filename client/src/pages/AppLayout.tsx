import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams, Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth.js';
import { useOrgs, useOrgRepos } from '../hooks/useRepos.js';
import { api } from '../lib/api.js';
import type { UserRepo, UserOrg } from '../lib/api.js';
import { DateRangeProvider } from '../contexts/DateRangeContext.js';
import { RateLimitIndicator } from '../components/RateLimitIndicator.js';

export default function AppLayout() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams();
  const location = useLocation();

  const [selectedOwner, setSelectedOwner] = useState<string | null>(() => {
    // Initialize from URL params — if the repo owner differs from the logged-in user,
    // set selectedOwner to match so the correct org's repos are loaded
    return params.owner ?? null;
  });
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const repoDropdownRef = useRef<HTMLDivElement>(null);

  const { orgs, isLoading: orgsLoading } = useOrgs(isAuthenticated);
  const { repos, isLoading: reposLoading, hasNextPage, loadMore } = useOrgRepos(
    selectedOwner,
    user?.login ?? null,
    isAuthenticated
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Sync org dropdown with URL owner param (for deep linking)
  useEffect(() => {
    if (params.owner && params.owner !== selectedOwner) {
      // If URL owner matches logged-in user, treat as Personal (null works too, but
      // setting it explicitly ensures the repos list fetches for the right owner)
      setSelectedOwner(params.owner);
    }
  }, [params.owner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setShowOrgDropdown(false);
      }
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setShowRepoDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  function selectOrg(owner: string | null) {
    setShowOrgDropdown(false);
    setSelectedOwner(owner);
    // If current repo doesn't belong to new owner, navigate to /app
    if (params.owner && params.owner !== (owner ?? user?.login)) {
      void navigate('/app');
    }
  }

  function selectRepo(repo: UserRepo) {
    setShowRepoDropdown(false);
    setSearchQuery('');
    const suffixes = ['/network', '/pulls', '/branches', '/settings', '/code-frequency'];
    const currentSuffix = suffixes.find((s) => location.pathname.endsWith(s)) ?? '';
    // Preserve date-range params when switching repos; drop repo-specific params (branches, etc.)
    const currentParams = new URLSearchParams(location.search);
    const newParams = new URLSearchParams();
    for (const key of ['range', 'since', 'until']) {
      const val = currentParams.get(key);
      if (val) newParams.set(key, val);
    }
    const qs = newParams.toString() ? `?${newParams.toString()}` : '';
    void navigate(`/app/repo/${repo.owner.login}/${repo.name}${currentSuffix}${qs}`);
  }

  const isPersonal = selectedOwner === null || selectedOwner === user?.login;
  const displayOwner = isPersonal ? user?.login : selectedOwner;
  const selectedOrg: UserOrg | null = isPersonal
    ? null
    : (orgs.find((o) => o.login === selectedOwner) ?? null);

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
          gap: '0.5rem',
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
            marginLeft: '0.5rem',
          }}
        />

        {/* Organization Dropdown */}
        <div ref={orgDropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowOrgDropdown((v) => !v)}
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
              width: 180,
            }}
          >
            {isPersonal && user ? (
              <img
                src={user.avatarUrl}
                alt={user.login}
                style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
              />
            ) : selectedOrg ? (
              <img
                src={selectedOrg.avatar_url}
                alt={selectedOrg.login}
                style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
              />
            ) : null}
            <span style={{ flexGrow: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isPersonal ? 'Personal' : (selectedOwner ?? 'Personal')}
            </span>
            <span style={{ color: '#8b949e', flexShrink: 0 }}>▾</span>
          </button>

          {showOrgDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 8,
                width: 220,
                maxHeight: 360,
                overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}
            >
              {/* Personal option */}
              <button
                onClick={() => selectOrg(null)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  background: isPersonal ? '#1f2937' : 'transparent',
                  border: 'none',
                  color: '#dfe2eb',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1f2937'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isPersonal ? '#1f2937' : 'transparent'; }}
              >
                {user && (
                  <img
                    src={user.avatarUrl}
                    alt={user.login}
                    style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
                  />
                )}
                <span>Personal</span>
              </button>

              {orgsLoading ? (
                <div style={{ padding: '0.75rem', color: '#8b949e', fontSize: '0.8125rem', textAlign: 'center' }}>
                  Loading...
                </div>
              ) : (
                orgs.map((org) => (
                  <button
                    key={org.login}
                    onClick={() => selectOrg(org.login)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: selectedOwner === org.login ? '#1f2937' : 'transparent',
                      border: 'none',
                      color: '#dfe2eb',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1f2937'; }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = selectedOwner === org.login ? '#1f2937' : 'transparent'; }}
                  >
                    <img
                      src={org.avatar_url}
                      alt={org.login}
                      style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {org.login}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Repo Dropdown */}
        <div ref={repoDropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
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
              width: 320,
            }}
          >
            <span style={{ flexGrow: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentRepo
                ? currentRepo.name
                : `Select repository... (${repos.length}${hasNextPage ? '+' : ''})`}
            </span>
            <span style={{ color: '#8b949e', flexShrink: 0 }}>▾</span>
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
                  placeholder={`Search ${displayOwner ?? ''} repositories...`}
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
                {reposLoading && repos.length === 0 ? (
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
                        (e.currentTarget as HTMLButtonElement).style.background = '#1f2937';
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          currentRepo?.full_name === repo.full_name ? '#1f2937' : 'transparent';
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>
                        {repo.private ? '🔒 ' : ''}
                        {repo.name}
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
                {hasNextPage && !searchQuery && (
                  <button
                    onClick={loadMore}
                    disabled={reposLoading}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: 'transparent',
                      border: 'none',
                      borderTop: '1px solid #30363d',
                      color: reposLoading ? '#8b949e' : '#58a6ff',
                      cursor: reposLoading ? 'default' : 'pointer',
                      fontSize: '0.8125rem',
                      textAlign: 'center',
                    }}
                  >
                    {reposLoading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* GitHub repo link */}
        {params.owner && params.repo && (
          <a
            href={`https://github.com/${params.owner}/${params.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`View ${params.owner}/${params.repo} on GitHub`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              color: '#8b949e',
              textDecoration: 'none',
              flexShrink: 0,
              transition: 'color 0.15s, background 0.15s',
              background: 'transparent',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#dfe2eb';
              e.currentTarget.style.background = 'rgba(88,166,255,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = '#8b949e';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        )}

        {/* Spacer */}
        <div style={{ flexGrow: 1 }} />

        {/* Rate limit indicator */}
        <RateLimitIndicator />

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
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#f85149';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#8b949e';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#30363d';
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
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}${location.search}`
                : '/app',
            },
            {
              icon: '🔀',
              label: 'Network Graph',
              active: isOnNetworkPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/network${location.search}`
                : '/app',
            },
            {
              icon: '📋',
              label: 'Pull Requests',
              active: isOnPullsPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/pulls${location.search}`
                : '/app',
            },
            {
              icon: '🏷️',
              label: 'Branches',
              active: isOnBranchesPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/branches${location.search}`
                : '/app',
            },
            {
              icon: '📈',
              label: 'Code Frequency',
              active: isOnCodeFrequencyPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/code-frequency${location.search}`
                : '/app',
            },
            {
              icon: '⚙️',
              label: 'Settings',
              active: isOnSettingsPage,
              href: currentRepo
                ? `/app/repo/${currentRepo.owner.login}/${currentRepo.name}/settings${location.search}`
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
            <DateRangeProvider>
              <Outlet />
            </DateRangeProvider>
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
    </div>
  );
}
