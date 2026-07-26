import { db, userPlantAccess, users, permissions, rolePermissions, userRoles, roles } from '@erp/db';
import { eq } from 'drizzle-orm';
const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';

async function run() {
  const u = await db.select().from(users).where(eq(users.id, userId));
  console.log('User:', u);
  
  const plants = await db.select().from(userPlantAccess).where(eq(userPlantAccess.userId, userId));
  console.log('Plants:', plants);
  
  const urs = await db.select().from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, userId));
  console.log('Roles:', urs.map(r => r.roles.name));

  process.exit(0);
}
run().catch(console.error);
