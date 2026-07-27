import type { FastifyRequest, FastifyReply } from 'fastify';
import { PermissionService } from '../services/permissions.js';

/**
 * Dot-path getter — reads a value from a nested object using a string path.
 * e.g. get(request, 'body.plantId') → request.body.plantId
 */
function get(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * authorize() — factory that returns a Fastify preHandler.
 *
 * Usage:
 *
 *   // 1. Simple permission check
 *   { preHandler: [app.authenticate, authorize('purchase.po.view')] }
 *
 *   // 2. With plant scope — checks user has access to the plant in the request
 *   { preHandler: [app.authenticate, authorize('purchase.po.create', {
 *       plantFrom: 'body.plantId',
 *   })] }
 *
 *   // 3. With approval amount limit
 *   { preHandler: [app.authenticate, authorize('purchase.po.approve', {
 *       plantFrom: 'body.plantId',
 *       amountFrom: 'body.totalAmount',   // amount in paise
 *       docType: 'purchase.po',
 *   })] }
 *
 * Requires app.authenticate to run first (populates request.user).
 * Requires app.permissionService to be decorated on the Fastify instance.
 */
export function authorize(
  permissionCode: string,
  opts?: {
    /** Dot-path into request object for the plant ID. e.g. 'body.plantId' or 'params.plantId' */
    plantFrom?: string;
    /** Dot-path into request object for the warehouse ID. e.g. 'body.warehouseId' */
    warehouseFrom?: string;
    /** Dot-path into request for the monetary amount (in paise). Used with docType. */
    amountFrom?: string;
    /** Document type for amount limit check. e.g. 'purchase.po'. Required if amountFrom is set. */
    docType?: string;
    /**
     * Skip the plant/warehouse operational access checks (steps 2 & 3), keeping
     * only the permission-code check. Use on configuration routes where a
     * `plantId`/`warehouseId` in the params or body names the object being
     * administered — not an operational scope the caller must already have
     * access to. Without this, e.g. editing a plant in Settings would require the
     * admin to hold an explicit userPlantAccess grant for that plant.
     */
    noScope?: boolean;
  }
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as any;
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // System admin bypasses all checks
    if (user.isSystemAdmin) return;

    const svc: PermissionService = (request.server as any).permissionService;
    // Tenant identity comes ONLY from the trusted, server-bound context that
    // resolveTenantContext derived from the verified JWT. Client-supplied
    // company hints (x-company-id header, body/params/query) are never trusted —
    // every authorize()d route runs resolveTenantContext first in its preHandler
    // chain, so request.tenant is always populated by the time we get here.
    const companyId: string | undefined = request.tenant?.companyId;

    if (!companyId) {
      // resolveTenantContext missing from the chain (programming error) or no
      // active company bound — either way we cannot resolve permissions safely.
      return reply.code(400).send({ error: 'Company context required' });
    }

    const plantId: string | undefined = opts?.plantFrom
      ? get(request, opts.plantFrom)
      : (request.headers['x-plant-id'] as string | undefined) ??
        (request as any).plantId ??
        get(request, 'body.plantId') ??
        get(request, 'params.plantId') ??
        (request.query as any)?.plantId;

    const warehouseId: string | undefined = opts?.warehouseFrom
      ? get(request, opts.warehouseFrom)
      : (request.headers['x-warehouse-id'] as string | undefined) ??
        (request as any).warehouseId ??
        get(request, 'body.warehouseId') ??
        get(request, 'params.warehouseId') ??
        (request.query as any)?.warehouseId;

    // ── Step 1: permission code check ──────────────────────────────────────
    const allowed = await svc.check(user.id, permissionCode, companyId, plantId);
    if (!allowed) {
      return reply.code(403).send({
        error: 'Forbidden',
        detail: `Missing permission: ${permissionCode}`,
      });
    }

    // ── Step 2: plant access check ─────────────────────────────────────────
    if (plantId && !opts?.noScope) {
      const hasAccess = await svc.hasPlantAccess(user.id, plantId);
      if (!hasAccess) {
        return reply.code(403).send({
          error: 'Forbidden',
          detail: 'No access to this plant',
        });
      }
    }

    // ── Step 3: warehouse access check ─────────────────────────────────────
    if (warehouseId && !opts?.noScope) {
      const hasAccess = await svc.hasWarehouseAccess(user.id, warehouseId);
      if (!hasAccess) {
        return reply.code(403).send({
          error: 'Forbidden',
          detail: 'No access to this warehouse',
        });
      }
    }

    // ── Step 4: approval amount limit check ────────────────────────────────
    if (opts?.amountFrom && opts?.docType) {
      const rawAmount = get(request, opts.amountFrom);
      const amountPaise = typeof rawAmount === 'number' ? rawAmount : parseInt(rawAmount, 10);

      if (!isNaN(amountPaise)) {
        const withinLimit = await svc.withinApprovalLimit(
          user.id,
          companyId,
          opts.docType,
          amountPaise,
          plantId
        );
        if (!withinLimit) {
          return reply.code(403).send({
            error: 'Forbidden',
            detail: 'Amount exceeds your approval limit for this document type',
          });
        }
      }
    }
  };
}
