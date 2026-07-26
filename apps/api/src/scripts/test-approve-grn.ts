import { db, goodsReceiptNotes, purchaseOrders, goodsReceiptNoteLines, purchaseOrderLines, approvalRequests } from '@erp/db';
import { eq, and, sql } from 'drizzle-orm';
import { app } from '../server.js'; // need to instantiate the fastify app, maybe hard to mock.
