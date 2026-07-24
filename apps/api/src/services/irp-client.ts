/**
 * IRP (Invoice Registration Portal) client abstraction.
 *
 * Production GST e-invoice flow:
 *   1. Authenticate with your GSP (GST Suvidha Provider)
 *   2. Encrypt the invoice payload with IRP's public key
 *   3. POST to IRP API → receive IRN + signed QR
 *
 * Encryption is non-trivial: AES-256 session key encrypted with IRP's
 * RSA-2048 public key, then invoice JSON encrypted with the AES key.
 * Most companies use a GSP SDK that handles this — e.g.:
 *   - Cleartax GSP SDK
 *   - Masters India GSP SDK
 *   - GSTN's own NIC API (direct, for large taxpayers)
 *
 * This file defines:
 *   IrpClient        — interface all implementations must satisfy
 *   MockIrpClient    — development/test implementation (no real IRP call)
 *   ProductionIrpClient — skeleton showing the integration points
 *
 * Set `IRP_MODE=mock` in .env for development. The mock returns a
 * deterministic fake IRN based on the invoice number so it's stable
 * across test runs.
 */

import { createHash } from 'crypto';
import type { EInvoicePayload } from './tax-engine.js';

// ─── IRP response ──────────────────────────────────────────────────────────

export interface IrpResponse {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedInvoice: string;
  signedQrCode: string;
  /** Raw IRP response (store for audit) */
  raw: unknown;
}

// ─── IrpClient interface ───────────────────────────────────────────────────

export interface IrpClient {
  /**
   * Submit invoice payload to IRP, get IRN + signed QR code.
   * Throws on IRP validation errors or network failures.
   */
  generateIrn(payload: EInvoicePayload): Promise<IrpResponse>;

  /**
   * Cancel an IRN within 24 hours of generation.
   * After 24h, only a Credit Note (CRN) can be issued.
   *
   * @param irn       The 64-char IRN to cancel
   * @param reason    Reason code: '1'=Duplicate, '2'=Data Entry Error, '3'=Order Cancelled, '4'=Other
   * @param cancelDate  DD/MM/YYYY
   */
  cancelIrn(irn: string, reason: '1' | '2' | '3' | '4', cancelDate: string): Promise<void>;

  /**
   * Fetch an existing IRN record from IRP (useful for reconciliation).
   * Returns null if not found.
   */
  getByIrn(irn: string): Promise<IrpResponse | null>;
}

// ─── MockIrpClient ─────────────────────────────────────────────────────────
//
// Use in development and test environments.
// Generates a deterministic fake IRN so test suites are stable.

export class MockIrpClient implements IrpClient {
  async generateIrn(payload: EInvoicePayload): Promise<IrpResponse> {
    // Deterministic IRN based on invoice details (matches what IRP would generate)
    const irn = createHash('sha256')
      .update(`${payload.SellerDtls.Gstin}${payload.DocDtls.Typ}${payload.DocDtls.No}${payload.DocDtls.Dt}`)
      .digest('hex');

    const ackNo = String(Date.now()).slice(-10);
    const ackDate = new Date();

    // Fake signed QR code (real one is a JWT signed by NIC's private key)
    const qrData = JSON.stringify({
      SellerGstin: payload.SellerDtls.Gstin,
      BuyerGstin: payload.BuyerDtls.Gstin,
      DocNo: payload.DocDtls.No,
      DocDt: payload.DocDtls.Dt,
      TotInvVal: payload.ValDtls.TotInvVal,
      ItemCnt: payload.ItemList.length,
      Irn: irn,
      IssueDt: ackDate.toISOString(),
    });

    const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(qrData).toString('base64url')}.MOCK_SIGNATURE`;

    console.log(`[MockIrpClient] Generated IRN for ${payload.DocDtls.No}: ${irn.slice(0, 16)}...`);

    return {
      irn,
      ackNo,
      ackDate,
      signedInvoice: fakeJwt,
      signedQrCode: fakeJwt,
      raw: { Status: '1', Irn: irn, AckNo: ackNo, AckDt: ackDate.toISOString() },
    };
  }

  async cancelIrn(irn: string, reason: string, cancelDate: string): Promise<void> {
    console.log(`[MockIrpClient] Cancelled IRN ${irn.slice(0, 16)}... reason=${reason} date=${cancelDate}`);
  }

  async getByIrn(irn: string): Promise<IrpResponse | null> {
    console.log(`[MockIrpClient] getByIrn ${irn.slice(0, 16)}... (mock returns null)`);
    return null;
  }
}

// ─── ProductionIrpClient skeleton ─────────────────────────────────────────
//
// Integrate with your GSP's SDK here. Every GSP has a slightly different
// authentication and encryption flow — follow their integration guide.
//
// Common GSPs:
//   - Cleartax:     https://cleartax.in/gst/e-invoicing-api
//   - Masters India: https://mastersindia.co/e-invoice-api
//   - NIC Direct:   https://einvoice1.gst.gov.in/Others/ApiDocs

export class ProductionIrpClient implements IrpClient {
  constructor(
    private readonly gspBaseUrl: string,
    private readonly gstin: string,
    private readonly username: string,
    private readonly password: string,
    /** IRP public key for payload encryption (from NIC portal) */
    private readonly irpPublicKey: string
  ) {}

  async generateIrn(payload: EInvoicePayload): Promise<IrpResponse> {
    // Step 1: Authenticate with GSP → get auth token
    // const token = await this.authenticate();

    // Step 2: Encrypt payload
    // const { encryptedPayload, encryptedKey } = this.encryptPayload(payload);

    // Step 3: POST to GSP
    // const response = await fetch(`${this.gspBaseUrl}/eicore/v1.03/Invoice`, {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ data: encryptedPayload, sek: encryptedKey }),
    // });

    // Step 4: Decrypt and parse response
    // ...

    throw new Error(
      'ProductionIrpClient not configured. ' +
      'Integrate your GSP SDK in apps/api/src/services/irp-client.ts ' +
      'and set IRP_MODE=production + GSP credentials in .env'
    );
  }

  async cancelIrn(_irn: string, _reason: string, _cancelDate: string): Promise<void> {
    throw new Error('ProductionIrpClient.cancelIrn not implemented');
  }

  async getByIrn(_irn: string): Promise<IrpResponse | null> {
    throw new Error('ProductionIrpClient.getByIrn not implemented');
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createIrpClient(): IrpClient {
  const mode = process.env.IRP_MODE ?? 'mock';

  if (mode === 'production') {
    const gspBaseUrl   = process.env.GSP_BASE_URL;
    const gstin        = process.env.GSP_GSTIN;
    const username     = process.env.GSP_USERNAME;
    const password     = process.env.GSP_PASSWORD;
    const irpPublicKey = process.env.IRP_PUBLIC_KEY;

    if (!gspBaseUrl || !gstin || !username || !password || !irpPublicKey) {
      throw new Error(
        'IRP_MODE=production requires: GSP_BASE_URL, GSP_GSTIN, GSP_USERNAME, ' +
        'GSP_PASSWORD, IRP_PUBLIC_KEY environment variables'
      );
    }

    return new ProductionIrpClient(gspBaseUrl, gstin, username, password, irpPublicKey);
  }

  return new MockIrpClient();
}
