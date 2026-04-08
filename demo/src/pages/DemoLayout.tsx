import { Outlet, Link, useLocation } from 'react-router';
import { OWNER, REPO } from '../lib/github-api.js';

export default function DemoLayout() {
  const location = useLocation();

  const isOnGraphPage = location.pathname === '/' || location.pathname === '';
  const isOnNetworkPage = location.pathname === '/network';
  const isOnBranchesPage = location.pathname === '/branches';
  const isOnCodeFrequencyPage = location.pathname === '/code-frequency';

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
          to="/"
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

        {/* DEMO badge */}
        <span
          style={{
            background: 'rgba(88,166,255,0.15)',
            color: '#58a6ff',
            border: '1px solid rgba(88,166,255,0.3)',
            borderRadius: 12,
            padding: '0.1rem 0.625rem',
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Demo
        </span>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 24,
            background: '#30363d',
            flexShrink: 0,
          }}
        />

        {/* Repo name */}
        <a
          href={`https://github.com/${OWNER}/${REPO}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#dfe2eb',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          {OWNER}/{REPO}
          <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>↗</span>
        </a>

        {/* Spacer */}
        <div style={{ flexGrow: 1 }} />

        {/* Rate limit notice */}
        <span
          style={{
            color: '#8b949e',
            fontSize: '0.75rem',
            opacity: 0.7,
          }}
        >
          Public API • 60 req/hr
        </span>
      </header>

      {/* Info banner */}
      <div
        style={{
          background: 'rgba(88,166,255,0.08)',
          borderBottom: '1px solid rgba(88,166,255,0.15)',
          padding: '0.375rem 1rem',
          fontSize: '0.75rem',
          color: '#8b949e',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        📡 Live demo using public GitHub API — data from{' '}
        <a
          href={`https://github.com/${OWNER}/${REPO}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#58a6ff', textDecoration: 'none' }}
        >
          {OWNER}/{REPO}
        </a>
      </div>

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
              href: '/',
            },
            {
              icon: '🔀',
              label: 'Network Graph',
              active: isOnNetworkPage,
              href: '/network',
            },
            {
              icon: '🏷️',
              label: 'Branches',
              active: isOnBranchesPage,
              href: '/branches',
            },
            {
              icon: '📈',
              label: 'Code Frequency',
              active: isOnCodeFrequencyPage,
              href: '/code-frequency',
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
                background: item.active
                  ? 'rgba(88,166,255,0.15)'
                  : 'transparent',
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
