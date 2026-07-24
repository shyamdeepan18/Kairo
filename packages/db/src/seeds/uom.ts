/**
 * Seed: Standard units of measure + common conversions
 *
 * seedUoms() — global one-time seed (not company-scoped).
 * seedUomConversions() — global conversion factors.
 *
 * Run once on install:
 *   npx tsx packages/db/src/seeds/uom.ts
 *
 * Safe to re-run — INSERT ON CONFLICT DO NOTHING on both tables.
 *
 * Companies can add custom UOMs (DRUM, BALE, BUNDLE, etc.) and item-scoped
 * conversion factors via Settings → Units of Measure.
 */

import { db, unitOfMeasures, uomConversions } from '../index.js';

// ─── UOM definitions ───────────────────────────────────────────────────────

const UOM_DEFS = [
  // ── Quantity ───────────────────────────────────────────────────────────
  { code: 'PCS',  name: 'Pieces',          type: 'quantity' },
  { code: 'NOS',  name: 'Numbers',          type: 'quantity' },
  { code: 'SET',  name: 'Set',              type: 'quantity' },
  { code: 'PAR',  name: 'Pair',             type: 'quantity' },
  { code: 'DOZ',  name: 'Dozen',            type: 'quantity' },
  { code: 'GRS',  name: 'Gross (144)',      type: 'quantity' },
  // ── Weight ─────────────────────────────────────────────────────────────
  { code: 'KG',   name: 'Kilogram',         type: 'weight' },
  { code: 'G',    name: 'Gram',             type: 'weight' },
  { code: 'MG',   name: 'Milligram',        type: 'weight' },
  { code: 'MT',   name: 'Metric Ton',       type: 'weight' },
  { code: 'LB',   name: 'Pound',            type: 'weight' },
  { code: 'OZ',   name: 'Ounce',            type: 'weight' },
  { code: 'QTL',  name: 'Quintal',          type: 'weight' },
  // ── Volume ─────────────────────────────────────────────────────────────
  { code: 'LTR',  name: 'Litre',            type: 'volume' },
  { code: 'ML',   name: 'Millilitre',       type: 'volume' },
  { code: 'KL',   name: 'Kilolitre',        type: 'volume' },
  { code: 'GAL',  name: 'Gallon (US)',      type: 'volume' },
  { code: 'BBL',  name: 'Barrel',           type: 'volume' },
  // ── Length ─────────────────────────────────────────────────────────────
  { code: 'MTR',  name: 'Metre',            type: 'length' },
  { code: 'CM',   name: 'Centimetre',       type: 'length' },
  { code: 'MM',   name: 'Millimetre',       type: 'length' },
  { code: 'KM',   name: 'Kilometre',        type: 'length' },
  { code: 'INCH', name: 'Inch',             type: 'length' },
  { code: 'FT',   name: 'Foot',             type: 'length' },
  { code: 'YD',   name: 'Yard',             type: 'length' },
  // ── Area ───────────────────────────────────────────────────────────────
  { code: 'SQM',  name: 'Square Metre',     type: 'area' },
  { code: 'SQFT', name: 'Square Foot',      type: 'area' },
  { code: 'SQIN', name: 'Square Inch',      type: 'area' },
  // ── Packaging (quantity-class) ─────────────────────────────────────────
  { code: 'BOX',  name: 'Box',              type: 'quantity' },
  { code: 'CTN',  name: 'Carton',           type: 'quantity' },
  { code: 'PKT',  name: 'Packet',           type: 'quantity' },
  { code: 'BAG',  name: 'Bag',              type: 'quantity' },
  { code: 'ROLL', name: 'Roll',             type: 'quantity' },
  { code: 'DRUM', name: 'Drum',             type: 'quantity' },
  { code: 'CAN',  name: 'Can',              type: 'quantity' },
  { code: 'BNDL', name: 'Bundle',           type: 'quantity' },
  { code: 'PLTF', name: 'Pallet',           type: 'quantity' },
  // ── Time ───────────────────────────────────────────────────────────────
  { code: 'HR',   name: 'Hour',             type: 'time' },
  { code: 'MIN',  name: 'Minute',           type: 'time' },
  { code: 'DAY',  name: 'Day',              type: 'time' },
  // ── Other ──────────────────────────────────────────────────────────────
  { code: 'KWH',  name: 'Kilowatt-hour',    type: 'other' },
  { code: 'JOB',  name: 'Job',              type: 'other' },
  { code: 'LOT',  name: 'Lot',              type: 'other' },
  { code: 'LS',   name: 'Lump Sum',         type: 'other' },
];

// ─── Global conversion factors ─────────────────────────────────────────────
//
// Only dimension-consistent conversions are defined here.
// Item-specific conversions (e.g. KG → LTR for a specific oil) must be
// added per item via Settings → Items → UOM Conversions.

const CONVERSION_DEFS = [
  // Weight
  { fromUom: 'MT',   toUom: 'KG',   factor: '1000' },
  { fromUom: 'KG',   toUom: 'G',    factor: '1000' },
  { fromUom: 'G',    toUom: 'MG',   factor: '1000' },
  { fromUom: 'QTL',  toUom: 'KG',   factor: '100' },
  { fromUom: 'LB',   toUom: 'KG',   factor: '0.45359237' },
  { fromUom: 'OZ',   toUom: 'G',    factor: '28.3495231' },
  // Volume
  { fromUom: 'KL',   toUom: 'LTR',  factor: '1000' },
  { fromUom: 'LTR',  toUom: 'ML',   factor: '1000' },
  { fromUom: 'GAL',  toUom: 'LTR',  factor: '3.78541' },
  { fromUom: 'BBL',  toUom: 'LTR',  factor: '158.987' },
  // Length
  { fromUom: 'KM',   toUom: 'MTR',  factor: '1000' },
  { fromUom: 'MTR',  toUom: 'CM',   factor: '100' },
  { fromUom: 'CM',   toUom: 'MM',   factor: '10' },
  { fromUom: 'FT',   toUom: 'MTR',  factor: '0.3048' },
  { fromUom: 'INCH', toUom: 'CM',   factor: '2.54' },
  { fromUom: 'YD',   toUom: 'MTR',  factor: '0.9144' },
  // Area
  { fromUom: 'SQM',  toUom: 'SQFT', factor: '10.7639' },
  { fromUom: 'SQFT', toUom: 'SQIN', factor: '144' },
  // Quantity
  { fromUom: 'DOZ',  toUom: 'PCS',  factor: '12' },
  { fromUom: 'GRS',  toUom: 'PCS',  factor: '144' },
  { fromUom: 'PAR',  toUom: 'PCS',  factor: '2' },
  // Time
  { fromUom: 'DAY',  toUom: 'HR',   factor: '8' },   // 8-hour working day
  { fromUom: 'HR',   toUom: 'MIN',  factor: '60' },
];

// ─── Seed functions ────────────────────────────────────────────────────────

export async function seedUoms(): Promise<void> {
  console.log('Seeding units of measure...');

  for (const def of UOM_DEFS) {
    await db
      .insert(unitOfMeasures)
      .values({
        code: def.code,
        name: def.name,
        type: def.type,
      })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${UOM_DEFS.length} units of measure`);
}

export async function seedUomConversions(): Promise<void> {
  console.log('Seeding UOM conversions...');

  for (const def of CONVERSION_DEFS) {
    await db
      .insert(uomConversions)
      .values({
        companyId: null,
        itemId: null,
        fromUom: def.fromUom,
        toUom: def.toUom,
        factor: def.factor,
      })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${CONVERSION_DEFS.length} UOM conversions`);
}

// ─── CLI runner ────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  seedUoms()
    .then(() => seedUomConversions())
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
