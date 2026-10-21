import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { buildApp } from './app.js';

const config = loadConfig();
const handle = await openDb(config.databaseUrl);
await handle.migrate();
const app = await buildApp({ config, db: handle.db });

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
