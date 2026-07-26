import { db, userPermissions, permissions } from '@erp/db';
import { eq } from 'drizzle-orm';
const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';

async function run() {
  const rs = await db.select().from(userPermissions).innerJoin(permissions, eq(permissions.id, userPermissions.permissionId)).where(eq(userPermissions.userId, userId));
  console.log('User Permissions overrides:', rs);
  process.exit(0);
}
run().catch(console.error);
