import { useState, useRef, useEffect } from 'react';
import { useDateRange, TIME_RANGE_LABELS } from '../contexts/DateRangeContext.js';
import type { TimeRange } from '../contexts/DateRangeContext.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYMD(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtRange(since: string, until: string): string {
  const s = parseYMD(since);
  const u = parseYMD(until);
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const uStr = u.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${sStr} – ${uStr}`;
}

// ── CalendarMonth ─────────────────────────────────────────────────────────────

interface CalendarMonthProps {
  year: number;
  month: number; // 0-based
  selecting: string | null;
  rangeStart: string;
  rangeEnd: string;
  hoveredDate: string | null;
  onDayClick: (dateStr: string) => void;
  onDayHover: (dateStr: string | null) => void;
  todayStr: string;
}

function CalendarMonth({
  year, month, selecting, rangeStart, rangeEnd,
  hoveredDate, onDayClick, onDayHover, todayStr,
}: CalendarMonthProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build flat array of date strings (or null for padding)
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  // Compute effective range (preview while selecting)
  let effStart = rangeStart;
  let effEnd = rangeEnd;
  if (selecting) {
    const hov = hoveredDate ?? selecting;
    effStart = hov < selecting ? hov : selecting;
    effEnd = hov < selecting ? selecting : hov;
  }

  const singleDay = effStart === effEnd;
  const inRange = (d: string) => effStart && effEnd && d >= effStart && d <= effEnd;
  const isStart = (d: string) => d === effStart;
  const isEnd = (d: string) => d === effEnd;

  return (
    <div style={{ minWidth: 252 }}>
      {/* Month name */}
      <div style={{
        textAlign: 'center', fontWeight: 600, color: '#dfe2eb',
        marginBottom: 10, fontSize: '0.875rem', userSelect: 'none',
      }}>
        {monthLabel}
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 36px)', gap: 0 }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(wd => (
          <div key={wd} style={{
            width: 36, height: 28, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#8b949e', fontSize: '0.75rem',
            fontWeight: 500, userSelect: 'none',
          }}>
            {wd}
          </div>
        ))}

        {/* Day cells */}
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`pad-${i}`} style={{ width: 36, height: 36 }} />;
          }

          const inR = inRange(dateStr);
          const start = isStart(dateStr);
          const end = isEnd(dateStr);
          const today = dateStr === todayStr;
          const selected = (start || end) && Boolean(effStart && effEnd);

          // Strip background for range (the colored band between dates)
          let stripBg = 'transparent';
          let stripRadius: string | number = 0;
          if (inR && !singleDay) {
            stripBg = 'rgba(88,166,255,0.12)';
            if (start) stripRadius = '50% 0 0 50%';
            else if (end) stripRadius = '0 50% 50% 0';
          }

          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              onMouseEnter={() => onDayHover(dateStr)}
              onMouseLeave={() => onDayHover(null)}
              style={{
                width: 36, height: 36,
                background: stripBg,
                borderRadius: stripRadius,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%',
                background: selected ? '#58a6ff' : 'transparent',
                color: selected ? '#ffffff' : '#dfe2eb',
                fontSize: '0.8125rem',
                fontWeight: today ? 700 : 400,
                outline: today && !selected ? '2px solid rgba(88,166,255,0.45)' : 'none',
                outlineOffset: -2,
                transition: 'background 0.1s',
                userSelect: 'none',
              }}>
                {Number(dateStr.split('-')[2])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

export default function DateRangePicker() {
  const {
    timeRange, setTimeRange,
    customSince, setCustomSince,
    customUntil, setCustomUntil,
  } = useDateRange();

  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const today = new Date();
  const todayStr = toYMD(today);

  // navMonth is the RIGHT calendar; left calendar shows the previous month
  const [navYear, setNavYear] = useState(today.getFullYear());
  const [navMonth, setNavMonth] = useState(today.getMonth());

  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSelecting(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const buttonLabel = timeRange === 'all'
    ? 'All time'
    : (customSince && customUntil ? fmtRange(customSince, customUntil) : 'Pick dates');

  const handleDayClick = (dateStr: string) => {
    if (!selecting) {
      setSelecting(dateStr);
    } else {
      const start = dateStr < selecting ? dateStr : selecting;
      const end = dateStr < selecting ? selecting : dateStr;
      setCustomSince(start);
      setCustomUntil(end);
      setTimeRange('custom');
      setSelecting(null);
      setOpen(false);
    }
  };

  const prevMonth = () => {
    if (navMonth === 0) { setNavYear(y => y - 1); setNavMonth(11); }
    else setNavMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (navMonth === 11) { setNavYear(y => y + 1); setNavMonth(0); }
    else setNavMonth(m => m + 1);
  };

  const leftYear = navMonth === 0 ? navYear - 1 : navYear;
  const leftMonth = navMonth === 0 ? 11 : navMonth - 1;

  const navBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    color: '#8b949e',
    cursor: 'pointer',
    fontSize: '1.125rem',
    lineHeight: 1,
    padding: '4px 10px',
    userSelect: 'none',
    transition: 'color 0.1s, border-color 0.1s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
      {/* Preset dropdown */}
      <select
        value={timeRange}
        onChange={(e) => setTimeRange(e.target.value as TimeRange)}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 8,
          color: '#dfe2eb',
          padding: '0.375rem 0.75rem',
          fontSize: '0.875rem',
          cursor: 'pointer',
          height: 36,
          boxSizing: 'border-box',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none',
          paddingRight: '1.75rem',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b949e' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.5rem center',
        }}
      >
        {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((r) => (
          <option key={r} value={r}>{TIME_RANGE_LABELS[r]}</option>
        ))}
      </select>

      {/* Date range trigger button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (timeRange === 'all') return;
          setOpen(o => !o);
          if (open) setSelecting(null);
        }}
        style={{
          background: open ? 'rgba(88,166,255,0.08)' : '#161b22',
          border: `1px solid ${open ? '#58a6ff' : '#30363d'}`,
          borderRadius: 8,
          color: timeRange === 'all' ? '#484f58' : '#dfe2eb',
          padding: '0.375rem 0.75rem',
          fontSize: '0.875rem',
          cursor: timeRange === 'all' ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          whiteSpace: 'nowrap',
          transition: 'border-color 0.15s, background 0.15s',
          height: 36,
          boxSizing: 'border-box',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '0.875rem' }}>📅</span>
        {buttonLabel}
        {timeRange !== 'all' && (
          <span style={{ fontSize: '0.6rem', color: '#8b949e', marginLeft: 2 }}>▾</span>
        )}
      </button>

      {/* Calendar popup */}
      {open && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 1000,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 10,
            padding: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Navigation row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button style={navBtnStyle} onClick={prevMonth} title="Previous month">‹</button>
            {/* spacer — month names are rendered inside each CalendarMonth */}
            <div style={{ flex: 1 }} />
            <button style={navBtnStyle} onClick={nextMonth} title="Next month">›</button>
          </div>

          {/* Two-month calendars */}
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <CalendarMonth
              year={leftYear}
              month={leftMonth}
              selecting={selecting}
              rangeStart={customSince}
              rangeEnd={customUntil}
              hoveredDate={hoveredDate}
              onDayClick={handleDayClick}
              onDayHover={setHoveredDate}
              todayStr={todayStr}
            />
            <div style={{ width: 1, background: '#30363d', alignSelf: 'stretch' }} />
            <CalendarMonth
              year={navYear}
              month={navMonth}
              selecting={selecting}
              rangeStart={customSince}
              rangeEnd={customUntil}
              hoveredDate={hoveredDate}
              onDayClick={handleDayClick}
              onDayHover={setHoveredDate}
              todayStr={todayStr}
            />
          </div>

          {/* Hint during two-step selection */}
          {selecting && (
            <div style={{
              textAlign: 'center', color: '#8b949e', fontSize: '0.8125rem',
              paddingTop: 4, borderTop: '1px solid #21262d',
            }}>
              Now click an end date
            </div>
          )}
        </div>
      )}
    </div>
  );
}
