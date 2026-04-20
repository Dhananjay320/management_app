import React, { useEffect, useRef } from 'react';
import './SearchBar.css';

/**
 * SearchBar — the topbar search input with ⌘K / Ctrl+K keyboard shortcut hint.
 *
 * Props:
 *   - value, onChange
 *   - placeholder
 *   - onEnter: () => void       — called on Enter keypress
 *   - onShortcut: () => void    — called when user presses ⌘K / Ctrl+K anywhere on the page
 *   - icon: ReactNode           — defaults to a unicode magnifier (pass lucide Search if using)
 *   - width: number | string    — defaults to 320
 *
 * Usage:
 *   <SearchBar value={q} onChange={setQ} onEnter={runSearch} onShortcut={focus} />
 */
export default function SearchBar({
  value = '',
  onChange,
  placeholder = 'Search people, tasks, messages…',
  onEnter,
  onShortcut,
  icon,
  width = 320,
  className = '',
}) {
  const inputRef = useRef(null);

  // Detect platform for kbd hint
  const isMac = typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  const kbdLabel = isMac ? '⌘K' : 'Ctrl K';

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (inputRef.current) inputRef.current.focus();
        if (onShortcut) onShortcut();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onShortcut]);

  return (
    <div className={`ad-search ${className}`} style={{ width }}>
      <span className="ad-search__icon" aria-hidden="true">
        {icon || (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
      </span>
      <input
        ref={inputRef}
        type="text"
        className="ad-search__input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
        aria-label="Search"
      />
      <span className="ad-search__kbd" aria-hidden="true">{kbdLabel}</span>
    </div>
  );
}
