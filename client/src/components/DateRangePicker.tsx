import { useDateRange, TIME_RANGE_LABELS } from '../contexts/DateRangeContext.js';
import type { TimeRange } from '../contexts/DateRangeContext.js';

export default function DateRangePicker() {
  const { timeRange, setTimeRange, customSince, setCustomSince, customUntil, setCustomUntil } =
    useDateRange();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      <select
        value={timeRange}
        onChange={(e) => setTimeRange(e.target.value as TimeRange)}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: '#dfe2eb',
          padding: '0.25rem 0.5rem',
          fontSize: '0.8125rem',
          cursor: 'pointer',
        }}
      >
        {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((r) => (
          <option key={r} value={r}>
            {TIME_RANGE_LABELS[r]}
          </option>
        ))}
      </select>

      <span style={{ color: '#30363d', fontSize: '0.75rem', padding: '0 0.125rem' }}>|</span>

      <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>From</span>
      <input
        type="date"
        value={customSince}
        disabled={timeRange === 'all'}
        onChange={(e) => {
          setCustomSince(e.target.value);
          setTimeRange('custom');
        }}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: timeRange === 'all' ? '#484f58' : '#dfe2eb',
          padding: '0.25rem 0.375rem',
          fontSize: '0.8125rem',
          cursor: timeRange === 'all' ? 'default' : 'pointer',
          colorScheme: 'dark',
        }}
      />
      <span style={{ color: '#8b949e', fontSize: '0.8125rem' }}>To</span>
      <input
        type="date"
        value={customUntil}
        disabled={timeRange === 'all'}
        onChange={(e) => {
          setCustomUntil(e.target.value);
          setTimeRange('custom');
        }}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: timeRange === 'all' ? '#484f58' : '#dfe2eb',
          padding: '0.25rem 0.375rem',
          fontSize: '0.8125rem',
          cursor: timeRange === 'all' ? 'default' : 'pointer',
          colorScheme: 'dark',
        }}
      />
    </div>
  );
}
