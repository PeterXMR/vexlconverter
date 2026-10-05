import '@testing-library/jest-dom';
import { vi } from 'vitest';

// axios is ESM-only in 1.x. Mock it at the Vitest level so component
// imports resolve in the jsdom test environment without hitting the
// network.
vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
  get: vi.fn(() => Promise.resolve({ data: {} })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock('./preferences/evoluStore.js', () => ({
  openEvoluStore: async () => ({
    isNewIdentity: true,
    readSettings: async () => ({}),
    writeSetting: () => {},
  }),
}));
