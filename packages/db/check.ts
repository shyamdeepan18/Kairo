import { db, users, userRoles, rolePermissions, permissions, companyModules } from './src/index.js';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';

async function check() {
  const [u] = await db.select().from(users).where(eq(users.fullName, 'User 1')).limit(1);
  if (!u) { console.log('User 1 not found'); process.exit(1); }
  console.log('User:', u.id, u.fullName, u.isSystemAdmin);

  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, u.id));
  console.log('Roles:', roles);

  if (roles.length > 0) {
    const perms = await db.select({ code: permissions.code }).from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roles[0].roleId));
    console.log('Perms count:', perms.length);
    const hasGrn = perms.some(p => p.code === 'purchase.grn.view');
    console.log('Has GRN view:', hasGrn);
  }

  const modules = await db.select().from(companyModules);
  console.log('Modules:', modules);

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const keys = await redis.keys('perms:*');
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log('Flushed perms cache!', keys.length, 'keys');
  } else {
    console.log('No keys to flush');
  }
  process.exit(0);
}
check().catch(console.error);
