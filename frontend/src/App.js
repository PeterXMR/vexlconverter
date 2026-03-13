import React, { useState } from 'react';
import ModeSwitch from './components/ModeSwitch';
import Converter from './components/Converter';
import AlertManager from './components/AlertManager';
import PriceChart from './components/PriceChart';
import './App.css';

function App() {
  const [mode, setMode] = useState('btc');

  return (
    <div className="App">
      <div className="header">
        <h1>Vexl Converter</h1>
      </div>
      <ModeSwitch mode={mode} onModeChange={setMode} />
      <Converter mode={mode} />
      <div className="extra-sections">
        <PriceChart />
        <AlertManager />
      </div>
    </div>
  );
}

export default App;
