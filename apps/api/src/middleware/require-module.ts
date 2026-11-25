import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * requireModule(module) — preHandler/hook that blocks a request when the company
 * has not licensed `module` (company-level gate, above per-user permissions).
 *
 * MUST run after `app.authenticate`: it derives the company solely from the
 * trusted, server-bound context (request.tenant, or request.user.activeCompanyId
 * before resolveTenantContext has run) — never from client-supplied params, body,
 * query, or the x-company-id header, which a caller could forge to probe another
 * tenant's licensing. Route groups register it AFTER a group-level authenticate
 * hook so request.user is populated by the time it runs:
 *
 *   app.addHook('preHandler', app.authenticate);
 *   app.addHook('preHandler', requireModule('purchase'));
 *
 * If no company can be resolved (authenticated but no active company selected) it
 * defers — the route's resolveTenantContext returns the 409 asking the client to
 * select a context.
 */
export function requireModule(module: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Platform owner / System admin has full operational and administrative rights across all modules
    if ((request.user as any)?.isSystemAdmin) return;

    // Trusted sources only. request.tenant is set once resolveTenantContext has
    // run; before that (group-level hook order) the same value lives on the
    // verified JWT as request.user.activeCompanyId.
    const companyId = request.tenant?.companyId ?? request.user?.activeCompanyId ?? undefined;

    if (!companyId) return; // defer — resolveTenantContext will require the context

    const svc = request.server.licenseService;
    const enabled = await svc.isModuleEnabled(companyId, module);
    if (!enabled) {
      return reply.code(403).send({
        error: 'module_not_licensed',
        detail: `The '${module}' module is not enabled for this company.`,
      });
    }
  };
}
