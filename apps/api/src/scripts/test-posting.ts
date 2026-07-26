import { db, goodsReceiptNotes, goodsReceiptNoteLines } from '@erp/db';
import Redis from 'ioredis';
import { eq, sql } from 'drizzle-orm';
import { PostingEngine } from '../services/posting-engine.js';
import { AccountMapService } from '../services/account-map.js';
import { NumberSeriesService } from '../services/number-series.js';
import { purchaseGrnTemplate } from '../services/posting-templates.js';
import { fiscalPeriod } from '../services/posting-engine.js';
import type { TaxLine } from '../services/posting-engine.js';

function grnTaxLines(lines: Array<{ cgstAmountPaise?: number; sgstAmountPaise?: number; igstAmountPaise?: number; taxAmountPaise: number; netAmountPaise: number }>): TaxLine[] {
  const taxes: TaxLine[] = [];
  let cgst = 0, sgst = 0, igst = 0, net = 0;
  for (const l of lines) {
    cgst += l.cgstAmountPaise || 0;
    sgst += l.sgstAmountPaise || 0;
    igst += l.igstAmountPaise || 0;
    net += l.netAmountPaise;
  }
  if (cgst > 0) taxes.push({ taxCode: 'CGST', taxType: 'cgst', baseAmountPaise: net, taxAmountPaise: cgst });
  if (sgst > 0) taxes.push({ taxCode: 'SGST', taxType: 'sgst', baseAmountPaise: net, taxAmountPaise: sgst });
  if (igst > 0) taxes.push({ taxCode: 'IGST', taxType: 'igst', baseAmountPaise: net, taxAmountPaise: igst });
  return taxes;
}

const DOC = 'purchase.grn';

async function run() {
  const id = '1c494b72-c938-4dd2-aebd-b21f0c4d9d13';
  const uid = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';
  const cid = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';

  const [grn] = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, id)).limit(1);
  const lines = await db.select().from(goodsReceiptNoteLines).where(eq(goodsReceiptNoteLines.grnId, id));

  const redis = new Redis('redis://localhost:6379');
  const num = new NumberSeriesService();
  const acc = new AccountMapService(redis);
  const eng = new PostingEngine(acc, num);
  eng.register(DOC, purchaseGrnTemplate);

  try {
    await db.transaction(async (tx) => {
      // 2. GL post (DR inventory + input GST / CR GR-IR clearing)
      const { fiscalYear, period } = fiscalPeriod(new Date(grn.postingDate));
      const ctx = {
        companyId: cid, plantId: grn.plantId, documentType: DOC, documentId: grn.id,
        documentNumber: grn.documentNumber, postingDate: new Date(grn.postingDate), fiscalYear, period,
        header: { supplierId: grn.supplierId },
        lines: lines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
        taxLines: grnTaxLines(lines),
      };
      
      console.log('Posting...');
      const jeId = await eng.post(tx, ctx, uid);
      
      console.log('Posted JE:', jeId);
      
      console.log('Updating PO lines...');
      for (const l of lines) {
        if (l.poLineId) {
          const res = await tx.execute(sql`UPDATE purchase_order_lines SET received_qty = received_qty + ${parseFloat(l.acceptedQty)} WHERE id = ${l.poLineId} RETURNING *`);
          console.log('Updated PO line:', res);
        }
      }
      
      throw new Error('Rollback');
    });
  } catch (e: any) {
    if (e.message !== 'Rollback') {
      console.error('Error:', e);
    } else {
      console.log('Success (rolled back)');
    }
  }

  process.exit(0);
}

run().catch(console.error);
