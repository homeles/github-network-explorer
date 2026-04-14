import { useState, useRef, useEffect } from 'react';

interface Props {
  branches: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

export default function BranchSelector({ branches, selected, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSelected = branches.length > 0 && selected.length === branches.length;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggleAll() {
    if (allSelected) {
      // Keep at least one selected — fall back to the first branch
      onChange(branches.slice(0, 1));
    } else {
      onChange([...branches]);
    }
  }

  function toggleBranch(name: string) {
    if (selected.includes(name)) {
      // Don't allow deselecting the last branch
      if (selected.length === 1) return;
      onChange(selected.filter((b) => b !== name));
    } else {
      onChange([...selected, name]);
    }
  }

  const label =
    allSelected
      ? 'All branches'
      : selected.length === 1
      ? (selected[0] ?? '')
      : `${selected.length} branches`;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        disabled={disabled}
        style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: '#dfe2eb',
          padding: '0.25rem 0.625rem',
          fontSize: '0.875rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          opacity: disabled ? 0.6 : 1,
          minWidth: 140,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ color: '#8b949e', fontSize: '0.6875rem', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 6,
            minWidth: 220,
            maxHeight: 300,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* All branches toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              borderBottom: '1px solid #21262d',
              color: '#dfe2eb',
              fontSize: '0.875rem',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: '#58a6ff', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 500 }}>All branches</span>
          </label>

          {/* Individual branches */}
          {branches.map((name) => {
            const isOnlySelected = selected.length === 1 && selected[0] === name;
            return (
              <label
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.75rem',
                  cursor: isOnlySelected ? 'default' : 'pointer',
                  color: '#dfe2eb',
                  fontSize: '0.875rem',
                  userSelect: 'none',
                  opacity: isOnlySelected ? 0.55 : 1,
                }}
                title={isOnlySelected ? 'At least one branch must be selected' : undefined}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  onChange={() => toggleBranch(name)}
                  disabled={isOnlySelected}
                  style={{ accentColor: '#58a6ff', cursor: isOnlySelected ? 'default' : 'pointer' }}
                />
                <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
