import { db, users } from '@erp/db';
import { eq } from 'drizzle-orm';

async function run() {
  try {
    const us = await db.select().from(users).where(eq(users.email, 'user1@g.com'));
    console.log('Is System Admin:', us[0].isSystemAdmin);
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}
run();
