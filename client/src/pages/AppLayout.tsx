import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams, Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth.js';
import { useOrgs, useOrgRepos } from '../hooks/useRepos.js';
import { api } from '../lib/api.js';
import type { UserRepo } from '../lib/api.js';

export default function AppLayout() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams();
  const location = useLocation();

  // Selected org: null = personal (user's own repos)
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { orgs, isLoading: orgsLoading } = useOrgs(isAuthenticated);
  const { repos, isLoading: reposLoading, hasNextPage, loadMore, isLoadingMore } =
    useOrgRepos(selectedOwner, user?.login ?? null, isAuthenticated);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // When switching orgs, navigate away if current repo doesn't belong to new owner
  useEffect(() => {
    if (params.owner && selectedOwner !== null && params.owner !== selectedOwner) {
      void navigate('/app');
    }
    if (params.owner && selectedOwner === null && user && params.owner !== user.login) {
      void navigate('/app');
    }
  }, [selectedOwner, params.owner, user, navigate]);

  const currentRepo =
    params.owner && params.repo
      ? repos.find((r) => r.owner.login === params.owner && r.name === params.repo) ?? null
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

  function selectOwner(login: string | null) {
    setSelectedOwner(login);
    setShowOrgDropdown(false);
    setSearchQuery('');
  }

  const effectiveOwner = selectedOwner ?? user?.login ?? null;
  const isPersonal = !selectedOwner || selectedOwner === user?.login;

  const selectedOrgLabel = isPersonal
    ? (user?.login ?? 'Personal')
    : selectedOwner!;
  const selectedOrgAvatar = isPersonal
    ? (user?.avatarUrl ?? '')
    : orgs.find((o) => o.login === selectedOwner)?.avatar_url ?? '';

  const isOnGraphPage =
    location.pathname.includes('/app/repo/') && !location.pathname.endsWith('/network');
  const isOnNetworkPage = location.pathname.endsWith('/network');

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
          gap: '0.75rem',
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

        {/* Organization dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => {
              setShowOrgDropdown((v) => !v);
              setShowRepoDropdown(false);
            }}
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
            {selectedOrgAvatar && (
              <img
                src={selectedOrgAvatar}
                alt={selectedOrgLabel}
                style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
              />
            )}
            <span
              style={{
                flexGrow: 1,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedOrgLabel}
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
                onClick={() => selectOwner(null)}
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
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#1f2937';
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = isPersonal
                    ? '#1f2937'
                    : 'transparent';
                }}
              >
                {user?.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt={user.login}
                    style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
                  />
                )}
                <span>{user?.login ?? 'Personal'}</span>
              </button>

              {/* Divider if orgs exist */}
              {orgs.length > 0 && (
                <div style={{ height: 1, background: '#30363d', margin: '0.25rem 0' }} />
              )}

              {/* Org options */}
              {orgsLoading ? (
                <div
                  style={{
                    padding: '0.75rem',
                    color: '#8b949e',
                    fontSize: '0.8125rem',
                    textAlign: 'center',
                  }}
                >
                  Loading...
                </div>
              ) : (
                orgs.map((org) => (
                  <button
                    key={org.login}
                    onClick={() => selectOwner(org.login)}
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
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#1f2937';
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        selectedOwner === org.login ? '#1f2937' : 'transparent';
                    }}
                  >
                    <img
                      src={org.avatar_url}
                      alt={org.login}
                      style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {org.login}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Repo selector */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => {
              setShowRepoDropdown((v) => !v);
              setShowOrgDropdown(false);
            }}
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
              {currentRepo ? currentRepo.name : 'Select repository...'}
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
              <div style={{ overflowY: 'auto', maxHeight: 320 }}>
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
                  <>
                    {filteredRepos.map((repo) => (
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
                    ))}
                    {/* Load more button */}
                    {hasNextPage && !searchQuery && (
                      <button
                        onClick={() => loadMore()}
                        disabled={isLoadingMore}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          background: 'transparent',
                          border: 'none',
                          borderTop: '1px solid #30363d',
                          color: '#58a6ff',
                          cursor: isLoadingMore ? 'default' : 'pointer',
                          fontSize: '0.8125rem',
                          textAlign: 'center',
                        }}
                      >
                        {isLoadingMore ? 'Loading...' : 'Load more'}
                      </button>
                    )}
                  </>
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
            { icon: '📋', label: 'Pull Requests', active: false, href: '#' },
            { icon: '🏷️', label: 'Branches', active: false, href: '#' },
            { icon: '⚙️', label: 'Settings', active: false, href: '#' },
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

      {/* Click-outside handler for dropdowns */}
      {(showOrgDropdown || showRepoDropdown) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
          }}
          onClick={() => {
            setShowOrgDropdown(false);
            setShowRepoDropdown(false);
          }}
        />
      )}
    </div>
  );
}
