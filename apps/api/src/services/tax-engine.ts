import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db, taxCodes } from '@erp/db';
import type { SupplyType } from '@erp/db';

// ─── Indian state codes ────────────────────────────────────────────────────

export const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',     '02': 'Himachal Pradesh',
  '03': 'Punjab',              '04': 'Chandigarh',
  '05': 'Uttarakhand',         '06': 'Haryana',
  '07': 'Delhi',               '08': 'Rajasthan',
  '09': 'Uttar Pradesh',       '10': 'Bihar',
  '11': 'Sikkim',              '12': 'Arunachal Pradesh',
  '13': 'Nagaland',            '14': 'Manipur',
  '15': 'Mizoram',             '16': 'Tripura',
  '17': 'Meghalaya',           '18': 'Assam',
  '19': 'West Bengal',         '20': 'Jharkhand',
  '21': 'Odisha',              '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',      '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',         '28': 'Andhra Pradesh',
  '29': 'Karnataka',           '30': 'Goa',
  '31': 'Lakshadweep',         '32': 'Kerala',
  '33': 'Tamil Nadu',          '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',           '37': 'Andhra Pradesh (old)',
  '38': 'Ladakh',              '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ─── Shared types ──────────────────────────────────────────────────────────

export interface TaxableLineItem {
  lineNumber: number;
  hsnCode?: string;
  /** SAC code for services (mutually exclusive with hsnCode) */
  sacCode?: string;
  isService?: boolean;
  itemDescription?: string;
  quantity: number;
  unit?: string;
  unitPricePaise: number;
  discountPaise?: number;
  /** Tax code string e.g. 'GST18'. Resolved to rate in TaxEngine.compute(). */
  taxCode: string;
  /** Basis points from tax_codes table — passed in after lookup to keep compute() pure */
  gstRateBp: number;
  cgstRateBp: number;
  sgstRateBp: number;
  igstRateBp: number;
  cessRateBp: number;
}

export interface ComputedTaxLine {
  lineNumber: number;
  hsnCode?: string;
  isService: boolean;
  itemDescription?: string;
  quantity: number;
  unit?: string;
  baseAmountPaise: number;
  discountPaise: number;
  assessableAmountPaise: number;
  gstRateBp: number;
  cgstRateBp: number;
  sgstRateBp: number;
  igstRateBp: number;
  cessRateBp: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  igstAmountPaise: number;
  cessAmountPaise: number;
  totalTaxPaise: number;
  totalLinePaise: number;
}

export interface TaxComputation {
  lines: ComputedTaxLine[];
  totals: {
    assessableAmountPaise: number;
    cgstAmountPaise: number;
    sgstAmountPaise: number;
    igstAmountPaise: number;
    cessAmountPaise: number;
    totalTaxPaise: number;
    roundOffPaise: number;   // rounding diff (max ±49 paise)
    totalAmountPaise: number;
  };
  isInterState: boolean;
  placeOfSupply: string;
  supplierStateCode: string;
  supplyType: SupplyType;
}

// ─── e-Invoice types ───────────────────────────────────────────────────────
// Schema follows NIC IRP JSON schema v1.1

export interface EInvoiceParty {
  gstin: string;
  legalName: string;
  tradeName?: string;
  addr1: string;
  addr2?: string;
  location: string;
  pincode: number;
  stateCode: string;
  phone?: string;
  email?: string;
}

export interface EInvoicePayload {
  Version: '1.1';
  TranDtls: {
    TaxSch: 'GST';
    SupTyp: 'B2B' | 'B2C' | 'EXPWP' | 'EXPWOP' | 'SEZWP' | 'SEZWOP';
    RegRev: 'Y' | 'N';
    IgstOnIntra: 'Y' | 'N';
  };
  DocDtls: {
    Typ: 'INV' | 'CRN' | 'DBN';
    No: string;
    Dt: string;  // DD/MM/YYYY
  };
  SellerDtls: {
    Gstin: string; LglNm: string; TrdNm?: string;
    Addr1: string; Addr2?: string; Loc: string; Pin: number; Stcd: string;
    Ph?: string; Em?: string;
  };
  BuyerDtls: {
    Gstin: string; LglNm: string; TrdNm?: string;
    Pos: string;  // Place of supply state code
    Addr1: string; Addr2?: string; Loc: string; Pin: number; Stcd: string;
    Ph?: string; Em?: string;
  };
  ItemList: Array<{
    SlNo: string; PrdDesc: string; IsServc: 'Y' | 'N'; HsnCd: string;
    Qty: number; Unit: string; UnitPrice: number;
    TotAmt: number; Discount: number; AssAmt: number;
    GstRt: number; IgstAmt: number; CgstAmt: number; SgstAmt: number;
    CesRt: number; CesAmt: number; CesNonAdvlAmt: number;
    TotItemVal: number;
  }>;
  ValDtls: {
    AssVal: number; CgstVal: number; SgstVal: number; IgstVal: number;
    CesVal: number; StCesVal: number; Discount: number; OthChrg: number;
    RndOffAmt: number; TotInvVal: number;
  };
}

export interface GstinValidation {
  valid: boolean;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  errors: string[];
}

// ─── TaxEngine ────────────────────────────────────────────────────────────
//
// Stateless — all methods are pure (no DB calls except loadTaxCode).
// The caller is responsible for loading tax code rates from the DB
// and passing them into compute() via TaxableLineItem.gstRateBp etc.

export class TaxEngine {

  // ── Core computation ────────────────────────────────────────────────────

  /**
   * Compute GST for a set of line items.
   *
   * INTRA-STATE: supplier state = place of supply → CGST + SGST (each rate/2)
   * INTER-STATE: different states → IGST (full rate)
   * EXPORT / SEZ: zero-rated → all tax amounts = 0
   *
   * Rounding: tax rounded at line level (floor half-up nearest paise).
   * Grand total discrepancies of ±1–2 paise are normal; absorbed by round-off
   * account in the GL posting.
   *
   * @param lines         Line items with pre-loaded rate basis points
   * @param supplierGstin Supplier's GSTIN (determines supplier state)
   * @param placeOfSupply 2-digit state code (buyer's state for B2B)
   * @param supplyType    'B2B' | 'B2C' | 'EXPORT' | 'SEZ'
   * @param isReverseCharge  Under RCM, buyer pays GST (leave tax amounts 0 in invoice)
   */
  compute(
    lines: TaxableLineItem[],
    supplierGstin: string,
    placeOfSupply: string,
    supplyType: SupplyType = 'B2B',
    isReverseCharge = false
  ): TaxComputation {
    const supplierStateCode = supplierGstin.slice(0, 2);
    const isInterState = supplierStateCode !== placeOfSupply;
    const isZeroRated = supplyType === 'EXPORT' || supplyType === 'SEZ';

    const computedLines: ComputedTaxLine[] = lines.map((line) => {
      const base = line.unitPricePaise * line.quantity;
      const discount = line.discountPaise ?? 0;
      const assessable = base - discount;

      let cgst = 0, sgst = 0, igst = 0, cess = 0;

      if (!isZeroRated && !isReverseCharge && assessable > 0) {
        if (isInterState) {
          igst = this.roundTax(assessable * line.igstRateBp / 10000);
          cess = this.roundTax(assessable * line.cessRateBp / 10000);
        } else {
          cgst = this.roundTax(assessable * line.cgstRateBp / 10000);
          sgst = this.roundTax(assessable * line.sgstRateBp / 10000);
          cess = this.roundTax(assessable * line.cessRateBp / 10000);
        }
      }

      const totalTax = cgst + sgst + igst + cess;
      return {
        lineNumber: line.lineNumber,
        hsnCode: line.hsnCode ?? line.sacCode,
        isService: line.isService ?? false,
        itemDescription: line.itemDescription,
        quantity: line.quantity,
        unit: line.unit,
        baseAmountPaise: base,
        discountPaise: discount,
        assessableAmountPaise: assessable,
        gstRateBp: line.gstRateBp,
        cgstRateBp: line.cgstRateBp,
        sgstRateBp: line.sgstRateBp,
        igstRateBp: line.igstRateBp,
        cessRateBp: line.cessRateBp,
        cgstAmountPaise: cgst,
        sgstAmountPaise: sgst,
        igstAmountPaise: igst,
        cessAmountPaise: cess,
        totalTaxPaise: totalTax,
        totalLinePaise: assessable + totalTax,
      };
    });

    const totals = computedLines.reduce(
      (acc, l) => ({
        assessableAmountPaise: acc.assessableAmountPaise + l.assessableAmountPaise,
        cgstAmountPaise:       acc.cgstAmountPaise + l.cgstAmountPaise,
        sgstAmountPaise:       acc.sgstAmountPaise + l.sgstAmountPaise,
        igstAmountPaise:       acc.igstAmountPaise + l.igstAmountPaise,
        cessAmountPaise:       acc.cessAmountPaise + l.cessAmountPaise,
        totalTaxPaise:         acc.totalTaxPaise + l.totalTaxPaise,
        totalAmountPaise:      acc.totalAmountPaise + l.totalLinePaise,
        roundOffPaise: 0,
      }),
      { assessableAmountPaise: 0, cgstAmountPaise: 0, sgstAmountPaise: 0,
        igstAmountPaise: 0, cessAmountPaise: 0, totalTaxPaise: 0,
        totalAmountPaise: 0, roundOffPaise: 0 }
    );

    // Round off grand total to nearest rupee (optional — some companies do this)
    const rounded = Math.round(totals.totalAmountPaise / 100) * 100;
    totals.roundOffPaise = rounded - totals.totalAmountPaise;
    totals.totalAmountPaise = rounded;

    return {
      lines: computedLines,
      totals,
      isInterState,
      placeOfSupply,
      supplierStateCode,
      supplyType,
    };
  }

  // ── GSTIN validation ────────────────────────────────────────────────────

  /**
   * Validate a GSTIN:
   *   - Correct length (15 chars)
   *   - Correct format (regex)
   *   - Valid state code (exists in Indian states table)
   *   - Correct check digit (mod-36 checksum)
   */
  validateGstin(gstin: string): GstinValidation {
    const errors: string[] = [];

    if (!gstin || typeof gstin !== 'string') {
      return { valid: false, errors: ['GSTIN is required'] };
    }

    const g = gstin.trim().toUpperCase();

    if (g.length !== 15) {
      errors.push(`GSTIN must be exactly 15 characters (got ${g.length})`);
      return { valid: false, errors };
    }

    const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!pattern.test(g)) {
      errors.push('GSTIN format invalid. Expected: 2-digit state + 10-char PAN + entity + Z + check');
      return { valid: false, errors };
    }

    const stateCode = g.slice(0, 2);
    const stateName = INDIAN_STATE_CODES[stateCode];
    if (!stateName) {
      errors.push(`Invalid state code '${stateCode}'`);
    }

    const expectedCheck = this.computeGstinCheckDigit(g.slice(0, 14));
    if (g[14] !== expectedCheck) {
      errors.push(`Invalid check digit '${g[14]}' — expected '${expectedCheck}'`);
    }

    const pan = g.slice(2, 12);

    return {
      valid: errors.length === 0,
      stateCode,
      stateName,
      pan,
      errors,
    };
  }

  /** Extract 2-digit state code from a GSTIN (no validation) */
  stateFromGstin(gstin: string): string {
    return gstin.slice(0, 2);
  }

  /** State name from 2-digit state code */
  stateName(stateCode: string): string {
    return INDIAN_STATE_CODES[stateCode] ?? `Unknown (${stateCode})`;
  }

  // ── IRN generation ──────────────────────────────────────────────────────

  /**
   * Compute the Invoice Reference Number.
   * IRN = SHA-256 of "{supplierGstin}{docType}{docNo}{docDate}{fy}"
   * where docDate = DD/MM/YYYY and fy = '2425' (4-char fiscal year).
   *
   * The same IRN can be independently verified by any party.
   * IRP rejects duplicate IRNs within the same fiscal year.
   */
  computeIrn(
    supplierGstin: string,
    docType: 'INV' | 'CRN' | 'DBN',
    docNumber: string,
    docDate: Date,
    fiscalYear: string
  ): string {
    const dd = String(docDate.getDate()).padStart(2, '0');
    const mm = String(docDate.getMonth() + 1).padStart(2, '0');
    const yyyy = docDate.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    const input = `${supplierGstin}${docType}${docNumber}${dateStr}${fiscalYear}`;
    return createHash('sha256').update(input).digest('hex');
  }

  // ── e-Invoice payload builder ────────────────────────────────────────────

  /**
   * Build the JSON payload for submission to the IRP.
   * Amounts are in INR (rupees) as the IRP requires — not paise.
   *
   * Call this after compute() to get the full payload.
   */
  buildEInvoicePayload(opts: {
    docType: 'INV' | 'CRN' | 'DBN';
    docNumber: string;
    docDate: Date;
    supplyType: SupplyType;
    isReverseCharge: boolean;
    seller: EInvoiceParty;
    buyer: EInvoiceParty;
    placeOfSupply: string;
    taxResult: TaxComputation;
  }): EInvoicePayload {
    const { docType, docNumber, docDate, seller, buyer, taxResult } = opts;

    const dd = String(docDate.getDate()).padStart(2, '0');
    const mm = String(docDate.getMonth() + 1).padStart(2, '0');
    const yyyy = docDate.getFullYear();

    // IRP SupTyp mapping
    const supTypMap: Record<string, EInvoicePayload['TranDtls']['SupTyp']> = {
      B2B: 'B2B', B2C: 'B2C',
      EXPORT: 'EXPWOP',  // default export without payment; caller can override
      SEZ: 'SEZWOP',
    };

    return {
      Version: '1.1',
      TranDtls: {
        TaxSch: 'GST',
        SupTyp: supTypMap[opts.supplyType] ?? 'B2B',
        RegRev: opts.isReverseCharge ? 'Y' : 'N',
        IgstOnIntra: 'N',
      },
      DocDtls: {
        Typ: docType,
        No: docNumber,
        Dt: `${dd}/${mm}/${yyyy}`,
      },
      SellerDtls: {
        Gstin: seller.gstin, LglNm: seller.legalName, TrdNm: seller.tradeName,
        Addr1: seller.addr1, Addr2: seller.addr2, Loc: seller.location,
        Pin: seller.pincode, Stcd: seller.stateCode,
        Ph: seller.phone, Em: seller.email,
      },
      BuyerDtls: {
        Gstin: buyer.gstin, LglNm: buyer.legalName, TrdNm: buyer.tradeName,
        Pos: opts.placeOfSupply,
        Addr1: buyer.addr1, Addr2: buyer.addr2, Loc: buyer.location,
        Pin: buyer.pincode, Stcd: buyer.stateCode,
        Ph: buyer.phone, Em: buyer.email,
      },
      ItemList: taxResult.lines.map((l, i) => ({
        SlNo: String(i + 1),
        PrdDesc: (l.itemDescription ?? '').slice(0, 300),
        IsServc: l.isService ? 'Y' : 'N',
        HsnCd: l.hsnCode ?? '',
        Qty: Number(l.quantity),
        Unit: 'NOS',
        UnitPrice: l.assessableAmountPaise / l.quantity / 100,
        TotAmt: l.baseAmountPaise / 100,
        Discount: l.discountPaise / 100,
        AssAmt: l.assessableAmountPaise / 100,
        GstRt: l.gstRateBp / 100,
        IgstAmt: l.igstAmountPaise / 100,
        CgstAmt: l.cgstAmountPaise / 100,
        SgstAmt: l.sgstAmountPaise / 100,
        CesRt: l.cessRateBp / 100,
        CesAmt: l.cessAmountPaise / 100,
        CesNonAdvlAmt: 0,
        TotItemVal: l.totalLinePaise / 100,
      })),
      ValDtls: {
        AssVal:    taxResult.totals.assessableAmountPaise / 100,
        CgstVal:   taxResult.totals.cgstAmountPaise / 100,
        SgstVal:   taxResult.totals.sgstAmountPaise / 100,
        IgstVal:   taxResult.totals.igstAmountPaise / 100,
        CesVal:    taxResult.totals.cessAmountPaise / 100,
        StCesVal:  0,
        Discount:  0,
        OthChrg:   0,
        RndOffAmt: taxResult.totals.roundOffPaise / 100,
        TotInvVal: taxResult.totals.totalAmountPaise / 100,
      },
    };
  }

  // ── DB helper: load tax code rates ──────────────────────────────────────

  /**
   * Load rate basis points for a tax code string from the DB.
   * Used by route handlers before calling compute().
   *
   * Returns null if the code is not found or is inactive.
   */
  async loadTaxCode(companyId: string, code: string): Promise<{
    id: string;
    gstRateBp: number; cgstRateBp: number;
    sgstRateBp: number; igstRateBp: number; cessRateBp: number;
  } | null> {
    const [row] = await db
      .select()
      .from(taxCodes)
      .where(and(eq(taxCodes.companyId, companyId), eq(taxCodes.code, code), eq(taxCodes.isActive, true)))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      gstRateBp: row.gstRateBp,
      cgstRateBp: row.cgstRateBp,
      sgstRateBp: row.sgstRateBp,
      igstRateBp: row.igstRateBp,
      cessRateBp: row.cessRateBp,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /** Round tax to nearest paise (standard banker's rounding) */
  private roundTax(amountPaise: number): number {
    return Math.round(amountPaise);
  }

  /**
   * Compute the GSTIN check digit using mod-36 checksum.
   * Input: first 14 characters of GSTIN (uppercase).
   * Returns: the expected 15th character.
   */
  private computeGstinCheckDigit(gstin14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const charVal = GSTIN_CHARSET.indexOf(gstin14[i]);
      if (charVal === -1) return '?';
      const factor = i % 2 === 0 ? 1 : 2;
      const product = charVal * factor;
      sum += Math.floor(product / 36) + (product % 36);
    }
    const checkVal = (36 - (sum % 36)) % 36;
    return GSTIN_CHARSET[checkVal];
  }
}
