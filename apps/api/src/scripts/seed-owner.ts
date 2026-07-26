import { db, permissions, roles, rolePermissions, userRoles } from '@erp/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function main() {
  const companyId = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';
  const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';

  // 1. Insert system.bypass_sod
  let [perm] = await db.select().from(permissions).where(eq(permissions.code, 'system.bypass_sod'));
  if (!perm) {
    [perm] = await db.insert(permissions).values({
      code: 'system.bypass_sod',
      module: 'system',
      action: 'bypass_sod',
      label: 'Bypass Segregation of Duties',
      description: 'Allows the user to approve documents they created or submitted.',
    }).returning();
    console.log('Inserted permission system.bypass_sod');
  }

  // 2. Create Owner role
  let [ownerRole] = await db.select().from(roles).where(and(eq(roles.name, 'Owner'), eq(roles.companyId, companyId)));
  if (!ownerRole) {
    [ownerRole] = await db.insert(roles).values({
      companyId,
      name: 'Owner',
      description: 'Company Owner',
      isSystemRole: false,
    }).returning();
    console.log('Created Owner role');
  }

  // 3. Assign permission to role
  const [rp] = await db.select().from(rolePermissions).where(and(eq(rolePermissions.roleId, ownerRole.id), eq(rolePermissions.permissionId, perm.id)));
  if (!rp) {
    await db.insert(rolePermissions).values({
      roleId: ownerRole.id,
      permissionId: perm.id,
    });
    console.log('Assigned permission to Owner role');
  }

  // 4. Assign role to User 1
  const [ur] = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, ownerRole.id)));
  if (!ur) {
    await db.insert(userRoles).values({
      userId,
      roleId: ownerRole.id,
      companyId,
    });
    console.log('Assigned Owner role to User 1');
  }

  console.log('Done');
  process.exit(0);
}

main().catch(console.error);
