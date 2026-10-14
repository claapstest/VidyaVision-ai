import React from 'react';
import { Sun, Moon } from 'lucide-react';
import '../landing.css';

export function LandingNav({ onEnter, theme, onToggleTheme }) {
  return (
    <>
      <div className="land-navwrap">
        <nav className="land-nav">
          <span className="land-brand" onClick={() => onEnter('dashboard')} style={{ cursor: 'pointer' }}><i>◈</i> VidyaVision</span>
          <span className="land-links">
            <a href="#dashboard" onClick={(e) => { e.preventDefault(); onEnter('dashboard'); }}>Dashboard</a>
            <a href="#dialer" onClick={(e) => { e.preventDefault(); onEnter('dialer'); }}>Dialer</a>
            <a href="#calls" onClick={(e) => { e.preventDefault(); onEnter('calls'); }}>Calls</a>
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
