import * as argon2 from 'argon2';
import { db, users } from '@erp/db';
import { eq } from 'drizzle-orm';
async function run() {
  const hash = await argon2.hash('password123');
  await db.update(users).set({ passwordHash: hash }).where(eq(users.email, 'admin@erp.com'));
  console.log('Updated to new hash!');
  process.exit(0);
}
run();
