import React from 'react';
import './ModeSwitch.css';

const MODES = [
  { key: 'btc', label: 'BTC', desc: 'Bitcoin to fiat' },
  { key: 'crypto', label: 'Crypto', desc: 'Crypto to crypto' },
  { key: 'fiat', label: 'Fiat', desc: 'Fiat to fiat' },
  { key: 'both', label: 'All', desc: 'Any to any' },
];

function ModeSwitch({ mode, onModeChange }) {
  return (
    <div className="mode-switch">
      {MODES.map((m) => (
        <button
          key={m.key}
          className={`mode-btn ${mode === m.key ? 'active' : ''}`}
          onClick={() => onModeChange(m.key)}
          type="button"
          title={m.desc}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default ModeSwitch;
