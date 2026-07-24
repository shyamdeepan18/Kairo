/**
 * Seed: System Admin User — Shyam18
 *
 * Creates the platform-owner system admin account.
 * Run from the ERP root (DATABASE_URL must be set in .env):
 *
 *   cd /Users/shyam18/SEGA/ERP && \
 *   DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) \
 *   npx tsx apps/api/src/seeds/system-admin.ts
 *
 * IMPORTANT: Change the password immediately after first login!
 */

import { db, users } from '@erp/db';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';

async function seedSystemAdmin() {
  const email = 'shyam18@kairo.com';
  const fullName = 'Shyam (System Admin)';

  // Check if already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.log(`[seed] System admin already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await argon2.hash('Shyam18');

  const [user] = await db.insert(users).values({
    email,
    passwordHash,
    fullName,
    isActive: true,
    isSystemAdmin: true,
  }).returning();

  console.log('');
  console.log('✅ System Admin created!');
  console.log('─────────────────────────────────────────');
  console.log(`   Email    : ${user.email}`);
  console.log(`   Password : Shyam18`);
  console.log(`   ID       : ${user.id}`);
  console.log('─────────────────────────────────────────');
  console.log('⚠️  Change this password on first login!');
  console.log('');

  process.exit(0);
}

seedSystemAdmin().catch((err) => {
  console.error('Failed to seed system admin:', err);
  process.exit(1);
});
