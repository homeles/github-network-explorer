import { useSettings } from '../hooks/useSettings.js';

const APP_VERSION = '0.1.0';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        background: '#0d1117',
        padding: '1.5rem',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1
          style={{
            color: '#dfe2eb',
            fontSize: '1.25rem',
            fontWeight: 700,
            margin: '0 0 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>⚙️</span> Settings
        </h1>

        {/* Theme section */}
        <section style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              color: '#8b949e',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.75rem',
            }}
          >
            Appearance
          </h2>
          <div
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1rem',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ color: '#dfe2eb', fontSize: '0.9375rem', fontWeight: 500 }}>
                  Theme
                </div>
                <div style={{ color: '#8b949e', fontSize: '0.8125rem', marginTop: 2 }}>
                  Visual style of the application
                </div>
              </div>
              <span
                style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#8b949e',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.875rem',
                  cursor: 'not-allowed',
                }}
              >
                GitGraph Obsidian
              </span>
            </div>
          </div>
        </section>

        {/* Graph settings */}
        <section style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              color: '#8b949e',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.75rem',
            }}
          >
            Graph
          </h2>
          <div
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {/* Default page size */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1rem',
                justifyContent: 'space-between',
                borderBottom: '1px solid #21262d',
              }}
            >
              <div>
                <div style={{ color: '#dfe2eb', fontSize: '0.9375rem', fontWeight: 500 }}>
                  Default commits per page
                </div>
                <div style={{ color: '#8b949e', fontSize: '0.8125rem', marginTop: 2 }}>
                  Number of commits to load at once
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {([25, 50, 100] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => updateSettings({ defaultPageSize: size })}
                    style={{
                      background:
                        settings.defaultPageSize === size
                          ? 'rgba(88,166,255,0.15)'
                          : '#0d1117',
                      border: `1px solid ${settings.defaultPageSize === size ? '#58a6ff' : '#30363d'}`,
                      borderRadius: 6,
                      color:
                        settings.defaultPageSize === size ? '#58a6ff' : '#8b949e',
                      padding: '0.25rem 0.625rem',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontWeight: settings.defaultPageSize === size ? 600 : 400,
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Show merge commits */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1rem',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ color: '#dfe2eb', fontSize: '0.9375rem', fontWeight: 500 }}>
                  Show merge commits
                </div>
                <div style={{ color: '#8b949e', fontSize: '0.8125rem', marginTop: 2 }}>
                  Display merge commits in the graph
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.showMergeCommits}
                onClick={() =>
                  updateSettings({ showMergeCommits: !settings.showMergeCommits })
                }
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  border: 'none',
                  background: settings.showMergeCommits ? '#238636' : '#30363d',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: settings.showMergeCommits ? 23 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* About section */}
        <section>
          <h2
            style={{
              color: '#8b949e',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.75rem',
            }}
          >
            About
          </h2>
          <div
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1rem',
                justifyContent: 'space-between',
                borderBottom: '1px solid #21262d',
              }}
            >
              <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>Version</span>
              <span
                style={{
                  color: '#8b949e',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              >
                v{APP_VERSION}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1rem',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>Source</span>
              <a
                href="https://github.com/homeles/gne"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#58a6ff',
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline';
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none';
                }}
              >
                github.com/homeles/gne ↗
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
