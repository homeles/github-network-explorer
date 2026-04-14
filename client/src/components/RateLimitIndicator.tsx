import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { api } from '../lib/api.js';

function formatCountdown(resetTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = resetTimestamp - now;
  if (diff <= 0) return '0m 0s';
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}m ${s}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function RateLimitIndicator() {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['rate-limit'],
    queryFn: api.rateLimit,
    refetchInterval: 30000,
    staleTime: 25000,
  });

  if (!data) return null;

  const { limit, remaining, used, reset } = data;
  const ratio = limit > 0 ? remaining / limit : 1;
  const pct = ratio * 100;

  let ringColor = '#58a6ff';
  let textColor = '#8b949e';
  if (ratio < 0.05) {
    ringColor = '#f85149';
    textColor = '#f85149';
  } else if (ratio < 0.2) {
    ringColor = '#d29922';
    textColor = '#d29922';
  }

  // SVG ring params
  const size = 22;
  const cx = size / 2;
  const cy = size / 2;
  const r = 8;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      {/* Ring */}
      <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#30363d"
          strokeWidth={2.5}
        />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={2.5}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
        />
      </svg>

      {/* Text */}
      <span style={{ color: textColor, fontSize: '0.75rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(remaining)} / {formatNumber(limit)}
      </span>

      {/* Tooltip */}
      {tooltipVisible && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            zIndex: 1000,
            whiteSpace: 'nowrap',
            fontSize: '0.8125rem',
            color: '#c0c7d4',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Rate Limit:{' '}
            <span style={{ color: textColor }}>
              {formatNumber(remaining)} / {formatNumber(limit)}
            </span>{' '}
            remaining
          </div>
          <div style={{ color: '#8b949e', marginBottom: 2 }}>
            Resets in{' '}
            <span style={{ color: '#c0c7d4' }}>{formatCountdown(reset)}</span>
          </div>
          <div style={{ color: '#8b949e' }}>
            Used:{' '}
            <span style={{ color: '#c0c7d4' }}>{formatNumber(used)}</span> requests this hour
          </div>
        </div>
      )}
    </div>
  );
}
