import 'fastify';
import '@fastify/jwt';
import type { AuthUser } from '@erp/shared';
import type { PermissionService } from '../services/permissions.js';
import type { DocumentConfigService } from '../services/document-config.js';
import type { NumberSeriesService } from '../services/number-series.js';
import type { AuditEngine } from '../services/audit-engine.js';
import type { StatusEngine } from '../services/status-engine.js';
import type { AccountMapService } from '../services/account-map.js';
import type { PostingEngine } from '../services/posting-engine.js';
import type { TaxEngine } from '../services/tax-engine.js';
import type { IrpClient } from '../services/irp-client.js';
import type { StockLedgerService } from '../services/stock-ledger.js';
import type { ValuationEngine } from '../services/valuation-engine.js';
import type { UomService } from '../services/uom-service.js';
import type { ApprovalEngine } from '../services/approval-engine.js';
import type { LicenseService } from '../services/license-service.js';

// Extend JWT payload so request.user is typed everywhere
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      sessionId: string;
      email: string;
      fullName: string;
      isSystemAdmin: boolean;
    };
    user: AuthUser & { sessionId: string };
  }
}

// Add all decorators to FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    // Phase 0 — auth
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>;

    // Phase 1 — permissions
    permissionService: PermissionService;

    // Phase 2 — document engine services
    docConfigService: DocumentConfigService;
    numberSeriesService: NumberSeriesService;
    statusEngine: typeof StatusEngine;
    auditEngine: AuditEngine;

    // Phase 3 — accounting / posting engine
    accountMapService: AccountMapService;
    postingEngine: PostingEngine;

    // Phase 4 — GST tax engine
    taxEngine: TaxEngine;
    irpClient: IrpClient;

    // Phase 5 — inventory core
    stockLedger: StockLedgerService;
    valuationEngine: ValuationEngine;
    uomService: UomService;

    // Permission roadmap item 2 — approval workflows + licensing
    approvalEngine: ApprovalEngine;
    licenseService: LicenseService;
  }
}
