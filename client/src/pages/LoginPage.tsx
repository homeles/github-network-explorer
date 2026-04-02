import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { api } from '../lib/api.js';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      void navigate('/app');
    }
  }, [isAuthenticated, navigate]);

  // Check for error params from OAuth callback
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get('error');

  async function handleLogin() {
    try {
      const { url } = await api.auth.initiateLogin();
      window.location.href = url;
    } catch (err) {
      console.error('Login initiation failed:', err);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d1117 0%, #10141a 50%, #0d1117 100%)',
        padding: '2rem',
      }}
    >
      {/* Logo / Brand */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: 32,
          }}
        >
          ⬡
        </div>
        <h1
          style={{
            color: '#dfe2eb',
            fontSize: '2rem',
            fontWeight: 700,
            margin: '0 0 0.5rem',
            letterSpacing: '-0.02em',
          }}
        >
          GitHub Network Explorer
        </h1>
        <p
          style={{
            color: '#8b949e',
            fontSize: '1.1rem',
            margin: 0,
            maxWidth: 400,
          }}
        >
          Visualize your repository commit history as an interactive DAG graph
        </p>
      </div>

      {/* Login Card */}
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: '2rem 2.5rem',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        }}
      >
        {oauthError && (
          <div
            style={{
              background: 'rgba(248,81,73,0.15)',
              border: '1px solid #f85149',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              color: '#f85149',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            Authentication failed: {oauthError.replace(/_/g, ' ')}
          </div>
        )}

        <h2
          style={{
            color: '#dfe2eb',
            fontSize: '1.25rem',
            fontWeight: 600,
            margin: '0 0 0.5rem',
          }}
        >
          Sign in to continue
        </h2>
        <p
          style={{
            color: '#8b949e',
            fontSize: '0.875rem',
            margin: '0 0 1.5rem',
          }}
        >
          Connect your GitHub account to explore repository commit graphs.
        </p>

        <button
          onClick={() => void handleLogin()}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '0.75rem 1.5rem',
            background: '#238636',
            color: '#fff',
            border: '1px solid rgba(240,246,252,0.1)',
            borderRadius: 8,
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
            opacity: isLoading ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => {
            if (!isLoading)
              (e.currentTarget as HTMLButtonElement).style.background = '#2ea043';
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#238636';
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          {isLoading ? 'Checking...' : 'Connect with GitHub'}
        </button>

        <p
          style={{
            color: '#8b949e',
            fontSize: '0.75rem',
            marginTop: '1.25rem',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          We request{' '}
          <code
            style={{
              background: '#0d1117',
              padding: '0.1em 0.3em',
              borderRadius: 4,
              color: '#58a6ff',
            }}
          >
            repo
          </code>{' '}
          and{' '}
          <code
            style={{
              background: '#0d1117',
              padding: '0.1em 0.3em',
              borderRadius: 4,
              color: '#58a6ff',
            }}
          >
            read:user
          </code>{' '}
          scopes to display your repositories.
        </p>
      </div>

      {/* Features list */}
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          marginTop: '2.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {[
          { icon: '⬡', label: 'DAG Visualization' },
          { icon: '⚡', label: 'Fast & Cached' },
          { icon: '🔀', label: 'Branch Tracking' },
        ].map((f) => (
          <div
            key={f.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#8b949e',
              fontSize: '0.875rem',
            }}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
