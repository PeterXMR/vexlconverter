import React, { useState, Suspense, lazy } from 'react';
import ModeSwitch from './components/ModeSwitch';
import Converter from './components/Converter';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

const AlertManager = lazy(() => import('./components/AlertManager'));
const PriceChart = lazy(() => import('./components/PriceChart'));

function App() {
  const [mode, setMode] = useState('btc');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark">
          Vexl Converter <small>v0.2.0</small>
        </div>
        <ModeSwitch mode={mode} onModeChange={setMode} />
      </header>
      <main className="workspace">
        <section className="convert-pane">
          <ErrorBoundary>
            <Converter mode={mode} />
          </ErrorBoundary>
        </section>
        <section className="chart-pane">
          <ErrorBoundary>
            <Suspense fallback={<div className="panel">Loading chart…</div>}>
              <PriceChart />
            </Suspense>
          </ErrorBoundary>
        </section>
        <section className="alerts-pane">
          <ErrorBoundary>
            <Suspense fallback={<div className="panel">Loading alerts…</div>}>
              <AlertManager />
            </Suspense>
          </ErrorBoundary>
        </section>
      </main>
    </div>
  );
}

export default App;
