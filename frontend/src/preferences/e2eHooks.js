const enabled = import.meta.env.VITE_E2E === '1';

export const e2eHooks = () => (enabled ? (globalThis.__vexlE2E ?? {}) : {});

export const reportPendingWrites = (count) => {
  if (enabled) globalThis.__vexlE2E = { ...globalThis.__vexlE2E, pendingWrites: count };
};
