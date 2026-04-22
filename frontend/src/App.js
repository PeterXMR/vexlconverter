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
    <div className="App">
      <div className="header">
        <h1>Vexl Converter</h1>
      </div>
      <ModeSwitch mode={mode} onModeChange={setMode} />
      <ErrorBoundary>
        <Converter mode={mode} />
      </ErrorBoundary>
      <div className="extra-sections">
        <ErrorBoundary>
          <Suspense fallback={<div>Loading…</div>}>
            <PriceChart />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary>
          <Suspense fallback={<div>Loading…</div>}>
            <AlertManager />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
