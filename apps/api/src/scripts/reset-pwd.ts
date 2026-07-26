import { db } from '@erp/db';
import { users } from '@erp/db/schema/admin';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

async function run() {
  const hash = await bcrypt.hash('12345678', 10);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.email, 'user1@g.com'));
  await db.update(users).set({ passwordHash: hash }).where(eq(users.email, 'user2@g.com'));
  console.log('Passwords reset to 12345678');
  process.exit(0);
}

run().catch(console.error);
