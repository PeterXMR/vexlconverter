import { readFileSync } from 'node:fs';

export const RELAY_PORT = 4000;

const adaptCsp = (policy) =>
  policy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && directive !== 'upgrade-insecure-requests')
    .map((directive) =>
      directive.startsWith('connect-src ') ? `${directive} ws://localhost:${RELAY_PORT}` : directive,
    )
    .join('; ');

export function productionPreviewHeaders() {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const { headers } = vercelConfig.headers.find(({ source }) => source === '/(.*)');
  return Object.fromEntries(
    headers.map(({ key, value }) => [key, key === 'Content-Security-Policy' ? adaptCsp(value) : value]),
  );
}
