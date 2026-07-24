/**
 * Seed: Standard Indian GST tax codes + common HSN codes
 *
 * seedTaxCodesForCompany(companyId, userId) — called during company onboarding.
 * Safe to re-run — uses INSERT ON CONFLICT DO NOTHING.
 *
 * Tax codes follow the 5 standard GST slabs:
 *   NIL (0% nil-rated), EXEMPT (0% exempt), GST0 (0% zero-rated/export),
 *   GST5, GST12, GST18, GST28, plus common cess variants.
 *
 * Rates stored in basis points (1% = 100 bp).
 */

import { db, taxCodes, hsnSacCodes } from '../index.js';

// ─── Tax code definitions ──────────────────────────────────────────────────

const TAX_CODE_DEFS = [
  {
    code: 'NIL',
    name: 'Nil Rated (0%)',
    rateType: 'nil' as const,
    gstRateBp: 0, cgstRateBp: 0, sgstRateBp: 0, igstRateBp: 0, cessRateBp: 0,
  },
  {
    code: 'EXEMPT',
    name: 'Exempt Supply (0%)',
    rateType: 'exempt' as const,
    gstRateBp: 0, cgstRateBp: 0, sgstRateBp: 0, igstRateBp: 0, cessRateBp: 0,
  },
  {
    code: 'GST0',
    name: 'Zero Rated — Export / SEZ (0%)',
    rateType: 'zero' as const,
    gstRateBp: 0, cgstRateBp: 0, sgstRateBp: 0, igstRateBp: 0, cessRateBp: 0,
  },
  {
    code: 'GST5',
    name: 'GST @ 5% (CGST 2.5% + SGST 2.5% / IGST 5%)',
    rateType: 'standard' as const,
    gstRateBp: 500, cgstRateBp: 250, sgstRateBp: 250, igstRateBp: 500, cessRateBp: 0,
  },
  {
    code: 'GST12',
    name: 'GST @ 12% (CGST 6% + SGST 6% / IGST 12%)',
    rateType: 'standard' as const,
    gstRateBp: 1200, cgstRateBp: 600, sgstRateBp: 600, igstRateBp: 1200, cessRateBp: 0,
  },
  {
    code: 'GST18',
    name: 'GST @ 18% (CGST 9% + SGST 9% / IGST 18%)',
    rateType: 'standard' as const,
    gstRateBp: 1800, cgstRateBp: 900, sgstRateBp: 900, igstRateBp: 1800, cessRateBp: 0,
  },
  {
    code: 'GST28',
    name: 'GST @ 28% (CGST 14% + SGST 14% / IGST 28%)',
    rateType: 'standard' as const,
    gstRateBp: 2800, cgstRateBp: 1400, sgstRateBp: 1400, igstRateBp: 2800, cessRateBp: 0,
  },
  {
    code: 'GST28C12',
    name: 'GST @ 28% + Cess 12% (luxury goods)',
    rateType: 'cess' as const,
    gstRateBp: 2800, cgstRateBp: 1400, sgstRateBp: 1400, igstRateBp: 2800, cessRateBp: 1200,
  },
  {
    code: 'GST28C5',
    name: 'GST @ 28% + Cess 5%',
    rateType: 'cess' as const,
    gstRateBp: 2800, cgstRateBp: 1400, sgstRateBp: 1400, igstRateBp: 2800, cessRateBp: 500,
  },
];

// ─── Common HSN codes for manufacturing SMEs ──────────────────────────────
//
// Only a representative set — companies add their specific HSN codes via the UI.
// The full HSN master (12,000+ codes) is available from GSTN for import.

const HSN_DEFS = [
  // Iron & Steel
  { code: '7201', description: 'Pig iron and spiegeleisen', isService: false, defaultGstRateBp: 1800 },
  { code: '7204', description: 'Ferrous waste and scrap', isService: false, defaultGstRateBp: 1800 },
  { code: '7208', description: 'Flat-rolled products of iron or non-alloy steel, hot-rolled', isService: false, defaultGstRateBp: 1800 },
  { code: '72081000', description: 'Hot-rolled steel sheets — in coils', isService: false, defaultGstRateBp: 1800 },
  { code: '7214', description: 'Bars and rods of iron or non-alloy steel', isService: false, defaultGstRateBp: 1800 },
  // Machinery parts
  { code: '7315', description: 'Chain and parts thereof, of iron or steel', isService: false, defaultGstRateBp: 1800 },
  { code: '7318', description: 'Screws, bolts, nuts, washers of iron or steel', isService: false, defaultGstRateBp: 1800 },
  { code: '73181500', description: 'Threaded bolts and nuts — M10', isService: false, defaultGstRateBp: 1800 },
  // Rubber
  { code: '4016', description: 'Articles of vulcanised rubber', isService: false, defaultGstRateBp: 1800 },
  { code: '40169390', description: 'Rubber seals and gaskets', isService: false, defaultGstRateBp: 1800 },
  // Plastics
  { code: '3926', description: 'Other articles of plastics', isService: false, defaultGstRateBp: 1800 },
  // Electrical
  { code: '8544', description: 'Insulated wire, cable and other insulated electric conductors', isService: false, defaultGstRateBp: 1800 },
  // Bearings
  { code: '8482', description: 'Ball or roller bearings', isService: false, defaultGstRateBp: 1800 },
  // General machinery
  { code: '8481', description: 'Taps, cocks, valves, similar appliances for pipes', isService: false, defaultGstRateBp: 1800 },
  { code: '8484', description: 'Gaskets and similar joints of metal sheeting', isService: false, defaultGstRateBp: 1800 },
  // Computers & electronics
  { code: '8471', description: 'Automatic data processing machines (computers)', isService: false, defaultGstRateBp: 1800 },
  { code: '84714900', description: 'Desktop computers, servers', isService: false, defaultGstRateBp: 1800 },
  // Packing materials
  { code: '4819', description: 'Cartons, boxes, bags of paper or paperboard', isService: false, defaultGstRateBp: 1200 },
  // Paints & chemicals
  { code: '3208', description: 'Paints and varnishes based on synthetic polymers', isService: false, defaultGstRateBp: 1800 },
  { code: '2710', description: 'Petroleum oils and oils from bituminous minerals', isService: false, defaultGstRateBp: 1800 },
  // SAC codes (services)
  { code: '9954', description: 'Construction services', isService: true, defaultGstRateBp: 1800 },
  { code: '9973', description: 'Leasing or rental services', isService: true, defaultGstRateBp: 1800 },
  { code: '9983', description: 'Other professional, technical and business services', isService: true, defaultGstRateBp: 1800 },
  { code: '9985', description: 'Support services (security, maintenance, cleaning)', isService: true, defaultGstRateBp: 1800 },
  { code: '9997', description: 'Other services', isService: true, defaultGstRateBp: 1800 },
];

// ─── Seed functions ────────────────────────────────────────────────────────

export async function seedTaxCodesForCompany(
  companyId: string,
  createdByUserId: string
): Promise<void> {
  console.log(`Seeding tax codes for company ${companyId}...`);

  for (const def of TAX_CODE_DEFS) {
    await db
      .insert(taxCodes)
      .values({
        companyId,
        code: def.code,
        name: def.name,
        rateType: def.rateType,
        gstRateBp: def.gstRateBp,
        cgstRateBp: def.cgstRateBp,
        sgstRateBp: def.sgstRateBp,
        igstRateBp: def.igstRateBp,
        cessRateBp: def.cessRateBp,
        isSystemCode: true,
        createdBy: createdByUserId,
      })
      .onConflictDoNothing();
  }

  console.log(`  ✓ ${TAX_CODE_DEFS.length} tax codes`);
}

export async function seedHsnCodes(): Promise<void> {
  console.log('Seeding HSN/SAC codes (global master)...');

  for (const def of HSN_DEFS) {
    await db
      .insert(hsnSacCodes)
      .values({
        code: def.code,
        description: def.description,
        isService: def.isService,
        defaultGstRateBp: def.defaultGstRateBp,
      })
      .onConflictDoNothing();
  }

  console.log(`  ✓ ${HSN_DEFS.length} HSN/SAC codes`);
}

// ─── CLI runner ────────────────────────────────────────────────────────────

if (process.argv[2] === 'hsn') {
  seedHsnCodes()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
} else if (process.argv[2] && process.argv[3]) {
  seedTaxCodesForCompany(process.argv[2], process.argv[3])
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
