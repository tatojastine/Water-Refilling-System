import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createMongoStore } from './mongo-store.mjs';

export { createApp } from './app.mjs';

function start() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const production = process.env.NODE_ENV === 'production';
  const host = process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1');
  const port = Number(process.env.PORT ?? 8765);
  const localOnly = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const secureCookies = production || process.env.AQUA_SECURE_COOKIES === '1';
  const uri = process.env.MONGODB_URI?.trim();
  const clientUrl = process.env.CLIENT_URL?.trim() || undefined;

  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (!localOnly && !production && process.env.AQUA_ALLOW_NETWORK !== '1') {
    throw new Error('Set AQUA_ALLOW_NETWORK=1 to explicitly enable non-production network access.');
  }
  if (clientUrl) {
    const url = URL.parse(clientUrl);
    if (!url || url.origin !== clientUrl || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('CLIENT_URL must be an exact http or https origin, with no path or trailing slash.');
    }
  }
  if (production && !clientUrl?.startsWith('https://')) throw new Error('Production requires an HTTPS CLIENT_URL.');
  if (production && !uri) throw new Error('Production requires MONGODB_URI.');

  const store = uri ? createMongoStore({ uri, database: process.env.MONGODB_DB?.trim() || undefined }) : undefined;
  const server = createApp({
    dataFile: process.env.AQUA_DATA_FILE,
    store,
    localOnly: !production && localOnly,
    secureCookies,
    clientUrl,
    serveFrontend: !production,
  });
  server.listen(port, host, () => {
    const address = server.address();
    const displayHost = host.includes(':') ? `[${host}]` : host;
    console.log(`AquaRefresh listening on http://${displayHost}:${address.port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => {
        Promise.resolve(store?.close()).catch(() => { process.exitCode = 1; });
      });
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
