import { PermissionService } from '../services/permissions.js';
import Redis from 'ioredis';
import { db } from '@erp/db';

const redis = new Redis('redis://localhost:6379');
const svc = new PermissionService(redis);

const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';
const companyId = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';
const plantId = '0e2ad5ed-14c3-4036-98ce-bed2c9e378c2';

async function run() {
  const perms = await svc.getEffectivePermissions(userId, companyId, plantId);
  console.log('Perms count:', perms.size);
  console.log('Has purchase.grn.create:', perms.has('purchase.grn.create'));
  console.log('Has system.bypass_sod:', perms.has('system.bypass_sod'));
  
  const plantAccess = await svc.hasPlantAccess(userId, plantId);
  console.log('Has plant access:', plantAccess);
  process.exit(0);
}
run().catch(console.error);
