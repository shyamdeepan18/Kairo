import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * requireModule(module) — preHandler/hook that blocks a request when the company
 * has not licensed `module` (company-level gate, above per-user permissions).
 *
 * Resolves companyId the same way as resolveCompany (params/body/query/header).
 * If no company can be resolved it defers (lets resolveCompany/authorize return
 * the 400/401), so it's safe to attach as an onRequest hook on a route group:
 *
 *   app.addHook('onRequest', requireModule('purchase'));
 */
export function requireModule(module: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const params = request.params as Record<string, unknown> | undefined;
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, unknown> | undefined;
    const companyId =
      (request as unknown as { companyId?: string }).companyId ??
      (params?.companyId as string | undefined) ??
      (body?.companyId as string | undefined) ??
      (query?.companyId as string | undefined) ??
      (request.headers['x-company-id'] as string | undefined);

    if (!companyId) return; // defer — downstream will require the company context

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
