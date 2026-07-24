import { purchasePaymentCreateSchema } from './packages/shared/src/validators/purchase';

const body = {
  companyId: "11111111-1111-1111-1111-111111111111",
  plantId: "11111111-1111-1111-1111-111111111111",
  postingDate: "2026-07-06",
  supplierId: "11111111-1111-1111-1111-111111111111",
  paymentMode: "bank_transfer",
  bankReference: undefined,
  remarks: undefined,
  paidAmountPaise: 500,
  allocations: [
    { invoiceId: "11111111-1111-1111-1111-111111111111", allocatedAmountPaise: 500 }
  ]
};

const res = purchasePaymentCreateSchema.safeParse(body);
console.log(JSON.stringify(res, null, 2));
