import fs from 'fs';
import path from 'path';

const file = '/Users/shyam18/SEGA/ERP/apps/api/src/routes/purchase.ts';
let content = fs.readFileSync(file, 'utf8');

const putRoute = `
  app.put('/orders/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = poCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    
    const [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (existing.status !== 'draft') return reply.code(409).send({ error: 'Can only edit draft orders' });
    
    const computed = d.lines.map((l) => computeLine(l));
    const totals = headerTotals(computed);

    const updated = await db.transaction(async (tx) => {
      const [po] = await tx.update(purchaseOrders).set({
        plantId: d.plantId,
        supplierId: d.supplierId, requisitionId: d.requisitionId, supplierRef: d.supplierRef,
        expectedDeliveryDate: d.expectedDeliveryDate as any, paymentTermsDays: d.paymentTermsDays,
        deliveryWarehouseId: d.deliveryWarehouseId, placeOfSupply: d.placeOfSupply,
        isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
        totalAmountPaise: totals.totalAmountPaise, updatedBy: userId(request), updatedAt: new Date(),
      }).where(eq(purchaseOrders.id, id)).returning();
      
      // We don't revert old PR ordered quantities here. For true accuracy we'd diff it, 
      // but in draft mode, standard practice is to just delete and recreate lines, 
      // and re-apply PR linked ordered quantities if changed.
      // Wait, deleting lines and recreating is simpler:
      
      // Un-link old lines from PR
      const oldLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
      for (const line of oldLines) {
        if (line.requisitionLineId) {
          await tx.update(purchaseRequisitionLines)
            .set({ orderedQty: sql\`\${purchaseRequisitionLines.orderedQty} - \${line.quantity}\` })
            .where(eq(purchaseRequisitionLines.id, line.requisitionLineId));
        }
      }
      
      await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
      
      await tx.insert(purchaseOrderLines).values(
        d.lines.map((l, i) => ({
          poId: po.id, lineNumber: i + 1, requisitionLineId: l.requisitionLineId, itemId: l.itemId,
          description: l.description, quantity: l.quantity.toString(), uom: l.uom,
          ratePaise: l.ratePaise, discountPercent: String(l.discountPercent ?? 0),
          discountPaise: computed[i].discountPaise, netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
          cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
          igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
          taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
          warehouseId: l.warehouseId,
        }))
      );

      // Re-link new PR lines
      const prLinesToUpdate = d.lines.filter(l => l.requisitionLineId);
      for (const line of prLinesToUpdate) {
        await tx.update(purchaseRequisitionLines)
          .set({ orderedQty: sql\`\${purchaseRequisitionLines.orderedQty} + \${line.quantity}\` })
          .where(eq(purchaseRequisitionLines.id, line.requisitionLineId!));
      }

      await app.auditEngine.logTransition(
        { companyId: po.companyId, documentType: DOC, documentId: po.id, documentNumber: po.documentNumber, performedBy: userId(request) },
        'draft', { status: 'draft', stampFields: {} }, 'Order modified', { tx }
      );
      
      return po;
    });
    return reply.send(updated);
  });
`;

content = content.replace("  app.get('/orders', {", putRoute + "\n  app.get('/orders', {");
fs.writeFileSync(file, content);
console.log('Done');
