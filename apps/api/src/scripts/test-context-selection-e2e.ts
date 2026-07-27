import Fastify from 'fastify';
import authPlugin from '../plugins/auth.js';
import redisPlugin from '../plugins/redis.js';
import enginesPlugin from '../plugins/engines.js';
import governancePlugin from '../plugins/governance.js';
import authRoutes from '../routes/auth.js';
import { resolveTenantContext } from '../middleware/tenant-context.js';
import { PermissionService } from '../services/permissions.js';
import {
  db, users, sessions, companies, plants, companyUsers, userPlantAccess,
} from '@erp/db';
import argon2 from 'argon2';
import { eq, inArray } from 'drizzle-orm';
import assert from 'node:assert';

async function runE2ETests() {
  console.log('🚀 Starting Context Selection E2E Integration Tests...\n');

  // 1. Setup Test Fastify App instance
  const app = Fastify({ logger: false });

  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(enginesPlugin);
  await app.register(governancePlugin);
  app.decorate('permissionService', new PermissionService(app.redis));

  await app.register(authRoutes, { prefix: '/api/auth' });

  // Test route protected by resolveTenantContext
  app.get('/api/test-tenant', { preHandler: [app.authenticate, resolveTenantContext] }, async (request) => {
    return { ok: true, tenant: request.tenant };
  });

  await app.ready();

  // 2. Seed Test DB Fixtures
  console.log('📦 Seeding test fixtures in DB...');
  const testRunId = Date.now().toString().slice(-6);

  // Clean up any existing test records matching our pattern
  const user1Email = `e2e_user1_${testRunId}@test.com`;
  const user2Email = `e2e_user2_${testRunId}@test.com`;
  const sysAdminEmail = `e2e_admin_${testRunId}@test.com`;
  const defaultPassword = 'TestPassword123!';
  const pwdHash = await argon2.hash(defaultPassword);

  // Create test companies
  const [companyA] = await db.insert(companies).values({
    name: `E2E Co A ${testRunId}`,
    legalName: `E2E Co A Legal ${testRunId}`,
    baseCurrency: 'INR',
    isActive: true,
  }).returning();

  const [companyB] = await db.insert(companies).values({
    name: `E2E Co B ${testRunId}`,
    legalName: `E2E Co B Legal ${testRunId}`,
    baseCurrency: 'INR',
    isActive: true,
  }).returning();

  // Create test plants
  const [plantA1] = await db.insert(plants).values({
    companyId: companyA.id,
    name: `Plant A1 ${testRunId}`,
    code: `PA1_${testRunId}`,
    isActive: true,
  }).returning();

  const [plantB1] = await db.insert(plants).values({
    companyId: companyB.id,
    name: `Plant B1 ${testRunId}`,
    code: `PB1_${testRunId}`,
    isActive: true,
  }).returning();

  // Create Users
  const [user1] = await db.insert(users).values({
    email: user1Email,
    passwordHash: pwdHash,
    fullName: 'E2E Regular User 1',
    isActive: true,
    isSystemAdmin: false,
  }).returning();

  const [user2] = await db.insert(users).values({
    email: user2Email,
    passwordHash: pwdHash,
    fullName: 'E2E Regular User 2',
    isActive: true,
    isSystemAdmin: false,
  }).returning();

  const [sysAdmin] = await db.insert(users).values({
    email: sysAdminEmail,
    passwordHash: pwdHash,
    fullName: 'E2E System Admin',
    isActive: true,
    isSystemAdmin: true,
  }).returning();

  // Bind memberships: User 1 -> Company A, User 2 -> Company B
  await db.insert(companyUsers).values([
    { companyId: companyA.id, userId: user1.id, isActive: true },
    { companyId: companyB.id, userId: user2.id, isActive: true },
  ]);

  // Grant User 1 plant access to Plant A1
  await db.insert(userPlantAccess).values([
    { companyId: companyA.id, userId: user1.id, plantId: plantA1.id },
  ]);


  console.log('✅ Fixtures seeded successfully.\n');


  try {
    // ── STEP 1: User 1 Login ───────────────────────────────────────────────
    console.log('Test 1: Login User 1 (no active context by default)');
    const loginRes1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user1Email, password: defaultPassword },
    });
    assert.strictEqual(loginRes1.statusCode, 200, 'Login should succeed with 200');
    const loginData1 = JSON.parse(loginRes1.body);
    const token1 = loginData1.accessToken;
    assert.ok(token1, 'Access token should be returned');
    
    // Parse refresh cookie
    const refreshCookieHeader = loginRes1.headers['set-cookie'] as string;
    assert.ok(refreshCookieHeader, 'Set-Cookie header for refresh token should exist');
    const refreshToken1Match = refreshCookieHeader.match(/refresh_token=([^;]+)/);
    assert.ok(refreshToken1Match, 'Refresh token cookie value extracted');
    const refreshToken1 = refreshToken1Match[1];
    console.log('  ✔ User 1 logged in successfully.');

    // ── STEP 2: Access Tenant-Protected Endpoint without context ───────────
    console.log('Test 2: Access tenant-protected route prior to context selection');
    const protectedRes1 = await app.inject({
      method: 'GET',
      url: '/api/test-tenant',
      headers: { authorization: `Bearer ${token1}` },
    });
    assert.strictEqual(protectedRes1.statusCode, 409, 'Should return 409 Conflict');
    const protectedBody1 = JSON.parse(protectedRes1.body);
    assert.strictEqual(protectedBody1.error, 'tenant_context_required', 'Error must be tenant_context_required');
    console.log('  ✔ Received expected 409 tenant_context_required.');


    // ── STEP 3: Get Context Options ─────────────────────────────────────────
    console.log('Test 3: Fetch available context options for User 1');
    const optionsRes1 = await app.inject({
      method: 'GET',
      url: '/api/auth/context-options',
      headers: { authorization: `Bearer ${token1}` },
    });
    assert.strictEqual(optionsRes1.statusCode, 200, 'Context options should return 200');
    const optionsData1 = JSON.parse(optionsRes1.body);
    const user1Companies = optionsData1.companies;
    assert.strictEqual(user1Companies.length, 1, 'User 1 should only see Company A');
    assert.strictEqual(user1Companies[0].id, companyA.id, 'Company ID must match Company A');
    console.log('  ✔ Correct context options returned.');

    // ── STEP 4: Attempt Unauthorized Context Selection ─────────────────────
    console.log('Test 4: Attempt to select unauthorized Company B');
    const selectUnauthorizedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/select-context',
      headers: { authorization: `Bearer ${token1}` },
      payload: { companyId: companyB.id },
    });
    assert.strictEqual(selectUnauthorizedRes.statusCode, 403, 'Selecting non-member company must return 403');
    console.log('  ✔ Unauthorized selection blocked with 403.');

    // ── STEP 5: Attempt Invalid Plant Selection ─────────────────────────────
    console.log('Test 5: Attempt to select Plant B1 for Company A');
    const selectInvalidPlantRes = await app.inject({
      method: 'POST',
      url: '/api/auth/select-context',
      headers: { authorization: `Bearer ${token1}` },
      payload: { companyId: companyA.id, plantId: plantB1.id },
    });
    assert.strictEqual(selectInvalidPlantRes.statusCode, 404, 'Plant from wrong company must return 404');
    console.log('  ✔ Mismatched plant selection rejected with 404.');

    // ── STEP 6: Valid Context Selection ────────────────────────────────────
    console.log('Test 6: Valid selection of Company A & Plant A1');
    const selectValidRes = await app.inject({
      method: 'POST',
      url: '/api/auth/select-context',
      headers: { authorization: `Bearer ${token1}` },
      payload: { companyId: companyA.id, plantId: plantA1.id },
    });
    assert.strictEqual(selectValidRes.statusCode, 200, 'Valid context selection must return 200');
    const selectValidData = JSON.parse(selectValidRes.body);
    const boundToken = selectValidData.accessToken;
    assert.ok(boundToken, 'New context-bound access token returned');
    assert.strictEqual(selectValidData.context.companyId, companyA.id);
    assert.strictEqual(selectValidData.context.plantId, plantA1.id);
    console.log('  ✔ Valid context selected and new access token issued.');

    // ── STEP 7: Verify Database State ──────────────────────────────────────
    console.log('Test 7: Verify session record in PostgreSQL database');
    const jwtPayload = app.jwt.decode<{ sessionId: string }>(boundToken)!;
    const [dbSession] = await db
      .select({
        id: sessions.id,
        activeCompanyId: sessions.activeCompanyId,
        activePlantId: sessions.activePlantId,
      })
      .from(sessions)
      .where(eq(sessions.id, jwtPayload.sessionId))
      .limit(1);
    assert.ok(dbSession, 'Session record must exist in DB');
    assert.strictEqual(dbSession.activeCompanyId, companyA.id, 'DB activeCompanyId must match Company A');
    assert.strictEqual(dbSession.activePlantId, plantA1.id, 'DB activePlantId must match Plant A1');
    console.log('  ✔ Session table updated with active_company_id & active_plant_id.');

    // ── STEP 8: Access Protected Route WITH Context ────────────────────────
    console.log('Test 8: Access tenant-protected route with context-bound token');
    const protectedWithContextRes = await app.inject({
      method: 'GET',
      url: '/api/test-tenant',
      headers: { authorization: `Bearer ${boundToken}` },
    });
    assert.strictEqual(protectedWithContextRes.statusCode, 200, 'Must return 200 OK');
    const tenantBody = JSON.parse(protectedWithContextRes.body);
    assert.strictEqual(tenantBody.ok, true);
    assert.strictEqual(tenantBody.tenant.companyId, companyA.id);
    assert.strictEqual(tenantBody.tenant.activePlantId, plantA1.id);
    console.log(`  ✔ Request passed tenant context validation (Company: ${tenantBody.tenant.companyId}, Plant: ${tenantBody.tenant.activePlantId}).`);


    // ── STEP 9: Refresh Token Preserves Context ────────────────────────────
    console.log('Test 9: Token refresh preserves bound tenant context');
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: refreshToken1 },
    });
    assert.strictEqual(refreshRes.statusCode, 200, 'Refresh must succeed');
    const refreshData = JSON.parse(refreshRes.body);
    const refreshedToken = refreshData.accessToken;
    const refreshedPayload = app.jwt.decode<{ activeCompanyId?: string; activePlantId?: string }>(refreshedToken)!;
    assert.strictEqual(refreshedPayload.activeCompanyId, companyA.id, 'Refreshed token must carry activeCompanyId');
    assert.strictEqual(refreshedPayload.activePlantId, plantA1.id, 'Refreshed token must carry activePlantId');
    console.log('  ✔ Refreshed access token successfully preserved tenant context from session.');

    // ── STEP 10: System Admin Context Capabilities ─────────────────────────
    console.log('Test 10: System Admin context options and cross-company selection');
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: sysAdminEmail, password: defaultPassword },
    });
    const adminToken = JSON.parse(adminLoginRes.body).accessToken;

    const adminOptionsRes = await app.inject({
      method: 'GET',
      url: '/api/auth/context-options',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminCompanies = JSON.parse(adminOptionsRes.body).companies;
    const adminCompIds = adminCompanies.map((c: any) => c.id);
    assert.ok(adminCompIds.includes(companyA.id) && adminCompIds.includes(companyB.id), 'Admin sees all active companies');

    const adminSelectRes = await app.inject({
      method: 'POST',
      url: '/api/auth/select-context',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { companyId: companyB.id, plantId: plantB1.id },
    });
    assert.strictEqual(adminSelectRes.statusCode, 200, 'System admin can select Company B');
    console.log('  ✔ System Admin context selection verified.');

    console.log('\n🎉 ALL 10 CONTEXT SELECTION INTEGRATION TESTS PASSED PERFECTLY!\n');
  } finally {
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await db.delete(userPlantAccess).where(inArray(userPlantAccess.userId, [user1.id, user2.id, sysAdmin.id]));
    await db.delete(companyUsers).where(inArray(companyUsers.userId, [user1.id, user2.id, sysAdmin.id]));
    await db.delete(sessions).where(inArray(sessions.userId, [user1.id, user2.id, sysAdmin.id]));
    await db.delete(users).where(inArray(users.id, [user1.id, user2.id, sysAdmin.id]));
    await db.delete(plants).where(inArray(plants.id, [plantA1.id, plantB1.id]));
    await db.delete(companies).where(inArray(companies.id, [companyA.id, companyB.id]));
    console.log('  ✔ Cleanup complete.');
    await app.close();
  }

}

runE2ETests().catch((err) => {
  console.error('❌ E2E Integration Test Failed:', err);
  process.exit(1);
});
