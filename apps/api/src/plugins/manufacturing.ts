import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { StatusEngine } from '../services/status-engine.js';

/**
 * Phase 8 — Manufacturing wiring.
 *
 * The production-order lifecycle ('manufacturing.order') already has StatusEngine
 * transitions, and the manufacturing.issue / manufacturing.receipt POSTING
 * templates are pre-registered in the accounting plugin's BUILT_IN_TEMPLATES.
 *
 * What's missing is the lifecycle for the BOM / recipe definition document
 * ('manufacturing.bom'): draft → submitted → approved, with revise/cancel. We
 * register it here at runtime (no edit to the shared status-engine.ts).
 */
async function manufacturingPlugin(_app: FastifyInstance) {
  StatusEngine.register('manufacturing.bom', {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['cancelled'],
    cancelled: [],
  });
}

export default fp(manufacturingPlugin, { name: 'manufacturing' });
