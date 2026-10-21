import { loadConfig } from '../config.js';
import { openDb } from './client.js';

const config = loadConfig();
const handle = await openDb(config.databaseUrl);
await handle.migrate();
await handle.close();
console.log('Migracje zastosowane.');
