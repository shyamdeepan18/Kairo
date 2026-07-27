/**
 * Request-body DTO helpers (Phase 4).
 *
 * The server, never the client, owns tenant identity, the primary key, and the
 * audit columns. `stripServerOwned` removes those keys from an inbound body
 * BEFORE strict Zod parsing, so:
 *   - they can never be mass-assigned (the security invariant), and
 *   - a client that echoes a whole record back on PATCH (the normal
 *     GET-edit-PUT pattern) is not rejected for merely mentioning them.
 *
 * Genuinely unexpected keys still fail the subsequent `.strict()` parse — this
 * filters ownership fields, it does not open the door to arbitrary extras.
 *
 *   const parsed = schema.safeParse(stripServerOwned(req.body));
 *   if (!parsed.success) return invalid(reply, parsed);
 */

/** Fields the server always derives — never accepted from a client body. */
export const SERVER_OWNED_FIELDS = [
  'id', 'companyId', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt',
] as const;

export function stripServerOwned(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...((body as Record<string, unknown>) ?? {}) };
  for (const k of SERVER_OWNED_FIELDS) delete out[k];
  return out;
}
