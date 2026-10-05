import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULTS, loadPreferences } from './preferences';
import { e2eHooks } from './e2eHooks';

const START_TIMEOUT_MS = 10000;

const PreferencesContext = createContext(null);

let opening = null;
const openStore = (onOneTab) => {
  opening ??= import('./evoluStore.js').then(({ openEvoluStore }) => openEvoluStore({ onOneTab }));
  return opening;
};

export function PreferencesProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [values, setValues] = useState(DEFAULTS);
  const [oneTab, setOneTab] = useState(false);
  const storeRef = useRef(null);

  useEffect(() => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      setStatus('failed');
    };
    const timer = setTimeout(fail, e2eHooks().startTimeoutMs ?? START_TIMEOUT_MS);
    openStore(() => setOneTab(true))
      .then(async (store) => {
        const loaded = await loadPreferences(store);
        if (settled) return;
        settled = true;
        storeRef.current = store;
        setValues(loaded);
        setStatus('ready');
      })
      .catch(fail)
      .finally(() => clearTimeout(timer));
    return () => {
      settled = true;
      clearTimeout(timer);
    };
  }, []);

  const setPreference = useCallback((key, value) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    storeRef.current?.writeSetting(key, value);
  }, []);

  return (
    <PreferencesContext.Provider value={{ status, oneTab, values, setPreference }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreference(key) {
  const { status, values, setPreference } = useContext(PreferencesContext);
  const setValue = useCallback((value) => setPreference(key, value), [key, setPreference]);
  return [values[key], setValue, status === 'loading'];
}
