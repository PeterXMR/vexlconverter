import {
  AppName,
  Mnemonic,
  NonEmptyTrimmedString100,
  NonEmptyTrimmedString1000,
  createAppOwner,
  createEvolu,
  createIdFromString,
  createOwnerSecret,
  createQueryBuilder,
  createRandomBytes,
  createRun,
  id,
  mnemonicToOwnerSecret,
  ownerSecretToMnemonic,
} from '@evolu/common';
import { createEvoluDeps } from '@evolu/web';
import { e2eHooks, reportPendingWrites } from './e2eHooks';

const OWNER_SECRET_KEY = 'vexl.evolu.ownerSecret';
const DEFAULT_SERVER_URL = 'wss://free.evoluhq.com';

const SettingId = id('Setting');

const Schema = {
  setting: {
    id: SettingId,
    key: NonEmptyTrimmedString100,
    value: NonEmptyTrimmedString1000,
  },
};

const createQuery = createQueryBuilder(Schema);

const allSettings = createQuery((db) =>
  db
    .selectFrom('setting')
    .select(['key', 'value'])
    .where('isDeleted', 'is not', 1)
    .where('key', 'is not', null)
    .where('value', 'is not', null),
);

const serverUrls = () => {
  const configured = (import.meta.env.VITE_EVOLU_SERVER_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.startsWith('wss://') || url.startsWith('ws://'));
  return configured.length > 0 ? configured : [DEFAULT_SERVER_URL];
};

let pendingWrites = 0;

const trackWrite = (write) => {
  pendingWrites += 1;
  reportPendingWrites(pendingWrites);
  write(() => {
    pendingWrites -= 1;
    reportPendingWrites(pendingWrites);
  });
};

const readOrCreateOwnerSecret = () => {
  const stored = Mnemonic.fromUnknown(localStorage.getItem(OWNER_SECRET_KEY));
  if (stored.ok) return { secret: mnemonicToOwnerSecret(stored.value), isNewIdentity: false };
  const secret = createOwnerSecret({ randomBytes: createRandomBytes() });
  localStorage.setItem(OWNER_SECRET_KEY, ownerSecretToMnemonic(secret));
  return { secret, isNewIdentity: true };
};

export async function openEvoluStore({ onOneTab }) {
  const hooks = e2eHooks();
  if (hooks.evolu === 'hang') return new Promise(() => {});
  if (hooks.evolu === 'one-tab') globalThis.SharedWorker = undefined;

  const { secret, isNewIdentity } = readOrCreateOwnerSecret();
  const run = createRun(createEvoluDeps({ onSharedWorkerUnsupported: onOneTab }));
  const evolu = await run.ok(
    createEvolu(Schema, {
      appName: AppName.orThrow('vexlconverter'),
      appOwner: createAppOwner(secret),
      transports: serverUrls().map((url) => ({ type: 'WebSocket', url })),
    }),
  );

  return {
    isNewIdentity,
    readSettings: async () => {
      const rows = await evolu.loadQuery(allSettings);
      return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
    },
    writeSetting: (key, value) => {
      trackWrite((onComplete) => evolu.upsert('setting', { id: createIdFromString(key), key, value }, { onComplete }));
    },
  };
}
