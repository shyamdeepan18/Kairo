import type { FastifyPluginAsync } from 'fastify';
import { db, notifications, approvalRequests, stockBalances, items } from '@erp/db';
import { eq, and, desc, or, isNull, sql } from 'drizzle-orm';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', resolveTenantContext);

  // ─── GET NOTIFICATIONS ───────────────────────────────────────────────────
  app.get('/', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const userId = (request.user as { id?: string; sub?: string }).id ??
        (request.user as { sub?: string }).sub;

      // 1. Fetch DB notifications
      const userConditions = userId
        ? or(eq(notifications.userId, userId), isNull(notifications.userId))
        : isNull(notifications.userId);

      const dbNotifications = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.companyId, companyId), userConditions))
        .orderBy(desc(notifications.createdAt))
        .limit(30);

      const itemsList: Array<{
        id: string;
        title: string;
        description: string;
        time: string;
        unread: boolean;
        type: string;
        link?: string;
        createdAt: string;
      }> = dbNotifications.map((n) => {
        const diffMs = Date.now() - new Date(n.createdAt).getTime();
        const mins = Math.floor(diffMs / 60000);
        let timeStr = 'Just now';
        if (mins >= 1440) timeStr = `${Math.floor(mins / 1440)}d ago`;
        else if (mins >= 60) timeStr = `${Math.floor(mins / 60)}h ago`;
        else if (mins > 0) timeStr = `${mins}m ago`;

        return {
          id: n.id,
          title: n.title,
          description: n.message,
          time: timeStr,
          unread: !n.isRead,
          type: n.type,
          link: n.link ?? undefined,
          createdAt: n.createdAt.toISOString(),
        };
      });

      // 2. Synthesize event alerts if DB has fewer than 10 alerts
      if (itemsList.length < 10) {
        // Pending approvals alert
        const pendingApprovals = await db
          .select({
            id: approvalRequests.id,
            documentType: approvalRequests.documentType,
            documentNumber: approvalRequests.documentNumber,
            createdAt: approvalRequests.createdAt,
          })
          .from(approvalRequests)
          .where(and(eq(approvalRequests.companyId, companyId), eq(approvalRequests.status, 'pending')))
          .limit(3);

        for (const app of pendingApprovals) {
          const docId = app.documentNumber || app.documentType;
          if (!itemsList.some((it) => it.title.includes(docId))) {
            itemsList.push({
              id: `appr-${app.id}`,
              title: 'Approval Required',
              description: `${app.documentType.toUpperCase()} ${docId} is awaiting authorization.`,
              time: 'Pending',
              unread: true,
              type: 'approval',
              link: '/governance/approvals',
              createdAt: app.createdAt.toISOString(),
            });
          }
        }

        // Low stock alerts
        const lowStocks = await db
          .select({
            itemId: stockBalances.itemId,
            itemName: items.itemName,
            itemCode: items.itemCode,
            quantityOnHand: stockBalances.quantityOnHand,
          })
          .from(stockBalances)
          .innerJoin(items, eq(stockBalances.itemId, items.id))
          .where(and(eq(stockBalances.companyId, companyId), sql`${stockBalances.quantityOnHand} <= 5`))
          .limit(3);

        for (const ls of lowStocks) {
          const title = `Low Stock: ${ls.itemCode}`;
          if (!itemsList.some((it) => it.title === title)) {
            itemsList.push({
              id: `stock-${ls.itemId}`,
              title,
              description: `${ls.itemName} has only ${ls.quantityOnHand} units remaining.`,
              time: 'Warning',
              unread: true,
              type: 'stock',
              link: '/inventory/stock-balances',
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      const unreadCount = itemsList.filter((it) => it.unread).length;

      return {
        notifications: itemsList,
        unreadCount,
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch notifications' });
    }
  });

  // ─── MARK NOTIFICATION READ ──────────────────────────────────────────────
  app.post('/:id/read', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const { id } = request.params as { id: string };

      if (!id.startsWith('appr-') && !id.startsWith('stock-')) {
        await db
          .update(notifications)
          .set({ isRead: true, readAt: new Date() })
          .where(and(eq(notifications.id, id), eq(notifications.companyId, companyId)));
      }

      return { success: true };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to mark notification read' });
    }
  });

  // ─── MARK ALL READ ───────────────────────────────────────────────────────
  app.post('/mark-all-read', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const userId = (request.user as { id?: string; sub?: string }).id ??
        (request.user as { sub?: string }).sub;

      const userConditions = userId
        ? or(eq(notifications.userId, userId), isNull(notifications.userId))
        : isNull(notifications.userId);

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.companyId, companyId), userConditions));

      return { success: true };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to mark all notifications read' });
    }
  });
};

export default notificationsRoutes;
