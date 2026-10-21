import { eq } from 'drizzle-orm';
import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { users } from './db/schema.js';
import { hashPassword } from './services/crypto.js';

/** Konta testowe do lokalnej gry i testów kooperacji. Nigdy w produkcji. */
export const SEED_PASSWORD = 'haslo-testowe-1';
export const SEED_USERS = [
  { email: 'detektyw1@example.com', displayName: 'Komisarz Kowal' },
  { email: 'detektyw2@example.com', displayName: 'Aspirant Nowak' },
];

const config = loadConfig();
if (config.env === 'production') {
  console.error('Seed jest zablokowany w środowisku produkcyjnym.');
  process.exit(1);
}
const handle = await openDb(config.databaseUrl);
await handle.migrate();
const passwordHash = await hashPassword(SEED_PASSWORD);
for (const u of SEED_USERS) {
  const [existing] = await handle.db.select().from(users).where(eq(users.email, u.email));
  if (!existing) await handle.db.insert(users).values({ ...u, passwordHash });
  console.log(`${u.email} / ${SEED_PASSWORD}`);
}
await handle.close();
