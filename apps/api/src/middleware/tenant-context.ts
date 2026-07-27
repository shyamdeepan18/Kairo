import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * The trusted, server-validated tenant context for a request.
 *
 * This is the ONLY source of tenant identity that business routes may use.
 * It is derived exclusively from the active context bound to the session/JWT by
 * POST /api/auth/select-context — never from request headers, URL params, query
 * string, or body. A user may belong to several companies, so the login token
 * carries no company; the client selects one, the server validates it, and the
 * validated selection is what lands here.
 */
export interface TenantContext {
  companyId: string;
  activePlantId?: string | null;
  sessionId: string;
  isSystemAdmin: boolean;
}

/**
 * resolveTenantContext — preHandler that binds `request.tenant` from the trusted
 * active context on the verified JWT. MUST run after `app.authenticate`.
 *
 *   { preHandler: [app.authenticate, resolveTenantContext, authorize('...')] }
 *
 * Behaviour:
 *   - No authenticated user            → 401 (authenticate should have caught it)
 *   - Authenticated but no active company selected → 409 tenant_context_required
 *     (the client should call /api/auth/context-options + /api/auth/select-context)
 *   - Otherwise attaches request.tenant and continues.
 *
 * System admins are NOT exempt: they must also select an explicit company before
 * touching tenant data. isSystemAdmin may waive permission checks elsewhere, but
 * it must never waive the tenant predicate.
 */
export async function resolveTenantContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const companyId = user.activeCompanyId;
  if (!companyId) {
    return reply.code(409).send({
      error: 'tenant_context_required',
      detail:
        'No active company selected. Call POST /api/auth/select-context to choose one.',
    });
  }

  request.tenant = {
    companyId,
    activePlantId: user.activePlantId ?? null,
    sessionId: user.sessionId,
    isSystemAdmin: user.isSystemAdmin,
  };
}

/**
 * Read the resolved tenant context inside a handler. Throws if the route did not
 * run resolveTenantContext first — a programming error, not a client error.
 */
export function tenant(request: FastifyRequest): TenantContext {
  if (!request.tenant) {
    throw new Error(
      'request.tenant is not set — add resolveTenantContext to this route’s preHandler chain',
    );
  }
  return request.tenant;
}
