/**
 * Security Cleanup: Neutralize insecure dev/test accounts.
 * Cannot DELETE due to FK constraints (audit log references).
 * Instead: strip isSystemAdmin + deactivate + scramble password.
 *
 * Run from apps/api:
 *   npx tsx --env-file=../../.env src/seeds/delete-dev-accounts.ts
 */

import { db, users } from '@erp/db';
import { inArray } from 'drizzle-orm';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';

const DEV_ACCOUNTS = [
  'admin@erp.com',
  'test@erp.com',
  'admin@test.com',
];

async function cleanup() {
  // Scramble the password to something random and unguessable
  const randomPwd = randomBytes(32).toString('hex');
  const scrambledHash = await argon2.hash(randomPwd);

  const updated = await db
    .update(users)
    .set({
      isActive: false,
      isSystemAdmin: false,
      passwordHash: scrambledHash, // random, no one can log in
      updatedAt: new Date(),
    })
    .where(inArray(users.email, DEV_ACCOUNTS))
    .returning({ email: users.email, isActive: users.isActive, isSystemAdmin: users.isSystemAdmin });

  if (updated.length > 0) {
    console.log('');
    console.log('✅ Dev accounts neutralized (deactivated + stripped of admin rights):');
    updated.forEach((u) => console.log(`   🔒 ${u.email} → isActive=${u.isActive}, isSystemAdmin=${u.isSystemAdmin}`));
    console.log('');
    console.log('These accounts still exist in the DB due to audit log FK constraints,');
    console.log('but cannot login and have no admin access.');
    console.log('');
  } else {
    console.log('ℹ️  No dev accounts found — already clean.');
  }

  process.exit(0);
}

cleanup().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
