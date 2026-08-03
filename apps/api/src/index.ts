import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import redisPlugin from './plugins/redis.js';
import enginesPlugin from './plugins/engines.js';
import accountingPlugin from './plugins/accounting.js';
import taxPlugin from './plugins/tax.js';
import inventoryPlugin from './plugins/inventory.js';
import salesPlugin from './plugins/sales.js';
import manufacturingPlugin from './plugins/manufacturing.js';
import governancePlugin from './plugins/governance.js';
import auditPlugin from './plugins/audit.js';
import authRoutes from './routes/auth.js';
import companyRoutes from './routes/companies.js';
import settingsRoutes from './routes/settings.js';
import mastersRoutes from './routes/masters.js';
import purchaseRoutes from './routes/purchase.js';
import inventoryApiRoutes from './routes/inventory.js';
import salesRoutes from './routes/sales.js';
import manufacturingRoutes from './routes/manufacturing.js';
import governanceRoutes from './routes/governance.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import { PermissionService } from './services/permissions.js';

const app = Fastify({
  logger: {
    level: config.isProd ? 'info' : 'debug',
    transport: config.isProd
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
  },
  trustProxy: true,  // needed for correct req.ip behind nginx/docker
});

async function start() {
  // CORS — only the configured origin may make credentialed requests (allow any localhost port in dev)
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!config.isProd) {
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }
      }
      if (origin === config.cors.origin) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Redis — used by PermissionService cache
  await app.register(redisPlugin);

  // Auth plugin: JWT + cookie support + authenticate decorator
  await app.register(authPlugin);

  // Global Audit logging plugin for mutations
  await app.register(auditPlugin);

  // PermissionService — available on every request via app.permissionService
  app.decorate('permissionService', new PermissionService(app.redis));

  // Phase 2: Document Engine services (docConfigService, numberSeriesService, statusEngine, auditEngine)
  await app.register(enginesPlugin);

  // Phase 3: Accounting (accountMapService, postingEngine with all built-in templates)
  await app.register(accountingPlugin);

  // Phase 4: Tax Engine (taxEngine, irpClient)
  await app.register(taxPlugin);

  // Phase 5: Inventory Core (stockLedger, valuationEngine, uomService)
  await app.register(inventoryPlugin);

  // Phase 7: Sales wiring — registers sales.delivery COGS template + sales.payment status transitions
  await app.register(salesPlugin);

  // Phase 8: Manufacturing wiring — registers manufacturing.bom status transitions
  await app.register(manufacturingPlugin);

  // Permission roadmap item 2: approval workflows + licensing (approvalEngine, licenseService)
  await app.register(governancePlugin);

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  // Company + plant listing (minimal, used by UI company selector)
  await app.register(companyRoutes, { prefix: '/api/companies' });
  // Settings: company CRUD, users, roles/permissions, COA
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  // Phase 2 (UI): Master data — suppliers, customers, items, item groups, UOM
  await app.register(mastersRoutes, { prefix: '/api/masters' });
  // Phase 6: Purchase module (PR → PO → GRN → Invoice → Payment)
  await app.register(purchaseRoutes, { prefix: '/api/purchase' });
  // Inventory module: stock balances, ledger, adjustments, transfers
  await app.register(inventoryApiRoutes, { prefix: '/api/inventory' });
  // Phase 7: Sales module (Quotation → SO → Delivery → Invoice → Receipt)
  await app.register(salesRoutes, { prefix: '/api/sales' });
  // Phase 8: Manufacturing module (Formula → Production Order → Issue → Receive → Close)
  await app.register(manufacturingRoutes, { prefix: '/api/manufacturing' });
  // Permission item 2: approval workflows + module/license governance
  await app.register(governanceRoutes, { prefix: '/api/governance' });
  // Phase 10: Reports module
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  // System Admin portal — platform-owner only (isSystemAdmin = true)
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // Health check — used by Docker healthcheck and load balancers
  app.get('/health', async () => ({
    status: 'ok',
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV,
  }));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API listening on ${config.host}:${config.port}`);
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
