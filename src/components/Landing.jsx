import React from 'react';
import { Sun, Moon } from 'lucide-react';
import '../landing.css';

export function LandingNav({ onEnter, theme, onToggleTheme, active }) {
  const link = (id, label) => (
    <a
      href={`#${id}`}
      onClick={(e) => { e.preventDefault(); onEnter(id); }}
      className={active === id ? 'active' : ''}
      aria-current={active === id ? 'page' : undefined}
    >
      {label}
    </a>
  );
  return (
    <>
      <div className="land-navwrap">
        <nav className="land-nav" aria-label="Primary">
          <span className="land-brand" onClick={() => onEnter('dashboard')} style={{ cursor: 'pointer' }}><i>◈</i> VidyaVision</span>
          <span className="land-links">
            {link('dashboard', 'Dashboard')}
            {link('dialer', 'Dialer')}
            {link('calls', 'Calls')}
          </span>
          <span className="land-navright">
            <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button className="land-signup" onClick={() => onEnter('dialer')}>Start dialing</button>
          </span>
        </nav>
      </div>
    </>
  );
}
