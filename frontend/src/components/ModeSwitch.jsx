import './ModeSwitch.css';

const MODES = [
  { key: 'btc', label: 'BTC', desc: 'Bitcoin to fiat' },
  { key: 'crypto', label: 'Crypto', desc: 'Crypto to crypto' },
  { key: 'fiat', label: 'Fiat', desc: 'Fiat to fiat' },
  { key: 'both', label: 'All', desc: 'Any to any' },
];

function ModeSwitch({ mode, onModeChange, loading }) {
  if (loading) {
    return (
      <div className="mode-switch" role="tablist" aria-label="Conversion mode" aria-busy="true">
        {MODES.map((m) => (
          <span key={m.key} className="mode-btn mode-skeleton" aria-hidden="true">
            {m.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mode-switch" role="tablist" aria-label="Conversion mode">
      {MODES.map((m) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            className={`mode-btn ${active ? 'active' : ''}`}
            onClick={() => onModeChange(m.key)}
            type="button"
            title={m.desc}
            role="tab"
            aria-selected={active}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default ModeSwitch;
