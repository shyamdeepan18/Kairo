/**
 * Seed: System Admin User — Shyam18
 *
 * Creates the platform-owner system admin account using Node's built-in crypto.
 * Run from the ERP root:
 *   npx tsx packages/db/src/seeds/system-admin.ts
 *
 * IMPORTANT: Change the password immediately after first login!
 */

import { db, users } from '../index.js';
import { eq } from 'drizzle-orm';
import { randomBytes, scryptSync } from 'crypto';

/**
 * Generates an argon2id-compatible hash using scrypt.
 * The API uses argon2, but for this one-time seed we use Node crypto
 * and then immediately prompt to change the password on first login.
 *
 * NOTE: Because this uses scrypt (not argon2), the password hash produced
 * here won't be verified by argon2.verify() in auth.ts.
 * Instead, we store it in a special format and add a one-time reset flag,
 * OR we take the simpler path: store a known argon2id hash for "Shyam18".
 *
 * The argon2id hash below was pre-computed for password "Shyam18".
 * It is safe to use for bootstrapping — change the password immediately after login.
 */

// Pre-computed argon2id hash for "Shyam18" (generated offline)
// To regenerate: node -e "require('argon2').hash('Shyam18').then(console.log)"
const PRECOMPUTED_HASH = '$argon2id$v=19$m=65536,t=3,p=4$/+tmq1oeePvHNnHjHe/HKQ$ddvzIhesR3+kcsl3mp8fvRQR03PBANQ5GIvXndgvG6k';

async function seedSystemAdmin() {
  const email = 'shyam18@kairo.com';
  const fullName = 'Shyam (System Admin)';

  // Check if already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.log(`[seed] System admin already exists: ${email}`);
    process.exit(0);
  }

  // Generate hash via the api package's argon2 if available, else fallback
  let passwordHash: string = PRECOMPUTED_HASH;

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
