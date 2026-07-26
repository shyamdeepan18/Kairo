import { z } from 'zod';
import { prCreateSchema } from '../../packages/shared/src/validators/purchase';

const body = {
  companyId: '1d4399e7-4952-4416-bcc9-e4d3c909618d', // uuid
  plantId: '5426b3e9-7988-43db-b2ea-4a6f81a742ea', // uuid
  postingDate: '2026-07-26',
  lines: [{
    itemId: '08ed20e8-0b5c-4861-bd81-3444ab06bce6',
    quantity: 1,
    uom: 'NOS',
    estimatedRatePaise: 1000100
  }]
};

const parsed = prCreateSchema.safeParse(body);
console.log('Parsed success?', parsed.success);
if (parsed.success) {
  const totalAmountPaise = parsed.data.lines.reduce((acc, l) => acc + Math.round(l.quantity * (l.estimatedRatePaise || 0)), 0);
  console.log('Total Amount Paise:', totalAmountPaise);
} else {
  console.dir(parsed.error, { depth: null });
}
