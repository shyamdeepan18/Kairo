import { db, userRoles, roles, rolePermissions, permissions } from '@erp/db';
import { eq } from 'drizzle-orm';
const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';

async function run() {
  const urs = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  for (const ur of urs) {
    const r = await db.select().from(roles).where(eq(roles.id, ur.roleId));
    console.log('Role:', r[0].name);
    
    const rps = await db.select().from(rolePermissions).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(eq(rolePermissions.roleId, ur.roleId));
    console.log('  Permissions:', rps.map(rp => rp.permissions.code).join(', '));
  }

  process.exit(0);
}
run().catch(console.error);
