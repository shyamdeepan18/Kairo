/**
 * Company + Plant listing routes
 * GET /api/companies            — companies the authenticated user has roles in
 * GET /api/companies/:id/plants — plants within a company
 *
 * These are intentionally minimal — full CRUD lives in Phase 1 Settings module.
 */

import type { FastifyInstance } from 'fastify';
import { db } from '@erp/db';
import { companies, plants, userRoles, documentNumberSeries, roles, companyLicense } from '@erp/db';
import { sql } from 'drizzle-orm';
import { seedCoaForCompany } from '@erp/db/seeds/coa';
import { eq, inArray, and } from 'drizzle-orm';

export default async function companyRoutes(app: FastifyInstance) {
  // ── GET /api/companies ────────────────────────────────────────────────────
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = (req.user as { id: string }).id;

      const isSystemAdmin = (req.user as any).isSystemAdmin;

      let companyIds: string[] = [];

      if (!isSystemAdmin) {
        // Find distinct companies where this user has any role
        const rows = await db
          .selectDistinct({ companyId: userRoles.companyId })
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        companyIds = rows.map((r) => r.companyId);
        if (companyIds.length === 0) return { companies: [] };
      }

      const query = db
        .select({
          id: companies.id,
          name: companies.name,
          legalName: companies.legalName,
          gstin: companies.gstin,
          baseCurrency: companies.baseCurrency,
          hasLicense: sql<boolean>`${companyLicense.id} IS NOT NULL`,
          licenseValidTo: companyLicense.validTo,
        })
        .from(companies)
        .leftJoin(companyLicense, eq(companyLicense.companyId, companies.id));

      const list = isSystemAdmin ? await query : await query.where(inArray(companies.id, companyIds));

      return { companies: list };
    }
  );

  // ── GET /api/companies/:companyId/plants ──────────────────────────────────
  app.get(
    '/:companyId/plants',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params as { companyId: string };

      const list = await db
        .select({
          id: plants.id,
          companyId: plants.companyId,
          name: plants.name,
          code: plants.code,
          gstin: plants.gstin,
        })
        .from(plants)
        .where(eq(plants.companyId, companyId));

      return { plants: list };
    }
  );

  // ── POST /api/companies/:companyId/bootstrap ──────────────────────────────
  app.post(
    '/:companyId/bootstrap',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params as { companyId: string };
      const isSystemAdmin = (req.user as any).isSystemAdmin;

      if (!isSystemAdmin) {
        return reply.code(403).send({ error: 'Only system admins can trigger company onboarding bootstrap' });
      }

      const [comp] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!comp) return reply.code(404).send({ error: 'Company not found' });

      // Seed default number series for Purchase, Sales, Manufacturing, Accounting & Inventory
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const fyStart = month >= 4 ? year : year - 1;
      const fiscalYear = `${String(fyStart).slice(-2)}${String(fyStart + 1).slice(-2)}`;

      const seriesDefs = [
        { documentType: 'purchase.requisition', prefix: 'PR' },
        { documentType: 'purchase.po', prefix: 'PO' },
        { documentType: 'purchase.grn', prefix: 'GRN' },
        { documentType: 'purchase.invoice', prefix: 'PINV' },
        { documentType: 'purchase.payment', prefix: 'PPAY' },
        { documentType: 'sales.quotation', prefix: 'QTN' },
        { documentType: 'sales.so', prefix: 'SO' },
        { documentType: 'sales.delivery', prefix: 'DN' },
        { documentType: 'sales.invoice', prefix: 'SINV' },
        { documentType: 'sales.payment', prefix: 'RCPT' },
        { documentType: 'manufacturing.bom', prefix: 'BOM' },
        { documentType: 'manufacturing.order', prefix: 'MO' },
        { documentType: 'accounting.jv', prefix: 'JV' },
      ];

      for (const s of seriesDefs) {
        await db
          .insert(documentNumberSeries)
          .values({
            companyId,
            documentType: s.documentType,
            fiscalYear,
            prefix: s.prefix,
            paddingDigits: 5,
            currentSequence: 0,
            isActive: true,
          })
          .onConflictDoNothing();
      }

      const userId = (req.user as any).id;
      
      // 2. Seed COA
      await seedCoaForCompany(companyId, userId);

      // 3. Assign Company Admin role to the user who triggered the bootstrap
      const [adminRole] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.name, 'Company Admin'), eq(roles.isSystemRole, true)))
        .limit(1);

      if (adminRole) {
        await db
          .insert(userRoles)
          .values({
            userId,
            roleId: adminRole.id,
            companyId,
            grantedBy: userId,
          })
          .onConflictDoNothing();
      }

      return reply.send({
        ok: true,
        message: `Company '${comp.name}' successfully bootstrapped with default number series for FY${fiscalYear}.`,
      });
    }
  );
}
