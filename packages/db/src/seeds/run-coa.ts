import { db, companies, users } from '../index.js';
import { seedCoaForCompany } from './coa.js';

async function run() {
  const allComps = await db.select().from(companies);
  const allUsers = await db.select().from(users);
  const adminUser = allUsers.find(u => u.email === 'admin@erp.com') || allUsers[0];
  if (!adminUser) {
    console.log("No user found");
    process.exit(1);
  }
  for (const c of allComps) {
    console.log(`Seeding COA for company ${c.name} (${c.id})...`);
    await seedCoaForCompany(c.id, adminUser.id);
  }
  process.exit(0);
}
run();
