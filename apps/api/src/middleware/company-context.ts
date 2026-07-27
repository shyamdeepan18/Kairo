import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * @deprecated SECURITY: this trusts a client-supplied company id (params/body/
 * query/header) and must NOT be used on business routes. Replaced by
 * resolveTenantContext (middleware/tenant-context.ts), which reads the active
 * company only from the server-validated JWT/session. All business routes have
 * been migrated. Kept only so legacy dev scripts still compile; do not re-add.
 *
 * resolveCompany — preHandler that resolves the active company for the request
 * and stamps it on `request.companyId`, where authorize() and route handlers
 * read it from.
 *
 * Resolution order (first hit wins):
 *   1. URL param        :companyId
 *   2. Request body      body.companyId
 *   3. Query string      ?companyId=
 *   4. Header            x-company-id
 *
 * Why this exists: the JWT access token does not carry a company id (a user may
 * belong to several companies), so every request must state which company it
 * operates on. authorize() already falls back to body/params; this preHandler
 * additionally covers GET requests (query / header) and sets a single canonical
 * value so permission resolution is consistent.
 *
 * Place it AFTER app.authenticate and BEFORE authorize():
 *   { preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.view')] }
 */
export async function resolveCompany(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as Record<string, unknown> | undefined;
  const body = request.body as Record<string, unknown> | undefined;
  const query = request.query as Record<string, unknown> | undefined;

  const companyId =
    (params?.companyId as string | undefined) ??
    (body?.companyId as string | undefined) ??
    (query?.companyId as string | undefined) ??
    (request.headers['x-company-id'] as string | undefined);

  if (!companyId) {
    return reply.code(400).send({
      error: 'Company context required',
      detail: 'Provide companyId in the body, ?companyId= query, or x-company-id header.',
    });
  }

  (request as unknown as { companyId: string }).companyId = companyId;
}

/** Read the resolved company id inside a handler (resolveCompany must have run). */
export function companyId(request: FastifyRequest): string {
  return (request as unknown as { companyId: string }).companyId;
}
